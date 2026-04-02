import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ActorRecord,
  ActorRole,
  ActorSessionRecord,
  ActorStatus,
  DurableOrderStatus,
  OrderEventType,
  OrderOwnership,
  OrderTimelineEvent,
  SessionStatus,
  TokenPurpose,
  TokenRecordSummary,
  TokenType,
} from "@padala-vision/shared";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase.js";

export interface StoredActorRecord extends ActorRecord {
  pinHash: string | null;
  failedPinAttempts: number;
  pinLockedUntil: string | null;
  repeatedLockoutCount: number;
}

export interface StoredActorSessionRecord extends ActorSessionRecord {
  tokenHash: string;
  createdAt: string;
  updatedAt: string;
}

export interface StoredOrderAccessTokenRecord extends TokenRecordSummary {
  tokenHash: string;
  shortCodeHash: string | null;
  invalidatedAt: string | null;
  invalidatedReason: string | null;
  createdByActorId: string | null;
  createdAt: string;
}

export interface WorkflowOrderRecord {
  id: string;
  publicOrderCode: string;
  workflowStatus: DurableOrderStatus;
  contractId: string | null;
  onChainOrderId: string | null;
  sellerWallet: string;
  buyerWallet: string;
  riderWallet: string | null;
  orderCreatedTxHash: string | null;
  fundingTxHash: string | null;
  fundingStatus: "not_started" | "pending" | "confirmed" | "failed";
  lastChainReconciliationStatus: string | null;
  lastChainReconciledAt: string | null;
  lastChainError: string | null;
  sellerActorId: string;
  buyerActorId: string;
  riderActorId: string | null;
  itemAmount: string;
  deliveryFee: string;
  totalAmount: string;
  itemDescription: string;
  pickupLabel: string;
  dropoffLabel: string;
  fundingDeadlineAt: string;
  buyerConfirmationDueAt: string | null;
  riderAcceptDueAt: string | null;
  deliveryDueAt: string | null;
  manualReviewReason: string | null;
  lastEventType: OrderEventType;
  lastEventAt: string;
  deliveredAt: string | null;
  buyerConfirmedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CreateActorInput {
  id?: string;
  role: ActorRole;
  status: ActorStatus;
  displayName: string;
  workspaceCode: string | null;
  contactLabel?: string | null;
  pinHash?: string | null;
  failedPinAttempts?: number;
  pinLockedUntil?: string | null;
  repeatedLockoutCount?: number;
  createdByActorId?: string | null;
  claimedAt?: string | null;
  lastLoginAt?: string | null;
}

interface UpdateActorPatch {
  status?: ActorStatus;
  displayName?: string;
  workspaceCode?: string | null;
  contactLabel?: string | null;
  pinHash?: string | null;
  failedPinAttempts?: number;
  pinLockedUntil?: string | null;
  repeatedLockoutCount?: number;
  claimedAt?: string | null;
  lastLoginAt?: string | null;
}

interface CreateActorSessionInput {
  id: string;
  actorId: string;
  actorRole: ActorRole;
  tokenHash: string;
  status: SessionStatus;
  issuedAt: string;
  expiresAt: string;
  lastSeenAt: string;
  revokedAt?: string | null;
}

interface UpdateActorSessionPatch {
  status?: SessionStatus;
  expiresAt?: string;
  lastSeenAt?: string;
  revokedAt?: string | null;
}

interface CreateOrderAccessTokenInput {
  id?: string;
  orderId: string;
  actorId: string;
  type: TokenType;
  purpose: TokenPurpose;
  tokenHash: string;
  shortCodeHash?: string | null;
  expiresAt: string;
  createdByActorId?: string | null;
}

interface CreateWorkflowOrderInput {
  id: string;
  publicOrderCode: string;
  workflowStatus: DurableOrderStatus;
  contractId?: string | null;
  onChainOrderId?: string | null;
  sellerWallet: string;
  buyerWallet: string;
  riderWallet?: string | null;
  orderCreatedTxHash?: string | null;
  fundingTxHash?: string | null;
  fundingStatus?: "not_started" | "pending" | "confirmed" | "failed";
  lastChainReconciliationStatus?: string | null;
  lastChainReconciledAt?: string | null;
  lastChainError?: string | null;
  sellerActorId: string;
  buyerActorId: string;
  riderActorId?: string | null;
  itemAmount: string;
  deliveryFee: string;
  totalAmount: string;
  itemDescription: string;
  pickupLabel: string;
  dropoffLabel: string;
  fundingDeadlineAt: string;
  buyerConfirmationDueAt?: string | null;
  riderAcceptDueAt?: string | null;
  deliveryDueAt?: string | null;
  manualReviewReason?: string | null;
  lastEventType: OrderEventType;
  lastEventAt: string;
  deliveredAt?: string | null;
  buyerConfirmedAt?: string | null;
}

interface UpdateWorkflowOrderPatch {
  workflowStatus?: DurableOrderStatus;
  contractId?: string | null;
  onChainOrderId?: string | null;
  sellerWallet?: string;
  buyerWallet?: string;
  riderWallet?: string | null;
  orderCreatedTxHash?: string | null;
  fundingTxHash?: string | null;
  fundingStatus?: "not_started" | "pending" | "confirmed" | "failed";
  lastChainReconciliationStatus?: string | null;
  lastChainReconciledAt?: string | null;
  lastChainError?: string | null;
  riderActorId?: string | null;
  buyerConfirmationDueAt?: string | null;
  riderAcceptDueAt?: string | null;
  deliveryDueAt?: string | null;
  manualReviewReason?: string | null;
  lastEventType?: OrderEventType;
  lastEventAt?: string;
  deliveredAt?: string | null;
  buyerConfirmedAt?: string | null;
}

interface CreateOrderTimelineEventInput {
  id?: string;
  orderId: string;
  type: OrderEventType;
  actorId?: string | null;
  actorRole?: ActorRole | null;
  note?: string | null;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

interface InvalidateOrderAccessTokensInput {
  orderId: string;
  type: TokenType;
  actorId?: string | null;
  invalidatedAt: string;
  reason: string;
}

export interface FoundationRepository {
  readonly mode: "memory" | "supabase";
  createActor(input: CreateActorInput): Promise<StoredActorRecord>;
  getActorById(id: string): Promise<StoredActorRecord | null>;
  getActorByWorkspaceCode(workspaceCode: string): Promise<StoredActorRecord | null>;
  getActorsByIds(ids: string[]): Promise<StoredActorRecord[]>;
  updateActor(id: string, patch: UpdateActorPatch): Promise<StoredActorRecord>;
  createActorSession(input: CreateActorSessionInput): Promise<StoredActorSessionRecord>;
  getActorSessionByTokenHash(tokenHash: string): Promise<StoredActorSessionRecord | null>;
  updateActorSession(id: string, patch: UpdateActorSessionPatch): Promise<StoredActorSessionRecord>;
  revokeActorSession(id: string, revokedAt: string): Promise<StoredActorSessionRecord | null>;
  revokeActorSessionsByActor(actorId: string, revokedAt: string): Promise<number>;
  createOrderAccessToken(input: CreateOrderAccessTokenInput): Promise<StoredOrderAccessTokenRecord>;
  getOrderAccessTokenByTokenHash(tokenHash: string): Promise<StoredOrderAccessTokenRecord | null>;
  hasActiveOrderAccessToken(orderId: string, type: TokenType, actorId?: string | null): Promise<boolean>;
  consumeOrderAccessToken(id: string, consumedAt: string): Promise<StoredOrderAccessTokenRecord | null>;
  invalidateOrderAccessTokens(input: InvalidateOrderAccessTokensInput): Promise<number>;
  createWorkflowOrder(input: CreateWorkflowOrderInput): Promise<WorkflowOrderRecord>;
  getWorkflowOrder(id: string): Promise<WorkflowOrderRecord | null>;
  updateWorkflowOrder(id: string, patch: UpdateWorkflowOrderPatch): Promise<WorkflowOrderRecord>;
  getWorkflowOrderOwnership(orderId: string): Promise<OrderOwnership | null>;
  createOrderTimelineEvent(input: CreateOrderTimelineEventInput): Promise<OrderTimelineEvent>;
  listOrderTimelineEvents(orderId: string): Promise<OrderTimelineEvent[]>;
  listWorkflowOrdersBySeller(actorId: string): Promise<WorkflowOrderRecord[]>;
  listWorkflowOrdersByBuyer(actorId: string): Promise<WorkflowOrderRecord[]>;
  listAvailableRiderWorkflowOrders(): Promise<WorkflowOrderRecord[]>;
  listAssignedRiderWorkflowOrders(actorId: string): Promise<WorkflowOrderRecord[]>;
  listWorkflowOrdersByStatuses(statuses: DurableOrderStatus[]): Promise<WorkflowOrderRecord[]>;
}

export class InMemoryFoundationRepository implements FoundationRepository {
  readonly mode = "memory" as const;
  private actors = new Map<string, StoredActorRecord>();
  private sessions = new Map<string, StoredActorSessionRecord>();
  private tokens = new Map<string, StoredOrderAccessTokenRecord>();
  private workflowOrders = new Map<string, WorkflowOrderRecord>();
  private timelineEvents: OrderTimelineEvent[] = [];

  async createActor(input: CreateActorInput): Promise<StoredActorRecord> {
    const now = new Date().toISOString();
    const actor: StoredActorRecord = {
      id: input.id ?? randomUUID(),
      role: input.role,
      status: input.status,
      displayName: input.displayName,
      workspaceCode: input.workspaceCode,
      contactLabel: input.contactLabel ?? null,
      createdByActorId: input.createdByActorId ?? null,
      claimedAt: input.claimedAt ?? null,
      createdAt: now,
      updatedAt: now,
      lastLoginAt: input.lastLoginAt ?? null,
      pinHash: input.pinHash ?? null,
      failedPinAttempts: input.failedPinAttempts ?? 0,
      pinLockedUntil: input.pinLockedUntil ?? null,
      repeatedLockoutCount: input.repeatedLockoutCount ?? 0,
    };

    this.actors.set(actor.id, actor);
    return actor;
  }

  async getActorById(id: string) {
    return this.actors.get(id) ?? null;
  }

  async getActorByWorkspaceCode(workspaceCode: string) {
    return [...this.actors.values()].find((actor) => actor.workspaceCode === workspaceCode) ?? null;
  }

  async getActorsByIds(ids: string[]) {
    return ids.map((id) => this.actors.get(id)).filter((actor): actor is StoredActorRecord => Boolean(actor));
  }

  async updateActor(id: string, patch: UpdateActorPatch) {
    const existing = this.actors.get(id);
    if (!existing) {
      throw new Error(`Actor ${id} not found`);
    }

    const updated: StoredActorRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.actors.set(id, updated);
    return updated;
  }

  async createActorSession(input: CreateActorSessionInput) {
    const now = new Date().toISOString();
    const session: StoredActorSessionRecord = {
      id: input.id,
      actorId: input.actorId,
      actorRole: input.actorRole,
      tokenHash: input.tokenHash,
      status: input.status,
      issuedAt: input.issuedAt,
      expiresAt: input.expiresAt,
      lastSeenAt: input.lastSeenAt,
      revokedAt: input.revokedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async getActorSessionByTokenHash(tokenHash: string) {
    return [...this.sessions.values()].find((session) => session.tokenHash === tokenHash) ?? null;
  }

  async updateActorSession(id: string, patch: UpdateActorSessionPatch) {
    const existing = this.sessions.get(id);
    if (!existing) {
      throw new Error(`Actor session ${id} not found`);
    }

    const updated: StoredActorSessionRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.sessions.set(id, updated);
    return updated;
  }

  async revokeActorSession(id: string, revokedAt: string) {
    const existing = this.sessions.get(id);
    if (!existing) {
      return null;
    }

    return this.updateActorSession(id, {
      status: "revoked",
      revokedAt,
    });
  }

  async revokeActorSessionsByActor(actorId: string, revokedAt: string) {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.actorId !== actorId || session.status === "revoked") {
        continue;
      }

      await this.updateActorSession(session.id, {
        status: "revoked",
        revokedAt,
      });
      count += 1;
    }

    return count;
  }

  async createOrderAccessToken(input: CreateOrderAccessTokenInput) {
    const now = new Date().toISOString();
    const token: StoredOrderAccessTokenRecord = {
      id: input.id ?? randomUUID(),
      orderId: input.orderId,
      actorId: input.actorId,
      type: input.type,
      purpose: input.purpose,
      tokenHash: input.tokenHash,
      shortCodeHash: input.shortCodeHash ?? null,
      expiresAt: input.expiresAt,
      consumedAt: null,
      invalidatedAt: null,
      invalidatedReason: null,
      createdByActorId: input.createdByActorId ?? null,
      createdAt: now,
    };

    this.tokens.set(token.id, token);
    return token;
  }

  async getOrderAccessTokenByTokenHash(tokenHash: string) {
    return [...this.tokens.values()].find((token) => token.tokenHash === tokenHash) ?? null;
  }

  async hasActiveOrderAccessToken(orderId: string, type: TokenType, actorId?: string | null) {
    const now = Date.now();
    return [...this.tokens.values()].some((token) => {
      if (token.orderId !== orderId || token.type !== type) {
        return false;
      }
      if (actorId && token.actorId !== actorId) {
        return false;
      }
      if (token.invalidatedAt || token.consumedAt) {
        return false;
      }
      return Date.parse(token.expiresAt) > now;
    });
  }

  async consumeOrderAccessToken(id: string, consumedAt: string) {
    const existing = this.tokens.get(id);
    if (!existing || existing.consumedAt || existing.invalidatedAt) {
      return existing ?? null;
    }

    const updated: StoredOrderAccessTokenRecord = {
      ...existing,
      consumedAt,
    };
    this.tokens.set(id, updated);
    return updated;
  }

  async invalidateOrderAccessTokens(input: InvalidateOrderAccessTokensInput) {
    let count = 0;
    for (const token of this.tokens.values()) {
      if (token.orderId !== input.orderId || token.type !== input.type || token.invalidatedAt || token.consumedAt) {
        continue;
      }
      if (input.actorId && token.actorId !== input.actorId) {
        continue;
      }

      this.tokens.set(token.id, {
        ...token,
        invalidatedAt: input.invalidatedAt,
        invalidatedReason: input.reason,
      });
      count += 1;
    }

    return count;
  }

  async createWorkflowOrder(input: CreateWorkflowOrderInput) {
    const now = new Date().toISOString();
    const order: WorkflowOrderRecord = {
      id: input.id,
      publicOrderCode: input.publicOrderCode,
      workflowStatus: input.workflowStatus,
      contractId: input.contractId ?? null,
      onChainOrderId: input.onChainOrderId ?? null,
      sellerWallet: input.sellerWallet,
      buyerWallet: input.buyerWallet,
      riderWallet: input.riderWallet ?? null,
      orderCreatedTxHash: input.orderCreatedTxHash ?? null,
      fundingTxHash: input.fundingTxHash ?? null,
      fundingStatus: input.fundingStatus ?? "not_started",
      lastChainReconciliationStatus: input.lastChainReconciliationStatus ?? null,
      lastChainReconciledAt: input.lastChainReconciledAt ?? null,
      lastChainError: input.lastChainError ?? null,
      sellerActorId: input.sellerActorId,
      buyerActorId: input.buyerActorId,
      riderActorId: input.riderActorId ?? null,
      itemAmount: input.itemAmount,
      deliveryFee: input.deliveryFee,
      totalAmount: input.totalAmount,
      itemDescription: input.itemDescription,
      pickupLabel: input.pickupLabel,
      dropoffLabel: input.dropoffLabel,
      fundingDeadlineAt: input.fundingDeadlineAt,
      buyerConfirmationDueAt: input.buyerConfirmationDueAt ?? null,
      riderAcceptDueAt: input.riderAcceptDueAt ?? null,
      deliveryDueAt: input.deliveryDueAt ?? null,
      manualReviewReason: input.manualReviewReason ?? null,
      lastEventType: input.lastEventType,
      lastEventAt: input.lastEventAt,
      deliveredAt: input.deliveredAt ?? null,
      buyerConfirmedAt: input.buyerConfirmedAt ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.workflowOrders.set(order.id, order);
    return order;
  }

  async getWorkflowOrder(id: string) {
    return this.workflowOrders.get(id) ?? null;
  }

  async updateWorkflowOrder(id: string, patch: UpdateWorkflowOrderPatch) {
    const existing = this.workflowOrders.get(id);
    if (!existing) {
      throw new Error(`Workflow order ${id} not found`);
    }

    const updated: WorkflowOrderRecord = {
      ...existing,
      contractId: patch.contractId ?? existing.contractId,
      onChainOrderId: patch.onChainOrderId ?? existing.onChainOrderId,
      sellerWallet: patch.sellerWallet ?? existing.sellerWallet,
      buyerWallet: patch.buyerWallet ?? existing.buyerWallet,
      riderWallet: patch.riderWallet ?? existing.riderWallet,
      orderCreatedTxHash: patch.orderCreatedTxHash ?? existing.orderCreatedTxHash,
      fundingTxHash: patch.fundingTxHash ?? existing.fundingTxHash,
      fundingStatus: patch.fundingStatus ?? existing.fundingStatus,
      lastChainReconciliationStatus: patch.lastChainReconciliationStatus ?? existing.lastChainReconciliationStatus,
      lastChainReconciledAt: patch.lastChainReconciledAt ?? existing.lastChainReconciledAt,
      lastChainError: patch.lastChainError ?? existing.lastChainError,
      workflowStatus: patch.workflowStatus ?? existing.workflowStatus,
      riderActorId: patch.riderActorId ?? existing.riderActorId,
      buyerConfirmationDueAt: patch.buyerConfirmationDueAt ?? existing.buyerConfirmationDueAt,
      riderAcceptDueAt: patch.riderAcceptDueAt ?? existing.riderAcceptDueAt,
      deliveryDueAt: patch.deliveryDueAt ?? existing.deliveryDueAt,
      manualReviewReason: patch.manualReviewReason ?? existing.manualReviewReason,
      lastEventType: patch.lastEventType ?? existing.lastEventType,
      lastEventAt: patch.lastEventAt ?? existing.lastEventAt,
      deliveredAt: patch.deliveredAt ?? existing.deliveredAt,
      buyerConfirmedAt: patch.buyerConfirmedAt ?? existing.buyerConfirmedAt,
      updatedAt: new Date().toISOString(),
    };
    this.workflowOrders.set(id, updated);
    return updated;
  }

  async getWorkflowOrderOwnership(orderId: string) {
    const order = this.workflowOrders.get(orderId);
    if (!order) {
      return null;
    }

    return {
      sellerActorId: order.sellerActorId,
      buyerActorId: order.buyerActorId,
      riderActorId: order.riderActorId,
    };
  }

  async createOrderTimelineEvent(input: CreateOrderTimelineEventInput) {
    const event: OrderTimelineEvent = {
      id: input.id ?? randomUUID(),
      orderId: input.orderId,
      type: input.type,
      occurredAt: input.occurredAt,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      note: input.note ?? null,
      metadata: input.metadata ?? {},
    };
    this.timelineEvents.push(event);
    return event;
  }

  async listOrderTimelineEvents(orderId: string) {
    return this.timelineEvents
      .filter((event) => event.orderId === orderId)
      .sort((left, right) => Date.parse(left.occurredAt) - Date.parse(right.occurredAt));
  }

  async listWorkflowOrdersBySeller(actorId: string) {
    return [...this.workflowOrders.values()]
      .filter((order) => order.sellerActorId === actorId)
      .sort(byLastEventDesc);
  }

  async listWorkflowOrdersByBuyer(actorId: string) {
    return [...this.workflowOrders.values()]
      .filter((order) => order.buyerActorId === actorId)
      .sort(byLastEventDesc);
  }

  async listAvailableRiderWorkflowOrders() {
    return [...this.workflowOrders.values()]
      .filter((order) => order.workflowStatus === "funded" && order.riderActorId === null)
      .sort(byLastEventDesc);
  }

  async listAssignedRiderWorkflowOrders(actorId: string) {
    return [...this.workflowOrders.values()]
      .filter((order) => order.riderActorId === actorId)
      .sort(byLastEventDesc);
  }

  async listWorkflowOrdersByStatuses(statuses: DurableOrderStatus[]) {
    return [...this.workflowOrders.values()]
      .filter((order) => statuses.includes(order.workflowStatus))
      .sort(byLastEventDesc);
  }
}

type ActorRow = {
  id: string;
  role: ActorRole;
  status: ActorStatus;
  display_name: string;
  workspace_code: string | null;
  contact_label: string | null;
  pin_hash: string | null;
  failed_pin_attempts: number;
  pin_locked_until: string | null;
  repeated_lockout_count: number;
  created_by_actor_id: string | null;
  claimed_at: string | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
};

type ActorSessionRow = {
  id: string;
  actor_id: string;
  token_hash: string;
  actor_role: ActorRole;
  status: SessionStatus;
  issued_at: string;
  expires_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderAccessTokenRow = {
  id: string;
  order_id: string;
  actor_id: string;
  type: TokenType;
  purpose: TokenPurpose;
  token_hash: string;
  short_code_hash: string | null;
  expires_at: string;
  consumed_at: string | null;
  invalidated_at: string | null;
  invalidated_reason: string | null;
  created_by_actor_id: string | null;
  created_at: string;
};

type WorkflowOrderRow = {
  id: string;
  public_order_code: string | null;
  workflow_status: DurableOrderStatus | null;
  contract_id: string | null;
  on_chain_order_id: string | null;
  seller_wallet: string;
  buyer_wallet: string;
  rider_wallet: string | null;
  order_created_tx_hash: string | null;
  funding_tx_hash: string | null;
  funding_status: "not_started" | "pending" | "confirmed" | "failed";
  last_chain_reconciliation_status: string | null;
  last_chain_reconciled_at: string | null;
  last_chain_error: string | null;
  seller_actor_id: string | null;
  buyer_actor_id: string | null;
  rider_actor_id: string | null;
  item_amount: string | number;
  delivery_fee: string | number;
  total_amount: string | number;
  item_description: string | null;
  pickup_label: string | null;
  dropoff_label: string | null;
  funding_deadline_at: string | null;
  buyer_confirmation_due_at: string | null;
  rider_accept_due_at: string | null;
  delivery_due_at: string | null;
  manual_review_reason: string | null;
  last_event_type: OrderEventType | null;
  last_event_at: string | null;
  delivered_at: string | null;
  buyer_confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

type OrderTimelineEventRow = {
  id: string;
  order_id: string;
  type: OrderEventType;
  actor_id: string | null;
  actor_role: ActorRole | null;
  note: string | null;
  metadata_json: Record<string, unknown>;
  occurred_at: string;
  created_at: string;
};

export class SupabaseFoundationRepository implements FoundationRepository {
  readonly mode = "supabase" as const;

  constructor(private readonly client: SupabaseClient) {}

  async createActor(input: CreateActorInput) {
    const { data, error } = await this.client
      .from("actors")
      .insert({
        id: input.id ?? randomUUID(),
        role: input.role,
        status: input.status,
        display_name: input.displayName,
        workspace_code: input.workspaceCode,
        contact_label: input.contactLabel ?? null,
        pin_hash: input.pinHash ?? null,
        failed_pin_attempts: input.failedPinAttempts ?? 0,
        pin_locked_until: input.pinLockedUntil ?? null,
        repeated_lockout_count: input.repeatedLockoutCount ?? 0,
        created_by_actor_id: input.createdByActorId ?? null,
        claimed_at: input.claimedAt ?? null,
        last_login_at: input.lastLoginAt ?? null,
      })
      .select("*")
      .single<ActorRow>();

    if (error || !data) {
      throw new Error(`Failed to create actor in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapActorRow(data);
  }

  async getActorById(id: string) {
    const { data, error } = await this.client.from("actors").select("*").eq("id", id).maybeSingle<ActorRow>();
    if (error) {
      throw new Error(`Failed to fetch actor by id from Supabase: ${error.message}`);
    }
    return data ? mapActorRow(data) : null;
  }

  async getActorByWorkspaceCode(workspaceCode: string) {
    const { data, error } = await this.client
      .from("actors")
      .select("*")
      .eq("workspace_code", workspaceCode)
      .maybeSingle<ActorRow>();
    if (error) {
      throw new Error(`Failed to fetch actor by workspace code from Supabase: ${error.message}`);
    }
    return data ? mapActorRow(data) : null;
  }

  async getActorsByIds(ids: string[]) {
    if (ids.length === 0) {
      return [];
    }

    const { data, error } = await this.client.from("actors").select("*").in("id", ids).returns<ActorRow[]>();
    if (error) {
      throw new Error(`Failed to fetch actors by ids from Supabase: ${error.message}`);
    }
    return (data ?? []).map(mapActorRow);
  }

  async updateActor(id: string, patch: UpdateActorPatch) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.displayName !== undefined) update.display_name = patch.displayName;
    if (patch.workspaceCode !== undefined) update.workspace_code = patch.workspaceCode;
    if (patch.contactLabel !== undefined) update.contact_label = patch.contactLabel;
    if (patch.pinHash !== undefined) update.pin_hash = patch.pinHash;
    if (patch.failedPinAttempts !== undefined) update.failed_pin_attempts = patch.failedPinAttempts;
    if (patch.pinLockedUntil !== undefined) update.pin_locked_until = patch.pinLockedUntil;
    if (patch.repeatedLockoutCount !== undefined) update.repeated_lockout_count = patch.repeatedLockoutCount;
    if (patch.claimedAt !== undefined) update.claimed_at = patch.claimedAt;
    if (patch.lastLoginAt !== undefined) update.last_login_at = patch.lastLoginAt;

    const { data, error } = await this.client.from("actors").update(update).eq("id", id).select("*").single<ActorRow>();
    if (error || !data) {
      throw new Error(`Failed to update actor in Supabase: ${error?.message ?? "unknown error"}`);
    }
    return mapActorRow(data);
  }

  async createActorSession(input: CreateActorSessionInput) {
    const { data, error } = await this.client
      .from("actor_sessions")
      .insert({
        id: input.id,
        actor_id: input.actorId,
        token_hash: input.tokenHash,
        actor_role: input.actorRole,
        status: input.status,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
        last_seen_at: input.lastSeenAt,
        revoked_at: input.revokedAt ?? null,
      })
      .select("*")
      .single<ActorSessionRow>();
    if (error || !data) {
      throw new Error(`Failed to create actor session in Supabase: ${error?.message ?? "unknown error"}`);
    }
    return mapActorSessionRow(data);
  }

  async getActorSessionByTokenHash(tokenHash: string) {
    const { data, error } = await this.client
      .from("actor_sessions")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle<ActorSessionRow>();
    if (error) {
      throw new Error(`Failed to fetch actor session by token hash from Supabase: ${error.message}`);
    }
    return data ? mapActorSessionRow(data) : null;
  }

  async updateActorSession(id: string, patch: UpdateActorSessionPatch) {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.expiresAt !== undefined) update.expires_at = patch.expiresAt;
    if (patch.lastSeenAt !== undefined) update.last_seen_at = patch.lastSeenAt;
    if (patch.revokedAt !== undefined) update.revoked_at = patch.revokedAt;

    const { data, error } = await this.client
      .from("actor_sessions")
      .update(update)
      .eq("id", id)
      .select("*")
      .single<ActorSessionRow>();
    if (error || !data) {
      throw new Error(`Failed to update actor session in Supabase: ${error?.message ?? "unknown error"}`);
    }
    return mapActorSessionRow(data);
  }

  async revokeActorSession(id: string, revokedAt: string) {
    const { data, error } = await this.client
      .from("actor_sessions")
      .update({
        status: "revoked",
        revoked_at: revokedAt,
        updated_at: revokedAt,
      })
      .eq("id", id)
      .select("*")
      .maybeSingle<ActorSessionRow>();
    if (error) {
      throw new Error(`Failed to revoke actor session in Supabase: ${error.message}`);
    }
    return data ? mapActorSessionRow(data) : null;
  }

  async revokeActorSessionsByActor(actorId: string, revokedAt: string) {
    const { data, error } = await this.client
      .from("actor_sessions")
      .update({
        status: "revoked",
        revoked_at: revokedAt,
        updated_at: revokedAt,
      })
      .eq("actor_id", actorId)
      .neq("status", "revoked")
      .select("id");
    if (error) {
      throw new Error(`Failed to revoke actor sessions by actor in Supabase: ${error.message}`);
    }
    return data?.length ?? 0;
  }

  async createOrderAccessToken(input: CreateOrderAccessTokenInput) {
    const { data, error } = await this.client
      .from("order_access_tokens")
      .insert({
        id: input.id ?? randomUUID(),
        order_id: input.orderId,
        actor_id: input.actorId,
        type: input.type,
        purpose: input.purpose,
        token_hash: input.tokenHash,
        short_code_hash: input.shortCodeHash ?? null,
        expires_at: input.expiresAt,
        created_by_actor_id: input.createdByActorId ?? null,
      })
      .select("*")
      .single<OrderAccessTokenRow>();
    if (error || !data) {
      throw new Error(`Failed to create order access token in Supabase: ${error?.message ?? "unknown error"}`);
    }
    return mapOrderAccessTokenRow(data);
  }

  async getOrderAccessTokenByTokenHash(tokenHash: string) {
    const { data, error } = await this.client
      .from("order_access_tokens")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle<OrderAccessTokenRow>();
    if (error) {
      throw new Error(`Failed to fetch order access token by hash from Supabase: ${error.message}`);
    }
    return data ? mapOrderAccessTokenRow(data) : null;
  }

  async hasActiveOrderAccessToken(orderId: string, type: TokenType, actorId?: string | null) {
    let query = this.client
      .from("order_access_tokens")
      .select("*")
      .eq("order_id", orderId)
      .eq("type", type)
      .is("consumed_at", null)
      .is("invalidated_at", null);

    if (actorId) {
      query = query.eq("actor_id", actorId);
    }

    const { data, error } = await query.returns<OrderAccessTokenRow[]>();
    if (error) {
      throw new Error(`Failed to check active order access token in Supabase: ${error.message}`);
    }

    const now = Date.now();
    return (data ?? []).some((row) => Date.parse(row.expires_at) > now);
  }

  async consumeOrderAccessToken(id: string, consumedAt: string) {
    const { data, error } = await this.client
      .from("order_access_tokens")
      .update({
        consumed_at: consumedAt,
      })
      .eq("id", id)
      .is("consumed_at", null)
      .is("invalidated_at", null)
      .select("*")
      .maybeSingle<OrderAccessTokenRow>();
    if (error) {
      throw new Error(`Failed to consume order access token in Supabase: ${error.message}`);
    }
    return data ? mapOrderAccessTokenRow(data) : null;
  }

  async invalidateOrderAccessTokens(input: InvalidateOrderAccessTokensInput) {
    let query = this.client
      .from("order_access_tokens")
      .update({
        invalidated_at: input.invalidatedAt,
        invalidated_reason: input.reason,
      })
      .eq("order_id", input.orderId)
      .eq("type", input.type)
      .is("consumed_at", null)
      .is("invalidated_at", null);

    if (input.actorId) {
      query = query.eq("actor_id", input.actorId);
    }

    const { data, error } = await query.select("id");
    if (error) {
      throw new Error(`Failed to invalidate order access tokens in Supabase: ${error.message}`);
    }
    return data?.length ?? 0;
  }

  async createWorkflowOrder(input: CreateWorkflowOrderInput) {
    const shadow = createShadowLegacyOrderFields(input);
    const { data, error } = await this.client
      .from("orders")
      .insert({
        id: input.id,
        contract_id: input.contractId ?? null,
        on_chain_order_id: input.onChainOrderId ?? null,
        seller_wallet: input.sellerWallet,
        buyer_wallet: input.buyerWallet,
        rider_wallet: input.riderWallet ?? null,
        item_amount: input.itemAmount,
        delivery_fee: input.deliveryFee,
        total_amount: input.totalAmount,
        status: shadow.legacyStatus,
        funded_at: shadow.fundedAt,
        released_at: shadow.releasedAt,
        expires_at: input.fundingDeadlineAt,
        order_created_tx_hash: input.orderCreatedTxHash ?? null,
        funding_tx_hash: input.fundingTxHash ?? null,
        funding_status: input.fundingStatus ?? "not_started",
        last_chain_reconciliation_status: input.lastChainReconciliationStatus ?? null,
        last_chain_reconciled_at: input.lastChainReconciledAt ?? null,
        last_chain_error: input.lastChainError ?? null,
        workflow_status: input.workflowStatus,
        seller_actor_id: input.sellerActorId,
        buyer_actor_id: input.buyerActorId,
        rider_actor_id: input.riderActorId ?? null,
        public_order_code: input.publicOrderCode,
        item_description: input.itemDescription,
        pickup_label: input.pickupLabel,
        dropoff_label: input.dropoffLabel,
        funding_deadline_at: input.fundingDeadlineAt,
        buyer_confirmation_due_at: input.buyerConfirmationDueAt ?? null,
        rider_accept_due_at: input.riderAcceptDueAt ?? null,
        delivery_due_at: input.deliveryDueAt ?? null,
        manual_review_reason: input.manualReviewReason ?? null,
        last_event_type: input.lastEventType,
        last_event_at: input.lastEventAt,
        delivered_at: input.deliveredAt ?? null,
        buyer_confirmed_at: input.buyerConfirmedAt ?? null,
      })
      .select("*")
      .single<WorkflowOrderRow>();
    if (error || !data) {
      throw new Error(`Failed to create workflow order in Supabase: ${error?.message ?? "unknown error"}`);
    }
    return mapWorkflowOrderRow(data);
  }

  async getWorkflowOrder(id: string) {
    const { data, error } = await this.client
      .from("orders")
      .select("*")
      .eq("id", id)
      .not("workflow_status", "is", null)
      .maybeSingle<WorkflowOrderRow>();
    if (error) {
      throw new Error(`Failed to fetch workflow order from Supabase: ${error.message}`);
    }
    return data ? mapWorkflowOrderRow(data) : null;
  }

  async updateWorkflowOrder(id: string, patch: UpdateWorkflowOrderPatch) {
    const current = await this.getWorkflowOrder(id);
    if (!current) {
      throw new Error(`Workflow order ${id} not found`);
    }

    const nextStatus = patch.workflowStatus ?? current.workflowStatus;
    const shadow = createShadowLegacyOrderFields({
      workflowStatus: nextStatus,
      sellerActorId: current.sellerActorId,
      buyerActorId: current.buyerActorId,
      riderActorId: patch.riderActorId ?? current.riderActorId,
    });

    const { data, error } = await this.client
      .from("orders")
      .update({
        contract_id: patch.contractId ?? current.contractId,
        on_chain_order_id: patch.onChainOrderId ?? current.onChainOrderId,
        seller_wallet: patch.sellerWallet ?? current.sellerWallet,
        buyer_wallet: patch.buyerWallet ?? current.buyerWallet,
        rider_actor_id: patch.riderActorId ?? current.riderActorId,
        workflow_status: nextStatus,
        buyer_confirmation_due_at: patch.buyerConfirmationDueAt ?? current.buyerConfirmationDueAt,
        rider_accept_due_at: patch.riderAcceptDueAt ?? current.riderAcceptDueAt,
        delivery_due_at: patch.deliveryDueAt ?? current.deliveryDueAt,
        manual_review_reason: patch.manualReviewReason ?? current.manualReviewReason,
        last_event_type: patch.lastEventType ?? current.lastEventType,
        last_event_at: patch.lastEventAt ?? current.lastEventAt,
        delivered_at: patch.deliveredAt ?? current.deliveredAt,
        buyer_confirmed_at: patch.buyerConfirmedAt ?? current.buyerConfirmedAt,
        status: shadow.legacyStatus,
        funded_at: shadow.fundedAt,
        released_at: shadow.releasedAt,
        rider_wallet: patch.riderWallet ?? current.riderWallet ?? shadow.riderWallet,
        order_created_tx_hash: patch.orderCreatedTxHash ?? current.orderCreatedTxHash,
        funding_tx_hash: patch.fundingTxHash ?? current.fundingTxHash,
        funding_status: patch.fundingStatus ?? current.fundingStatus,
        last_chain_reconciliation_status: patch.lastChainReconciliationStatus ?? current.lastChainReconciliationStatus,
        last_chain_reconciled_at: patch.lastChainReconciledAt ?? current.lastChainReconciledAt,
        last_chain_error: patch.lastChainError ?? current.lastChainError,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*")
      .single<WorkflowOrderRow>();
    if (error || !data) {
      throw new Error(`Failed to update workflow order in Supabase: ${error?.message ?? "unknown error"}`);
    }
    return mapWorkflowOrderRow(data);
  }

  async getWorkflowOrderOwnership(orderId: string) {
    const { data, error } = await this.client
      .from("orders")
      .select("seller_actor_id,buyer_actor_id,rider_actor_id")
      .eq("id", orderId)
      .not("workflow_status", "is", null)
      .maybeSingle();
    if (error) {
      throw new Error(`Failed to fetch workflow order ownership from Supabase: ${error.message}`);
    }
    const ownershipRow = data as Pick<WorkflowOrderRow, "seller_actor_id" | "buyer_actor_id" | "rider_actor_id"> | null;
    if (!ownershipRow || !ownershipRow.seller_actor_id || !ownershipRow.buyer_actor_id) {
      return null;
    }
    return {
      sellerActorId: ownershipRow.seller_actor_id,
      buyerActorId: ownershipRow.buyer_actor_id,
      riderActorId: ownershipRow.rider_actor_id,
    };
  }

  async createOrderTimelineEvent(input: CreateOrderTimelineEventInput) {
    const { data, error } = await this.client
      .from("order_timeline_events")
      .insert({
        id: input.id ?? randomUUID(),
        order_id: input.orderId,
        type: input.type,
        actor_id: input.actorId ?? null,
        actor_role: input.actorRole ?? null,
        note: input.note ?? null,
        metadata_json: input.metadata ?? {},
        occurred_at: input.occurredAt,
      })
      .select("*")
      .single<OrderTimelineEventRow>();
    if (error || !data) {
      throw new Error(`Failed to create order timeline event in Supabase: ${error?.message ?? "unknown error"}`);
    }
    return mapOrderTimelineEventRow(data);
  }

  async listOrderTimelineEvents(orderId: string) {
    const { data, error } = await this.client
      .from("order_timeline_events")
      .select("*")
      .eq("order_id", orderId)
      .order("occurred_at", { ascending: true })
      .returns<OrderTimelineEventRow[]>();
    if (error) {
      throw new Error(`Failed to list order timeline events from Supabase: ${error.message}`);
    }
    return (data ?? []).map(mapOrderTimelineEventRow);
  }

  async listWorkflowOrdersBySeller(actorId: string) {
    return this.listWorkflowOrdersQuery(this.client.from("orders").select("*").eq("seller_actor_id", actorId));
  }

  async listWorkflowOrdersByBuyer(actorId: string) {
    return this.listWorkflowOrdersQuery(this.client.from("orders").select("*").eq("buyer_actor_id", actorId));
  }

  async listAvailableRiderWorkflowOrders() {
    return this.listWorkflowOrdersQuery(
      this.client.from("orders").select("*").eq("workflow_status", "funded").is("rider_actor_id", null),
    );
  }

  async listAssignedRiderWorkflowOrders(actorId: string) {
    return this.listWorkflowOrdersQuery(this.client.from("orders").select("*").eq("rider_actor_id", actorId));
  }

  async listWorkflowOrdersByStatuses(statuses: DurableOrderStatus[]) {
    return this.listWorkflowOrdersQuery(this.client.from("orders").select("*").in("workflow_status", statuses));
  }

  private async listWorkflowOrdersQuery(query: any) {
    const { data, error } = await query
      .not("workflow_status", "is", null)
      .order("last_event_at", { ascending: false });
    if (error) {
      throw new Error(`Failed to list workflow orders from Supabase: ${error.message}`);
    }
    return ((data ?? []) as WorkflowOrderRow[]).map(mapWorkflowOrderRow);
  }
}

function mapActorRow(row: ActorRow): StoredActorRecord {
  return {
    id: row.id,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    workspaceCode: row.workspace_code,
    contactLabel: row.contact_label,
    createdByActorId: row.created_by_actor_id,
    claimedAt: row.claimed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastLoginAt: row.last_login_at,
    pinHash: row.pin_hash,
    failedPinAttempts: row.failed_pin_attempts,
    pinLockedUntil: row.pin_locked_until,
    repeatedLockoutCount: row.repeated_lockout_count,
  };
}

function mapActorSessionRow(row: ActorSessionRow): StoredActorSessionRecord {
  return {
    id: row.id,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    tokenHash: row.token_hash,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    lastSeenAt: row.last_seen_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderAccessTokenRow(row: OrderAccessTokenRow): StoredOrderAccessTokenRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    actorId: row.actor_id,
    type: row.type,
    purpose: row.purpose,
    tokenHash: row.token_hash,
    shortCodeHash: row.short_code_hash,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    invalidatedAt: row.invalidated_at,
    invalidatedReason: row.invalidated_reason,
    createdByActorId: row.created_by_actor_id,
    createdAt: row.created_at,
  };
}

function mapWorkflowOrderRow(row: WorkflowOrderRow): WorkflowOrderRecord {
  if (
    !row.public_order_code ||
    !row.workflow_status ||
    !row.seller_actor_id ||
    !row.buyer_actor_id ||
    !row.item_description ||
    !row.pickup_label ||
    !row.dropoff_label ||
    !row.funding_deadline_at ||
    !row.last_event_type ||
    !row.last_event_at
  ) {
    throw new Error(`Order row ${row.id} is missing required workflow columns`);
  }

  return {
    id: row.id,
    publicOrderCode: row.public_order_code,
    workflowStatus: row.workflow_status,
    contractId: row.contract_id,
    onChainOrderId: row.on_chain_order_id,
    sellerWallet: row.seller_wallet,
    buyerWallet: row.buyer_wallet,
    riderWallet: row.rider_wallet,
    orderCreatedTxHash: row.order_created_tx_hash,
    fundingTxHash: row.funding_tx_hash,
    fundingStatus: row.funding_status,
    lastChainReconciliationStatus: row.last_chain_reconciliation_status,
    lastChainReconciledAt: row.last_chain_reconciled_at,
    lastChainError: row.last_chain_error,
    sellerActorId: row.seller_actor_id,
    buyerActorId: row.buyer_actor_id,
    riderActorId: row.rider_actor_id,
    itemAmount: String(row.item_amount),
    deliveryFee: String(row.delivery_fee),
    totalAmount: String(row.total_amount),
    itemDescription: row.item_description,
    pickupLabel: row.pickup_label,
    dropoffLabel: row.dropoff_label,
    fundingDeadlineAt: row.funding_deadline_at,
    buyerConfirmationDueAt: row.buyer_confirmation_due_at,
    riderAcceptDueAt: row.rider_accept_due_at,
    deliveryDueAt: row.delivery_due_at,
    manualReviewReason: row.manual_review_reason,
    lastEventType: row.last_event_type,
    lastEventAt: row.last_event_at,
    deliveredAt: row.delivered_at,
    buyerConfirmedAt: row.buyer_confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapOrderTimelineEventRow(row: OrderTimelineEventRow): OrderTimelineEvent {
  return {
    id: row.id,
    orderId: row.order_id,
    type: row.type,
    occurredAt: row.occurred_at,
    actorId: row.actor_id,
    actorRole: row.actor_role,
    note: row.note,
    metadata: row.metadata_json ?? {},
  };
}

function createShadowLegacyOrderFields(input: Pick<CreateWorkflowOrderInput | WorkflowOrderRecord, "workflowStatus" | "sellerActorId" | "buyerActorId" | "riderActorId">) {
  switch (input.workflowStatus) {
    case "awaiting_funding":
    case "funding_pending":
    case "funding_failed":
      return {
        legacyStatus: "Draft",
        fundedAt: null,
        releasedAt: null,
        riderWallet: null,
      };
    case "funded":
      return {
        legacyStatus: "Funded",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: null,
      };
    case "rider_assigned":
      return {
        legacyStatus: "RiderAssigned",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "in_transit":
      return {
        legacyStatus: "InTransit",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "awaiting_buyer_confirmation":
      return {
        legacyStatus: "EvidenceSubmitted",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "manual_review":
    case "dispute_open":
      return {
        legacyStatus: "Disputed",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "release_pending":
      return {
        legacyStatus: "Approved",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "released":
      return {
        legacyStatus: "Released",
        fundedAt: new Date().toISOString(),
        releasedAt: new Date().toISOString(),
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "refund_pending":
      return {
        legacyStatus: "Disputed",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "refunded":
      return {
        legacyStatus: "Refunded",
        fundedAt: new Date().toISOString(),
        releasedAt: null,
        riderWallet: input.riderActorId ? `demo:rider:${input.riderActorId}` : null,
      };
    case "cancelled":
      return {
        legacyStatus: "Expired",
        fundedAt: null,
        releasedAt: null,
        riderWallet: null,
      };
    case "expired":
      return {
        legacyStatus: "Expired",
        fundedAt: null,
        releasedAt: null,
        riderWallet: null,
      };
  }
}

function byLastEventDesc(left: WorkflowOrderRecord, right: WorkflowOrderRecord) {
  return Date.parse(right.lastEventAt) - Date.parse(left.lastEventAt);
}

function createFoundationRepository(): FoundationRepository {
  if (!isSupabaseConfigured()) {
    return new InMemoryFoundationRepository();
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return new InMemoryFoundationRepository();
  }

  return new SupabaseFoundationRepository(client);
}

export const foundationRepository: FoundationRepository = createFoundationRepository();
