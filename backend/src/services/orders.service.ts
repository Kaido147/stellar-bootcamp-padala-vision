import { randomUUID } from "node:crypto";
import type {
  CreateOrderRequest,
  CreateOrderResponse,
  EvidenceSubmitRequest,
  EvidenceSubmitResponse,
  GetOrderResponse,
  OracleEvaluationResult,
  OrderHistoryResponse,
  ReleaseRecordRequest,
  ReleaseRecordResponse,
} from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { assertBoundWalletEquals, getBoundWalletOrThrow } from "./authorization.service.js";
import { ChainService } from "./chain.service.js";
import { ContractRegistryService } from "./contract-registry.service.js";
import { OracleService } from "./oracle.service.js";

const oracleService = new OracleService();

export class OrdersService {
  constructor(
    private readonly contractRegistryService = new ContractRegistryService(),
    private readonly chainService = new ChainService(),
  ) {}

  async createOrder(request: CreateOrderRequest, actor: SessionActor): Promise<CreateOrderResponse> {
    const boundWallet = await getBoundWalletOrThrow(actor);
    assertBoundWalletEquals(
      boundWallet,
      request.seller_wallet,
      "order_seller_wallet_mismatch",
      "Seller wallet must match the authenticated bound wallet",
    );

    const itemAmount = Number(request.item_amount);
    const deliveryFee = Number(request.delivery_fee);
    const totalAmount = itemAmount + deliveryFee;

    const order = await repository.createOrder({
      id: repository.generateOrderId(),
      contractId: null,
      sellerWallet: request.seller_wallet,
      buyerWallet: request.buyer_wallet,
      riderWallet: null,
      itemAmount: request.item_amount,
      deliveryFee: request.delivery_fee,
      totalAmount: totalAmount.toFixed(2),
      status: "Draft",
      fundedAt: null,
      releasedAt: null,
      expiresAt: request.expires_at,
    });

    return {
      order_id: order.id,
      order,
      expected_total_amount: order.totalAmount,
    };
  }

  async getOrder(orderId: string): Promise<GetOrderResponse> {
    const order = await requireOrder(orderId);
    const latestDecision = await repository.getLatestDecision(orderId);
    const transactions = await repository.getTransactions(orderId);
    const latestTransaction = transactions.at(-1) ?? null;
    const latestDispute = await repository.getLatestDisputeByOrderId(orderId);
    const openDispute = latestDispute?.status === "open" ? latestDispute : await repository.getOpenDisputeByOrderId(orderId);

    return {
      order,
      latest_decision: latestDecision
        ? {
            decision: latestDecision.decision,
            confidence: latestDecision.confidence,
            fraudFlags: latestDecision.fraudFlags,
            reason: latestDecision.reason,
            attestation: null,
          }
        : null,
      latest_transaction: latestTransaction,
      transactions,
      pending_transactions: transactions.filter((transaction) => transaction.txStatus === "pending"),
      failed_transactions: transactions.filter((transaction) => transaction.txStatus === "failed"),
      open_dispute: openDispute
        ? {
            id: openDispute.id,
            status: openDispute.status,
            reason_code: openDispute.reasonCode,
            description: openDispute.description,
            resolution: openDispute.resolution,
            created_at: openDispute.createdAt,
            updated_at: openDispute.updatedAt,
          }
        : null,
      latest_dispute: latestDispute
        ? {
            id: latestDispute.id,
            status: latestDispute.status,
            reason_code: latestDispute.reasonCode,
            description: latestDispute.description,
            resolution: latestDispute.resolution,
            created_at: latestDispute.createdAt,
            updated_at: latestDispute.updatedAt,
          }
        : null,
      review_state: latestDecision
        ? {
            decision: latestDecision.decision,
            confidence: latestDecision.confidence,
            fraud_flags: latestDecision.fraudFlags,
            reason: latestDecision.reason,
            reviewed_at: latestDecision.createdAt,
          }
        : {
            decision: null,
            confidence: null,
            fraud_flags: [],
            reason: null,
            reviewed_at: null,
          },
    } as GetOrderResponse;
  }

  async listFundedJobs() {
    return {
      jobs: await repository.listFundedJobs(),
    };
  }

  async markFunded(orderId: string, actor: SessionActor) {
    const order = await requireOrder(orderId);
    if (order.status !== "Draft") {
      throw new HttpError(409, "Only draft orders can be marked funded");
    }
    const boundWallet = await getBoundWalletOrThrow(actor);
    assertBoundWalletEquals(
      boundWallet,
      order.buyerWallet,
      "order_buyer_wallet_mismatch",
      "Buyer wallet must match the authenticated bound wallet",
    );

    return repository.updateOrderStatus(orderId, "Funded", "Buyer funded escrow", {
      fundedAt: new Date().toISOString(),
    });
  }

  async acceptRider(orderId: string, riderWallet: string, actor: SessionActor) {
    const order = await requireOrder(orderId);
    if (order.status !== "Funded") {
      throw new HttpError(409, "Only funded orders can be accepted");
    }
    const boundWallet = await getBoundWalletOrThrow(actor);
    assertBoundWalletEquals(
      boundWallet,
      riderWallet,
      "order_rider_wallet_mismatch",
      "Rider wallet must match the authenticated bound wallet",
    );

    return repository.updateOrderStatus(orderId, "RiderAssigned", "Rider accepted job", {
      riderWallet,
    });
  }

  async markInTransit(orderId: string, riderWallet: string, actor: SessionActor) {
    const order = await requireOrder(orderId);
    if (order.status !== "RiderAssigned") {
      throw new HttpError(409, "Only rider-assigned orders can move to in transit");
    }
    const boundWallet = await getBoundWalletOrThrow(actor);
    assertBoundWalletEquals(
      boundWallet,
      riderWallet,
      "order_rider_wallet_mismatch",
      "Rider wallet must match the authenticated bound wallet",
    );
    if (order.riderWallet !== riderWallet) {
      throw new HttpError(403, "Only the assigned rider can mark the order in transit");
    }

    return repository.updateOrderStatus(orderId, "InTransit", "Rider picked up parcel");
  }

  async createFundIntent(input: { orderId: string; actor: SessionActor; correlationId: string }) {
    const order = await requireOrder(input.orderId);
    if (order.status !== "Draft") {
      throw new HttpError(409, "Only draft orders can create a funding intent", "fund_invalid_state");
    }

    const actorWallet = await getBoundWalletOrThrow(input.actor);
    assertBoundWalletEquals(
      actorWallet,
      order.buyerWallet,
      "order_buyer_wallet_mismatch",
      "Buyer wallet must match the authenticated bound wallet",
    );

    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    if (order.contractId && order.contractId !== contractSet.contractId) {
      throw new HttpError(409, "Order contract does not match the active contract registry", "fund_contract_mismatch");
    }

    const intent = await repository.createChainActionIntent({
      id: randomUUID(),
      orderId: input.orderId,
      actionType: "fund",
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
      method: "fund_order",
      args: {
        order_id: input.orderId,
        total_amount: order.totalAmount,
      },
      replayKey: randomUUID(),
      correlationId: input.correlationId,
    });

    return {
      action_intent_id: intent.id,
      order_id: input.orderId,
      action_type: intent.actionType,
      contract_id: contractSet.contractId,
      network_passphrase: contractSet.networkPassphrase,
      rpc_url: contractSet.rpcUrl,
      method: intent.method,
      args: intent.args,
      replay_key: intent.replayKey,
    };
  }

  async recordFunding(input: {
    orderId: string;
    actor: SessionActor;
    actionIntentId: string;
    txHash: string;
    submittedWallet: string;
    correlationId: string;
  }) {
    return this.recordOrderAction({
      ...input,
      actionType: "fund",
      method: "fund_order",
      requiredOrderStatus: "Draft",
      pendingStatus: "Funded",
      successNote: "Funding transaction confirmed on-chain",
      mismatchCode: "fund_tx_mismatch",
      invalidStateCode: "fund_invalid_state",
      applyOrderUpdate: (orderId, intent) =>
        repository.updateOrderStatus(orderId, "Funded", "Funding transaction confirmed on-chain", {
          contractId: intent.contractId,
          fundedAt: new Date().toISOString(),
        }),
    });
  }

  async createRiderAssignIntent(input: { orderId: string; actor: SessionActor; correlationId: string }) {
    const order = await requireOrder(input.orderId);
    if (order.status !== "Funded") {
      throw new HttpError(409, "Only funded orders can create a rider-assign intent", "rider_assign_invalid_state");
    }

    const actorWallet = await getBoundWalletOrThrow(input.actor);
    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    if (order.contractId && order.contractId !== contractSet.contractId) {
      throw new HttpError(
        409,
        "Order contract does not match the active contract registry",
        "rider_assign_contract_mismatch",
      );
    }

    const intent = await repository.createChainActionIntent({
      id: randomUUID(),
      orderId: input.orderId,
      actionType: "rider_assign",
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
      method: "assign_rider",
      args: {
        order_id: input.orderId,
        rider_wallet: actorWallet,
      },
      replayKey: randomUUID(),
      correlationId: input.correlationId,
    });

    return {
      action_intent_id: intent.id,
      order_id: input.orderId,
      action_type: intent.actionType,
      contract_id: contractSet.contractId,
      network_passphrase: contractSet.networkPassphrase,
      rpc_url: contractSet.rpcUrl,
      method: intent.method,
      args: intent.args,
      replay_key: intent.replayKey,
    };
  }

  async recordRiderAssign(input: {
    orderId: string;
    actor: SessionActor;
    actionIntentId: string;
    txHash: string;
    submittedWallet: string;
    correlationId: string;
  }) {
    return this.recordOrderAction({
      ...input,
      actionType: "rider_assign",
      method: "assign_rider",
      requiredOrderStatus: "Funded",
      pendingStatus: "RiderAssigned",
      successNote: "Rider assignment transaction confirmed on-chain",
      mismatchCode: "rider_assign_tx_mismatch",
      invalidStateCode: "rider_assign_invalid_state",
      riderWallet: true,
      applyOrderUpdate: async (orderId, intent) =>
        repository.updateOrderStatus(orderId, "RiderAssigned", "Rider assignment transaction confirmed on-chain", {
          contractId: intent.contractId,
          riderWallet: typeof intent.args.rider_wallet === "string" ? intent.args.rider_wallet : null,
        }),
    });
  }

  async createInTransitIntent(input: { orderId: string; actor: SessionActor; correlationId: string }) {
    const order = await requireOrder(input.orderId);
    if (order.status !== "RiderAssigned") {
      throw new HttpError(
        409,
        "Only rider-assigned orders can create an in-transit intent",
        "in_transit_invalid_state",
      );
    }

    const actorWallet = await getBoundWalletOrThrow(input.actor);
    if (order.riderWallet !== actorWallet) {
      throw new HttpError(403, "Only the assigned rider can create an in-transit intent", "order_rider_wallet_mismatch");
    }

    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    if (order.contractId && order.contractId !== contractSet.contractId) {
      throw new HttpError(
        409,
        "Order contract does not match the active contract registry",
        "in_transit_contract_mismatch",
      );
    }

    const intent = await repository.createChainActionIntent({
      id: randomUUID(),
      orderId: input.orderId,
      actionType: "in_transit",
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
      method: "mark_in_transit",
      args: {
        order_id: input.orderId,
        rider_wallet: actorWallet,
      },
      replayKey: randomUUID(),
      correlationId: input.correlationId,
    });

    return {
      action_intent_id: intent.id,
      order_id: input.orderId,
      action_type: intent.actionType,
      contract_id: contractSet.contractId,
      network_passphrase: contractSet.networkPassphrase,
      rpc_url: contractSet.rpcUrl,
      method: intent.method,
      args: intent.args,
      replay_key: intent.replayKey,
    };
  }

  async recordInTransit(input: {
    orderId: string;
    actor: SessionActor;
    actionIntentId: string;
    txHash: string;
    submittedWallet: string;
    correlationId: string;
  }) {
    return this.recordOrderAction({
      ...input,
      actionType: "in_transit",
      method: "mark_in_transit",
      requiredOrderStatus: "RiderAssigned",
      pendingStatus: "InTransit",
      successNote: "In-transit transaction confirmed on-chain",
      mismatchCode: "in_transit_tx_mismatch",
      invalidStateCode: "in_transit_invalid_state",
      applyOrderUpdate: (orderId, intent) =>
        repository.updateOrderStatus(orderId, "InTransit", "In-transit transaction confirmed on-chain", {
          contractId: intent.contractId,
        }),
    });
  }

  async submitEvidence(request: EvidenceSubmitRequest, actor: SessionActor): Promise<EvidenceSubmitResponse> {
    const order = await requireOrder(request.order_id);
    if (order.status !== "InTransit") {
      throw new HttpError(409, "Evidence can only be submitted while the order is in transit");
    }
    const boundWallet = await getBoundWalletOrThrow(actor);
    assertBoundWalletEquals(
      boundWallet,
      request.rider_wallet,
      "order_rider_wallet_mismatch",
      "Rider wallet must match the authenticated bound wallet",
    );
    if (order.riderWallet !== request.rider_wallet) {
      throw new HttpError(403, "Only the assigned rider can submit evidence");
    }

    await repository.saveEvidence({
      orderId: request.order_id,
      imageUrl: request.storage_path ?? request.image_url,
      gpsLat: request.gps.lat,
      gpsLng: request.gps.lng,
      fileHash: request.file_hash ?? null,
    });

    await repository.updateOrderStatus(request.order_id, "EvidenceSubmitted", "Evidence uploaded");

    const evaluation = await oracleService.evaluate({
      order,
      evidence: {
        orderId: request.order_id,
        riderWallet: request.rider_wallet,
        imageUrl: request.image_url,
        fileHash: request.file_hash ?? null,
        storagePath: request.storage_path ?? null,
        gps: request.gps,
        timestamp: request.timestamp,
      },
    });

    let finalDecision: OracleEvaluationResult = evaluation;
    if (evaluation.decision === "APPROVE") {
      const attestation = await oracleService.signApproval(request.order_id, evaluation.confidence);
      finalDecision = {
        ...evaluation,
        attestation,
      };
      await repository.updateOrderStatus(request.order_id, "Approved", "Oracle approved evidence");
    } else if (evaluation.decision === "REJECT") {
      await repository.updateOrderStatus(request.order_id, "Rejected", "Oracle rejected evidence");
    } else {
      await repository.updateOrderStatus(request.order_id, "Disputed", "Manual review required");
    }

    await repository.saveOracleDecision({
      orderId: request.order_id,
      decision: finalDecision.decision,
      confidence: finalDecision.confidence,
      reason: finalDecision.reason,
      fraudFlags: finalDecision.fraudFlags,
      signature: finalDecision.attestation?.signature ?? null,
      issuedAt: finalDecision.attestation
        ? new Date(finalDecision.attestation.issuedAtSecs * 1000).toISOString()
        : null,
      expiresAt: finalDecision.attestation
        ? new Date(finalDecision.attestation.expiresAtSecs * 1000).toISOString()
        : null,
    });

    return finalDecision;
  }

  async releaseEscrow(request: ReleaseRecordRequest): Promise<ReleaseRecordResponse> {
    const order = await requireOrder(request.order_id);
    if (order.status !== "Approved") {
      throw new HttpError(409, "Only approved orders can be released");
    }

    const tx = await repository.createTransaction({
      orderId: request.order_id,
      txHash: request.tx_hash,
      txType: "release",
      txStatus: "confirmed",
    });

    const released = await repository.updateOrderStatus(
      request.order_id,
      "Released",
      "Release transaction confirmed on-chain",
      {
        releasedAt: new Date().toISOString(),
      },
    );

    return {
      release_status: "confirmed",
      chain_status: "confirmed",
      financial_finality: true,
      order: released,
      tx,
      release_record_id: tx.id,
    };
  }

  async getHistory(orderId: string): Promise<OrderHistoryResponse> {
    const order = await requireOrder(orderId);
    const transactions = await repository.getTransactions(orderId);
    const latestDispute = await repository.getLatestDisputeByOrderId(orderId);
    return {
      order,
      history: await repository.getHistory(orderId),
      transactions,
      pending_transactions: transactions.filter((transaction) => transaction.txStatus === "pending"),
      failed_transactions: transactions.filter((transaction) => transaction.txStatus === "failed"),
      latest_dispute: latestDispute
        ? {
            id: latestDispute.id,
            status: latestDispute.status,
            reason_code: latestDispute.reasonCode,
            description: latestDispute.description,
            resolution: latestDispute.resolution,
            created_at: latestDispute.createdAt,
            updated_at: latestDispute.updatedAt,
          }
        : null,
    } as OrderHistoryResponse;
  }

  async assertEvidenceUploadAuthorized(orderId: string, riderWallet: string, actor: SessionActor) {
    const order = await requireOrder(orderId);
    const boundWallet = await getBoundWalletOrThrow(actor);
    assertBoundWalletEquals(
      boundWallet,
      riderWallet,
      "order_rider_wallet_mismatch",
      "Rider wallet must match the authenticated bound wallet",
    );

    if (order.status !== "InTransit") {
      throw new HttpError(409, "Evidence can only be uploaded while the order is in transit");
    }
    if (order.riderWallet !== riderWallet) {
      throw new HttpError(403, "Only the assigned rider can upload evidence");
    }
  }

  private async recordOrderAction(input: {
    orderId: string;
    actor: SessionActor;
    actionIntentId: string;
    actionType: "fund" | "rider_assign" | "in_transit";
    method: "fund_order" | "assign_rider" | "mark_in_transit";
    requiredOrderStatus: "Draft" | "Funded" | "RiderAssigned";
    txHash: string;
    submittedWallet: string;
    correlationId: string;
    pendingStatus: "Funded" | "RiderAssigned" | "InTransit";
    successNote: string;
    mismatchCode: string;
    invalidStateCode: string;
    riderWallet?: boolean;
    applyOrderUpdate: (
      orderId: string,
      intent: Awaited<ReturnType<typeof repository.getChainActionIntentById>> extends infer T ? NonNullable<T> : never,
    ) => Promise<Awaited<ReturnType<typeof repository.getOrder>> extends infer T ? NonNullable<T> : never>;
  }) {
    const order = await requireOrder(input.orderId);
    if (order.status !== input.requiredOrderStatus && order.status !== input.pendingStatus) {
      throw new HttpError(409, "Order is not in a recordable state for this action", input.invalidStateCode);
    }

    const existingRecord = await repository.getChainActionRecordByTxHash(input.txHash);
    if (existingRecord) {
      return replayExistingOrderAction(existingRecord, input.orderId);
    }

    const actorWallet = await getBoundWalletOrThrow(input.actor);
    assertBoundWalletEquals(
      actorWallet,
      input.submittedWallet,
      `${input.actionType}_wallet_mismatch`,
      "Submitted wallet must match the authenticated bound wallet",
    );

    const intent = await repository.getChainActionIntentById(input.actionIntentId);
    if (!intent || intent.orderId !== input.orderId || intent.actionType !== input.actionType) {
      throw new HttpError(404, "Order action intent was not found for this order", `${input.actionType}_intent_not_found`);
    }

    const contractSet = await this.contractRegistryService.resolveActiveContractSet(intent.environment);
    if (contractSet.contractId !== intent.contractId) {
      throw new HttpError(
        409,
        "Order action intent contract does not match the active contract registry",
        `${input.actionType}_contract_mismatch`,
      );
    }

    const verified = await this.chainService.verifyOrderActionTransaction({
      txHash: input.txHash,
      orderId: input.orderId,
      contractId: intent.contractId,
      method: input.method,
      submittedWallet: input.submittedWallet,
      riderWallet: input.riderWallet && typeof intent.args.rider_wallet === "string" ? intent.args.rider_wallet : undefined,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
    });

    const existingTransaction = await repository.getTransactionByHash(input.txHash);
    if (existingTransaction) {
      throw new HttpError(409, "Transaction hash has already been recorded", input.mismatchCode);
    }

    const transaction = await repository.createTransaction({
      orderId: input.orderId,
      txHash: input.txHash,
      txType: input.actionType,
      txStatus: verified.status,
    });

    const record = await repository.createChainActionRecord({
      chainActionIntentId: intent.id,
      orderId: input.orderId,
      actionType: input.actionType,
      txHash: input.txHash,
      submittedWallet: input.submittedWallet,
      contractId: intent.contractId,
      status: verified.status,
      correlationId: input.correlationId,
      confirmedAt: verified.status === "confirmed" ? new Date().toISOString() : null,
      chainLedger: verified.ledger ?? null,
    });

    if (verified.status === "pending") {
      return {
        action_type: input.actionType,
        action_status: "pending_confirmation" as const,
        chain_status: "pending" as const,
        order,
        tx: null,
        action_record_id: record.id,
      };
    }

    if (verified.status === "failed") {
      throw new HttpError(409, "Order action transaction failed on-chain", input.mismatchCode);
    }

    await repository.updateTransactionByHash(input.txHash, {
      txStatus: "confirmed",
    });

    const updatedOrder = await input.applyOrderUpdate(input.orderId, intent);
    await repository.updateChainActionRecord(record.id, {
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
      chainLedger: verified.ledger ?? null,
      correlationId: input.correlationId,
    });

    return {
      action_type: input.actionType,
      action_status: "confirmed" as const,
      chain_status: "confirmed" as const,
      order: updatedOrder,
      tx: {
        ...transaction,
        txStatus: "confirmed",
      },
      action_record_id: record.id,
    };
  }
}

async function requireOrder(orderId: string) {
  const order = await repository.getOrder(orderId);
  if (!order) {
    throw new HttpError(404, "Order not found");
  }
  return order;
}

async function replayExistingOrderAction(
  record: Awaited<ReturnType<typeof repository.getChainActionRecordByTxHash>>,
  orderId: string,
) {
  if (!record) {
    throw new HttpError(500, "Order action replay failed", "order_action_replay_failed");
  }
  if (record.orderId !== orderId) {
    throw new HttpError(409, "Transaction hash is already associated with another order", "order_action_tx_conflict");
  }

  const order = await requireOrder(orderId);
  const tx = await repository.getTransactionByHash(record.txHash);

  return {
    action_type: record.actionType,
    action_status: record.status === "confirmed" ? ("confirmed" as const) : ("pending_confirmation" as const),
    chain_status: record.status,
    order,
    tx: record.status === "confirmed" ? tx : null,
    action_record_id: record.id,
  };
}
