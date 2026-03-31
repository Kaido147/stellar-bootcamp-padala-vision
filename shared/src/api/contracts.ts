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
  transactions?: TransactionRecord[];
  pending_transactions?: TransactionRecord[];
  failed_transactions?: TransactionRecord[];
  open_dispute?: {
    id: string;
    status: string;
    reason_code: string;
    description: string;
    resolution: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  latest_dispute?: {
    id: string;
    status: string;
    reason_code: string;
    description: string;
    resolution: string | null;
    created_at: string;
    updated_at: string;
  } | null;
  review_state?: {
    decision: string | null;
    confidence: number | null;
    fraud_flags: string[];
    reason: string | null;
    reviewed_at: string | null;
  };
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

export interface ReleaseIntentRequest {
  order_id: string;
}

export interface ReleaseIntentArgs {
  order_id: string;
  decision: Extract<SignedOracleAttestation["decision"], "APPROVE">;
  confidence_bps: number;
  issued_at_secs: number;
  expires_at_secs: number;
  nonce: string;
  signature: string;
  contract_id: string;
  environment: SignedOracleAttestation["environment"];
}

export interface ReleaseIntentResponse {
  release_intent_id: string;
  order_id: string;
  contract_id: string;
  network_passphrase: string;
  rpc_url: string;
  method: "submit_release";
  attestation: SignedOracleAttestation;
  args: ReleaseIntentArgs;
  replay_key: string;
}

export interface ReleaseRecordRequest {
  order_id: string;
  tx_hash: string;
  attestation_nonce: string;
  submitted_wallet: string;
}

export interface ReleaseRecordResponse {
  release_status: "pending_confirmation" | "confirmed";
  chain_status: "pending" | "confirmed" | "failed";
  financial_finality: boolean;
  order: OrderRecord;
  tx: TransactionRecord | null;
  release_record_id: string;
}

export interface OrderHistoryResponse {
  order: OrderRecord;
  history: OrderStatusHistoryEntry[];
  transactions: TransactionRecord[];
  pending_transactions?: TransactionRecord[];
  failed_transactions?: TransactionRecord[];
  latest_dispute?: {
    id: string;
    status: string;
    reason_code: string;
    description: string;
    resolution: string | null;
    created_at: string;
    updated_at: string;
  } | null;
}
