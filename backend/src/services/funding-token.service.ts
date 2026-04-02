import {
  BASE_FEE,
  Keypair,
  Operation,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
} from "@stellar/stellar-sdk";
import type { FundingTokenMetadata } from "@padala-vision/shared";
import { formatTokenAmountFromBaseUnits } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";

interface SimulateInput {
  rpcUrl: string;
  networkPassphrase: string;
  contractId: string;
  functionName: string;
  sourceAddress: string;
  args?: ReturnType<typeof nativeToScVal>[];
}

interface MintTopUpInput {
  rpcUrl: string;
  networkPassphrase: string;
  tokenContractId: string;
  adminSecret: string;
  recipientWallet: string;
  amountNeededBaseUnits: bigint;
}

interface MintTopUpResult {
  status: "minted" | "already_ready";
  txHash: string | null;
  mintedAmount: string;
  balanceAfter: string;
}

const VIEW_SOURCE = "GDRWACB7JDNPZ5ZZYCJUDMGCKNCR6ZSVZP2K2X37KT66ZC6HEGQRKDVI";

export class FundingTokenService {
  async inspectToken(input: {
    rpcUrl: string;
    networkPassphrase: string;
    contractId: string;
    sourceAddress?: string | null;
  }): Promise<FundingTokenMetadata> {
    const sourceAddress = input.sourceAddress ?? VIEW_SOURCE;
    try {
      const [decimals, name, symbol, adminAddress] = await Promise.all([
        this.simulateView({
          rpcUrl: input.rpcUrl,
          networkPassphrase: input.networkPassphrase,
          contractId: input.contractId,
          functionName: "decimals",
          sourceAddress,
        }),
        this.simulateView({
          rpcUrl: input.rpcUrl,
          networkPassphrase: input.networkPassphrase,
          contractId: input.contractId,
          functionName: "name",
          sourceAddress,
        }),
        this.simulateView({
          rpcUrl: input.rpcUrl,
          networkPassphrase: input.networkPassphrase,
          contractId: input.contractId,
          functionName: "symbol",
          sourceAddress,
        }),
        this.simulateView({
          rpcUrl: input.rpcUrl,
          networkPassphrase: input.networkPassphrase,
          contractId: input.contractId,
          functionName: "admin",
          sourceAddress,
        }).catch(() => null),
      ]);

      const parsedAsset = parseAssetDescriptor(String(name), typeof adminAddress === "string" ? adminAddress : null);

      return {
        contractId: input.contractId,
        symbol: String(symbol),
        name: String(name),
        decimals: Number(decimals),
        adminAddress: typeof adminAddress === "string" ? adminAddress : null,
        assetCode: parsedAsset.assetCode,
        assetIssuer: parsedAsset.assetIssuer,
        isStellarAssetContract: parsedAsset.assetIssuer !== null,
        trustlineRequired: parsedAsset.assetIssuer !== null,
      };
    } catch {
      return {
        contractId: input.contractId,
        symbol: "TOKEN",
        name: input.contractId,
        decimals: 7,
        adminAddress: null,
        assetCode: null,
        assetIssuer: null,
        isStellarAssetContract: false,
        trustlineRequired: false,
      };
    }
  }

  async getBalanceBaseUnits(input: {
    rpcUrl: string;
    networkPassphrase: string;
    tokenContractId: string;
    walletAddress: string;
    sourceAddress?: string | null;
  }) {
    const balance = await this.simulateView({
      rpcUrl: input.rpcUrl,
      networkPassphrase: input.networkPassphrase,
      contractId: input.tokenContractId,
      functionName: "balance",
      sourceAddress: input.sourceAddress ?? VIEW_SOURCE,
      args: [nativeToScVal(input.walletAddress, { type: "address" })],
    });

    return BigInt(String(balance));
  }

  async mintBuyerTopUp(input: MintTopUpInput): Promise<MintTopUpResult> {
    const adminKeypair = Keypair.fromSecret(input.adminSecret);
    const currentBalance = await this.getBalanceBaseUnits({
      rpcUrl: input.rpcUrl,
      networkPassphrase: input.networkPassphrase,
      tokenContractId: input.tokenContractId,
      walletAddress: input.recipientWallet,
      sourceAddress: adminKeypair.publicKey(),
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("trustline entry is missing")) {
        throw new HttpError(
          409,
          "Add the active token trustline before requesting a demo top-up.",
          "workflow_token_trustline_required",
        );
      }

      throw error;
    });

    const shortfall = input.amountNeededBaseUnits - currentBalance;
    if (shortfall <= 0n) {
      return {
        status: "already_ready",
        txHash: null,
        mintedAmount: "0",
        balanceAfter: currentBalance.toString(),
      };
    }

    const server = new rpc.Server(input.rpcUrl);
    const account = await server.getAccount(adminKeypair.publicKey());
    let transaction = new TransactionBuilder(account, {
      fee: String(BASE_FEE),
      networkPassphrase: input.networkPassphrase,
    })
      .addOperation(
        Operation.invokeContractFunction({
          contract: input.tokenContractId,
          function: "mint",
          args: [
            nativeToScVal(input.recipientWallet, { type: "address" }),
            nativeToScVal(shortfall, { type: "i128" }),
          ],
        }),
      )
      .setTimeout(120)
      .build();

    transaction = await server.prepareTransaction(transaction);
    transaction.sign(adminKeypair);

    const submitted = await server.sendTransaction(transaction);
    if (!submitted.hash) {
      throw new HttpError(502, "Token top-up submission did not return a transaction hash", "workflow_token_top_up_failed");
    }

    const finality = await waitForTransactionFinality(server, submitted.hash);
    if (finality.status !== "SUCCESS") {
      throw new HttpError(502, "Token top-up failed on chain", "workflow_token_top_up_failed");
    }

    const nextBalance = await this.getBalanceBaseUnits({
      rpcUrl: input.rpcUrl,
      networkPassphrase: input.networkPassphrase,
      tokenContractId: input.tokenContractId,
      walletAddress: input.recipientWallet,
      sourceAddress: adminKeypair.publicKey(),
    });

    return {
      status: "minted",
      txHash: submitted.hash,
      mintedAmount: shortfall.toString(),
      balanceAfter: nextBalance.toString(),
    };
  }

  private async simulateView<T>(input: SimulateInput): Promise<T> {
    const server = new rpc.Server(input.rpcUrl);
    const account = await server.getAccount(input.sourceAddress);
    const transaction = new TransactionBuilder(account, {
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
      .setTimeout(60)
      .build();

    const simulation = await server.simulateTransaction(transaction);
    if ("error" in simulation) {
      throw new Error(simulation.error);
    }
    if (!simulation.result) {
      throw new Error(`Simulation for ${input.functionName} did not return a value.`);
    }

    return scValToNative(simulation.result.retval) as T;
  }
}

function parseAssetDescriptor(name: string, adminAddress: string | null) {
  const separatorIndex = name.indexOf(":");
  const assetCode = separatorIndex >= 0 ? name.slice(0, separatorIndex) : null;
  const trailing = separatorIndex >= 0 ? name.slice(separatorIndex + 1) : null;
  const assetIssuer =
    trailing && StrKey.isValidEd25519PublicKey(trailing)
      ? trailing
      : adminAddress && StrKey.isValidEd25519PublicKey(adminAddress)
        ? adminAddress
        : null;

  return {
    assetCode,
    assetIssuer,
  };
}

async function waitForTransactionFinality(server: rpc.Server, txHash: string) {
  const deadline = Date.now() + 45_000;

  while (Date.now() < deadline) {
    const transaction = await server.getTransaction(txHash);
    if (transaction.status === "SUCCESS" || transaction.status === "FAILED") {
      return transaction;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  throw new HttpError(504, "Timed out waiting for token top-up confirmation", "workflow_token_top_up_timeout");
}

export function formatDisplayAmountFromBaseUnits(amount: bigint | string, decimals: number) {
  return formatTokenAmountFromBaseUnits(amount, decimals);
}
