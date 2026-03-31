import { randomUUID } from "node:crypto";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { assertHasOperatorRole, getBoundWalletOrThrow, isOperator } from "./authorization.service.js";
import { ReleaseService } from "./release.service.js";

export class DisputeService {
  constructor(private readonly releaseService = new ReleaseService()) {}

  async listDisputes(input: { actor: SessionActor }) {
    assertHasOperatorRole(
      input.actor,
      "dispute_queue_forbidden",
      "Only ops_reviewer or ops_admin can view the dispute queue",
    );

    const disputes = await repository.listDisputes();
    const items = await Promise.all(
      disputes.map(async (dispute) => {
        const order = await repository.getOrder(dispute.orderId);
        const latestDecision = await repository.getLatestDecision(dispute.orderId);
        return {
          dispute_id: dispute.id,
          order_id: dispute.orderId,
          dispute_status: dispute.status,
          reason_code: dispute.reasonCode,
          description: dispute.description,
          opened_at: dispute.createdAt,
          updated_at: dispute.updatedAt,
          resolved_at: dispute.resolvedAt,
          resolution: dispute.resolution,
          order_status: order?.status ?? null,
          participants: order
            ? {
                seller_wallet: order.sellerWallet,
                buyer_wallet: order.buyerWallet,
                rider_wallet: order.riderWallet,
              }
            : null,
          confidence: latestDecision?.confidence ?? null,
          fraud_flags: latestDecision?.fraudFlags ?? [],
          resolution_available: dispute.status === "open",
        };
      }),
    );

    return { disputes: items };
  }

  async getDisputeDetail(input: { actor: SessionActor; disputeIdOrOrderId: string }) {
    const dispute = await resolveDisputeRecord(input.disputeIdOrOrderId);
    const order = await repository.getOrder(dispute.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }

    const actorWallet = await getBoundWalletOrThrow(input.actor);
    const operator = isOperator(input.actor);
    const isParticipant = [order.buyerWallet, order.sellerWallet, order.riderWallet].filter(Boolean).includes(actorWallet);
    if (!operator && !isParticipant) {
      throw new HttpError(403, "Only an order participant or authorized operator can view this dispute", "dispute_forbidden");
    }

    const events = await repository.listDisputeEvents(dispute.id);
    const latestDecision = await repository.getLatestDecision(dispute.orderId);
    const transactions = await repository.getTransactions(dispute.orderId);

    return {
      dispute_id: dispute.id,
      dispute_status: dispute.status,
      reason_code: dispute.reasonCode,
      description: dispute.description,
      opened_at: dispute.createdAt,
      updated_at: dispute.updatedAt,
      resolved_at: dispute.resolvedAt,
      opened_by: {
        user_id: dispute.actorUserId,
        wallet: dispute.actorWallet,
        roles: dispute.actorRoles,
      },
      resolved_by: dispute.resolvedByUserId
        ? {
            user_id: dispute.resolvedByUserId,
            wallet: dispute.resolvedByWallet,
            roles: dispute.resolvedByRoles,
          }
        : null,
      resolution: dispute.resolution
        ? {
            decision: dispute.resolution,
            reason: dispute.resolutionReason,
            note: dispute.resolutionNote,
          }
        : null,
      order: {
        id: order.id,
        status: order.status,
        contract_id: order.contractId,
        seller_wallet: order.sellerWallet,
        buyer_wallet: order.buyerWallet,
        rider_wallet: order.riderWallet,
        funded_at: order.fundedAt,
        released_at: order.releasedAt,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
      },
      latest_review: latestDecision
        ? {
            decision: latestDecision.decision,
            confidence: latestDecision.confidence,
            fraud_flags: latestDecision.fraudFlags,
            reason: latestDecision.reason,
            reviewed_at: latestDecision.createdAt,
          }
        : null,
      transactions,
      events,
      allowed_actions: {
        can_resolve_release: operator && dispute.status === "open",
        can_resolve_refund: operator && dispute.status === "open",
        can_reject_dispute: operator && dispute.status === "open",
      },
    };
  }

  async openDispute(input: {
    actor: SessionActor;
    orderId: string;
    reasonCode: string;
    description: string;
    evidenceRefs?: string[];
    correlationId: string;
  }) {
    const order = await repository.getOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }
    if (order.status === "Released" || order.status === "Refunded") {
      throw new HttpError(409, "Finalized orders cannot be disputed", "dispute_final_state_locked");
    }

    const existingOpenDispute = await repository.getOpenDisputeByOrderId(input.orderId);
    if (existingOpenDispute) {
      throw new HttpError(409, "An open dispute already exists for this order", "dispute_already_open");
    }

    const operator = isOperator(input.actor);
    const actorWallet = await getBoundWalletOrThrow(input.actor);
    const isParticipant =
      actorWallet !== null &&
      [order.buyerWallet, order.sellerWallet, order.riderWallet].filter(Boolean).includes(actorWallet);

    if (!operator && !isParticipant) {
      throw new HttpError(403, "Only an order participant or authorized operator can open a dispute", "dispute_forbidden");
    }

    const dispute = await repository.createDispute({
      id: randomUUID(),
      orderId: input.orderId,
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      frozenFromStatus: order.status,
      reasonCode: input.reasonCode.trim(),
      description: input.description.trim(),
      evidenceRefs: input.evidenceRefs ?? [],
      status: "open",
      correlationId: input.correlationId,
      lastActivityAt: new Date().toISOString(),
      resolution: null,
      resolutionReason: null,
      resolutionNote: null,
      resolvedByUserId: null,
      resolvedByWallet: null,
      resolvedByRoles: [],
      resolvedAt: null,
    });

    await repository.createDisputeEvent({
      disputeId: dispute.id,
      orderId: input.orderId,
      action: "opened",
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      reason: input.reasonCode.trim(),
      note: input.description.trim(),
      resolution: null,
      correlationId: input.correlationId,
    });

    const disputedOrder =
      order.status === "Disputed"
        ? order
        : await repository.updateOrderStatus(
            input.orderId,
            "Disputed",
            "Dispute opened and backend workflow frozen",
          );

    return {
      dispute_id: dispute.id,
      order_id: input.orderId,
      dispute_status: dispute.status.toUpperCase(),
      order_status: disputedOrder.status,
      dispute,
    };
  }

  async resolveDispute(input: {
    actor: SessionActor;
    disputeId: string;
    resolution: "release" | "refund" | "reject_dispute";
    reason: string;
    note: string;
    txHash?: string;
    attestationNonce?: string;
    submittedWallet?: string;
    correlationId: string;
  }) {
    assertHasOperatorRole(
      input.actor,
      "dispute_resolution_forbidden",
      "Only ops_reviewer or ops_admin can resolve disputes",
    );

    const dispute = await resolveDisputeRecord(input.disputeId);
    if (!dispute) {
      throw new HttpError(404, "Dispute not found", "dispute_not_found");
    }
    if (dispute.status !== "open") {
      throw new HttpError(409, "Only open disputes can be resolved", "dispute_not_open");
    }

    const now = new Date().toISOString();
    const actorWallet = await getBoundWalletOrThrow(input.actor);

    if (input.resolution === "reject_dispute") {
      const restoredStatus = dispute.frozenFromStatus === "Disputed" ? "Approved" : dispute.frozenFromStatus;
      const restoredOrder = await repository.updateOrderStatus(
        dispute.orderId,
        restoredStatus,
        "Dispute rejected by operator",
      );

      const updatedDispute = await repository.updateDispute(dispute.id, {
        status: "resolved",
        lastActivityAt: now,
        resolution: input.resolution,
        resolutionReason: input.reason.trim(),
        resolutionNote: input.note.trim(),
        resolvedByUserId: input.actor.userId,
        resolvedByWallet: actorWallet,
        resolvedByRoles: input.actor.roles,
        resolvedAt: now,
        correlationId: input.correlationId,
      });

      await repository.createDisputeEvent({
        disputeId: dispute.id,
        orderId: dispute.orderId,
        action: "resolved",
        actorUserId: input.actor.userId,
        actorWallet,
        actorRoles: input.actor.roles,
        reason: input.reason.trim(),
        note: input.note.trim(),
        resolution: input.resolution,
        correlationId: input.correlationId,
      });

      return {
        dispute_id: updatedDispute.id,
        resolution: input.resolution,
        resolution_status: "resolved" as const,
        order_status: restoredOrder.status,
        next_action: null,
      };
    }

    await repository.createDisputeEvent({
      disputeId: dispute.id,
      orderId: dispute.orderId,
      action: "resolution_requested",
      actorUserId: input.actor.userId,
      actorWallet,
      actorRoles: input.actor.roles,
      reason: input.reason.trim(),
      note: input.note.trim(),
      resolution: input.resolution,
      correlationId: input.correlationId,
    });

    await repository.updateDispute(dispute.id, {
      lastActivityAt: now,
      resolution: input.resolution,
      resolutionReason: input.reason.trim(),
      resolutionNote: input.note.trim(),
      correlationId: input.correlationId,
    });

    if (input.resolution === "release") {
      if (!input.txHash || !input.attestationNonce || !input.submittedWallet) {
        return {
          dispute_id: dispute.id,
          resolution: input.resolution,
          resolution_status: "pending" as const,
          order_status: "Disputed",
          next_action: "chain_release_confirmation_required",
        };
      }

      const releaseResult = await this.releaseService.recordRelease({
        actor: input.actor,
        orderId: dispute.orderId,
        txHash: input.txHash,
        attestationNonce: input.attestationNonce,
        submittedWallet: input.submittedWallet,
        correlationId: input.correlationId,
        allowDisputedResolution: true,
      });

      if (releaseResult.release_status !== "confirmed") {
        return {
          dispute_id: dispute.id,
          resolution: input.resolution,
          resolution_status: "pending" as const,
          order_status: "Disputed",
          next_action: "chain_release_confirmation_required",
        };
      }

      const updatedDispute = await repository.updateDispute(dispute.id, {
        status: "resolved",
        lastActivityAt: now,
        resolution: input.resolution,
        resolutionReason: input.reason.trim(),
        resolutionNote: input.note.trim(),
        resolvedByUserId: input.actor.userId,
        resolvedByWallet: actorWallet,
        resolvedByRoles: input.actor.roles,
        resolvedAt: now,
        correlationId: input.correlationId,
      });

      await repository.createDisputeEvent({
        disputeId: dispute.id,
        orderId: dispute.orderId,
        action: "resolved",
        actorUserId: input.actor.userId,
        actorWallet,
        actorRoles: input.actor.roles,
        reason: input.reason.trim(),
        note: input.note.trim(),
        resolution: input.resolution,
        correlationId: input.correlationId,
      });

      return {
        dispute_id: updatedDispute.id,
        resolution: input.resolution,
        resolution_status: "resolved" as const,
        order_status: releaseResult.order.status,
        next_action: null,
      };
    }

    return {
      dispute_id: dispute.id,
      resolution: input.resolution,
      resolution_status: "pending" as const,
      order_status: "Disputed",
      next_action: "refund_chain_confirmation_required",
    };
  }
}

async function resolveDisputeRecord(disputeIdOrOrderId: string) {
  const direct = await repository.getDisputeById(disputeIdOrOrderId);
  if (direct) {
    return direct;
  }

  const latestForOrder = await repository.getLatestDisputeByOrderId(disputeIdOrOrderId);
  if (latestForOrder) {
    return latestForOrder;
  }

  throw new HttpError(404, "Dispute not found", "dispute_not_found");
}
