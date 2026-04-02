import { Asset, Horizon, Networks, Operation, TransactionBuilder } from "@stellar/stellar-sdk";
import FreighterApi from "@stellar/freighter-api";

export interface WalletSnapshot {
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  rpcUrl: string | null;
  installed: boolean;
}

function normalizeWalletAddress(address: string | null | undefined) {
  const trimmed = address?.trim();
  return trimmed ? trimmed : null;
}

export function getExpectedNetworkPassphrase() {
  return import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
}

export function getHorizonUrl(networkPassphrase?: string | null) {
  return networkPassphrase === Networks.PUBLIC
    ? "https://horizon.stellar.org"
    : "https://horizon-testnet.stellar.org";
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
    address: addressError ? null : normalizeWalletAddress(address),
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

  const address = normalizeWalletAddress(access.address);
  if (!address) {
    throw new Error("Freighter did not return a wallet address.");
  }

  return address;
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

export async function signWalletTransaction(transactionXdr: string, address: string, networkPassphrase?: string) {
  const signed = await FreighterApi.signTransaction(transactionXdr, {
    address,
    networkPassphrase: networkPassphrase ?? getExpectedNetworkPassphrase(),
  });

  if (signed.error || !signed.signedTxXdr) {
    throw new Error(signed.error ?? "Freighter did not return a signed transaction.");
  }

  return signed.signedTxXdr;
}

export async function loadHorizonAccount(address: string, networkPassphrase?: string | null) {
  const server = new Horizon.Server(getHorizonUrl(networkPassphrase));
  return server.loadAccount(address);
}

export async function prepareTrustlineTransaction(input: {
  sourceAddress: string;
  networkPassphrase: string;
  assetCode: string;
  assetIssuer: string;
}) {
  const server = new Horizon.Server(getHorizonUrl(input.networkPassphrase));
  const account = await server.loadAccount(input.sourceAddress);
  const transaction = new TransactionBuilder(account, {
    fee: "100000",
    networkPassphrase: input.networkPassphrase,
  })
    .addOperation(
      Operation.changeTrust({
        asset: new Asset(input.assetCode, input.assetIssuer),
      }),
    )
    .setTimeout(120)
    .build();

  return transaction;
}

export async function submitClassicTransaction(input: {
  signedTxXdr: string;
  networkPassphrase: string;
}) {
  const server = new Horizon.Server(getHorizonUrl(input.networkPassphrase));
  const signed = TransactionBuilder.fromXDR(input.signedTxXdr, input.networkPassphrase);
  return server.submitTransaction(signed);
}
