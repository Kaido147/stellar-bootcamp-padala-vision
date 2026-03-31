import { evaluateTransitionEligibility, getActionsAllowedForRole, type ActorRole, type OrderEventType, type WorkflowTransitionAction } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { foundationRepository, type FoundationRepository } from "../lib/foundation-repository.js";

export class StateTransitionService {
  constructor(private readonly repository: FoundationRepository = foundationRepository) {}

  getAvailableActionsForRole(role: ActorRole) {
    return getActionsAllowedForRole(role);
  }

  async transitionOrder(input: {
    orderId: string;
    action: WorkflowTransitionAction;
    actorRole?: ActorRole | null;
    actorId?: string | null;
    note?: string | null;
    metadata?: Record<string, unknown>;
    orderPatch?: {
      riderActorId?: string | null;
      buyerConfirmationDueAt?: string | null;
      riderAcceptDueAt?: string | null;
      deliveryDueAt?: string | null;
      manualReviewReason?: string | null;
      deliveredAt?: string | null;
      buyerConfirmedAt?: string | null;
    };
  }) {
    const order = await this.repository.getWorkflowOrder(input.orderId);
    if (!order) {
      throw new HttpError(404, "Workflow order not found", "workflow_order_not_found");
    }

    const eligibility = evaluateTransitionEligibility({
      from: order.workflowStatus,
      action: input.action,
      actorRole: input.actorRole ?? null,
    });

    if (!eligibility.allowed || !eligibility.transition) {
      throw mapTransitionError(eligibility.reason);
    }

    const occurredAt = new Date().toISOString();
    const updated = await this.repository.updateWorkflowOrder(order.id, {
      workflowStatus: eligibility.transition.to,
      lastEventType: eligibility.transition.emitsEvent,
      lastEventAt: occurredAt,
      buyerConfirmedAt:
        input.orderPatch?.buyerConfirmedAt ??
        (eligibility.transition.emitsEvent === "buyer_confirmed" ? occurredAt : order.buyerConfirmedAt),
      deliveredAt:
        input.orderPatch?.deliveredAt ??
        ((eligibility.transition.emitsEvent === "proof_submitted" || eligibility.transition.emitsEvent === "buyer_confirmed")
          ? occurredAt
          : order.deliveredAt),
      riderActorId: input.orderPatch?.riderActorId,
      buyerConfirmationDueAt: input.orderPatch?.buyerConfirmationDueAt,
      riderAcceptDueAt: input.orderPatch?.riderAcceptDueAt,
      deliveryDueAt: input.orderPatch?.deliveryDueAt,
      manualReviewReason: input.orderPatch?.manualReviewReason,
    });

    const event = await this.repository.createOrderTimelineEvent({
      orderId: order.id,
      type: eligibility.transition.emitsEvent as OrderEventType,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      note: input.note ?? eligibility.transition.description,
      metadata: input.metadata ?? {},
      occurredAt,
    });

    return {
      order: updated,
      event,
      transition: eligibility.transition,
    };
  }
}

function mapTransitionError(reason: string) {
  switch (reason) {
    case "role_not_allowed":
      return new HttpError(403, "Actor role is not allowed to perform this transition", "workflow_transition_forbidden");
    case "final_state_locked":
      return new HttpError(409, "Final workflow states are locked", "workflow_transition_final_locked");
    case "unknown_transition":
    default:
      return new HttpError(409, "Transition is not allowed from the current workflow state", "workflow_transition_invalid");
  }
}
