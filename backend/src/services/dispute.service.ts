import { randomUUID } from "node:crypto";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";

export class DisputeService {
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
      reasonCode: input.reasonCode.trim(),
      description: input.description.trim(),
      evidenceRefs: input.evidenceRefs ?? [],
      status: "open",
      correlationId: input.correlationId,
      lastActivityAt: new Date().toISOString(),
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
}
