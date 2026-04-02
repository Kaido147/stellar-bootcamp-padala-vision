import {
  ACTOR_ROLES,
  BUYER_CONFIRMATION_FAILED_ATTEMPT_LIMIT,
  BUYER_CONFIRMATION_LOCKOUT_DURATION_MS,
  BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD,
  BUYER_INVITE_TOKEN_TTL_MS,
  BUYER_PIN_LENGTH,
  BUYER_PIN_PATTERN,
  DELIVERY_CONFIRMATION_TOKEN_TTL_MS,
  FINAL_DURABLE_ORDER_STATUSES,
  SESSION_TTL_MS,
} from "../constants/foundation.js";
import type {
  ActorRole,
  DurableOrderStatus,
  OrderAccessContext,
  OrderActorRelation,
  TokenLifecyclePolicy,
  TransitionEligibilityInput,
  TransitionEligibilityResult,
  WorkflowTransition,
  WorkflowTransitionAction,
} from "../types/foundation.js";

export const TOKEN_LIFECYCLE_POLICIES = {
  buyer_invite: {
    type: "buyer_invite",
    defaultPurpose: "claim_workspace",
    ttlMs: BUYER_INVITE_TOKEN_TTL_MS,
    oneTimeUse: true,
  },
  delivery_confirmation: {
    type: "delivery_confirmation",
    defaultPurpose: "approve_delivery",
    ttlMs: DELIVERY_CONFIRMATION_TOKEN_TTL_MS,
    oneTimeUse: true,
  },
} as const satisfies Record<string, TokenLifecyclePolicy>;

export const WORKFLOW_TRANSITIONS = [
  {
    action: "buyer_submitted_funding",
    from: "awaiting_funding",
    to: "funding_pending",
    trigger: "actor",
    allowedRoles: ["buyer"],
    emitsEvent: "funding_submitted",
    description: "Buyer submitted a funding transaction for verification.",
  },
  {
    action: "buyer_submitted_funding",
    from: "funding_failed",
    to: "funding_pending",
    trigger: "actor",
    allowedRoles: ["buyer"],
    emitsEvent: "funding_submitted",
    description: "Buyer retried funding after a failed funding attempt.",
  },
  {
    action: "system_confirmed_funding",
    from: "funding_pending",
    to: "funded",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "funding_confirmed",
    description: "System confirmed the buyer funding transaction on chain.",
  },
  {
    action: "system_failed_funding",
    from: "funding_pending",
    to: "funding_failed",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "funding_failed",
    description: "System marked the funding attempt as failed after chain verification.",
  },
  {
    action: "seller_cancelled_order",
    from: "awaiting_funding",
    to: "cancelled",
    trigger: "actor",
    allowedRoles: ["seller"],
    emitsEvent: "timeout_triggered",
    description: "Seller cancels an unfunded order before fulfillment begins.",
  },
  {
    action: "system_expired_unfunded_order",
    from: "awaiting_funding",
    to: "expired",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "timeout_triggered",
    description: "System expires an unfunded order at the funding deadline.",
  },
  {
    action: "rider_accepted_order",
    from: "funded",
    to: "rider_assigned",
    trigger: "actor",
    allowedRoles: ["rider"],
    emitsEvent: "rider_accepted",
    description: "Rider accepts a funded job.",
  },
  {
    action: "system_flagged_funded_timeout",
    from: "funded",
    to: "manual_review",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "manual_review_opened",
    description: "System escalates a funded order that did not progress in time.",
  },
  {
    action: "operator_refunded_funded_order",
    from: "funded",
    to: "refund_pending",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "manual_review_resolved",
    description: "Operator routes a funded order to refund.",
  },
  {
    action: "rider_marked_pickup",
    from: "rider_assigned",
    to: "in_transit",
    trigger: "actor",
    allowedRoles: ["rider"],
    emitsEvent: "parcel_picked_up",
    description: "Assigned rider marks the parcel as picked up.",
  },
  {
    action: "system_flagged_pickup_timeout",
    from: "rider_assigned",
    to: "manual_review",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "manual_review_opened",
    description: "System escalates an assigned order that was not picked up in time.",
  },
  {
    action: "rider_submitted_proof",
    from: "in_transit",
    to: "awaiting_buyer_confirmation",
    trigger: "actor",
    allowedRoles: ["rider"],
    emitsEvent: "proof_submitted",
    description: "Rider submits proof and buyer confirmation becomes the next decision point.",
  },
  {
    action: "system_flagged_proof_for_review",
    from: "in_transit",
    to: "manual_review",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "manual_review_opened",
    description: "System escalates suspicious or incomplete proof for operator review.",
  },
  {
    action: "buyer_approved_delivery",
    from: "awaiting_buyer_confirmation",
    to: "release_pending",
    trigger: "actor",
    allowedRoles: ["buyer"],
    emitsEvent: "buyer_confirmed",
    description: "Buyer approves delivery using a valid confirmation token and PIN.",
  },
  {
    action: "buyer_rejected_delivery",
    from: "awaiting_buyer_confirmation",
    to: "dispute_open",
    trigger: "actor",
    allowedRoles: ["buyer"],
    emitsEvent: "buyer_rejected",
    description: "Buyer rejects delivery using a valid confirmation token and PIN.",
  },
  {
    action: "system_flagged_confirmation_timeout",
    from: "awaiting_buyer_confirmation",
    to: "manual_review",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "manual_review_opened",
    description: "System escalates an order when buyer confirmation expires.",
  },
  {
    action: "operator_returned_to_buyer_confirmation",
    from: "manual_review",
    to: "awaiting_buyer_confirmation",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "manual_review_resolved",
    description: "Operator returns the order to buyer confirmation after review.",
  },
  {
    action: "operator_opened_dispute_from_review",
    from: "manual_review",
    to: "dispute_open",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "dispute_opened",
    description: "Operator opens a formal dispute from manual review.",
  },
  {
    action: "operator_approved_release_from_review",
    from: "manual_review",
    to: "release_pending",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "manual_review_resolved",
    description: "Operator routes the order to release after manual review.",
  },
  {
    action: "operator_approved_refund_from_review",
    from: "manual_review",
    to: "refund_pending",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "manual_review_resolved",
    description: "Operator routes the order to refund after manual review.",
  },
  {
    action: "operator_resolved_dispute_to_release",
    from: "dispute_open",
    to: "release_pending",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "dispute_resolved_release",
    description: "Operator resolves an open dispute in favor of release.",
  },
  {
    action: "operator_resolved_dispute_to_refund",
    from: "dispute_open",
    to: "refund_pending",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "dispute_resolved_refund",
    description: "Operator resolves an open dispute in favor of refund.",
  },
  {
    action: "operator_rejected_dispute",
    from: "dispute_open",
    to: "awaiting_buyer_confirmation",
    trigger: "operator",
    allowedRoles: ["operator"],
    emitsEvent: "dispute_rejected",
    description: "Operator rejects the dispute and returns the order to buyer confirmation.",
  },
  {
    action: "system_confirmed_release",
    from: "release_pending",
    to: "released",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "release_confirmed",
    description: "System confirms the release on chain.",
  },
  {
    action: "system_confirmed_refund",
    from: "refund_pending",
    to: "refunded",
    trigger: "system",
    allowedRoles: [],
    emitsEvent: "refund_confirmed",
    description: "System confirms the refund on chain.",
  },
] as const satisfies readonly WorkflowTransition[];

const FINAL_STATUS_SET = new Set<DurableOrderStatus>(FINAL_DURABLE_ORDER_STATUSES);
const ACTOR_ROLE_SET = new Set<ActorRole>(ACTOR_ROLES);

export function isFinalDurableOrderStatus(status: DurableOrderStatus) {
  return FINAL_STATUS_SET.has(status);
}

export function getTransitionsFrom(status: DurableOrderStatus) {
  return WORKFLOW_TRANSITIONS.filter((transition) => transition.from === status);
}

export function getTransitionForAction(from: DurableOrderStatus, action: WorkflowTransitionAction) {
  return WORKFLOW_TRANSITIONS.find((transition) => transition.from === from && transition.action === action) ?? null;
}

export function getActionsAllowedForRole(role: ActorRole) {
  if (!ACTOR_ROLE_SET.has(role)) {
    return [] as WorkflowTransitionAction[];
  }

  return [
    ...new Set(
      WORKFLOW_TRANSITIONS.filter((transition) =>
        (transition.allowedRoles as readonly ActorRole[]).some((allowedRole) => allowedRole === role),
      ).map((transition) => transition.action),
    ),
  ];
}

export function canActorRoleTriggerAction(role: ActorRole, action: WorkflowTransitionAction) {
  return getActionsAllowedForRole(role).includes(action);
}

export function evaluateTransitionEligibility(input: TransitionEligibilityInput): TransitionEligibilityResult {
  if (isFinalDurableOrderStatus(input.from)) {
    return {
      allowed: false,
      reason: "final_state_locked",
      transition: null,
    };
  }

  const transition = getTransitionForAction(input.from, input.action);
  if (!transition) {
    return {
      allowed: false,
      reason: "unknown_transition",
      transition: null,
    };
  }

  if (
    transition.allowedRoles.length > 0 &&
    (!input.actorRole ||
      !(transition.allowedRoles as readonly ActorRole[]).some((allowedRole) => allowedRole === input.actorRole))
  ) {
    return {
      allowed: false,
      reason: "role_not_allowed",
      transition,
    };
  }

  return {
    allowed: true,
    reason: "ok",
    transition,
  };
}

export function resolveOrderActorRelation(context: OrderAccessContext): OrderActorRelation {
  if (context.actor.role === "operator") {
    return "operator";
  }

  if (context.actor.actorId === context.ownership.sellerActorId && context.actor.role === "seller") {
    return "seller_owner";
  }

  if (context.actor.actorId === context.ownership.buyerActorId && context.actor.role === "buyer") {
    return "buyer_owner";
  }

  if (context.ownership.riderActorId && context.actor.actorId === context.ownership.riderActorId && context.actor.role === "rider") {
    return "rider_owner";
  }

  return "non_participant";
}

export function canReadSharedOrderDetail(context: OrderAccessContext) {
  return resolveOrderActorRelation(context) !== "non_participant";
}

export function isValidBuyerPin(pin: string) {
  return pin.length === BUYER_PIN_LENGTH && BUYER_PIN_PATTERN.test(pin);
}

export const FOUNDATION_POLICY = {
  sessionTtlMs: SESSION_TTL_MS,
  buyerInviteTokenTtlMs: BUYER_INVITE_TOKEN_TTL_MS,
  deliveryConfirmationTokenTtlMs: DELIVERY_CONFIRMATION_TOKEN_TTL_MS,
  buyerPinLength: BUYER_PIN_LENGTH,
  failedAttemptLimit: BUYER_CONFIRMATION_FAILED_ATTEMPT_LIMIT,
  lockoutDurationMs: BUYER_CONFIRMATION_LOCKOUT_DURATION_MS,
  repeatedLockoutThreshold: BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD,
} as const;
