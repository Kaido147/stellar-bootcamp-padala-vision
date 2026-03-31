import { Link } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";

export function NetworkMismatchBanner() {
  const wallet = useWallet();

  return (
    <div
      className="rounded-3xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
      data-testid="network-mismatch-banner"
    >
      <div className="font-semibold">Wrong Stellar network</div>
      <div className="mt-1">Freighter is on `{wallet.networkPassphrase ?? "unknown"}`.</div>
      <div className="mt-1">Expected `{wallet.expectedNetworkPassphrase}` before any chain or wallet-bound action.</div>
      <Link className="mt-3 inline-flex font-semibold text-red-700 underline" to="/settings/network">
        Open network diagnostics
      </Link>
    </div>
  );
}
