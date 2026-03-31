import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { OperatorDisputeDetailResponse, OperatorListDisputesResponse } from "@padala-vision/shared";
import { AiAdvisoryCard } from "../components/AiAdvisoryCard";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { WorkflowOrderDetailContent } from "../components/WorkflowOrderDetailContent";
import { WorkflowStatusBadge } from "../components/WorkflowStatusBadge";
import { workflowApi } from "../lib/api";
import { formatDateTime } from "../lib/format";

export function OperatorDisputesPage() {
  const [data, setData] = useState<OperatorListDisputesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await workflowApi.listOperatorDisputes();
        if (!cancelled) {
          setData(response);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load disputes.");
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
      <Card subtitle="Disputes now arrive from the workflow dispute queue instead of generic placeholder detail pages." title="Operator Disputes">
        {data.disputes.length === 0 ? (
          <div className="rounded-2xl border border-line bg-night/80 p-4 text-sm text-ink/64">No disputes are currently open.</div>
        ) : (
          <div className="space-y-3">
            {data.disputes.map((dispute) => (
              <Link className="surface-card block p-4 transition hover:border-coral/25" to={`/operator/disputes/${dispute.disputeId}`} key={dispute.disputeId}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="font-display text-xl text-ink">{dispute.orderCode}</div>
                    <div className="mt-1 text-sm text-ink/62">
                      Buyer: {dispute.buyerDisplayName} • Seller: {dispute.sellerDisplayName}
                    </div>
                  </div>
                  <WorkflowStatusBadge status={dispute.orderStatus} />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <SummaryChip label="Opened" value={formatDateTime(dispute.openedAt)} />
                  <SummaryChip label="Rider" value={dispute.riderDisplayName ?? "Not assigned"} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function OperatorDisputeDetailPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<OperatorDisputeDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolution, setResolution] = useState<"release" | "refund" | "reject_dispute">("reject_dispute");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Dispute id is missing.");
      return;
    }

    const disputeId = id;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await workflowApi.getOperatorDispute(disputeId);
        if (!cancelled) {
          setDetail(response);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load dispute detail.");
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
  }, [id]);

  if (!detail) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Operator disputes", to: "/operator/disputes" }, { label: detail.order.orderCode }]} />

      <WorkflowOrderDetailContent
        detail={detail}
        detailSubtitle={`Dispute opened ${formatDateTime(detail.disputeOpenedAt)}.`}
        detailTitle={`Dispute ${detail.disputeId}`}
        proofSummary={detail.proofSummary}
      />

      <AiAdvisoryCard
        decisionSuggestion={detail.decisionSuggestion}
        riskFlags={detail.aiRiskFlags}
        subtitle="Gemini summarizes the current dispute context, but operators still choose the actual resolution."
        summary={detail.aiSummary}
        title="Gemini Dispute Summary"
      />
      <Card title="Resolve Dispute" subtitle="Operator resolution moves the workflow toward release, refund, or a restored buyer-confirmation step.">
        <label className="block text-sm font-semibold text-ink">
          Resolution
          <select className="field-input" onChange={(event) => setResolution(event.target.value as typeof resolution)} value={resolution}>
            <option value="reject_dispute">Reject dispute</option>
            <option value="release">Release</option>
            <option value="refund">Refund</option>
          </select>
        </label>
        <label className="block text-sm font-semibold text-ink">
          Note
          <textarea className="field-input min-h-28" onChange={(event) => setNote(event.target.value)} value={note} />
        </label>
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            disabled={!note.trim()}
            onClick={() => {
              if (!id) {
                return;
              }

              setMessage(null);
              void workflowApi
                .resolveOperatorDispute(id, {
                  resolution,
                  note,
                })
                .then((response) => {
                  setMessage(`Dispute resolved. Order moved to ${response.status}.`);
                })
                .catch((nextError) => {
                  setMessage(nextError instanceof Error ? nextError.message : "Could not resolve dispute.");
                });
            }}
            type="button"
          >
            Submit resolution
          </button>
        </div>
        {message ? <div className="surface-card p-4 text-sm text-ink/75">{message}</div> : null}
      </Card>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{label}</div>
      <div className="mt-2 text-sm text-ink/78">{value}</div>
    </div>
  );
}
