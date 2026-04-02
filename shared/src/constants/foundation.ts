export const ACTOR_ROLES = ["seller", "buyer", "rider", "operator"] as const;

export const ACTOR_STATUSES = ["active", "pending_claim", "disabled"] as const;

export const SESSION_STATUSES = ["active", "revoked", "expired"] as const;

export const TOKEN_TYPES = ["buyer_invite", "delivery_confirmation"] as const;

export const TOKEN_PURPOSES = ["claim_workspace", "view_confirmation", "approve_delivery", "reject_delivery"] as const;

export const DURABLE_ORDER_STATUSES = [
  "awaiting_funding",
  "funding_pending",
  "funding_failed",
  "funded",
  "rider_assigned",
  "in_transit",
  "awaiting_buyer_confirmation",
  "manual_review",
  "dispute_open",
  "release_pending",
  "released",
  "refund_pending",
  "refunded",
  "cancelled",
  "expired",
] as const;

export const FINAL_DURABLE_ORDER_STATUSES = ["released", "refunded", "cancelled", "expired"] as const;

export const ORDER_EVENT_TYPES = [
  "order_created",
  "order_created_on_chain",
  "buyer_invite_issued",
  "buyer_claimed",
  "funding_intent_created",
  "funding_submitted",
  "funding_confirmed",
  "funding_failed",
  "rider_accepted",
  "parcel_picked_up",
  "proof_uploaded",
  "proof_submitted",
  "buyer_confirmation_token_issued",
  "buyer_confirmed",
  "buyer_rejected",
  "manual_review_opened",
  "manual_review_resolved",
  "dispute_opened",
  "dispute_resolved_release",
  "dispute_resolved_refund",
  "dispute_rejected",
  "release_submitted",
  "release_confirmed",
  "refund_submitted",
  "refund_confirmed",
  "timeout_triggered",
] as const;

export const WORKFLOW_TRANSITION_ACTIONS = [
  "buyer_submitted_funding",
  "system_confirmed_funding",
  "system_failed_funding",
  "seller_cancelled_order",
  "system_expired_unfunded_order",
  "rider_accepted_order",
  "system_flagged_funded_timeout",
  "operator_refunded_funded_order",
  "rider_marked_pickup",
  "system_flagged_pickup_timeout",
  "rider_submitted_proof",
  "system_flagged_proof_for_review",
  "buyer_approved_delivery",
  "buyer_rejected_delivery",
  "system_flagged_confirmation_timeout",
  "operator_returned_to_buyer_confirmation",
  "operator_opened_dispute_from_review",
  "operator_approved_release_from_review",
  "operator_approved_refund_from_review",
  "operator_resolved_dispute_to_release",
  "operator_resolved_dispute_to_refund",
  "operator_rejected_dispute",
  "system_confirmed_release",
  "system_confirmed_refund",
] as const;

export const WORKFLOW_TRANSITION_TRIGGERS = ["actor", "system", "operator"] as const;

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
export const BUYER_INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const DELIVERY_CONFIRMATION_TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
export const BUYER_PIN_LENGTH = 6;
export const BUYER_CONFIRMATION_FAILED_ATTEMPT_LIMIT = 5;
export const BUYER_CONFIRMATION_LOCKOUT_DURATION_MS = 15 * 60 * 1000;
export const BUYER_CONFIRMATION_REPEATED_LOCKOUT_THRESHOLD = 3;
export const BUYER_PIN_PATTERN = /^\d{6}$/;
