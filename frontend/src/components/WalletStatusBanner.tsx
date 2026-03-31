import { Link } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { useWallet } from "../hooks/useWallet";
import { shortenAddress } from "../lib/format";

export function WalletStatusBanner() {
  const { walletBinding } = useAuth();
  const wallet = useWallet();

  return (
    <div className="rounded-3xl border border-ink/10 bg-sand/70 p-4">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/55">Wallet status</div>
      <div className="mt-2 text-sm text-ink">
        {wallet.installed ? `Freighter: ${wallet.address ? "connected" : "available"}` : "Freighter not detected"}
      </div>
      <div className="mt-1 text-sm text-ink/70">Connected: {shortenAddress(wallet.address)}</div>
      <div className="mt-1 text-sm text-ink/70">
        Bound: {walletBinding ? shortenAddress(walletBinding.wallet_address) : "Not verified yet"}
      </div>
      <Link className="mt-3 inline-flex text-sm font-semibold text-coral" to="/bind-wallet">
        Manage wallet binding
      </Link>
    </div>
  );
}
