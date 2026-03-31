import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { OperatorDecisionForm } from "../components/OperatorDecisionForm";
import { OrderStatusHeader } from "../components/OrderStatusHeader";
import { ReviewResultCard } from "../components/ReviewResultCard";
import { useOrderData } from "../hooks/useOrderData";

export function OperatorReviewsPage() {
  return (
    <Card title="Operator Review Queue" subtitle="Protected operator route with the current backend limitation called out explicitly.">
      <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        The frozen backend currently exposes no review queue or review-detail read endpoint. This route is wired and protected, but a real queue cannot be rendered without backend-provided order ids to review.
      </div>
      <Link className="inline-flex text-sm font-semibold text-coral" to="/settings/network">
        Return to diagnostics
      </Link>
    </Card>
  );
}

export function OperatorReviewDetailPage() {
  const { orderId } = useParams();
  const { orderResponse, historyResponse, loading, error, refresh } = useOrderData(orderId);

  if (!orderResponse || !historyResponse) {
    return <LoadState error={error} loading={loading} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-4">
      <OrderStatusHeader history={historyResponse.history} latestDecision={orderResponse.latest_decision} order={orderResponse.order} />
      <ReviewResultCard latestDecision={orderResponse.latest_decision} />
      <Card title="Operator Notes" subtitle="Order-linked review context available from the current backend.">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Evidence metadata, uploaded asset reads, audit trail, and queue provenance are not exposed through a dedicated review endpoint yet. This screen shows the order-linked review result that is currently available.
        </div>
      </Card>
    </div>
  );
}
