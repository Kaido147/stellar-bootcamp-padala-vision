import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { FinancialSummaryCard } from "../components/FinancialSummaryCard";
import { LoadState } from "../components/LoadState";
import { OrderStatusHeader } from "../components/OrderStatusHeader";
import { useOrderData } from "../hooks/useOrderData";
import { api } from "../lib/api";
import { useWallet } from "../hooks/useWallet";

export function RiderJobPage() {
  const { id } = useParams();
  const wallet = useWallet();
  const { orderResponse, historyResponse, loading, error, refresh } = useOrderData(id);
  const [message, setMessage] = useState<string | null>(null);

  if (!orderResponse || !historyResponse) {
    return <LoadState error={error} loading={loading} onRetry={() => void refresh()} />;
  }

  const order = orderResponse.order;

  return (
    <div className="space-y-4">
      <OrderStatusHeader history={historyResponse.history} latestDecision={orderResponse.latest_decision} order={order} />
      <FinancialSummaryCard order={order} />
      <Card title="Rider Actions" subtitle="Workflow state changes backed by the current frozen backend APIs.">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Real Freighter-backed assign and in-transit chain submission is blocked by the current backend surface because there are no assign or in-transit transaction intents or recording endpoints yet.
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary px-4 py-2"
            disabled={!wallet.address || order.status !== "Funded"}
            onClick={() => {
              setMessage(null);
              void api.acceptJob(order.id, wallet.address ?? "")
                .then(() => {
                  setMessage("Rider assignment recorded in backend workflow state.");
                  void refresh();
                })
                .catch((nextError) => setMessage(nextError instanceof Error ? nextError.message : "Accept failed."));
            }}
            type="button"
          >
            Accept job
          </button>
          <button
            className="btn-secondary px-4 py-2"
            disabled={!wallet.address || order.status !== "RiderAssigned"}
            onClick={() => {
              setMessage(null);
              void api.markInTransit(order.id, wallet.address ?? "")
                .then(() => {
                  setMessage("In-transit status recorded in backend workflow state.");
                  void refresh();
                })
                .catch((nextError) => setMessage(nextError instanceof Error ? nextError.message : "In-transit failed."));
            }}
            type="button"
          >
            Mark in transit
          </button>
          <Link className="btn-secondary px-4 py-2" to={`/rider/jobs/${order.id}/evidence`}>
            Open evidence capture
          </Link>
        </div>
        {message ? <div className="surface-card p-4 text-sm text-ink/75">{message}</div> : null}
      </Card>
    </div>
  );
}
