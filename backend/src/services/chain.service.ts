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

interface ChainServiceOptions {
  verifyReleaseTransaction?: (input: {
    txHash: string;
    orderId: string;
    contractId: string;
    attestationNonce: string;
    submittedWallet: string;
  }) => Promise<VerifiedReleaseTransaction>;
}

export class ChainService {
  private readonly verifyReleaseTransactionImpl: NonNullable<ChainServiceOptions["verifyReleaseTransaction"]>;

  constructor(options: ChainServiceOptions = {}) {
    this.verifyReleaseTransactionImpl = options.verifyReleaseTransaction ?? defaultVerifyReleaseTransaction;
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
}

async function defaultVerifyReleaseTransaction(): Promise<VerifiedReleaseTransaction> {
  throw new HttpError(
    503,
    "Chain verification is not configured for release recording",
    "chain_verification_unavailable",
  );
}
