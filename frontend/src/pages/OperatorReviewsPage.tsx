import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { OperatorListReviewsResponse, OperatorReviewDetailResponse } from "@padala-vision/shared";
import { AiAdvisoryCard } from "../components/AiAdvisoryCard";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { WorkflowOrderCard } from "../components/WorkflowOrderCard";
import { WorkflowOrderDetailContent } from "../components/WorkflowOrderDetailContent";
import { WorkflowWorkspaceSection } from "../components/WorkflowWorkspaceSection";
import { workflowApi } from "../lib/api";

export function OperatorReviewsPage() {
  const [data, setData] = useState<OperatorListReviewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await workflowApi.listOperatorReviews();
        if (!cancelled) {
          setData(response);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load operator reviews.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!data) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Card subtitle="Review queues are now driven by the new workflow API instead of placeholder copy." title="Operator Review Queue">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Manual review" value={String(data.manualReviewQueue.length)} />
          <SummaryChip label="Overdue confirmation" value={String(data.overdueBuyerConfirmations.length)} />
          <SummaryChip label="Settlement exceptions" value={String(data.settlementExceptions.length)} />
        </div>
      </Card>

      <WorkflowWorkspaceSection empty="No workflow orders are in manual review." subtitle="Suspicious proof and repeated confirmation issues route here first." title="Manual Review Queue">
        {data.manualReviewQueue.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/operator/reviews/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No buyer confirmations are overdue." subtitle="Orders move here after the buyer confirmation window lapses." title="Overdue Buyer Confirmations">
        {data.overdueBuyerConfirmations.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/operator/reviews/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No settlement exceptions are active." subtitle="Release and refund pending states stay discoverable here." title="Settlement Exceptions">
        {data.settlementExceptions.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/operator/reviews/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>
    </div>
  );
}

export function OperatorReviewDetailPage() {
  const { orderId } = useParams();
  const [detail, setDetail] = useState<OperatorReviewDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setError("Order id is missing.");
      return;
    }

    const reviewOrderId = orderId;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await workflowApi.getOperatorReview(reviewOrderId);
        if (!cancelled) {
          setDetail(response);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load review detail.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  if (!detail) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Operator reviews", to: "/operator/reviews" }, { label: detail.order.orderCode }]} />

      <WorkflowOrderDetailContent
        actions={
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className="btn-secondary px-4 py-2"
              onClick={() => {
                void workflowApi
                  .operatorReissueConfirmation(detail.order.orderId)
                  .then((response) => {
                    setMessage(`Confirmation reissued. Token expires at ${response.deliveryConfirmation.expiresAt}.`);
                  })
                  .catch((nextError) => {
                    setMessage(nextError instanceof Error ? nextError.message : "Could not reissue confirmation.");
                  });
              }}
              type="button"
            >
              Reissue confirmation
            </button>
            <Link className="btn-secondary px-4 py-2" to="/operator/disputes">
              Open dispute queue
            </Link>
          </div>
        }
        detail={detail}
        detailSubtitle="Operator review detail with proof inspection, queue-backed history, and Gemini advisory context."
        detailTitle={`Review ${detail.order.orderCode}`}
        proofSummary={detail.proofSummary}
      />

      <AiAdvisoryCard
        decisionSuggestion={detail.decisionSuggestion}
        riskFlags={detail.aiRiskFlags}
        subtitle="Gemini remains advisory only. Operators still make the actual review decision."
        summary={detail.aiSummary}
        title="Gemini Review Context"
      />
      {message ? <div className="surface-card p-4 text-sm text-ink/75">{message}</div> : null}
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{label}</div>
      <div className="mt-2 font-display text-2xl text-ink">{value}</div>
    </div>
  );
}
