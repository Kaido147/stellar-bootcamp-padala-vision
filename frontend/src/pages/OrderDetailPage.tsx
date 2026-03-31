import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { EventTimeline } from "../components/EventTimeline";
import { FinancialSummaryCard } from "../components/FinancialSummaryCard";
import { KeyValueList } from "../components/KeyValueList";
import { LoadState } from "../components/LoadState";
import { OrderStatusHeader } from "../components/OrderStatusHeader";
import { ReviewResultCard } from "../components/ReviewResultCard";
import { TxProgressCard } from "../components/TxProgressCard";
import { useOrderData } from "../hooks/useOrderData";
import { api } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { submitReleaseTransaction, type TxStage } from "../lib/stellar";
import { useWallet } from "../hooks/useWallet";

export function OrderDetailPage({
  audience,
}: {
  audience: "seller" | "buyer" | "timeline";
}) {
  const { id } = useParams();
  const wallet = useWallet();
  const { orderResponse, historyResponse, loading, error, refresh } = useOrderData(id);
  const [txStage, setTxStage] = useState<TxStage | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);
  const [refundInfo, setRefundInfo] = useState<string | null>(null);
  const [disputeMessage, setDisputeMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!orderResponse || !historyResponse) {
    return <LoadState error={error} loading={loading} onRetry={() => void refresh()} />;
  }

  const order = orderResponse.order;

  return (
    <div className="space-y-4">
      <OrderStatusHeader history={historyResponse.history} latestDecision={orderResponse.latest_decision} order={order} />
      <FinancialSummaryCard order={order} />
      <Card title="Order Summary" subtitle={`View: ${audience}`}>
        <KeyValueList
          items={[
            { label: "Seller wallet", value: order.sellerWallet },
            { label: "Buyer wallet", value: order.buyerWallet },
            { label: "Rider wallet", value: order.riderWallet ?? "Not assigned" },
            { label: "Created at", value: formatDateTime(order.createdAt) },
            { label: "Updated at", value: formatDateTime(order.updatedAt) },
            { label: "Contract id", value: order.contractId ?? "Not recorded by backend" },
          ]}
        />
        <div className="flex flex-wrap gap-3">
          <Link className="btn-secondary px-4 py-2" to={`/orders/${order.id}/timeline`}>
            Open timeline route
          </Link>
          {audience === "buyer" ? (
            <Link className="btn-secondary px-4 py-2" to={`/buyer/orders/${order.id}/fund`}>
              Open funding route
            </Link>
          ) : null}
          {order.status === "Disputed" ? (
            <Link className="btn-secondary px-4 py-2" to={`/disputes/${order.id}`}>
              Open dispute detail route
            </Link>
          ) : null}
        </div>
      </Card>
      <ReviewResultCard latestDecision={orderResponse.latest_decision} />
      <Card title="Available Actions" subtitle="Actions are limited to the existing frozen backend APIs.">
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-primary px-4 py-2"
            disabled={busy || order.status !== "Approved" || wallet.networkMismatch || !wallet.address}
            onClick={() => {
              setBusy(true);
              setTxError(null);
              setTxHash(null);
              setTxStage("Prepare");
              void api
                .createReleaseIntent({ order_id: order.id })
                .then(async (releaseIntent) => {
                  const release = await submitReleaseTransaction({
                    releaseIntent,
                    sourceAddress: wallet.address ?? undefined,
                    onStageChange: (stage, hash) => {
                      setTxStage(stage);
                      if (hash) {
                        setTxHash(hash);
                      }
                    },
                  });
                  const recorded = await api.recordRelease({
                    order_id: order.id,
                    tx_hash: release.hash,
                    attestation_nonce: releaseIntent.attestation.nonce,
                    submitted_wallet: release.submittedWallet,
                  });
                  setTxStage(recorded.chain_status === "confirmed" ? "Confirmed" : "Confirming");
                  setTxHash(release.hash);
                  await refresh();
                })
                .catch((nextError) => {
                  setTxStage("Failed");
                  setTxError(nextError instanceof Error ? nextError.message : "Release failed.");
                })
                .finally(() => setBusy(false));
            }}
            type="button"
          >
            Relay release with Freighter
          </button>
          <button
            className="btn-secondary px-4 py-2"
            onClick={() => {
              setRefundInfo(null);
              void api
                .createRefundIntent(order.id)
                .then((intent) => {
                  setRefundInfo(`Refund eligible by ${intent.eligibility_basis} since ${formatDateTime(intent.eligible_at)}.`);
                })
                .catch((nextError) => {
                  setRefundInfo(nextError instanceof Error ? nextError.message : "Refund intent failed.");
                });
            }}
            type="button"
          >
            Check refund availability
          </button>
          <button
            className="btn-secondary px-4 py-2"
            onClick={() => {
              setDisputeMessage(null);
              void api
                .createDispute({
                  order_id: order.id,
                  reason_code: "frontend_request",
                  description: "Dispute opened from the new frontend detail screen.",
                })
                .then((result) => {
                  setDisputeMessage(`Dispute ${result.dispute_id} is now ${result.dispute_status}.`);
                  void refresh();
                })
                .catch((nextError) => {
                  setDisputeMessage(nextError instanceof Error ? nextError.message : "Dispute creation failed.");
                });
            }}
            type="button"
          >
            Open dispute
          </button>
        </div>
        {refundInfo ? <div className="surface-card p-4 text-sm text-ink/75">{refundInfo}</div> : null}
        {disputeMessage ? <div className="surface-card p-4 text-sm text-ink/75">{disputeMessage}</div> : null}
      </Card>
      <TxProgressCard
        error={txError}
        helperText="Release only moves to confirmed here after backend records proven on-chain confirmation."
        stage={txStage}
        txHash={txHash}
      />
      <EventTimeline history={historyResponse.history} transactions={historyResponse.transactions} />
    </div>
  );
}
