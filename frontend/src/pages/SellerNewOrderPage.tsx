import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { api } from "../lib/api";
import { useAppState } from "../providers/AppStateProvider";

export function SellerNewOrderPage() {
  const { walletBinding } = useAppState();
  const navigate = useNavigate();
  const [buyerWallet, setBuyerWallet] = useState("");
  const [itemAmount, setItemAmount] = useState("15.00");
  const [deliveryFee, setDeliveryFee] = useState("3.00");
  const [expiresAt, setExpiresAt] = useState(
    new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Create Seller Order" subtitle="Creates the workflow record against the frozen backend.">
      {!walletBinding ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bind the seller wallet first. The backend still expects `seller_wallet` to match the wallet you verify here before order creation.
        </div>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!walletBinding) {
            setError("Wallet binding is required before creating an order.");
            return;
          }
          setBusy(true);
          setError(null);
          void api
            .createOrder({
              seller_wallet: walletBinding.wallet_address,
              buyer_wallet: buyerWallet,
              item_amount: itemAmount,
              delivery_fee: deliveryFee,
              expires_at: new Date(expiresAt).toISOString(),
            })
            .then((response) => {
              navigate(`/seller/orders/${response.order.id}`);
            })
            .catch((nextError) => {
              setError(nextError instanceof Error ? nextError.message : "Unable to create order.");
            })
            .finally(() => setBusy(false));
        }}
      >
        <label className="block text-sm font-semibold text-ink">
          Buyer wallet
          <input
            className="field-input"
            onChange={(event) => setBuyerWallet(event.target.value)}
            value={buyerWallet}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-semibold text-ink">
            Item amount
            <input
              className="field-input"
              onChange={(event) => setItemAmount(event.target.value)}
              value={itemAmount}
            />
          </label>
          <label className="block text-sm font-semibold text-ink">
            Delivery fee
            <input
              className="field-input"
              onChange={(event) => setDeliveryFee(event.target.value)}
              value={deliveryFee}
            />
          </label>
        </div>
        <label className="block text-sm font-semibold text-ink">
          Expires at
          <input
            className="field-input"
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            value={expiresAt}
          />
        </label>
        {error ? <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        <button
          className="btn-primary"
          disabled={busy || !walletBinding}
          type="submit"
        >
          {busy ? "Creating..." : "Create order"}
        </button>
      </form>
    </Card>
  );
}
