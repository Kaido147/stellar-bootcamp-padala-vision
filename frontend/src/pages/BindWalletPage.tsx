import { useState } from "react";
import { Card } from "../components/Card";
import { KeyValueList } from "../components/KeyValueList";
import { useWallet } from "../hooks/useWallet";
import { legacyApi } from "../lib/api";
import { shortenAddress } from "../lib/format";
import { useAppState } from "../providers/AppStateProvider";

export function BindWalletPage() {
  const wallet = useWallet();
  const { walletBinding, rememberWalletBinding } = useAppState();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleVerify() {
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const address = wallet.address ?? (await wallet.connectWallet());
      if (wallet.networkMismatch) {
        throw new Error("Switch Freighter to the configured network before binding your wallet.");
      }

      const challenge = await legacyApi.createWalletChallenge(address);
      const signature = await wallet.signMessage(challenge.message);
      const verified = await legacyApi.verifyWalletChallenge({
        challenge_id: challenge.challenge_id,
        wallet_address: address,
        signature,
        signed_message: challenge.message,
      });
      rememberWalletBinding(verified.wallet_binding);
      setSuccess(`Wallet ${shortenAddress(verified.wallet_binding.wallet_address)} is now bound to this device profile.`);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Wallet binding failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Bind Wallet" subtitle="Freighter connection and backend challenge verification.">
      <KeyValueList
        items={[
          { label: "Freighter", value: wallet.installed ? "Detected" : "Not installed" },
          { label: "Connected address", value: wallet.address ?? "Not connected" },
          { label: "Expected network", value: wallet.expectedNetworkPassphrase },
          { label: "Wallet binding", value: walletBinding?.wallet_address ?? "Not verified yet" },
        ]}
      />
      {wallet.address && walletBinding?.wallet_address && wallet.address !== walletBinding.wallet_address ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Wallet mismatch: the connected wallet does not match the last locally verified wallet binding on this device.
        </div>
      ) : null}
      {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
      {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}
      <div className="flex flex-wrap gap-3">
        <button
          className="btn-secondary"
          onClick={() => void wallet.connectWallet().catch((nextError) => setError(nextError.message))}
          type="button"
        >
          {wallet.connecting ? "Connecting..." : "Connect Freighter"}
        </button>
        <button
          className="btn-primary"
          disabled={busy || !wallet.address || wallet.networkMismatch}
          onClick={() => void handleVerify()}
          type="button"
        >
          {busy ? "Verifying..." : "Verify and bind wallet"}
        </button>
      </div>
    </Card>
  );
}
