import type {
  CreateOrderRequest,
  CreateOrderResponse,
  EvidenceSubmitRequest,
  EvidenceSubmitResponse,
  GetOrderResponse,
  OracleEvaluationResult,
  OrderHistoryResponse,
  ReleaseRequest,
  ReleaseResponse,
} from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { assertBoundWalletEquals, getBoundWalletOrThrow } from "./authorization.service.js";
import { OracleService } from "./oracle.service.js";

const oracleService = new OracleService();

export class OrdersService {
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
    const latestTransaction = (await repository.getTransactions(orderId)).at(-1) ?? null;

    return {
      order,
      latest_decision: latestDecision
        ? {
            decision: latestDecision.decision,
            confidence: latestDecision.confidence,
            fraudFlags: latestDecision.fraudFlags,
            reason: latestDecision.reason,
            attestation:
              latestDecision.signature && latestDecision.issuedAt && latestDecision.expiresAt
                ? {
                    orderId,
                    decision: "APPROVE",
                    confidence: latestDecision.confidence,
                    issuedAt: latestDecision.issuedAt,
                    expiresAt: latestDecision.expiresAt,
                    signature: latestDecision.signature,
                  }
                : null,
          }
        : null,
      latest_transaction: latestTransaction,
    };
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
      const attestation = oracleService.signApproval(request.order_id, evaluation.confidence);
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
      issuedAt: finalDecision.attestation?.issuedAt ?? null,
      expiresAt: finalDecision.attestation?.expiresAt ?? null,
    });

    return finalDecision;
  }

  async releaseEscrow(request: ReleaseRequest): Promise<ReleaseResponse> {
    const order = await requireOrder(request.order_id);
    if (order.status !== "Approved") {
      throw new HttpError(409, "Only approved orders can be released");
    }

    const tx = await repository.createTransaction({
      orderId: request.order_id,
      txHash: request.tx_hash,
      txType: "release",
      txStatus: request.tx_status,
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
      order: released,
      tx,
    };
  }

  async getHistory(orderId: string): Promise<OrderHistoryResponse> {
    const order = await requireOrder(orderId);
    return {
      order,
      history: await repository.getHistory(orderId),
      transactions: await repository.getTransactions(orderId),
    };
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
}

async function requireOrder(orderId: string) {
  const order = await repository.getOrder(orderId);
  if (!order) {
    throw new HttpError(404, "Order not found");
  }
  return order;
}
