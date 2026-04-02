import {
  BASE_FEE,
  Operation,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  type xdr,
} from "@stellar/stellar-sdk";

export async function prepareContractInvocation(input: {
  rpcUrl: string;
  networkPassphrase: string;
  sourceAddress: string;
  contractId: string;
  functionName: string;
  args?: xdr.ScVal[];
}) {
  const server = new rpc.Server(input.rpcUrl);
  const account = await server.getAccount(input.sourceAddress);
  const built = new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase: input.networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: input.contractId,
        function: input.functionName,
        args: input.args ?? [],
      }),
    )
    .setTimeout(300)
    .build();

  return server.prepareTransaction(built);
}

export async function submitPreparedTransaction(input: {
  rpcUrl: string;
  networkPassphrase: string;
  signedTxXdr: string;
}) {
  const server = new rpc.Server(input.rpcUrl);
  const signed = TransactionBuilder.fromXDR(input.signedTxXdr, input.networkPassphrase);
  const submitted = await server.sendTransaction(signed);

  if (submitted.status === "ERROR") {
    throw new Error("Soroban RPC rejected the transaction before submission.");
  }
  if (!submitted.hash) {
    throw new Error("Soroban RPC did not return a transaction hash.");
  }

  return {
    server,
    txHash: submitted.hash,
    sendStatus: submitted.status,
  };
}

export async function waitForTransactionFinality(input: {
  server: rpc.Server;
  txHash: string;
  timeoutMs?: number;
  intervalMs?: number;
}) {
  const deadline = Date.now() + (input.timeoutMs ?? 45_000);
  const intervalMs = input.intervalMs ?? 1_500;

  while (Date.now() < deadline) {
    const transaction = await input.server.getTransaction(input.txHash);
    if (transaction.status === "SUCCESS" || transaction.status === "FAILED") {
      return transaction;
    }

    await new Promise((resolve) => window.setTimeout(resolve, intervalMs));
  }

  throw new Error("Timed out waiting for the transaction to finalize on Soroban RPC.");
}

export function toAddressScVal(address: string) {
  return nativeToScVal(address, { type: "address" });
}

export function toI128ScVal(amount: bigint) {
  return nativeToScVal(amount, { type: "i128" });
}

export function toU64ScVal(value: bigint) {
  return nativeToScVal(value, { type: "u64" });
}

export async function readTokenDecimals(input: {
  rpcUrl: string;
  networkPassphrase: string;
  sourceAddress: string;
  tokenContractId: string;
}) {
  const server = new rpc.Server(input.rpcUrl);
  const account = await server.getAccount(input.sourceAddress);
  const tx = new TransactionBuilder(account, {
    fee: String(BASE_FEE),
    networkPassphrase: input.networkPassphrase,
  })
    .addOperation(
      Operation.invokeContractFunction({
        contract: input.tokenContractId,
        function: "decimals",
        args: [],
      }),
    )
    .setTimeout(60)
    .build();

  const simulation = await server.simulateTransaction(tx);
  if ("error" in simulation) {
    throw new Error(simulation.error);
  }
  if (!simulation.result) {
    throw new Error("Token decimals simulation did not return a value.");
  }

  return Number(scValToNative(simulation.result.retval));
}
