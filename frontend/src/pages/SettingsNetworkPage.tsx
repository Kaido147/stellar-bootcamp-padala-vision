import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { KeyValueList } from "../components/KeyValueList";
import { useWallet } from "../hooks/useWallet";
import { useAuth } from "../providers/AuthProvider";

export function SettingsNetworkPage() {
  const wallet = useWallet();
  const { walletBinding, roles } = useAuth();

  return (
    <Card title="Network Diagnostics" subtitle="Wallet, binding, and network checks before chain actions.">
      <KeyValueList
        items={[
          { label: "Roles", value: roles.length ? roles.join(", ") : "No role metadata on session" },
          { label: "Wallet address", value: wallet.address ?? "Not connected" },
          { label: "Bound wallet", value: walletBinding?.wallet_address ?? "Not verified yet" },
          { label: "Current network", value: wallet.networkPassphrase ?? "Unknown" },
          { label: "Expected network", value: wallet.expectedNetworkPassphrase },
          { label: "Soroban RPC", value: wallet.rpcUrl ?? import.meta.env.VITE_RPC_URL ?? "Not available" },
        ]}
      />
      <div className="rounded-3xl bg-sand/70 p-4 text-sm text-ink/75">
        Correction actions:
        <div className="mt-2">1. Connect Freighter.</div>
        <div>2. Switch it to the configured testnet passphrase.</div>
        <div>3. Verify wallet binding before funding, rider actions, or release relay.</div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
          onClick={() => void wallet.connectWallet()}
          type="button"
        >
          Refresh wallet connection
        </button>
        <Link className="rounded-full border border-ink/15 px-5 py-3 text-sm font-semibold text-ink" to="/bind-wallet">
          Open bind wallet
        </Link>
      </div>
    </Card>
  );
}
