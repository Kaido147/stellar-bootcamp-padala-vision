import { Networks } from "@stellar/stellar-sdk";
import FreighterApi from "@stellar/freighter-api";

export interface WalletSnapshot {
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  rpcUrl: string | null;
  installed: boolean;
}

export function getExpectedNetworkPassphrase() {
  return import.meta.env.VITE_STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET;
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
