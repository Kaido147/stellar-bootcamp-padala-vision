import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/Card";

const buyerSignals = [
  "Escrow funded once, then visible end to end",
  "Proof upload and review state remain easy to audit",
  "Dispute, refund, and release decisions stay attached to the order timeline",
];

export function BuyerHomePage() {
  const navigate = useNavigate();
  const [orderId, setOrderId] = useState("");

  return (
    <div className="space-y-4">
      <Card title="Buyer Workspace" subtitle="Enter an order to continue into the escrow and delivery timeline.">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
          <form
            className="surface-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              if (!orderId.trim()) {
                return;
              }

              navigate(`/buyer/orders/${orderId.trim()}`);
            }}
          >
            <div className="section-kicker">Open Order</div>
            <h3 className="mt-3 font-display text-2xl text-ink">Continue from a shared order link or known order ID.</h3>
            <p className="mt-2 text-sm leading-6 text-ink/68">
              Buyers enter once the seller has created the order. From there you can inspect totals, view proof state, and move into funding when the order is ready.
            </p>
            <label className="mt-5 block text-sm font-semibold text-ink">
              Order ID
              <input
                className="field-input"
                onChange={(event) => setOrderId(event.target.value)}
                placeholder="Paste the order id"
                value={orderId}
              />
            </label>
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn-primary" disabled={!orderId.trim()} type="submit">
                Open buyer order
              </button>
              <button
                className="btn-secondary"
                onClick={() => navigate("/settings/network")}
                type="button"
              >
                Review network setup
              </button>
            </div>
          </form>

          <div className="surface-card p-5">
            <div className="section-kicker">Buyer Visibility</div>
            <div className="mt-3 space-y-3">
              {buyerSignals.map((signal) => (
                <div key={signal} className="rounded-2xl border border-line bg-night/80 px-4 py-4 text-sm text-ink/80">
                  {signal}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
