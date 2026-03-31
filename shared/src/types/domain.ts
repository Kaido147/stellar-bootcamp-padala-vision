import { ORACLE_DECISIONS, ORDER_STATUSES } from "../constants/status.js";

export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type OracleDecision = (typeof ORACLE_DECISIONS)[number];

export interface MonetaryBreakdown {
  itemAmount: string;
  deliveryFee: string;
  totalAmount: string;
}

export interface OrderRecord extends MonetaryBreakdown {
  id: string;
  contractId: string | null;
  sellerWallet: string;
  buyerWallet: string;
  riderWallet: string | null;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
  fundedAt: string | null;
  releasedAt: string | null;
  expiresAt: string;
}

export interface EvidenceInput {
  orderId: string;
  riderWallet: string;
  imageUrl: string;
  fileHash?: string | null;
  storagePath?: string | null;
  gps: {
    lat: number;
    lng: number;
  };
  timestamp: string;
}

export interface OracleAttestationPayload {
  version: "v2";
  orderId: string;
  decision: Extract<OracleDecision, "APPROVE">;
  confidenceBps: number;
  issuedAtSecs: number;
  expiresAtSecs: number;
  nonce: string;
  contractId: string;
  environment: "staging" | "pilot";
}

export interface SignedOracleAttestation extends OracleAttestationPayload {
  signature: string;
}

export interface OracleEvaluationResult {
  decision: OracleDecision;
  confidence: number;
  fraudFlags: string[];
  reason: string;
  attestation: SignedOracleAttestation | null;
}

export interface EvidenceUploadResult {
  storagePath: string;
  signedUrl: string;
  fileHash: string;
  contentType: string;
}

export interface OrderStatusHistoryEntry {
  id: string;
  orderId: string;
  oldStatus: OrderStatus | null;
  newStatus: OrderStatus;
  changedAt: string;
  note: string | null;
}

export interface TransactionRecord {
  id: string;
  orderId: string;
  txHash: string;
  txType: string;
  txStatus: string;
  createdAt: string;
}
