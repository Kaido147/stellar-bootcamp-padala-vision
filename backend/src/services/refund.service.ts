import { randomUUID } from "node:crypto";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { getBoundWalletOrThrow, isOperator } from "./authorization.service.js";
import { ChainService } from "./chain.service.js";
import { ContractRegistryService } from "./contract-registry.service.js";

const FUNDED_UNACCEPTED_TIMEOUT_MS = 2 * 60 * 60 * 1000;
const ASSIGNED_NOT_IN_TRANSIT_TIMEOUT_MS = 60 * 60 * 1000;
const IN_TRANSIT_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const DISPUTE_INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class RefundService {
  constructor(
    private readonly contractRegistryService = new ContractRegistryService(),
    private readonly chainService = new ChainService(),
  ) {}

  async createRefundIntent(input: {
    actor: SessionActor;
    orderId: string;
    correlationId: string;
  }) {
    const order = await repository.getOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }
    if (order.status === "Released" || order.status === "Refunded") {
      throw new HttpError(409, "Order is not eligible for refund", "refund_not_eligible");
    }

    const operator = isOperator(input.actor);
    const actorWallet = await getBoundWalletOrThrow(input.actor);

    if (!operator) {
      if (actorWallet !== order.buyerWallet) {
        throw new HttpError(403, "Refund intent requires the buyer or an authorized operator", "refund_forbidden");
      }
    }

    const history = await repository.getHistory(input.orderId);
    const openDispute = await repository.getOpenDisputeByOrderId(input.orderId);
    const eligibility = evaluateRefundEligibility({
      order,
      history,
      openDispute,
      now: new Date(),
    });

    if (!eligibility.eligible) {
      throw new HttpError(409, "Order is not eligible for refund", "refund_not_eligible");
    }

    const contractSet = await this.contractRegistryService.resolveActiveContractSet();
    if (order.contractId && order.contractId !== contractSet.contractId) {
      throw new HttpError(409, "Order contract does not match the active contract registry", "refund_contract_mismatch");
    }

    const refundIntent = await repository.createRefundIntent({
      id: randomUUID(),
      orderId: input.orderId,
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
      eligibilityBasis: eligibility.basis,
      eligibleAt: eligibility.eligibleAt.toISOString(),
      correlationId: input.correlationId,
    });

    await repository.createChainActionIntent({
      id: refundIntent.id,
      orderId: input.orderId,
      actionType: "refund",
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      contractId: contractSet.contractId,
      environment: contractSet.environment,
      method: "refund_order",
      args: {
        order_id: input.orderId,
      },
      replayKey: refundIntent.id,
      correlationId: input.correlationId,
    });

    return {
      refund_intent_id: refundIntent.id,
      order_id: input.orderId,
      contract_id: contractSet.contractId,
      network_passphrase: contractSet.networkPassphrase,
      rpc_url: contractSet.rpcUrl,
      method: "refund_order",
      args: {
        order_id: input.orderId,
      },
      replay_key: refundIntent.id,
      eligibility_basis: eligibility.basis,
      eligible_at: eligibility.eligibleAt.toISOString(),
    };
  }

  async recordRefund(input: {
    actor: SessionActor;
    orderId: string;
    refundIntentId: string;
    txHash: string;
    submittedWallet: string;
    correlationId: string;
  }) {
    const order = await repository.getOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }

    const existingRecord = await repository.getChainActionRecordByTxHash(input.txHash);
    if (existingRecord) {
      return replayExistingRefund(existingRecord, input.orderId);
    }

    const actorWallet = await getBoundWalletOrThrow(input.actor);
    if (actorWallet !== input.submittedWallet) {
      throw new HttpError(403, "Submitted wallet must match the authenticated bound wallet", "refund_wallet_mismatch");
    }

    const refundIntent = await repository.getRefundIntentById(input.refundIntentId);
    if (!refundIntent || refundIntent.orderId !== input.orderId) {
      throw new HttpError(404, "Refund intent was not found for this order", "refund_intent_not_found");
    }

    const contractSet = await this.contractRegistryService.resolveActiveContractSet(refundIntent.environment);
    if (contractSet.contractId !== refundIntent.contractId) {
      throw new HttpError(409, "Refund intent contract does not match the active contract registry", "refund_contract_mismatch");
    }

    const verified = await this.chainService.verifyOrderActionTransaction({
      txHash: input.txHash,
      orderId: input.orderId,
      contractId: refundIntent.contractId,
      method: "refund_order",
      submittedWallet: input.submittedWallet,
      rpcUrl: contractSet.rpcUrl,
      networkPassphrase: contractSet.networkPassphrase,
    });

    const existingTransaction = await repository.getTransactionByHash(input.txHash);
    if (existingTransaction) {
      throw new HttpError(409, "Refund transaction hash has already been recorded", "refund_tx_hash_conflict");
    }

    const tx = await repository.createTransaction({
      orderId: input.orderId,
      txHash: input.txHash,
      txType: "refund",
      txStatus: verified.status,
    });

    const record = await repository.createChainActionRecord({
      chainActionIntentId: refundIntent.id,
      orderId: input.orderId,
      actionType: "refund",
      txHash: input.txHash,
      submittedWallet: input.submittedWallet,
      contractId: refundIntent.contractId,
      status: verified.status,
      correlationId: input.correlationId,
      confirmedAt: verified.status === "confirmed" ? new Date().toISOString() : null,
      chainLedger: verified.ledger ?? null,
    });

    if (verified.status === "pending") {
      return {
        refund_status: "pending_confirmation" as const,
        chain_status: "pending" as const,
        financial_finality: false,
        order,
        tx: null,
        refund_record_id: record.id,
      };
    }

    if (verified.status === "failed") {
      throw new HttpError(409, "Refund transaction failed on-chain", "refund_tx_failed");
    }

    await repository.updateTransactionByHash(input.txHash, { txStatus: "confirmed" });
    const refundedOrder = await repository.updateOrderStatus(
      input.orderId,
      "Refunded",
      "Refund transaction confirmed on-chain",
      {
        contractId: refundIntent.contractId,
      },
    );
    await repository.updateChainActionRecord(record.id, {
      status: "confirmed",
      confirmedAt: new Date().toISOString(),
      chainLedger: verified.ledger ?? null,
      correlationId: input.correlationId,
    });

    return {
      refund_status: "confirmed" as const,
      chain_status: "confirmed" as const,
      financial_finality: true,
      order: refundedOrder,
      tx: {
        ...tx,
        txStatus: "confirmed",
      },
      refund_record_id: record.id,
    };
  }
}

function evaluateRefundEligibility(input: {
  order: Awaited<ReturnType<typeof repository.getOrder>> extends infer T ? NonNullable<T> : never;
  history: Awaited<ReturnType<typeof repository.getHistory>>;
  openDispute: Awaited<ReturnType<typeof repository.getOpenDisputeByOrderId>>;
  now: Date;
}):
  | {
      eligible: true;
      basis: RefundIntentBasis;
      eligibleAt: Date;
    }
  | {
      eligible: false;
    } {
  if (input.openDispute) {
    const lastActivity = new Date(input.openDispute.lastActivityAt);
    const eligibleAt = new Date(lastActivity.getTime() + DISPUTE_INACTIVITY_TIMEOUT_MS);

    if (input.now >= eligibleAt) {
      return {
        eligible: true,
        basis: "dispute_inactive" as const,
        eligibleAt,
      };
    }

      return {
        eligible: false,
      };
  }

  if (input.order.status === "Rejected") {
    return {
      eligible: true,
      basis: "rejected" as const,
      eligibleAt: new Date(input.order.updatedAt),
    };
  }

  if (input.order.status === "Funded") {
    const fundedAt = input.order.fundedAt ? new Date(input.order.fundedAt) : getLatestStatusTime(input.history, "Funded");
    if (!fundedAt) {
      return { eligible: false };
    }

    const eligibleAt = new Date(fundedAt.getTime() + FUNDED_UNACCEPTED_TIMEOUT_MS);
    return {
      eligible: input.now >= eligibleAt,
      basis: "timeout_funded_unaccepted" as const,
      eligibleAt,
    };
  }

  if (input.order.status === "RiderAssigned") {
    const assignedAt = getLatestStatusTime(input.history, "RiderAssigned");
    if (!assignedAt) {
      return { eligible: false };
    }

    const eligibleAt = new Date(assignedAt.getTime() + ASSIGNED_NOT_IN_TRANSIT_TIMEOUT_MS);
    return {
      eligible: input.now >= eligibleAt,
      basis: "timeout_assigned_not_in_transit" as const,
      eligibleAt,
    };
  }

  if (input.order.status === "InTransit") {
    const inTransitAt = getLatestStatusTime(input.history, "InTransit");
    if (!inTransitAt) {
      return { eligible: false };
    }

    const eligibleAt = new Date(inTransitAt.getTime() + IN_TRANSIT_TIMEOUT_MS);
    return {
      eligible: input.now >= eligibleAt,
      basis: "timeout_in_transit" as const,
      eligibleAt,
    };
  }

  return { eligible: false };
}

type RefundIntentBasis =
  | "rejected"
  | "timeout_funded_unaccepted"
  | "timeout_assigned_not_in_transit"
  | "timeout_in_transit"
  | "dispute_inactive";

function getLatestStatusTime(
  history: Awaited<ReturnType<typeof repository.getHistory>>,
  status: "Funded" | "RiderAssigned" | "InTransit",
) {
  const entry = [...history].reverse().find((item) => item.newStatus === status);
  return entry ? new Date(entry.changedAt) : null;
}

async function replayExistingRefund(
  record: Awaited<ReturnType<typeof repository.getChainActionRecordByTxHash>>,
  orderId: string,
) {
  if (!record || record.actionType !== "refund") {
    throw new HttpError(500, "Refund replay failed", "refund_replay_failed");
  }
  if (record.orderId !== orderId) {
    throw new HttpError(409, "Refund transaction hash is already associated with another order", "refund_tx_hash_conflict");
  }

  const order = await repository.getOrder(orderId);
  if (!order) {
    throw new HttpError(404, "Order not found", "order_not_found");
  }

  return {
    refund_status: record.status === "confirmed" ? ("confirmed" as const) : ("pending_confirmation" as const),
    chain_status: record.status,
    financial_finality: record.status === "confirmed",
    order,
    tx: record.status === "confirmed" ? await repository.getTransactionByHash(record.txHash) : null,
    refund_record_id: record.id,
  };
}
