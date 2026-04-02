import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  ApproveDeliveryConfirmationResponse,
  DeliveryConfirmationViewResponse,
  RejectDeliveryConfirmationResponse,
} from "@padala-vision/shared";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { ProofEvidenceCard } from "../components/ProofEvidenceCard";
import { WorkflowStatusBadge } from "../components/WorkflowStatusBadge";
import { formatDateTime, formatRelativeCountdown } from "../lib/format";
import { ApiError, workflowApi } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";

export function DeliveryConfirmationPage() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { actor } = useAuth();
  const [view, setView] = useState<DeliveryConfirmationViewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [reasonCode, setReasonCode] = useState("delivery_issue");
  const [note, setNote] = useState("");
  const [busyAction, setBusyAction] = useState<"approve" | "reject" | null>(null);
  const [result, setResult] = useState<ApproveDeliveryConfirmationResponse | RejectDeliveryConfirmationResponse | null>(null);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      setError("Confirmation token is missing.");
      return;
    }

    const confirmationToken = token;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await workflowApi.viewDeliveryConfirmation(confirmationToken);
        if (!cancelled) {
          setView(response);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(
            nextError instanceof ApiError && nextError.code === "confirmation_token_invalid"
              ? "This confirmation link is invalid or expired. Reissue it from the buyer workspace or operator review queue."
              : nextError instanceof Error
                ? nextError.message
                : "Could not load confirmation view.",
          );
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
  }, [token]);

  if (!view) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card
        action={<WorkflowStatusBadge status={view.status} />}
        subtitle={`Expires ${formatDateTime(view.confirmationExpiresAt)} (${formatRelativeCountdown(view.confirmationExpiresAt)})`}
        title={`Confirm delivery for ${view.orderCode}`}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Seller" value={view.sellerDisplayName} />
          <SummaryChip label="Buyer" value={view.buyerDisplayName} />
          <SummaryChip label="Rider" value={view.riderDisplayName ?? "Assigned rider"} />
        </div>
      </Card>

      <Card title="Order Summary" subtitle="Review the delivery and make an explicit buyer decision.">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Item amount" value={`${view.itemAmount} PUSD`} />
          <SummaryChip label="Delivery fee" value={`${view.deliveryFee} PUSD`} />
          <SummaryChip label="Escrow total" value={`${view.totalAmount} PUSD`} />
        </div>
      </Card>

      <ProofEvidenceCard proof={view.latestProof ?? null} summary={view.proofSummary} />

      {view.aiRiskFlags && view.aiRiskFlags.length > 0 ? (
        <Card title="Proof Notes" subtitle="These flags are advisory only and do not replace your own buyer decision.">
          <div className="flex flex-wrap gap-2">
            {view.aiRiskFlags.map((flag) => (
              <div key={flag} className="quiet-pill">
                {flag.replace(/_/g, " ")}
              </div>
            ))}
          </div>
          {view.decisionSuggestion ? <div className="mt-4 text-sm leading-6 text-ink/66">{view.decisionSuggestion}</div> : null}
        </Card>
      ) : null}

      <Card title="Buyer Decision" subtitle="Enter your confirmation PIN to approve or reject delivery.">
        <label className="block text-sm font-semibold text-ink">
          Confirmation PIN
          <input
            className="field-input"
            inputMode="numeric"
            onChange={(event) => setPin(event.target.value)}
            placeholder="Enter your 6-digit PIN"
            type="password"
            value={pin}
          />
        </label>

        <label className="block text-sm font-semibold text-ink">
          Rejection reason
          <select className="field-input" onChange={(event) => setReasonCode(event.target.value)} value={reasonCode}>
            <option value="delivery_issue">Delivery issue</option>
            <option value="proof_mismatch">Proof mismatch</option>
            <option value="wrong_recipient">Wrong recipient</option>
            <option value="damaged_item">Damaged item</option>
          </select>
        </label>

        <label className="block text-sm font-semibold text-ink">
          Note
          <textarea
            className="field-input min-h-28"
            onChange={(event) => setNote(event.target.value)}
            placeholder="Optional context if you reject delivery"
            value={note}
          />
        </label>

        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        {result ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {"disputeId" in result
              ? `Delivery rejected. Dispute ${result.disputeId} is now open.`
              : actor?.role === "buyer"
                ? "Delivery approved. The order has moved to release pending and your buyer workspace has been updated."
                : "Delivery approved. The order has moved to release pending."}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            disabled={busyAction !== null || pin.trim().length < 6}
            onClick={() => {
              if (!token) {
                return;
              }

              setBusyAction("approve");
              setError(null);
              void workflowApi
                .approveDeliveryConfirmation(token, { pin })
                .then((response) => {
                  setResult(response);
                  if (actor?.role === "buyer") {
                    navigate(`/buyer/orders/${response.orderId}`);
                  }
                })
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : "Could not approve delivery.");
                })
                .finally(() => setBusyAction(null));
            }}
            type="button"
          >
            {busyAction === "approve" ? "Approving..." : "Approve delivery"}
          </button>
          <button
            className="btn-secondary"
            disabled={busyAction !== null || pin.trim().length < 6}
            onClick={() => {
              if (!token) {
                return;
              }

              setBusyAction("reject");
              setError(null);
              void workflowApi
                .rejectDeliveryConfirmation(token, {
                  pin,
                  reasonCode,
                  note: note.trim() || null,
                })
                .then((response) => {
                  setResult(response);
                })
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : "Could not reject delivery.");
                })
                .finally(() => setBusyAction(null));
            }}
            type="button"
          >
            {busyAction === "reject" ? "Rejecting..." : "Reject and open dispute"}
          </button>
        </div>

        {actor?.role === "buyer" ? (
          <Link className="inline-flex text-sm font-semibold text-coral" to="/buyer">
            Return to buyer workspace
          </Link>
        ) : null}
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
