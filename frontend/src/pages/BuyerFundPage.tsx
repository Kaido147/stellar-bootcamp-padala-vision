import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type {
  BuyerCreateFundingIntentResponse,
  BuyerOrderDetailResponse,
} from "@padala-vision/shared";
import { Card } from "../components/Card";
import { KeyValueList } from "../components/KeyValueList";
import { LoadState } from "../components/LoadState";
import { formatDateTime } from "../lib/format";
import { workflowApi } from "../lib/api";
import { useWallet } from "../hooks/useWallet";

export function BuyerFundPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const wallet = useWallet();
  const [detail, setDetail] = useState<BuyerOrderDetailResponse | null>(null);
  const [intent, setIntent] = useState<BuyerCreateFundingIntentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Order id is missing.");
      return;
    }

    const orderId = id;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [nextDetail, nextIntent] = await Promise.all([
          workflowApi.getBuyerWorkflowOrder(orderId),
          workflowApi.createBuyerFundingIntent(orderId),
        ]);

        if (!cancelled) {
          setDetail(nextDetail);
          setIntent(nextIntent);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not prepare funding flow.");
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

  if (!detail || !intent) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Card subtitle="This page uses the new funding intent and confirm endpoints instead of a raw order-ID flow." title={`Fund ${detail.order.orderCode}`}>
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Seller" value={detail.order.seller.displayName} />
          <SummaryChip label="Escrow total" value={`${detail.order.totalAmount} USDC`} />
          <SummaryChip label="Funding deadline" value={formatDateTime(detail.order.fundingDeadlineAt)} />
        </div>
      </Card>

      <Card title="Funding Intent" subtitle="Review the contract metadata that will be used for the funding action.">
        <KeyValueList
          items={[
            { label: "Method", value: intent.method },
            { label: "Contract id", value: intent.contractId },
            { label: "RPC URL", value: intent.rpcUrl },
            { label: "Replay key", value: intent.replayKey },
          ]}
        />
        <div className="surface-card p-4 text-sm text-ink/68">
          This phase keeps funding demo-friendly. Confirming below records the funding action against the new workflow state so the rest of the operational flow can continue.
        </div>
      </Card>

      <Card title="Confirm Funding" subtitle="Record the funding confirmation and continue back into the buyer detail page.">
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary"
            disabled={busy}
            onClick={() => {
              if (!id) {
                return;
              }

              setBusy(true);
              setError(null);
              void workflowApi
                .confirmBuyerFunding(id, {
                  txHash: `demo-fund-${Date.now()}`,
                  submittedWallet: wallet.address ?? "demo-buyer-wallet",
                })
                .then(() => {
                  navigate(`/buyer/orders/${id}`);
                })
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : "Could not confirm funding.");
                })
                .finally(() => setBusy(false));
            }}
            type="button"
          >
            {busy ? "Recording..." : "Record demo funding"}
          </button>
          <Link className="btn-secondary px-4 py-2" to={`/buyer/orders/${detail.order.orderId}`}>
            Back to order
          </Link>
        </div>
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
