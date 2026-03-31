import { useWalletContext } from "../providers/WalletProvider";

export function useWallet() {
  return useWalletContext();
}
