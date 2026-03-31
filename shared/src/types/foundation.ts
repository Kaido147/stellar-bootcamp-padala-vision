import type {
  ACTOR_ROLES,
  ACTOR_STATUSES,
  DURABLE_ORDER_STATUSES,
  ORDER_EVENT_TYPES,
  SESSION_STATUSES,
  TOKEN_PURPOSES,
  TOKEN_TYPES,
  WORKFLOW_TRANSITION_ACTIONS,
  WORKFLOW_TRANSITION_TRIGGERS,
} from "../constants/foundation.js";

export type ActorRole = (typeof ACTOR_ROLES)[number];
export type ActorStatus = (typeof ACTOR_STATUSES)[number];
export type SessionStatus = (typeof SESSION_STATUSES)[number];
export type TokenType = (typeof TOKEN_TYPES)[number];
export type TokenPurpose = (typeof TOKEN_PURPOSES)[number];
export type DurableOrderStatus = (typeof DURABLE_ORDER_STATUSES)[number];
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];
export type WorkflowTransitionAction = (typeof WORKFLOW_TRANSITION_ACTIONS)[number];
export type WorkflowTransitionTrigger = (typeof WORKFLOW_TRANSITION_TRIGGERS)[number];

export interface ActorRecord {
  id: string;
  role: ActorRole;
  status: ActorStatus;
  displayName: string;
  workspaceCode: string | null;
  contactLabel: string | null;
  createdByActorId: string | null;
  claimedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface ActorSummary {
  id: string;
  role: ActorRole;
  status: ActorStatus;
  displayName: string;
}

export interface ActorSessionRecord {
  id: string;
  actorId: string;
  actorRole: ActorRole;
  status: SessionStatus;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
}

export interface SessionActor {
  sessionId: string;
  actorId: string;
  role: ActorRole;
  status: ActorStatus;
}

export interface OrderOwnership {
  sellerActorId: string;
  buyerActorId: string;
  riderActorId: string | null;
}

export type OrderActorRelation = "seller_owner" | "buyer_owner" | "rider_owner" | "operator" | "non_participant";

export interface OrderAccessContext {
  actor: SessionActor;
  ownership: OrderOwnership;
}

export interface OrderTimelineEvent {
  id: string;
  orderId: string;
  type: OrderEventType;
  occurredAt: string;
  actorId: string | null;
  actorRole: ActorRole | null;
  note: string | null;
  metadata: Record<string, unknown>;
}

export interface WorkflowTransition {
  action: WorkflowTransitionAction;
  from: DurableOrderStatus;
  to: DurableOrderStatus;
  trigger: WorkflowTransitionTrigger;
  allowedRoles: ActorRole[];
  emitsEvent: OrderEventType;
  description: string;
}

export interface TransitionEligibilityInput {
  from: DurableOrderStatus;
  action: WorkflowTransitionAction;
  actorRole?: ActorRole | null;
}

export interface TransitionEligibilityResult {
  allowed: boolean;
  reason:
    | "ok"
    | "unknown_transition"
    | "role_not_allowed"
    | "final_state_locked";
  transition: WorkflowTransition | null;
}

export interface TokenLifecyclePolicy {
  type: TokenType;
  defaultPurpose: TokenPurpose;
  ttlMs: number;
  oneTimeUse: true;
}

export interface TokenRecordSummary {
  id: string;
  type: TokenType;
  purpose: TokenPurpose;
  actorId: string;
  orderId: string;
  expiresAt: string;
  consumedAt: string | null;
}
