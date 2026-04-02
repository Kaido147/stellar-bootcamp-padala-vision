import { StrKey, TransactionBuilder, rpc, scValToNative, type xdr } from "@stellar/stellar-sdk";
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

export interface VerifiedOrderActionTransaction {
  txHash: string;
  status: "pending" | "confirmed" | "failed";
  orderId: string;
  contractId: string;
  submittedWallet: string;
  riderWallet?: string | null;
  ledger?: number | null;
}

export interface VerifiedCreateOrderTransaction {
  txHash: string;
  status: "pending" | "confirmed" | "failed";
  contractId: string;
  submittedWallet: string;
  sellerWallet: string;
  buyerWallet: string;
  onChainOrderId: string | null;
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
  verifyCreateOrderTransaction?: (input: {
    txHash: string;
    contractId: string;
    submittedWallet: string;
    sellerWallet: string;
    buyerWallet: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  }) => Promise<VerifiedCreateOrderTransaction>;
  verifyReleaseTransaction?: (input: {
    txHash: string;
    orderId: string;
    contractId: string;
    attestationNonce: string;
    submittedWallet: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  }) => Promise<VerifiedReleaseTransaction>;
  verifyOrderActionTransaction?: (input: {
    txHash: string;
    orderId: string;
    contractId: string;
    method: "fund_order" | "assign_rider" | "mark_in_transit" | "refund_order";
    submittedWallet: string;
    riderWallet?: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  }) => Promise<VerifiedOrderActionTransaction>;
  getOrderState?: (input: {
    orderId: string;
    contractId: string;
    forceRefresh?: boolean;
    rpcUrl?: string;
    networkPassphrase?: string;
  }) => Promise<ChainOrderStateSnapshot>;
  fetchTransaction?: (input: {
    txHash: string;
    rpcUrl: string;
  }) => Promise<{
    status: string;
    envelopeXdr?: { toXDR(format: "base64"): string } | string;
    latestLedger?: number | null;
  }>;
}

export class ChainService {
  private readonly verifyCreateOrderTransactionImpl: NonNullable<ChainServiceOptions["verifyCreateOrderTransaction"]>;
  private readonly verifyReleaseTransactionImpl: NonNullable<ChainServiceOptions["verifyReleaseTransaction"]>;
  private readonly verifyOrderActionTransactionImpl: NonNullable<ChainServiceOptions["verifyOrderActionTransaction"]>;
  private readonly getOrderStateImpl: NonNullable<ChainServiceOptions["getOrderState"]>;
  private readonly fetchTransactionImpl?: NonNullable<ChainServiceOptions["fetchTransaction"]>;

  constructor(options: ChainServiceOptions = {}) {
    this.verifyCreateOrderTransactionImpl =
      options.verifyCreateOrderTransaction ?? defaultVerifyCreateOrderTransaction;
    this.verifyReleaseTransactionImpl = options.verifyReleaseTransaction ?? defaultVerifyReleaseTransaction;
    this.verifyOrderActionTransactionImpl =
      options.verifyOrderActionTransaction ?? defaultVerifyOrderActionTransaction;
    this.getOrderStateImpl = options.getOrderState ?? defaultGetOrderState;
    this.fetchTransactionImpl = options.fetchTransaction;
  }

  async verifyReleaseTransaction(input: {
    txHash: string;
    orderId: string;
    contractId: string;
    attestationNonce: string;
    submittedWallet: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  }): Promise<VerifiedReleaseTransaction> {
    if (this.verifyReleaseTransactionImpl === defaultVerifyReleaseTransaction) {
      return defaultVerifyReleaseTransaction(input, this.fetchTransactionImpl);
    }

    return this.verifyReleaseTransactionImpl(input);
  }

  async verifyCreateOrderTransaction(input: {
    txHash: string;
    contractId: string;
    submittedWallet: string;
    sellerWallet: string;
    buyerWallet: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  }): Promise<VerifiedCreateOrderTransaction> {
    if (this.verifyCreateOrderTransactionImpl === defaultVerifyCreateOrderTransaction) {
      return defaultVerifyCreateOrderTransaction(input, this.fetchTransactionImpl);
    }

    return this.verifyCreateOrderTransactionImpl(input);
  }

  async verifyOrderActionTransaction(input: {
    txHash: string;
    orderId: string;
    contractId: string;
    method: "fund_order" | "assign_rider" | "mark_in_transit" | "refund_order";
    submittedWallet: string;
    riderWallet?: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  }): Promise<VerifiedOrderActionTransaction> {
    if (this.verifyOrderActionTransactionImpl === defaultVerifyOrderActionTransaction) {
      return defaultVerifyOrderActionTransaction(input, this.fetchTransactionImpl);
    }

    return this.verifyOrderActionTransactionImpl(input);
  }

  async getOrderState(input: {
    orderId: string;
    contractId: string;
    forceRefresh?: boolean;
    rpcUrl?: string;
    networkPassphrase?: string;
  }): Promise<ChainOrderStateSnapshot> {
    return this.getOrderStateImpl(input);
  }
}

async function defaultVerifyReleaseTransaction(
  input: {
    txHash: string;
    orderId: string;
    contractId: string;
    attestationNonce: string;
    submittedWallet: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  },
  fetchTransactionImpl?: NonNullable<ChainServiceOptions["fetchTransaction"]>,
): Promise<VerifiedReleaseTransaction> {
  if (!input.rpcUrl || !input.networkPassphrase) {
    throw new HttpError(
      503,
      "Chain verification requires rpcUrl and networkPassphrase",
      "chain_verification_unavailable",
    );
  }

  const transaction = fetchTransactionImpl
    ? await fetchTransactionImpl({
        txHash: input.txHash,
        rpcUrl: input.rpcUrl,
      })
    : await fetchTransaction({
        txHash: input.txHash,
        rpcUrl: input.rpcUrl,
      });

  if (transaction.status === "NOT_FOUND" || transaction.status === "PENDING") {
    return {
      txHash: input.txHash,
      status: "pending",
      orderId: input.orderId,
      contractId: input.contractId,
      attestationNonce: input.attestationNonce,
      submittedWallet: input.submittedWallet,
      ledger: transaction.latestLedger ?? null,
    };
  }

  if (transaction.status !== "SUCCESS") {
    return {
      txHash: input.txHash,
      status: "failed",
      orderId: input.orderId,
      contractId: input.contractId,
      attestationNonce: input.attestationNonce,
      submittedWallet: input.submittedWallet,
      ledger: transaction.latestLedger ?? null,
    };
  }

  const envelopeXdr =
    typeof transaction.envelopeXdr === "string"
      ? transaction.envelopeXdr
      : transaction.envelopeXdr?.toXDR("base64");
  if (!envelopeXdr) {
    throw new HttpError(422, "Chain transaction envelope is unavailable", "release_tx_mismatch");
  }

  const parsedTransaction = TransactionBuilder.fromXDR(envelopeXdr, input.networkPassphrase);
  const submittedSource =
    "feeSource" in parsedTransaction ? parsedTransaction.feeSource : parsedTransaction.source;
  const operations =
    "innerTransaction" in parsedTransaction
      ? parsedTransaction.innerTransaction.operations
      : parsedTransaction.operations;

  if (submittedSource !== input.submittedWallet) {
    throw new HttpError(422, "Release transaction source wallet did not match the submitted wallet", "release_tx_mismatch");
  }
  if (operations.length !== 1) {
    throw new HttpError(422, "Release transaction must contain exactly one contract invocation", "release_tx_mismatch");
  }

  const operation = operations[0];
  if (operation.type !== "invokeHostFunction") {
    throw new HttpError(422, "Release transaction did not invoke a Soroban host function", "release_tx_mismatch");
  }
  if (operation.func.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new HttpError(422, "Release transaction did not invoke a contract function", "release_tx_mismatch");
  }

  const invokeContractArgs = operation.func.invokeContract();
  const functionName = invokeContractArgs.functionName().toString();
  const invokedContractAddress = invokeContractArgs.contractAddress();
  const invokedContractId =
    invokedContractAddress.switch().name === "scAddressTypeContract"
      ? StrKey.encodeContract(Buffer.from(invokedContractAddress.contractId() as unknown as Uint8Array))
      : null;

  if (functionName !== "submit_release" || invokedContractId !== input.contractId) {
    throw new HttpError(422, "Release transaction did not target the expected contract function", "release_tx_mismatch");
  }

  const args = invokeContractArgs.args().map((arg) => scValToNative(arg));
  const orderId = normalizeArgToString(args[0]);
  const nonce = normalizeArgToString(args[5]);

  if (orderId !== input.orderId || nonce !== input.attestationNonce) {
    throw new HttpError(422, "Release transaction args did not match the persisted release intent", "release_tx_mismatch");
  }

  return {
    txHash: input.txHash,
    status: "confirmed",
    orderId,
    contractId: invokedContractId,
    attestationNonce: nonce,
    submittedWallet: submittedSource,
    ledger: transaction.latestLedger ?? null,
  };
}

async function defaultVerifyCreateOrderTransaction(
  input: {
    txHash: string;
    contractId: string;
    submittedWallet: string;
    sellerWallet: string;
    buyerWallet: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  },
  fetchTransactionImpl?: NonNullable<ChainServiceOptions["fetchTransaction"]>,
): Promise<VerifiedCreateOrderTransaction> {
  const verified = await verifyContractInvocation({
    txHash: input.txHash,
    orderId: "0",
    contractId: input.contractId,
    submittedWallet: input.submittedWallet,
    method: "create_order",
    expectedArgErrorCode: "create_order_tx_mismatch",
    mismatchMessage: "Create order transaction did not match the submitted order payload",
    rpcUrl: input.rpcUrl,
    networkPassphrase: input.networkPassphrase,
    fetchTransactionImpl,
    skipOrderIdCheck: true,
  });

  if (verified.status !== "confirmed") {
    return {
      txHash: verified.txHash,
      status: verified.status,
      contractId: verified.contractId,
      submittedWallet: verified.submittedWallet,
      sellerWallet: input.sellerWallet,
      buyerWallet: input.buyerWallet,
      onChainOrderId: null,
      ledger: verified.ledger ?? null,
    };
  }

  const sellerWallet = normalizeArgToString(verified.args[0]);
  const buyerWallet = normalizeArgToString(verified.args[1]);
  if (sellerWallet !== input.sellerWallet || buyerWallet !== input.buyerWallet) {
    throw new HttpError(422, "Create order transaction args did not match the submitted wallets", "create_order_tx_mismatch");
  }

  const returnValue = verified.returnValue;
  if (!returnValue) {
    throw new HttpError(422, "Create order transaction return value was unavailable", "create_order_tx_mismatch");
  }

  const onChainOrderId = normalizeArgToString(returnValue);

  return {
    txHash: verified.txHash,
    status: "confirmed",
    contractId: verified.contractId,
    submittedWallet: verified.submittedWallet,
    sellerWallet,
    buyerWallet,
    onChainOrderId,
    ledger: verified.ledger ?? null,
  };
}

async function defaultVerifyOrderActionTransaction(
  input: {
    txHash: string;
    orderId: string;
    contractId: string;
    method: "fund_order" | "assign_rider" | "mark_in_transit" | "refund_order";
    submittedWallet: string;
    riderWallet?: string;
    rpcUrl?: string;
    networkPassphrase?: string;
  },
  fetchTransactionImpl?: NonNullable<ChainServiceOptions["fetchTransaction"]>,
): Promise<VerifiedOrderActionTransaction> {
  const verified = await verifyContractInvocation({
    txHash: input.txHash,
    orderId: input.orderId,
    contractId: input.contractId,
    submittedWallet: input.submittedWallet,
    method: input.method,
    expectedArgErrorCode: "order_action_tx_mismatch",
    mismatchMessage: "Order action transaction did not match the persisted intent",
    rpcUrl: input.rpcUrl,
    networkPassphrase: input.networkPassphrase,
    fetchTransactionImpl,
  });

  if (verified.status !== "confirmed") {
    return verified;
  }

  const riderWallet = input.method === "assign_rider" ? normalizeOptionalArgToString(verified.args[1]) : null;
  if (input.method === "assign_rider" && riderWallet !== input.riderWallet) {
    throw new HttpError(422, "Order action transaction rider did not match the persisted intent", "order_action_tx_mismatch");
  }

  return {
    txHash: verified.txHash,
    status: verified.status,
    orderId: verified.orderId,
    contractId: verified.contractId,
    submittedWallet: verified.submittedWallet,
    riderWallet,
    ledger: verified.ledger ?? null,
  };
}

async function defaultGetOrderState(): Promise<ChainOrderStateSnapshot> {
  throw new HttpError(
    503,
    "Chain order state lookup is not configured for reconciliation",
    "chain_state_unavailable",
  );
}

async function fetchTransaction(input: { txHash: string; rpcUrl: string }) {
  const server = new rpc.Server(input.rpcUrl);
  return server.getTransaction(input.txHash);
}

async function verifyContractInvocation(input: {
  txHash: string;
  orderId: string;
  contractId: string;
  submittedWallet: string;
  method: string;
  expectedArgErrorCode: string;
  mismatchMessage: string;
  rpcUrl?: string;
  networkPassphrase?: string;
  fetchTransactionImpl?: NonNullable<ChainServiceOptions["fetchTransaction"]>;
  skipOrderIdCheck?: boolean;
}) {
  if (!input.rpcUrl || !input.networkPassphrase) {
    throw new HttpError(
      503,
      "Chain verification requires rpcUrl and networkPassphrase",
      "chain_verification_unavailable",
    );
  }

  const transaction = input.fetchTransactionImpl
    ? await input.fetchTransactionImpl({
        txHash: input.txHash,
        rpcUrl: input.rpcUrl,
      })
    : await fetchTransaction({
        txHash: input.txHash,
        rpcUrl: input.rpcUrl,
      });

  if (transaction.status === "NOT_FOUND" || transaction.status === "PENDING") {
    return {
      txHash: input.txHash,
      status: "pending" as const,
      orderId: input.orderId,
      contractId: input.contractId,
      submittedWallet: input.submittedWallet,
      ledger: transaction.latestLedger ?? null,
      args: [] as unknown[],
      returnValue: undefined as unknown,
    };
  }

  if (transaction.status !== "SUCCESS") {
    return {
      txHash: input.txHash,
      status: "failed" as const,
      orderId: input.orderId,
      contractId: input.contractId,
      submittedWallet: input.submittedWallet,
      ledger: transaction.latestLedger ?? null,
      args: [] as unknown[],
      returnValue: undefined as unknown,
    };
  }

  const envelopeXdr =
    typeof transaction.envelopeXdr === "string"
      ? transaction.envelopeXdr
      : transaction.envelopeXdr?.toXDR("base64");
  if (!envelopeXdr) {
    throw new HttpError(422, "Chain transaction envelope is unavailable", input.expectedArgErrorCode);
  }

  const parsedTransaction = TransactionBuilder.fromXDR(envelopeXdr, input.networkPassphrase);
  const submittedSource =
    "feeSource" in parsedTransaction ? parsedTransaction.feeSource : parsedTransaction.source;
  const operations =
    "innerTransaction" in parsedTransaction
      ? parsedTransaction.innerTransaction.operations
      : parsedTransaction.operations;

  if (submittedSource !== input.submittedWallet) {
    throw new HttpError(422, "Submitted wallet did not match the transaction source wallet", input.expectedArgErrorCode);
  }
  if (operations.length !== 1) {
    throw new HttpError(422, "Transaction must contain exactly one contract invocation", input.expectedArgErrorCode);
  }

  const operation = operations[0];
  if (operation.type !== "invokeHostFunction") {
    throw new HttpError(422, "Transaction did not invoke a Soroban host function", input.expectedArgErrorCode);
  }
  if (operation.func.switch().name !== "hostFunctionTypeInvokeContract") {
    throw new HttpError(422, "Transaction did not invoke a contract function", input.expectedArgErrorCode);
  }

  const invokeContractArgs = operation.func.invokeContract();
  const functionName = invokeContractArgs.functionName().toString();
  const invokedContractAddress = invokeContractArgs.contractAddress();
  const invokedContractId =
    invokedContractAddress.switch().name === "scAddressTypeContract"
      ? StrKey.encodeContract(Buffer.from(invokedContractAddress.contractId() as unknown as Uint8Array))
      : null;

  if (functionName !== input.method || invokedContractId !== input.contractId) {
    throw new HttpError(422, "Transaction did not target the expected contract function", input.expectedArgErrorCode);
  }

  const args = invokeContractArgs.args().map((arg) => scValToNative(arg));
  const orderId =
    input.skipOrderIdCheck || args.length === 0
      ? input.orderId
      : normalizeArgToString(args[0]);

  if (!input.skipOrderIdCheck && orderId !== input.orderId) {
    throw new HttpError(422, input.mismatchMessage, input.expectedArgErrorCode);
  }

  return {
    txHash: input.txHash,
    status: "confirmed" as const,
    orderId,
    contractId: invokedContractId,
    submittedWallet: submittedSource,
    ledger: transaction.latestLedger ?? null,
    args,
    returnValue:
      "returnValue" in transaction && transaction.returnValue
        ? scValToNative(transaction.returnValue as xdr.ScVal)
        : undefined,
  };
}

function normalizeArgToString(value: unknown) {
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "string") {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value).toString("hex");
  }

  throw new HttpError(422, "Release transaction argument type was invalid", "release_tx_mismatch");
}

function normalizeOptionalArgToString(value: unknown) {
  if (value === undefined || value === null) {
    return null;
  }

  return normalizeArgToString(value);
}
