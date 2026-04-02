import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { parseTokenAmountToBaseUnits } from "@padala-vision/shared";
import { Card } from "../components/Card";
import { workflowApi } from "../lib/api";
import { useWallet } from "../hooks/useWallet";
import {
  prepareContractInvocation,
  readTokenDecimals,
  submitPreparedTransaction,
  toAddressScVal,
  toI128ScVal,
  toU64ScVal,
  waitForTransactionFinality,
} from "../lib/soroban";

export function SellerNewOrderPage() {
  const wallet = useWallet();
  const [buyerDisplayName, setBuyerDisplayName] = useState("");
  const [buyerContactLabel, setBuyerContactLabel] = useState("");
  const [buyerWallet, setBuyerWallet] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [pickupLabel, setPickupLabel] = useState("");
  const [dropoffLabel, setDropoffLabel] = useState("");
  const [itemAmount, setItemAmount] = useState("100.00");
  const [deliveryFee, setDeliveryFee] = useState("25.00");
  const [fundingDeadlineAt, setFundingDeadlineAt] = useState(
    new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Awaited<ReturnType<typeof workflowApi.createSellerWorkflowOrder>> | null>(null);

  const totalAmount = useMemo(() => {
    const total = Number(itemAmount || 0) + Number(deliveryFee || 0);
    return total.toFixed(2);
  }, [deliveryFee, itemAmount]);
  const sellerWallet = wallet.address?.trim() ?? "";
  const canSubmit =
    !busy &&
    !wallet.loading &&
    !wallet.connecting &&
    !wallet.networkMismatch &&
    Boolean(sellerWallet) &&
    Boolean(buyerDisplayName.trim()) &&
    Boolean(buyerWallet.trim()) &&
    Boolean(itemDescription.trim()) &&
    Boolean(pickupLabel.trim()) &&
    Boolean(dropoffLabel.trim());

  const inviteLink = created ? `${window.location.origin}/buyer/claim/${created.buyerInvite.token}` : "";

  async function handleConnectWallet() {
    setError(null);

    try {
      await wallet.connectWallet();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not connect seller wallet.");
    }
  }

  return (
    <div className="space-y-4">
      <Card subtitle="Create a buyer-owned workflow order, then share the claim link directly from this screen." title="Create Seller Order">
        <form
          className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]"
          onSubmit={(event) => {
            event.preventDefault();
            if (!sellerWallet) {
              setError("Connect seller wallet before creating an order.");
              return;
            }

            if (wallet.networkMismatch) {
              setError("Switch Freighter to Stellar testnet before creating an order.");
              return;
            }

            setBusy(true);
            setError(null);
            void (async () => {
              const fundingDeadlineIso = new Date(fundingDeadlineAt).toISOString();
              const intent = await workflowApi.createSellerWorkflowOrderIntent({
                sellerWallet,
                buyerWallet,
                itemDescription,
                pickupLabel,
                dropoffLabel,
                itemAmount,
                deliveryFee,
                totalAmount,
                fundingDeadlineAt: fundingDeadlineIso,
              });
              const tokenDecimals = await readTokenDecimals({
                rpcUrl: intent.rpcUrl,
                networkPassphrase: intent.networkPassphrase,
                sourceAddress: sellerWallet,
                tokenContractId: intent.tokenContractId,
              });
              const prepared = await prepareContractInvocation({
                rpcUrl: intent.rpcUrl,
                networkPassphrase: intent.networkPassphrase,
                sourceAddress: sellerWallet,
                contractId: intent.contractId,
                functionName: intent.method,
                args: [
                  toAddressScVal(sellerWallet),
                  toAddressScVal(buyerWallet),
                  toI128ScVal(parseTokenAmountToBaseUnits(itemAmount, tokenDecimals)),
                  toI128ScVal(parseTokenAmountToBaseUnits(deliveryFee, tokenDecimals)),
                  toU64ScVal(BigInt(Math.floor(new Date(fundingDeadlineIso).getTime() / 1000))),
                ],
              });
              const signedTxXdr = await wallet.signTransaction(prepared.toXDR());
              const submitted = await submitPreparedTransaction({
                rpcUrl: intent.rpcUrl,
                networkPassphrase: intent.networkPassphrase,
                signedTxXdr,
              });
              await waitForTransactionFinality({
                server: submitted.server,
                txHash: submitted.txHash,
              });

              const response = await workflowApi.createSellerWorkflowOrder({
                buyerDisplayName,
                buyerContactLabel: buyerContactLabel.trim() || null,
                sellerWallet,
                buyerWallet,
                itemDescription,
                pickupLabel,
                dropoffLabel,
                itemAmount,
                deliveryFee,
                totalAmount,
                fundingDeadlineAt: fundingDeadlineIso,
                txHash: submitted.txHash,
                submittedWallet: sellerWallet,
              });
              setCreated(response);
            })()
              .catch((nextError) => {
                setError(nextError instanceof Error ? nextError.message : "Could not create seller order.");
              })
              .finally(() => setBusy(false));
          }}
        >
          <div className="space-y-4">
            <label className="block text-sm font-semibold text-ink">
              Seller wallet
              <input
                className="field-input font-mono text-xs"
                placeholder="Connect Freighter to load the seller wallet"
                readOnly
                value={sellerWallet}
              />
            </label>
            {!sellerWallet ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                Connect seller wallet before creating an order.
              </div>
            ) : null}
            <label className="block text-sm font-semibold text-ink">
              Buyer display name
              <input className="field-input" onChange={(event) => setBuyerDisplayName(event.target.value)} value={buyerDisplayName} />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Buyer contact label
              <input className="field-input" onChange={(event) => setBuyerContactLabel(event.target.value)} value={buyerContactLabel} />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Buyer wallet
              <input className="field-input font-mono text-xs" onChange={(event) => setBuyerWallet(event.target.value)} value={buyerWallet} />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Item description
              <input className="field-input" onChange={(event) => setItemDescription(event.target.value)} value={itemDescription} />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">
                Pickup label
                <input className="field-input" onChange={(event) => setPickupLabel(event.target.value)} value={pickupLabel} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Dropoff label
                <input className="field-input" onChange={(event) => setDropoffLabel(event.target.value)} value={dropoffLabel} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block text-sm font-semibold text-ink">
                Item amount
                <input className="field-input" onChange={(event) => setItemAmount(event.target.value)} value={itemAmount} />
              </label>
              <label className="block text-sm font-semibold text-ink">
                Delivery fee
                <input className="field-input" onChange={(event) => setDeliveryFee(event.target.value)} value={deliveryFee} />
              </label>
            </div>
            <label className="block text-sm font-semibold text-ink">
              Funding deadline
              <input
                className="field-input"
                onChange={(event) => setFundingDeadlineAt(event.target.value)}
                type="datetime-local"
                value={fundingDeadlineAt}
              />
            </label>
            {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
            <div className="flex flex-wrap gap-3">
              <button
                className="btn-secondary"
                disabled={busy || wallet.connecting}
                onClick={() => void handleConnectWallet()}
                type="button"
              >
                {wallet.connecting ? "Connecting..." : sellerWallet ? "Refresh seller wallet" : "Connect seller wallet"}
              </button>
              <button
                className="btn-primary"
                disabled={!canSubmit}
                type="submit"
              >
                {busy ? "Creating on chain..." : "Create order"}
              </button>
              <Link className="btn-secondary px-4 py-2" to="/seller">
                Back to workspace
              </Link>
            </div>
          </div>

          <div className="space-y-4">
            <div className="surface-card p-5">
              <div className="section-kicker">Escrow preview</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
                <PreviewChip label="Item amount" value={`${itemAmount || "0.00"} PUSD`} />
                <PreviewChip label="Delivery fee" value={`${deliveryFee || "0.00"} PUSD`} />
                <PreviewChip label="Escrow total" value={`${totalAmount} PUSD`} />
              </div>
            </div>

            {created ? (
              <div className="surface-card p-5">
                <div className="section-kicker">Buyer invite ready</div>
                <div className="mt-3 text-sm text-ink/68">
                  Share this claim link so the buyer can activate workspace access and fund the order.
                </div>
                <input className="field-input mt-4 font-mono text-xs" readOnly value={inviteLink} />
                <div className="mt-4 flex flex-wrap gap-3">
                  <Link className="btn-primary px-4 py-2" to={`/seller/orders/${created.order.orderId}`}>
                    Open seller detail
                  </Link>
                  <a className="btn-secondary px-4 py-2" href={inviteLink}>
                    Open claim link
                  </a>
                </div>
              </div>
            ) : (
              <div className="surface-card p-5 text-sm leading-6 text-ink/66">
                After creation, this page will return the one-time buyer claim token and direct you into the new seller detail view.
              </div>
            )}
          </div>
        </form>
      </Card>
    </div>
  );
}

function PreviewChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-night/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{label}</div>
      <div className="mt-2 text-sm text-ink/78">{value}</div>
    </div>
  );
}
