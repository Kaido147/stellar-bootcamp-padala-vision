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
import type { SignedOracleAttestation } from "@padala-vision/shared";

const DEFAULT_TESTNET_RPC = "https://soroban-testnet.stellar.org";

function getConfig() {
  const rpcUrl = import.meta.env.VITE_RPC_URL ?? DEFAULT_TESTNET_RPC;
  const networkPassphrase =
    import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
  const contractId = import.meta.env.VITE_PADALA_ESCROW_CONTRACT_ID;

  if (!contractId) {
    throw new Error("VITE_PADALA_ESCROW_CONTRACT_ID is required for real release transactions.");
  }

  return {
    rpcUrl,
    networkPassphrase,
    contractId,
  };
}

export async function submitReleaseTransaction(input: {
  orderId: string;
  attestation: SignedOracleAttestation;
  sourceAddress?: string;
}) {
  const { rpcUrl, networkPassphrase, contractId } = getConfig();
  const server = new rpc.Server(rpcUrl);

  const walletAddress = input.sourceAddress || (await getFreighterAddress());
  if (!walletAddress) {
    throw new Error("Connect Freighter before submitting the release transaction.");
  }

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
            nativeToScVal(BigInt(input.orderId), { type: "u64" }),
            nativeToScVal(input.attestation.decision, { type: "symbol" }),
            nativeToScVal(Math.round(input.attestation.confidence * 10_000), {
              type: "u32",
            }),
            nativeToScVal(BigInt(new Date(input.attestation.issuedAt).getTime()), {
              type: "u64",
            }),
            nativeToScVal(BigInt(new Date(input.attestation.expiresAt).getTime()), {
              type: "u64",
            }),
            nativeToScVal(Buffer.from(input.attestation.signature, "hex"), {
              type: "bytes",
            }),
          ],
        }),
      )
      .setTimeout(TimeoutInfinite)
      .build(),
  );

  const signed = await FreighterApi.signTransaction(
    prepared.toEnvelope().toXDR("base64"),
    {
      address: walletAddress,
      networkPassphrase,
    },
  );

  if (signed.error) {
    throw new Error(signed.error);
  }

  const signedTx = TransactionBuilder.fromXDR(signed.signedTxXdr, networkPassphrase);
  const sendResult = await server.sendTransaction(signedTx);

  if ("errorResultXdr" in sendResult && sendResult.errorResultXdr) {
    throw new Error(`Soroban sendTransaction failed with status ${sendResult.status}`);
  }

  const txHash = sendResult.hash;
  const finalResult = await server.pollTransaction(txHash, {
    attempts: 15,
  });

  if (finalResult.status !== "SUCCESS") {
    throw new Error(`Release transaction did not succeed. Final status: ${finalResult.status}`);
  }

  return {
    hash: txHash,
    status: finalResult.status,
  };
}

export async function getFreighterAddress() {
  const access = await FreighterApi.requestAccess();
  if (access.error) {
    throw new Error(access.error);
  }

  return access.address;
}
