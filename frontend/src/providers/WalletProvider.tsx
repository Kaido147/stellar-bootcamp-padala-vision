import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import {
  getExpectedNetworkPassphrase,
  getWalletSnapshot,
  requestWalletAccess,
  signWalletMessage,
} from "../lib/stellar";

interface WalletContextValue {
  loading: boolean;
  connecting: boolean;
  installed: boolean;
  address: string | null;
  network: string | null;
  networkPassphrase: string | null;
  rpcUrl: string | null;
  expectedNetworkPassphrase: string;
  networkMismatch: boolean;
  connectWallet: () => Promise<string>;
  refreshWallet: () => Promise<void>;
  signMessage: (message: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [address, setAddress] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [networkPassphrase, setNetworkPassphrase] = useState<string | null>(null);
  const [rpcUrl, setRpcUrl] = useState<string | null>(null);

  const expectedNetworkPassphrase = getExpectedNetworkPassphrase();

  async function refreshWallet() {
    const snapshot = await getWalletSnapshot();
    setInstalled(snapshot.installed);
    setAddress(snapshot.address);
    setNetwork(snapshot.network);
    setNetworkPassphrase(snapshot.networkPassphrase);
    setRpcUrl(snapshot.rpcUrl);
    setLoading(false);
  }

  useEffect(() => {
    void refreshWallet();
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      loading,
      connecting,
      installed,
      address,
      network,
      networkPassphrase,
      rpcUrl,
      expectedNetworkPassphrase,
      networkMismatch:
        Boolean(address) &&
        Boolean(networkPassphrase) &&
        networkPassphrase !== expectedNetworkPassphrase,
      connectWallet: async () => {
        setConnecting(true);
        try {
          const nextAddress = await requestWalletAccess();
          await refreshWallet();
          return nextAddress;
        } finally {
          setConnecting(false);
        }
      },
      refreshWallet,
      signMessage: async (message) => {
        if (!address) {
          throw new Error("Connect Freighter before signing.");
        }

        return signWalletMessage(message, address, networkPassphrase ?? expectedNetworkPassphrase);
      },
    }),
    [
      address,
      connecting,
      expectedNetworkPassphrase,
      installed,
      loading,
      network,
      networkPassphrase,
      rpcUrl,
    ],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWalletContext() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWalletContext must be used inside WalletProvider");
  }

  return context;
}
