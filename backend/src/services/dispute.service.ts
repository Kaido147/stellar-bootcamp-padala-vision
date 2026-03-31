import { randomUUID } from "node:crypto";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { ReleaseService } from "./release.service.js";

export class DisputeService {
  constructor(private readonly releaseService = new ReleaseService()) {}

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

    const actorWalletBinding = await repository.getActiveWalletBindingByUser(input.actor.userId);
    const actorWallet = actorWalletBinding?.walletAddress ?? null;
    const isOperator = input.actor.roles.includes("ops_reviewer") || input.actor.roles.includes("ops_admin");
    const isParticipant =
      actorWallet !== null &&
      [order.buyerWallet, order.sellerWallet, order.riderWallet].filter(Boolean).includes(actorWallet);

    if (!isOperator && !isParticipant) {
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
    if (!input.actor.roles.includes("ops_reviewer") && !input.actor.roles.includes("ops_admin")) {
      throw new HttpError(403, "Only ops_reviewer or ops_admin can resolve disputes", "dispute_resolution_forbidden");
    }

    const dispute = await repository.getDisputeById(input.disputeId);
    if (!dispute) {
      throw new HttpError(404, "Dispute not found", "dispute_not_found");
    }
    if (dispute.status !== "open") {
      throw new HttpError(409, "Only open disputes can be resolved", "dispute_not_open");
    }

    const now = new Date().toISOString();
    const actorWalletBinding = await repository.getActiveWalletBindingByUser(input.actor.userId);
    const actorWallet = actorWalletBinding?.walletAddress ?? null;

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
