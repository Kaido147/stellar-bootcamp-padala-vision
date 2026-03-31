import { HttpError } from "../lib/errors.js";

export interface VerifiedReleaseTransaction {
  txHash: string;
  status: "pending" | "confirmed" | "failed";
  orderId: string;
  contractId: string;
  attestationNonce: string;
  submittedWallet: string;
  ledger?: number | null;
}

export interface ChainOrderStateSnapshot {
  orderId: string;
  contractId: string;
  status: "Draft" | "Funded" | "RiderAssigned" | "InTransit" | "Released" | "Refunded" | "Disputed";
  proven: boolean;
  ambiguous?: boolean;
  txHash?: string | null;
  ledger?: number | null;
  observedAt?: string | null;
}

interface ChainServiceOptions {
  verifyReleaseTransaction?: (input: {
    txHash: string;
    orderId: string;
    contractId: string;
    attestationNonce: string;
    submittedWallet: string;
  }) => Promise<VerifiedReleaseTransaction>;
  getOrderState?: (input: {
    orderId: string;
    contractId: string;
    forceRefresh?: boolean;
  }) => Promise<ChainOrderStateSnapshot>;
}

export class ChainService {
  private readonly verifyReleaseTransactionImpl: NonNullable<ChainServiceOptions["verifyReleaseTransaction"]>;
  private readonly getOrderStateImpl: NonNullable<ChainServiceOptions["getOrderState"]>;

  constructor(options: ChainServiceOptions = {}) {
    this.verifyReleaseTransactionImpl = options.verifyReleaseTransaction ?? defaultVerifyReleaseTransaction;
    this.getOrderStateImpl = options.getOrderState ?? defaultGetOrderState;
  }

  async verifyReleaseTransaction(input: {
    txHash: string;
    orderId: string;
    contractId: string;
    attestationNonce: string;
    submittedWallet: string;
  }): Promise<VerifiedReleaseTransaction> {
    return this.verifyReleaseTransactionImpl(input);
  }

  async getOrderState(input: {
    orderId: string;
    contractId: string;
    forceRefresh?: boolean;
  }): Promise<ChainOrderStateSnapshot> {
    return this.getOrderStateImpl(input);
  }
}

async function defaultVerifyReleaseTransaction(): Promise<VerifiedReleaseTransaction> {
  throw new HttpError(
    503,
    "Chain verification is not configured for release recording",
    "chain_verification_unavailable",
  );
}

async function defaultGetOrderState(): Promise<ChainOrderStateSnapshot> {
  throw new HttpError(
    503,
    "Chain order state lookup is not configured for reconciliation",
    "chain_state_unavailable",
  );
}
