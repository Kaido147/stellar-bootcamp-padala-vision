import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { KeyValueList } from "../components/KeyValueList";
import { useWallet } from "../hooks/useWallet";
import { useAppState } from "../providers/AppStateProvider";

export function SettingsNetworkPage() {
  const wallet = useWallet();
  const { selectedRole, walletBinding } = useAppState();

  return (
    <Card title="Network Diagnostics" subtitle="Wallet, binding, and network checks before chain actions.">
      <KeyValueList
        items={[
          { label: "Selected role", value: selectedRole ?? "No role selected yet" },
          { label: "Wallet address", value: wallet.address ?? "Not connected" },
          { label: "Bound wallet", value: walletBinding?.wallet_address ?? "Not verified yet" },
          { label: "Current network", value: wallet.networkPassphrase ?? "Unknown" },
          { label: "Expected network", value: wallet.expectedNetworkPassphrase },
          { label: "Soroban RPC", value: wallet.rpcUrl ?? import.meta.env.VITE_RPC_URL ?? "Not available" },
        ]}
      />
      <div className="surface-card p-4 text-sm text-ink/75">
        Correction actions:
        <div className="mt-2">1. Connect Freighter.</div>
        <div>2. Switch it to the configured testnet passphrase.</div>
        <div>3. Verify wallet binding before funding, rider actions, or release relay.</div>
      </div>
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-secondary"
          onClick={() => void wallet.connectWallet()}
          type="button"
        >
          Refresh wallet connection
        </button>
        <Link className="btn-primary" to="/bind-wallet">
          Open bind wallet
        </Link>
      </div>
    </Card>
  );
}
