import type {
  EvidenceInput,
  EvidenceUploadResult,
  OracleEvaluationResult,
  OrderRecord,
  OrderStatusHistoryEntry,
  SignedOracleAttestation,
  TransactionRecord,
} from "../types/domain.js";

export interface CreateOrderRequest {
  seller_wallet: string;
  buyer_wallet: string;
  item_amount: string;
  delivery_fee: string;
  expires_at: string;
}

export interface CreateOrderResponse {
  order_id: string;
  order: OrderRecord;
  expected_total_amount: string;
}

export interface GetOrderResponse {
  order: OrderRecord;
  latest_decision: OracleEvaluationResult | null;
  latest_transaction: TransactionRecord | null;
}

export interface FundedJobsResponse {
  jobs: OrderRecord[];
}

export interface AcceptJobRequest {
  rider_wallet: string;
}

export interface MarkInTransitRequest {
  rider_wallet: string;
}

export interface EvidenceSubmitRequest {
  order_id: string;
  rider_wallet: string;
  image_url: string;
  storage_path?: string;
  file_hash?: string;
  gps: EvidenceInput["gps"];
  timestamp: string;
}

export interface EvidenceSubmitResponse extends OracleEvaluationResult {}

export interface EvidenceUploadResponse extends EvidenceUploadResult {}

export interface ReleaseRequest {
  order_id: string;
  attestation: SignedOracleAttestation;
  tx_hash: string;
  tx_status: string;
}

export interface ReleaseResponse {
  order: OrderRecord;
  tx: TransactionRecord | null;
}

export interface OrderHistoryResponse {
  order: OrderRecord;
  history: OrderStatusHistoryEntry[];
  transactions: TransactionRecord[];
}
