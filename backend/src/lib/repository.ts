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
}

export class InMemoryRepository implements Repository {
  readonly mode = "memory" as const;
  private orders = new Map<string, OrderRecord>();
  private evidence: EvidenceRecord[] = [];
  private decisions: OracleDecisionRecord[] = [];
  private transactions: TransactionRecord[] = [];
  private history: OrderStatusHistoryEntry[] = [];
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

  private async insertStatusHistory(row: Omit<StatusHistoryRow, "id">) {
    const { error } = await this.client.from("order_status_history").insert({
      id: uuid(),
      ...row,
    });

    if (error) {
      throw new Error(`Failed to write order history in Supabase: ${error.message}`);
    }
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
