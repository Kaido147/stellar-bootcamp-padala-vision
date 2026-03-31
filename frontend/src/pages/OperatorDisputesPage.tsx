import { useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { OperatorDecisionForm } from "../components/OperatorDecisionForm";
import { OrderStatusHeader } from "../components/OrderStatusHeader";
import { useOrderData } from "../hooks/useOrderData";
import { api } from "../lib/api";

export function OperatorDisputesPage() {
  return (
    <Card title="Operator Dispute Queue" subtitle="Role-restricted route, pending backend queue reads.">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        The frozen backend provides dispute creation and resolution actions, but no queue or detail read endpoint for disputes. A true operator queue cannot be fetched from the current API surface.
      </div>
    </Card>
  );
}

export function OperatorDisputeDetailPage({ participantView = false }: { participantView?: boolean }) {
  const { id } = useParams();
  const { orderResponse, historyResponse, loading, error, refresh } = useOrderData(id);
  const [message, setMessage] = useState<string | null>(null);

  if (!orderResponse || !historyResponse) {
    return <LoadState error={error} loading={loading} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-4">
      <OrderStatusHeader history={historyResponse.history} latestDecision={orderResponse.latest_decision} order={orderResponse.order} />
      <Card title={participantView ? "Dispute Detail" : "Operator Dispute Detail"} subtitle="Order-linked dispute context from the existing API surface.">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Dedicated dispute detail, reason history, and dispute event reads are not exposed by the frozen backend yet, so this page can only use the order status and direct resolution action.
        </div>
        {participantView ? null : (
          <OperatorDecisionForm
            onSubmit={async (payload) => {
              const result = await api.resolveDispute(orderResponse.order.id, payload);
              setMessage(`Resolution ${result.resolution} is ${result.resolution_status}.`);
              await refresh();
            }}
          />
        )}
        {message ? <div className="surface-card p-4 text-sm text-ink/75">{message}</div> : null}
      </Card>
    </div>
  );
}
