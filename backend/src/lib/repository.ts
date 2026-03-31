import { v4 as uuid } from "uuid";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  OracleDecision,
  OrderRecord,
  OrderStatus,
  OrderStatusHistoryEntry,
  TransactionRecord,
} from "@padala-vision/shared";
import { getSupabaseAdminClient, isSupabaseConfigured } from "./supabase.js";

export interface EvidenceRecord {
  id: string;
  orderId: string;
  imageUrl: string;
  gpsLat: number;
  gpsLng: number;
  submittedAt: string;
  fileHash: string | null;
}

export interface OracleDecisionRecord {
  id: string;
  orderId: string;
  decision: OracleDecision;
  confidence: number;
  reason: string;
  fraudFlags: string[];
  signature: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

export interface IdempotencyRecord {
  scopeKey: string;
  method: string;
  path: string;
  idempotencyKey: string;
  requestHash: string;
  correlationId: string;
  state: "in_progress" | "completed";
  responseStatus: number | null;
  responseBody: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimIdempotencyRecordInput {
  scopeKey: string;
  method: string;
  path: string;
  idempotencyKey: string;
  requestHash: string;
  correlationId: string;
}

export interface WalletChallengeRecord {
  id: string;
  userId: string;
  walletAddress: string;
  walletProvider: string;
  nonceHash: string;
  message: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

export interface WalletBindingRecord {
  id: string;
  userId: string;
  walletAddress: string;
  walletProvider: string;
  challengeId: string;
  verifiedAt: string;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContractRegistryRecord {
  id: string;
  environment: "staging" | "pilot";
  escrowContractId: string;
  tokenContractId: string;
  oraclePublicKey: string;
  rpcUrl: string;
  networkPassphrase: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface ReleaseIntentRecord {
  id: string;
  orderId: string;
  actorUserId: string;
  actorWallet: string | null;
  actorRoles: string[];
  contractId: string;
  environment: "staging" | "pilot";
  attestationNonce: string;
  attestationPayload: unknown;
  attestationSignature: string;
  issuedAt: string;
  expiresAt: string;
  correlationId: string;
  createdAt: string;
}

export interface ReleaseRecord {
  id: string;
  releaseIntentId: string;
  orderId: string;
  txHash: string;
  attestationNonce: string;
  submittedWallet: string;
  contractId: string;
  status: "pending" | "confirmed" | "failed";
  correlationId: string;
  confirmedAt: string | null;
  chainLedger: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface Repository {
  readonly mode: "memory" | "supabase";
  generateOrderId(): string;
  createOrder(input: Omit<OrderRecord, "createdAt" | "updatedAt">): Promise<OrderRecord>;
  getOrder(id: string): Promise<OrderRecord | null>;
  listFundedJobs(): Promise<OrderRecord[]>;
  updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    note?: string,
    patch?: Partial<OrderRecord>,
  ): Promise<OrderRecord>;
  saveEvidence(input: Omit<EvidenceRecord, "id" | "submittedAt">): Promise<EvidenceRecord>;
  saveOracleDecision(input: Omit<OracleDecisionRecord, "id" | "createdAt">): Promise<OracleDecisionRecord>;
  createTransaction(input: Omit<TransactionRecord, "id" | "createdAt">): Promise<TransactionRecord>;
  getLatestDecision(orderId: string): Promise<OracleDecisionRecord | null>;
  getTransactions(orderId: string): Promise<TransactionRecord[]>;
  getHistory(orderId: string): Promise<OrderStatusHistoryEntry[]>;
  claimIdempotencyRecord(input: ClaimIdempotencyRecordInput): Promise<IdempotencyRecord>;
  completeIdempotencyRecord(
    scopeKey: string,
    result: {
      responseStatus: number;
      responseBody: unknown;
    },
  ): Promise<void>;
  deleteIdempotencyRecord(scopeKey: string): Promise<void>;
  createWalletChallenge(
    input: Omit<WalletChallengeRecord, "consumedAt" | "createdAt">,
  ): Promise<WalletChallengeRecord>;
  getWalletChallenge(id: string): Promise<WalletChallengeRecord | null>;
  consumeWalletChallenge(id: string, consumedAt: string): Promise<void>;
  getActiveWalletBindingByWallet(walletAddress: string): Promise<WalletBindingRecord | null>;
  upsertWalletBinding(input: {
    userId: string;
    walletAddress: string;
    walletProvider: string;
    challengeId: string;
    verifiedAt: string;
  }): Promise<WalletBindingRecord>;
  createContractRegistry(input: Omit<ContractRegistryRecord, "createdAt" | "updatedAt">): Promise<ContractRegistryRecord>;
  getActiveContractRegistry(environment: "staging" | "pilot"): Promise<ContractRegistryRecord | null>;
  clearContractRegistry(environment?: "staging" | "pilot"): Promise<void>;
  getActiveWalletBindingByUser(userId: string): Promise<WalletBindingRecord | null>;
  createReleaseIntent(input: Omit<ReleaseIntentRecord, "createdAt">): Promise<ReleaseIntentRecord>;
  getReleaseIntentByNonce(orderId: string, attestationNonce: string): Promise<ReleaseIntentRecord | null>;
  getTransactionByHash(txHash: string): Promise<TransactionRecord | null>;
  getReleaseRecordByTxHash(txHash: string): Promise<ReleaseRecord | null>;
  createReleaseRecord(input: Omit<ReleaseRecord, "id" | "createdAt" | "updatedAt">): Promise<ReleaseRecord>;
  updateReleaseRecord(
    id: string,
    patch: Partial<Pick<ReleaseRecord, "status" | "confirmedAt" | "chainLedger" | "correlationId">>,
  ): Promise<ReleaseRecord>;
}

export class InMemoryRepository implements Repository {
  readonly mode = "memory" as const;
  private orders = new Map<string, OrderRecord>();
  private evidence: EvidenceRecord[] = [];
  private decisions: OracleDecisionRecord[] = [];
  private transactions: TransactionRecord[] = [];
  private history: OrderStatusHistoryEntry[] = [];
  private idempotency = new Map<string, IdempotencyRecord>();
  private walletChallenges = new Map<string, WalletChallengeRecord>();
  private walletBindings = new Map<string, WalletBindingRecord>();
  private contractRegistry = new Map<string, ContractRegistryRecord>();
  private releaseIntents = new Map<string, ReleaseIntentRecord>();
  private releaseRecords = new Map<string, ReleaseRecord>();
  private nextOrderId = 1;

  generateOrderId(): string {
    const value = this.nextOrderId;
    this.nextOrderId += 1;
    return String(value);
  }

  async createOrder(input: Omit<OrderRecord, "createdAt" | "updatedAt">): Promise<OrderRecord> {
    const now = new Date().toISOString();
    const order: OrderRecord = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    this.orders.set(order.id, order);
    this.history.push({
      id: uuid(),
      orderId: order.id,
      oldStatus: null,
      newStatus: order.status,
      changedAt: now,
      note: "Order created",
    });
    return order;
  }

  async getOrder(id: string): Promise<OrderRecord | null> {
    return this.orders.get(id) ?? null;
  }

  async listFundedJobs(): Promise<OrderRecord[]> {
    return [...this.orders.values()].filter((order) => order.status === "Funded");
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    note?: string,
    patch?: Partial<OrderRecord>,
  ): Promise<OrderRecord> {
    const existing = this.orders.get(orderId);
    if (!existing) {
      throw new Error(`Order ${orderId} not found`);
    }

    const updated: OrderRecord = {
      ...existing,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    };
    this.orders.set(orderId, updated);
    this.history.push({
      id: uuid(),
      orderId,
      oldStatus: existing.status,
      newStatus: status,
      changedAt: updated.updatedAt,
      note: note ?? null,
    });
    return updated;
  }

  async saveEvidence(input: Omit<EvidenceRecord, "id" | "submittedAt">): Promise<EvidenceRecord> {
    const record: EvidenceRecord = {
      ...input,
      id: uuid(),
      submittedAt: new Date().toISOString(),
    };
    this.evidence.push(record);
    return record;
  }

  async saveOracleDecision(
    input: Omit<OracleDecisionRecord, "id" | "createdAt">,
  ): Promise<OracleDecisionRecord> {
    const record: OracleDecisionRecord = {
      ...input,
      id: uuid(),
      createdAt: new Date().toISOString(),
    };
    this.decisions.push(record);
    return record;
  }

  async createTransaction(
    input: Omit<TransactionRecord, "id" | "createdAt">,
  ): Promise<TransactionRecord> {
    const record: TransactionRecord = {
      ...input,
      id: uuid(),
      createdAt: new Date().toISOString(),
    };
    this.transactions.push(record);
    return record;
  }

  async getLatestDecision(orderId: string): Promise<OracleDecisionRecord | null> {
    return this.decisions.filter((entry) => entry.orderId === orderId).at(-1) ?? null;
  }

  async getTransactions(orderId: string): Promise<TransactionRecord[]> {
    return this.transactions.filter((entry) => entry.orderId === orderId);
  }

  async getHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    return this.history.filter((entry) => entry.orderId === orderId);
  }

  async claimIdempotencyRecord(input: ClaimIdempotencyRecordInput): Promise<IdempotencyRecord> {
    const existing = this.idempotency.get(input.scopeKey);
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const record: IdempotencyRecord = {
      ...input,
      state: "in_progress",
      responseStatus: null,
      responseBody: null,
      createdAt: now,
      updatedAt: now,
    };

    this.idempotency.set(input.scopeKey, record);
    return record;
  }

  async completeIdempotencyRecord(
    scopeKey: string,
    result: {
      responseStatus: number;
      responseBody: unknown;
    },
  ): Promise<void> {
    const existing = this.idempotency.get(scopeKey);
    if (!existing) {
      return;
    }

    this.idempotency.set(scopeKey, {
      ...existing,
      state: "completed",
      responseStatus: result.responseStatus,
      responseBody: result.responseBody,
      updatedAt: new Date().toISOString(),
    });
  }

  async deleteIdempotencyRecord(scopeKey: string): Promise<void> {
    this.idempotency.delete(scopeKey);
  }

  async createWalletChallenge(
    input: Omit<WalletChallengeRecord, "consumedAt" | "createdAt">,
  ): Promise<WalletChallengeRecord> {
    const record: WalletChallengeRecord = {
      ...input,
      consumedAt: null,
      createdAt: new Date().toISOString(),
    };

    this.walletChallenges.set(record.id, record);
    return record;
  }

  async getWalletChallenge(id: string): Promise<WalletChallengeRecord | null> {
    return this.walletChallenges.get(id) ?? null;
  }

  async consumeWalletChallenge(id: string, consumedAt: string): Promise<void> {
    const existing = this.walletChallenges.get(id);
    if (!existing) {
      return;
    }

    this.walletChallenges.set(id, {
      ...existing,
      consumedAt,
    });
  }

  async getActiveWalletBindingByWallet(walletAddress: string): Promise<WalletBindingRecord | null> {
    return (
      [...this.walletBindings.values()].find(
        (binding) => binding.walletAddress === walletAddress && binding.revokedAt === null,
      ) ?? null
    );
  }

  async upsertWalletBinding(input: {
    userId: string;
    walletAddress: string;
    walletProvider: string;
    challengeId: string;
    verifiedAt: string;
  }): Promise<WalletBindingRecord> {
    const existing = [...this.walletBindings.values()].find(
      (binding) => binding.userId === input.userId && binding.walletAddress === input.walletAddress,
    );

    if (existing) {
      const updated: WalletBindingRecord = {
        ...existing,
        walletProvider: input.walletProvider,
        challengeId: input.challengeId,
        verifiedAt: input.verifiedAt,
        revokedAt: null,
        updatedAt: input.verifiedAt,
      };
      this.walletBindings.set(existing.id, updated);
      return updated;
    }

    const record: WalletBindingRecord = {
      id: uuid(),
      userId: input.userId,
      walletAddress: input.walletAddress,
      walletProvider: input.walletProvider,
      challengeId: input.challengeId,
      verifiedAt: input.verifiedAt,
      revokedAt: null,
      createdAt: input.verifiedAt,
      updatedAt: input.verifiedAt,
    };

    this.walletBindings.set(record.id, record);
    return record;
  }

  async getActiveWalletBindingByUser(userId: string): Promise<WalletBindingRecord | null> {
    return [...this.walletBindings.values()].find((binding) => binding.userId === userId && binding.revokedAt === null) ?? null;
  }

  async createContractRegistry(
    input: Omit<ContractRegistryRecord, "createdAt" | "updatedAt">,
  ): Promise<ContractRegistryRecord> {
    const now = new Date().toISOString();
    const record: ContractRegistryRecord = {
      ...input,
      createdAt: now,
      updatedAt: now,
    };

    if (record.status === "active") {
      for (const [key, existing] of this.contractRegistry.entries()) {
        if (existing.environment === record.environment && existing.status === "active") {
          this.contractRegistry.set(key, {
            ...existing,
            status: "inactive",
            updatedAt: now,
          });
        }
      }
    }

    this.contractRegistry.set(record.id, record);
    return record;
  }

  async getActiveContractRegistry(environment: "staging" | "pilot"): Promise<ContractRegistryRecord | null> {
    return (
      [...this.contractRegistry.values()].find(
        (record) => record.environment === environment && record.status === "active",
      ) ?? null
    );
  }

  async clearContractRegistry(environment?: "staging" | "pilot"): Promise<void> {
    if (!environment) {
      this.contractRegistry.clear();
      return;
    }

    for (const [key, record] of this.contractRegistry.entries()) {
      if (record.environment === environment) {
        this.contractRegistry.delete(key);
      }
    }
  }

  async createReleaseIntent(input: Omit<ReleaseIntentRecord, "createdAt">): Promise<ReleaseIntentRecord> {
    const record: ReleaseIntentRecord = {
      ...input,
      createdAt: new Date().toISOString(),
    };

    this.releaseIntents.set(record.id, record);
    return record;
  }

  async getReleaseIntentByNonce(orderId: string, attestationNonce: string): Promise<ReleaseIntentRecord | null> {
    return (
      [...this.releaseIntents.values()].find(
        (record) => record.orderId === orderId && record.attestationNonce === attestationNonce,
      ) ?? null
    );
  }

  async getTransactionByHash(txHash: string): Promise<TransactionRecord | null> {
    return this.transactions.find((entry) => entry.txHash === txHash) ?? null;
  }

  async getReleaseRecordByTxHash(txHash: string): Promise<ReleaseRecord | null> {
    return [...this.releaseRecords.values()].find((record) => record.txHash === txHash) ?? null;
  }

  async createReleaseRecord(input: Omit<ReleaseRecord, "id" | "createdAt" | "updatedAt">): Promise<ReleaseRecord> {
    const now = new Date().toISOString();
    const record: ReleaseRecord = {
      ...input,
      id: uuid(),
      createdAt: now,
      updatedAt: now,
    };

    this.releaseRecords.set(record.id, record);
    return record;
  }

  async updateReleaseRecord(
    id: string,
    patch: Partial<Pick<ReleaseRecord, "status" | "confirmedAt" | "chainLedger" | "correlationId">>,
  ): Promise<ReleaseRecord> {
    const existing = this.releaseRecords.get(id);
    if (!existing) {
      throw new Error(`Release record ${id} not found`);
    }

    const updated: ReleaseRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.releaseRecords.set(id, updated);
    return updated;
  }
}

type OrderRow = {
  id: string;
  contract_id: string | null;
  seller_wallet: string;
  buyer_wallet: string;
  rider_wallet: string | null;
  item_amount: string | number;
  delivery_fee: string | number;
  total_amount: string | number;
  status: OrderStatus;
  created_at: string;
  updated_at: string;
  funded_at: string | null;
  released_at: string | null;
  expires_at: string;
};

type EvidenceRow = {
  id: string;
  order_id: string;
  image_url: string;
  gps_lat: string | number;
  gps_lng: string | number;
  submitted_at: string;
  file_hash: string | null;
};

type OracleDecisionRow = {
  id: string;
  order_id: string;
  decision: OracleDecision;
  confidence: string | number;
  reason: string;
  fraud_flags_json: string[] | string;
  signature: string | null;
  issued_at: string | null;
  expires_at: string | null;
  created_at: string;
};

type TransactionRow = {
  id: string;
  order_id: string;
  tx_hash: string;
  tx_type: string;
  tx_status: string;
  created_at: string;
};

type StatusHistoryRow = {
  id: string;
  order_id: string;
  old_status: OrderStatus | null;
  new_status: OrderStatus;
  changed_at: string;
  note: string | null;
};

type IdempotencyRow = {
  scope_key: string;
  method: string;
  path: string;
  idempotency_key: string;
  request_hash: string;
  correlation_id: string;
  state: "in_progress" | "completed";
  response_status: number | null;
  response_body: unknown | null;
  created_at: string;
  updated_at: string;
};

type WalletChallengeRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  wallet_provider: string;
  nonce_hash: string;
  message: string;
  issued_at: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
};

type WalletBindingRow = {
  id: string;
  user_id: string;
  wallet_address: string;
  wallet_provider: string;
  challenge_id: string;
  verified_at: string;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
};

type ContractRegistryRow = {
  id: string;
  environment: "staging" | "pilot";
  escrow_contract_id: string;
  token_contract_id: string;
  oracle_public_key: string;
  rpc_url: string;
  network_passphrase: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};

type ReleaseIntentRow = {
  id: string;
  order_id: string;
  actor_user_id: string;
  actor_wallet: string | null;
  actor_roles_json: string[] | string;
  contract_id: string;
  environment: "staging" | "pilot";
  attestation_nonce: string;
  attestation_payload: unknown;
  attestation_signature: string;
  issued_at: string;
  expires_at: string;
  correlation_id: string;
  created_at: string;
};

type ReleaseRecordRow = {
  id: string;
  release_intent_id: string;
  order_id: string;
  tx_hash: string;
  attestation_nonce: string;
  submitted_wallet: string;
  contract_id: string;
  status: "pending" | "confirmed" | "failed";
  correlation_id: string;
  confirmed_at: string | null;
  chain_ledger: number | null;
  created_at: string;
  updated_at: string;
};

class SupabaseRepository implements Repository {
  readonly mode = "supabase" as const;

  constructor(private readonly client: SupabaseClient) {}

  generateOrderId(): string {
    const millis = Date.now().toString();
    const randomSuffix = Math.floor(Math.random() * 10_000)
      .toString()
      .padStart(4, "0");
    return `${millis}${randomSuffix}`;
  }

  async createOrder(input: Omit<OrderRecord, "createdAt" | "updatedAt">): Promise<OrderRecord> {
    const { data, error } = await this.client
      .from("orders")
      .insert({
        id: input.id,
        contract_id: input.contractId,
        seller_wallet: input.sellerWallet,
        buyer_wallet: input.buyerWallet,
        rider_wallet: input.riderWallet,
        item_amount: input.itemAmount,
        delivery_fee: input.deliveryFee,
        total_amount: input.totalAmount,
        status: input.status,
        funded_at: input.fundedAt,
        released_at: input.releasedAt,
        expires_at: input.expiresAt,
      })
      .select("*")
      .single<OrderRow>();

    if (error || !data) {
      throw new Error(`Failed to create order in Supabase: ${error?.message ?? "unknown error"}`);
    }

    await this.insertStatusHistory({
      order_id: input.id,
      old_status: null,
      new_status: input.status,
      changed_at: data.created_at,
      note: "Order created",
    });

    return mapOrderRow(data);
  }

  async getOrder(id: string): Promise<OrderRecord | null> {
    const { data, error } = await this.client
      .from("orders")
      .select("*")
      .eq("id", id)
      .maybeSingle<OrderRow>();

    if (error) {
      throw new Error(`Failed to fetch order from Supabase: ${error.message}`);
    }

    return data ? mapOrderRow(data) : null;
  }

  async listFundedJobs(): Promise<OrderRecord[]> {
    const { data, error } = await this.client
      .from("orders")
      .select("*")
      .eq("status", "Funded")
      .order("created_at", { ascending: true })
      .returns<OrderRow[]>();

    if (error) {
      throw new Error(`Failed to list funded jobs from Supabase: ${error.message}`);
    }

    return (data ?? []).map(mapOrderRow);
  }

  async updateOrderStatus(
    orderId: string,
    status: OrderStatus,
    note?: string,
    patch?: Partial<OrderRecord>,
  ): Promise<OrderRecord> {
    const current = await this.getOrder(orderId);
    if (!current) {
      throw new Error(`Order ${orderId} not found`);
    }

    const now = new Date().toISOString();
    const { data, error } = await this.client
      .from("orders")
      .update({
        contract_id: patch?.contractId ?? current.contractId,
        seller_wallet: patch?.sellerWallet ?? current.sellerWallet,
        buyer_wallet: patch?.buyerWallet ?? current.buyerWallet,
        rider_wallet: patch?.riderWallet ?? current.riderWallet,
        item_amount: patch?.itemAmount ?? current.itemAmount,
        delivery_fee: patch?.deliveryFee ?? current.deliveryFee,
        total_amount: patch?.totalAmount ?? current.totalAmount,
        status,
        updated_at: now,
        funded_at: patch?.fundedAt ?? current.fundedAt,
        released_at: patch?.releasedAt ?? current.releasedAt,
        expires_at: patch?.expiresAt ?? current.expiresAt,
      })
      .eq("id", orderId)
      .select("*")
      .single<OrderRow>();

    if (error || !data) {
      throw new Error(`Failed to update order status in Supabase: ${error?.message ?? "unknown error"}`);
    }

    await this.insertStatusHistory({
      order_id: orderId,
      old_status: current.status,
      new_status: status,
      changed_at: now,
      note: note ?? null,
    });

    return mapOrderRow(data);
  }

  async saveEvidence(input: Omit<EvidenceRecord, "id" | "submittedAt">): Promise<EvidenceRecord> {
    const { data, error } = await this.client
      .from("evidence_submissions")
      .insert({
        id: uuid(),
        order_id: input.orderId,
        image_url: input.imageUrl,
        gps_lat: input.gpsLat,
        gps_lng: input.gpsLng,
        file_hash: input.fileHash,
      })
      .select("*")
      .single<EvidenceRow>();

    if (error || !data) {
      throw new Error(`Failed to save evidence in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapEvidenceRow(data);
  }

  async saveOracleDecision(
    input: Omit<OracleDecisionRecord, "id" | "createdAt">,
  ): Promise<OracleDecisionRecord> {
    const { data, error } = await this.client
      .from("oracle_decisions")
      .insert({
        id: uuid(),
        order_id: input.orderId,
        decision: input.decision,
        confidence: input.confidence,
        reason: input.reason,
        fraud_flags_json: input.fraudFlags,
        signature: input.signature,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
      })
      .select("*")
      .single<OracleDecisionRow>();

    if (error || !data) {
      throw new Error(`Failed to save oracle decision in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapOracleDecisionRow(data);
  }

  async createTransaction(
    input: Omit<TransactionRecord, "id" | "createdAt">,
  ): Promise<TransactionRecord> {
    const { data, error } = await this.client
      .from("transactions")
      .insert({
        id: uuid(),
        order_id: input.orderId,
        tx_hash: input.txHash,
        tx_type: input.txType,
        tx_status: input.txStatus,
      })
      .select("*")
      .single<TransactionRow>();

    if (error || !data) {
      throw new Error(`Failed to create transaction in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapTransactionRow(data);
  }

  async getLatestDecision(orderId: string): Promise<OracleDecisionRecord | null> {
    const { data, error } = await this.client
      .from("oracle_decisions")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<OracleDecisionRow>();

    if (error) {
      throw new Error(`Failed to fetch latest decision from Supabase: ${error.message}`);
    }

    return data ? mapOracleDecisionRow(data) : null;
  }

  async getTransactions(orderId: string): Promise<TransactionRecord[]> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true })
      .returns<TransactionRow[]>();

    if (error) {
      throw new Error(`Failed to fetch transactions from Supabase: ${error.message}`);
    }

    return (data ?? []).map(mapTransactionRow);
  }

  async getHistory(orderId: string): Promise<OrderStatusHistoryEntry[]> {
    const { data, error } = await this.client
      .from("order_status_history")
      .select("*")
      .eq("order_id", orderId)
      .order("changed_at", { ascending: true })
      .returns<StatusHistoryRow[]>();

    if (error) {
      throw new Error(`Failed to fetch order history from Supabase: ${error.message}`);
    }

    return (data ?? []).map(mapStatusHistoryRow);
  }

  async claimIdempotencyRecord(input: ClaimIdempotencyRecordInput): Promise<IdempotencyRecord> {
    const record = {
      scope_key: input.scopeKey,
      method: input.method,
      path: input.path,
      idempotency_key: input.idempotencyKey,
      request_hash: input.requestHash,
      correlation_id: input.correlationId,
      state: "in_progress" as const,
      response_status: null,
      response_body: null,
    };

    const { data, error } = await this.client
      .from("idempotency_keys")
      .insert(record)
      .select("*")
      .maybeSingle<IdempotencyRow>();

    if (data) {
      return mapIdempotencyRow(data);
    }

    if (error && error.code !== "23505") {
      throw new Error(`Failed to create idempotency record in Supabase: ${error.message}`);
    }

    const existing = await this.getIdempotencyRecord(input.scopeKey);
    if (!existing) {
      throw new Error("Failed to fetch existing idempotency record after insert conflict");
    }

    return existing;
  }

  async completeIdempotencyRecord(
    scopeKey: string,
    result: {
      responseStatus: number;
      responseBody: unknown;
    },
  ): Promise<void> {
    const { error } = await this.client
      .from("idempotency_keys")
      .update({
        state: "completed",
        response_status: result.responseStatus,
        response_body: result.responseBody,
        updated_at: new Date().toISOString(),
      })
      .eq("scope_key", scopeKey);

    if (error) {
      throw new Error(`Failed to complete idempotency record in Supabase: ${error.message}`);
    }
  }

  async deleteIdempotencyRecord(scopeKey: string): Promise<void> {
    const { error } = await this.client.from("idempotency_keys").delete().eq("scope_key", scopeKey);

    if (error) {
      throw new Error(`Failed to delete idempotency record in Supabase: ${error.message}`);
    }
  }

  async createWalletChallenge(
    input: Omit<WalletChallengeRecord, "consumedAt" | "createdAt">,
  ): Promise<WalletChallengeRecord> {
    const { data, error } = await this.client
      .from("wallet_challenges")
      .insert({
        id: input.id,
        user_id: input.userId,
        wallet_address: input.walletAddress,
        wallet_provider: input.walletProvider,
        nonce_hash: input.nonceHash,
        message: input.message,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
      })
      .select("*")
      .single<WalletChallengeRow>();

    if (error || !data) {
      throw new Error(`Failed to create wallet challenge in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapWalletChallengeRow(data);
  }

  async getWalletChallenge(id: string): Promise<WalletChallengeRecord | null> {
    const { data, error } = await this.client
      .from("wallet_challenges")
      .select("*")
      .eq("id", id)
      .maybeSingle<WalletChallengeRow>();

    if (error) {
      throw new Error(`Failed to fetch wallet challenge from Supabase: ${error.message}`);
    }

    return data ? mapWalletChallengeRow(data) : null;
  }

  async consumeWalletChallenge(id: string, consumedAt: string): Promise<void> {
    const { error } = await this.client
      .from("wallet_challenges")
      .update({
        consumed_at: consumedAt,
      })
      .eq("id", id)
      .is("consumed_at", null);

    if (error) {
      throw new Error(`Failed to consume wallet challenge in Supabase: ${error.message}`);
    }
  }

  async getActiveWalletBindingByWallet(walletAddress: string): Promise<WalletBindingRecord | null> {
    const { data, error } = await this.client
      .from("wallet_bindings")
      .select("*")
      .eq("wallet_address", walletAddress)
      .is("revoked_at", null)
      .maybeSingle<WalletBindingRow>();

    if (error) {
      throw new Error(`Failed to fetch active wallet binding from Supabase: ${error.message}`);
    }

    return data ? mapWalletBindingRow(data) : null;
  }

  async upsertWalletBinding(input: {
    userId: string;
    walletAddress: string;
    walletProvider: string;
    challengeId: string;
    verifiedAt: string;
  }): Promise<WalletBindingRecord> {
    const existing = await this.getWalletBindingForUserAndWallet(input.userId, input.walletAddress);

    if (existing) {
      const { data, error } = await this.client
        .from("wallet_bindings")
        .update({
          wallet_provider: input.walletProvider,
          challenge_id: input.challengeId,
          verified_at: input.verifiedAt,
          revoked_at: null,
          updated_at: input.verifiedAt,
        })
        .eq("id", existing.id)
        .select("*")
        .single<WalletBindingRow>();

      if (error || !data) {
        throw new Error(`Failed to update wallet binding in Supabase: ${error?.message ?? "unknown error"}`);
      }

      return mapWalletBindingRow(data);
    }

    const { data, error } = await this.client
      .from("wallet_bindings")
      .insert({
        id: uuid(),
        user_id: input.userId,
        wallet_address: input.walletAddress,
        wallet_provider: input.walletProvider,
        challenge_id: input.challengeId,
        verified_at: input.verifiedAt,
      })
      .select("*")
      .single<WalletBindingRow>();

    if (error || !data) {
      throw new Error(`Failed to create wallet binding in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapWalletBindingRow(data);
  }

  async getActiveWalletBindingByUser(userId: string): Promise<WalletBindingRecord | null> {
    const { data, error } = await this.client
      .from("wallet_bindings")
      .select("*")
      .eq("user_id", userId)
      .is("revoked_at", null)
      .maybeSingle<WalletBindingRow>();

    if (error) {
      throw new Error(`Failed to fetch active wallet binding by user from Supabase: ${error.message}`);
    }

    return data ? mapWalletBindingRow(data) : null;
  }

  async createContractRegistry(
    input: Omit<ContractRegistryRecord, "createdAt" | "updatedAt">,
  ): Promise<ContractRegistryRecord> {
    if (input.status === "active") {
      const { error: deactivateError } = await this.client
        .from("contract_registry")
        .update({
          status: "inactive",
          updated_at: new Date().toISOString(),
        })
        .eq("environment", input.environment)
        .eq("status", "active");

      if (deactivateError) {
        throw new Error(`Failed to deactivate existing contract registry rows: ${deactivateError.message}`);
      }
    }

    const { data, error } = await this.client
      .from("contract_registry")
      .insert({
        id: input.id,
        environment: input.environment,
        escrow_contract_id: input.escrowContractId,
        token_contract_id: input.tokenContractId,
        oracle_public_key: input.oraclePublicKey,
        rpc_url: input.rpcUrl,
        network_passphrase: input.networkPassphrase,
        status: input.status,
      })
      .select("*")
      .single<ContractRegistryRow>();

    if (error || !data) {
      throw new Error(`Failed to create contract registry row in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapContractRegistryRow(data);
  }

  async getActiveContractRegistry(environment: "staging" | "pilot"): Promise<ContractRegistryRecord | null> {
    const { data, error } = await this.client
      .from("contract_registry")
      .select("*")
      .eq("environment", environment)
      .eq("status", "active")
      .maybeSingle<ContractRegistryRow>();

    if (error) {
      throw new Error(`Failed to fetch active contract registry row from Supabase: ${error.message}`);
    }

    return data ? mapContractRegistryRow(data) : null;
  }

  async clearContractRegistry(environment?: "staging" | "pilot"): Promise<void> {
    const query = this.client.from("contract_registry").delete();
    const { error } = environment ? await query.eq("environment", environment) : await query;

    if (error) {
      throw new Error(`Failed to clear contract registry rows in Supabase: ${error.message}`);
    }
  }

  async createReleaseIntent(input: Omit<ReleaseIntentRecord, "createdAt">): Promise<ReleaseIntentRecord> {
    const { data, error } = await this.client
      .from("release_intents")
      .insert({
        id: input.id,
        order_id: input.orderId,
        actor_user_id: input.actorUserId,
        actor_wallet: input.actorWallet,
        actor_roles_json: input.actorRoles,
        contract_id: input.contractId,
        environment: input.environment,
        attestation_nonce: input.attestationNonce,
        attestation_payload: input.attestationPayload,
        attestation_signature: input.attestationSignature,
        issued_at: input.issuedAt,
        expires_at: input.expiresAt,
        correlation_id: input.correlationId,
      })
      .select("*")
      .single<ReleaseIntentRow>();

    if (error || !data) {
      throw new Error(`Failed to create release intent in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapReleaseIntentRow(data);
  }

  async getReleaseIntentByNonce(orderId: string, attestationNonce: string): Promise<ReleaseIntentRecord | null> {
    const { data, error } = await this.client
      .from("release_intents")
      .select("*")
      .eq("order_id", orderId)
      .eq("attestation_nonce", attestationNonce)
      .maybeSingle<ReleaseIntentRow>();

    if (error) {
      throw new Error(`Failed to fetch release intent by nonce from Supabase: ${error.message}`);
    }

    return data ? mapReleaseIntentRow(data) : null;
  }

  async getTransactionByHash(txHash: string): Promise<TransactionRecord | null> {
    const { data, error } = await this.client
      .from("transactions")
      .select("*")
      .eq("tx_hash", txHash)
      .maybeSingle<TransactionRow>();

    if (error) {
      throw new Error(`Failed to fetch transaction by hash from Supabase: ${error.message}`);
    }

    return data ? mapTransactionRow(data) : null;
  }

  async getReleaseRecordByTxHash(txHash: string): Promise<ReleaseRecord | null> {
    const { data, error } = await this.client
      .from("release_records")
      .select("*")
      .eq("tx_hash", txHash)
      .maybeSingle<ReleaseRecordRow>();

    if (error) {
      throw new Error(`Failed to fetch release record by tx hash from Supabase: ${error.message}`);
    }

    return data ? mapReleaseRecordRow(data) : null;
  }

  async createReleaseRecord(input: Omit<ReleaseRecord, "id" | "createdAt" | "updatedAt">): Promise<ReleaseRecord> {
    const { data, error } = await this.client
      .from("release_records")
      .insert({
        release_intent_id: input.releaseIntentId,
        order_id: input.orderId,
        tx_hash: input.txHash,
        attestation_nonce: input.attestationNonce,
        submitted_wallet: input.submittedWallet,
        contract_id: input.contractId,
        status: input.status,
        correlation_id: input.correlationId,
        confirmed_at: input.confirmedAt,
        chain_ledger: input.chainLedger,
      })
      .select("*")
      .single<ReleaseRecordRow>();

    if (error || !data) {
      throw new Error(`Failed to create release record in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapReleaseRecordRow(data);
  }

  async updateReleaseRecord(
    id: string,
    patch: Partial<Pick<ReleaseRecord, "status" | "confirmedAt" | "chainLedger" | "correlationId">>,
  ): Promise<ReleaseRecord> {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (patch.status !== undefined) {
      update.status = patch.status;
    }
    if (patch.confirmedAt !== undefined) {
      update.confirmed_at = patch.confirmedAt;
    }
    if (patch.chainLedger !== undefined) {
      update.chain_ledger = patch.chainLedger;
    }
    if (patch.correlationId !== undefined) {
      update.correlation_id = patch.correlationId;
    }

    const { data, error } = await this.client
      .from("release_records")
      .update(update)
      .eq("id", id)
      .select("*")
      .single<ReleaseRecordRow>();

    if (error || !data) {
      throw new Error(`Failed to update release record in Supabase: ${error?.message ?? "unknown error"}`);
    }

    return mapReleaseRecordRow(data);
  }

  private async insertStatusHistory(row: Omit<StatusHistoryRow, "id">) {
    const { error } = await this.client.from("order_status_history").insert({
      id: uuid(),
      ...row,
    });

    if (error) {
      throw new Error(`Failed to write order history in Supabase: ${error.message}`);
    }
  }

  private async getIdempotencyRecord(scopeKey: string): Promise<IdempotencyRecord | null> {
    const { data, error } = await this.client
      .from("idempotency_keys")
      .select("*")
      .eq("scope_key", scopeKey)
      .maybeSingle<IdempotencyRow>();

    if (error) {
      throw new Error(`Failed to fetch idempotency record from Supabase: ${error.message}`);
    }

    return data ? mapIdempotencyRow(data) : null;
  }

  private async getWalletBindingForUserAndWallet(
    userId: string,
    walletAddress: string,
  ): Promise<WalletBindingRecord | null> {
    const { data, error } = await this.client
      .from("wallet_bindings")
      .select("*")
      .eq("user_id", userId)
      .eq("wallet_address", walletAddress)
      .maybeSingle<WalletBindingRow>();

    if (error) {
      throw new Error(`Failed to fetch wallet binding from Supabase: ${error.message}`);
    }

    return data ? mapWalletBindingRow(data) : null;
  }
}

function mapOrderRow(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    contractId: row.contract_id,
    sellerWallet: row.seller_wallet,
    buyerWallet: row.buyer_wallet,
    riderWallet: row.rider_wallet,
    itemAmount: String(row.item_amount),
    deliveryFee: String(row.delivery_fee),
    totalAmount: String(row.total_amount),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fundedAt: row.funded_at,
    releasedAt: row.released_at,
    expiresAt: row.expires_at,
  };
}

function mapEvidenceRow(row: EvidenceRow): EvidenceRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    imageUrl: row.image_url,
    gpsLat: Number(row.gps_lat),
    gpsLng: Number(row.gps_lng),
    submittedAt: row.submitted_at,
    fileHash: row.file_hash,
  };
}

function mapOracleDecisionRow(row: OracleDecisionRow): OracleDecisionRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    decision: row.decision,
    confidence: Number(row.confidence),
    reason: row.reason,
    fraudFlags: Array.isArray(row.fraud_flags_json) ? row.fraud_flags_json : [],
    signature: row.signature,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
  };
}

function mapTransactionRow(row: TransactionRow): TransactionRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    txHash: row.tx_hash,
    txType: row.tx_type,
    txStatus: row.tx_status,
    createdAt: row.created_at,
  };
}

function mapStatusHistoryRow(row: StatusHistoryRow): OrderStatusHistoryEntry {
  return {
    id: row.id,
    orderId: row.order_id,
    oldStatus: row.old_status,
    newStatus: row.new_status,
    changedAt: row.changed_at,
    note: row.note,
  };
}

function mapIdempotencyRow(row: IdempotencyRow): IdempotencyRecord {
  return {
    scopeKey: row.scope_key,
    method: row.method,
    path: row.path,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    correlationId: row.correlation_id,
    state: row.state,
    responseStatus: row.response_status,
    responseBody: row.response_body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapWalletChallengeRow(row: WalletChallengeRow): WalletChallengeRecord {
  return {
    id: row.id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    walletProvider: row.wallet_provider,
    nonceHash: row.nonce_hash,
    message: row.message,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at,
  };
}

function mapWalletBindingRow(row: WalletBindingRow): WalletBindingRecord {
  return {
    id: row.id,
    userId: row.user_id,
    walletAddress: row.wallet_address,
    walletProvider: row.wallet_provider,
    challengeId: row.challenge_id,
    verifiedAt: row.verified_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapContractRegistryRow(row: ContractRegistryRow): ContractRegistryRecord {
  return {
    id: row.id,
    environment: row.environment,
    escrowContractId: row.escrow_contract_id,
    tokenContractId: row.token_contract_id,
    oraclePublicKey: row.oracle_public_key,
    rpcUrl: row.rpc_url,
    networkPassphrase: row.network_passphrase,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapReleaseIntentRow(row: ReleaseIntentRow): ReleaseIntentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    actorUserId: row.actor_user_id,
    actorWallet: row.actor_wallet,
    actorRoles: Array.isArray(row.actor_roles_json) ? row.actor_roles_json : [],
    contractId: row.contract_id,
    environment: row.environment,
    attestationNonce: row.attestation_nonce,
    attestationPayload: row.attestation_payload,
    attestationSignature: row.attestation_signature,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  };
}

function mapReleaseRecordRow(row: ReleaseRecordRow): ReleaseRecord {
  return {
    id: row.id,
    releaseIntentId: row.release_intent_id,
    orderId: row.order_id,
    txHash: row.tx_hash,
    attestationNonce: row.attestation_nonce,
    submittedWallet: row.submitted_wallet,
    contractId: row.contract_id,
    status: row.status,
    correlationId: row.correlation_id,
    confirmedAt: row.confirmed_at,
    chainLedger: row.chain_ledger,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function createRepository(): Repository {
  if (!isSupabaseConfigured()) {
    return new InMemoryRepository();
  }

  const client = getSupabaseAdminClient();
  if (!client) {
    return new InMemoryRepository();
  }

  return new SupabaseRepository(client);
}

export const repository: Repository = createRepository();
