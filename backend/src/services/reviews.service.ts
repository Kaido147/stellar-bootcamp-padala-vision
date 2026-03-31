import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import type { SessionActor } from "../middleware/auth.js";
import { assertHasOperatorRole } from "./authorization.service.js";

const REVIEW_QUEUE_STATUSES = ["EvidenceSubmitted", "Approved", "Rejected", "Disputed"] as const;

export class ReviewsService {
  async listReviews(input: { actor: SessionActor }) {
    assertHasOperatorRole(
      input.actor,
      "review_queue_forbidden",
      "Only ops_reviewer or ops_admin can view the review queue",
    );

    const orders = await repository.listOrdersByStatuses([...REVIEW_QUEUE_STATUSES]);
    const reviews = await Promise.all(
      orders.map(async (order) => {
        const latestDecision = await repository.getLatestDecision(order.id);
        const latestDispute = await repository.getLatestDisputeByOrderId(order.id);
        const evidence = await repository.listEvidenceByOrderId(order.id);
        const latestEvidence = evidence.at(-1) ?? null;

        return {
          order_id: order.id,
          order_status: order.status,
          participants: {
            seller_wallet: order.sellerWallet,
            buyer_wallet: order.buyerWallet,
            rider_wallet: order.riderWallet,
          },
          review_state: latestDecision
            ? latestDecision.decision === "APPROVE"
              ? "approved"
              : latestDecision.decision === "REJECT"
                ? "rejected"
                : "manual_review"
            : "pending_review",
          submitted_at: latestEvidence?.submittedAt ?? null,
          reviewed_at: latestDecision?.createdAt ?? null,
          reason: latestDecision?.reason ?? (latestDispute?.description ?? null),
          confidence: latestDecision?.confidence ?? null,
          fraud_flags: latestDecision?.fraudFlags ?? [],
          dispute_status: latestDispute?.status ?? null,
          resolution_available: order.status === "Approved" || order.status === "Rejected" || order.status === "Disputed",
        };
      }),
    );

    return {
      reviews: reviews.sort((left, right) => {
        const leftTime = Date.parse(left.reviewed_at ?? left.submitted_at ?? "1970-01-01T00:00:00.000Z");
        const rightTime = Date.parse(right.reviewed_at ?? right.submitted_at ?? "1970-01-01T00:00:00.000Z");
        return rightTime - leftTime;
      }),
    };
  }

  async getReview(orderId: string, actor: SessionActor) {
    assertHasOperatorRole(
      actor,
      "review_detail_forbidden",
      "Only ops_reviewer or ops_admin can view review detail",
    );

    const order = await repository.getOrder(orderId);
    if (!order) {
      throw new HttpError(404, "Order not found", "order_not_found");
    }

    const latestDecision = await repository.getLatestDecision(orderId);
    const history = await repository.getHistory(orderId);
    const evidence = await repository.listEvidenceByOrderId(orderId);
    const latestDispute = await repository.getLatestDisputeByOrderId(orderId);
    const transactions = await repository.getTransactions(orderId);

    return {
      order_id: order.id,
      order,
      history,
      evidence,
      latest_decision: latestDecision
        ? {
            decision: latestDecision.decision,
            confidence: latestDecision.confidence,
            fraud_flags: latestDecision.fraudFlags,
            reason: latestDecision.reason,
            reviewed_at: latestDecision.createdAt,
            attestation_issued_at: latestDecision.issuedAt,
            attestation_expires_at: latestDecision.expiresAt,
          }
        : null,
      latest_dispute: latestDispute
        ? {
            dispute_id: latestDispute.id,
            dispute_status: latestDispute.status,
            reason_code: latestDispute.reasonCode,
            description: latestDispute.description,
          }
        : null,
      transactions,
      resolution_available: order.status === "Approved" || order.status === "Rejected" || order.status === "Disputed",
    };
  }
}
