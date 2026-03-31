import {
  BASE_FEE,
  Networks,
  Operation,
  TimeoutInfinite,
  TransactionBuilder,
  nativeToScVal,
  rpc,
} from "@stellar/stellar-sdk";
import FreighterApi from "@stellar/freighter-api";
import type { ReleaseIntentResponse } from "@padala-vision/shared";

const DEFAULT_TESTNET_RPC = "https://soroban-testnet.stellar.org";

export type TxStage = "Prepare" | "Sign" | "Submitted" | "Confirming" | "Confirmed" | "Failed";

export interface WalletSnapshot {
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  rpcUrl: string | null;
  installed: boolean;
}

function getFallbackConfig() {
  return {
    rpcUrl: import.meta.env.VITE_RPC_URL ?? DEFAULT_TESTNET_RPC,
    networkPassphrase:
      import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET,
  };
}

export function getExpectedNetworkPassphrase() {
  return import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
}

export function getExplorerUrl(hash: string) {
  return `https://stellar.expert/explorer/testnet/tx/${hash}`;
}

export async function getWalletSnapshot(): Promise<WalletSnapshot> {
  const connected = await FreighterApi.isConnected();
  if (connected.error || !connected.isConnected) {
    return {
      address: null,
      network: null,
      networkPassphrase: null,
      rpcUrl: null,
      installed: false,
    };
  }

  const [{ address, error: addressError }, networkDetails] = await Promise.all([
    FreighterApi.getAddress(),
    FreighterApi.getNetworkDetails(),
  ]);

  return {
    address: addressError ? null : address,
    network: networkDetails.error ? null : networkDetails.network,
    networkPassphrase: networkDetails.error ? null : networkDetails.networkPassphrase,
    rpcUrl: networkDetails.error ? null : (networkDetails.sorobanRpcUrl ?? networkDetails.networkUrl),
    installed: true,
  };
}

export async function requestWalletAccess() {
  const access = await FreighterApi.requestAccess();
  if (access.error) {
    throw new Error(access.error);
  }

  return access.address;
}

export async function signWalletMessage(message: string, address: string, networkPassphrase?: string) {
  const signed = await FreighterApi.signMessage(message, {
    address,
    networkPassphrase: networkPassphrase ?? getExpectedNetworkPassphrase(),
  });

  if (signed.error || !signed.signedMessage) {
    throw new Error(signed.error ?? "Freighter did not return a message signature.");
  }

  return typeof signed.signedMessage === "string"
    ? signed.signedMessage
    : Buffer.from(signed.signedMessage).toString("base64");
}

export async function submitReleaseTransaction(input: {
  releaseIntent: ReleaseIntentResponse;
  sourceAddress?: string;
  onStageChange?: (stage: TxStage, txHash?: string) => void;
}) {
  const fallback = getFallbackConfig();
  const rpcUrl = input.releaseIntent.rpc_url || fallback.rpcUrl;
  const networkPassphrase =
    input.releaseIntent.network_passphrase || fallback.networkPassphrase;
  const contractId = input.releaseIntent.contract_id;
  const server = new rpc.Server(rpcUrl);

  input.onStageChange?.("Prepare");
  const walletAddress = input.sourceAddress || (await requestWalletAccess());
  const account = await server.getAccount(walletAddress);
  const prepared = await server.prepareTransaction(
    new TransactionBuilder(account, {
      fee: String(BASE_FEE),
      networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: contractId,
          function: "submit_release",
          args: [
            nativeToScVal(BigInt(input.releaseIntent.args.order_id), { type: "u64" }),
            nativeToScVal(input.releaseIntent.args.decision, { type: "symbol" }),
            nativeToScVal(input.releaseIntent.args.confidence_bps, {
              type: "u32",
            }),
            nativeToScVal(BigInt(input.releaseIntent.args.issued_at_secs), {
              type: "u64",
            }),
            nativeToScVal(BigInt(input.releaseIntent.args.expires_at_secs), {
              type: "u64",
            }),
            nativeToScVal(input.releaseIntent.args.nonce, {
              type: "string",
            }),
            nativeToScVal(input.releaseIntent.args.contract_id, {
              type: "string",
            }),
            nativeToScVal(input.releaseIntent.args.environment, {
              type: "string",
            }),
            nativeToScVal(Buffer.from(input.releaseIntent.args.signature, "hex"), {
              type: "bytes",
            }),
          ],
        }),
      )
      .setTimeout(TimeoutInfinite)
      .build(),
  );

  input.onStageChange?.("Sign");
  const signed = await FreighterApi.signTransaction(
    prepared.toEnvelope().toXDR("base64"),
    {
      address: walletAddress,
      networkPassphrase,
    },
  );

  if (signed.error) {
    input.onStageChange?.("Failed");
    throw new Error(signed.error);
  }

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, networkPassphrase);
  const sendResult = await server.sendTransaction(signedTx);

  if ("errorResultXdr" in sendResult && sendResult.errorResultXdr) {
    input.onStageChange?.("Failed");
    throw new Error(`Soroban sendTransaction failed with status ${sendResult.status}`);
  }

  const txHash = sendResult.hash;
  input.onStageChange?.("Submitted", txHash);
  input.onStageChange?.("Confirming", txHash);
  const finalResult = await server.pollTransaction(txHash, {
    attempts: 15,
  });

  if (finalResult.status !== "SUCCESS") {
    input.onStageChange?.("Failed", txHash);
    throw new Error(`Release transaction did not succeed. Final status: ${finalResult.status}`);
  }

  input.onStageChange?.("Confirmed", txHash);
  return {
    hash: txHash,
    status: finalResult.status,
    submittedWallet: walletAddress,
  };
}
