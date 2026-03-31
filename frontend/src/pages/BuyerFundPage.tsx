import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { FinancialSummaryCard } from "../components/FinancialSummaryCard";
import { LoadState } from "../components/LoadState";
import { OrderStatusHeader } from "../components/OrderStatusHeader";
import { TxProgressCard } from "../components/TxProgressCard";
import { useOrderData } from "../hooks/useOrderData";

export function BuyerFundPage() {
  const { id } = useParams();
  const { orderResponse, historyResponse, loading, error, refresh } = useOrderData(id);
  const [info, setInfo] = useState<string | null>(null);

  if (!orderResponse || !historyResponse) {
    return <LoadState error={error} loading={loading} onRetry={() => void refresh()} />;
  }

  return (
    <div className="space-y-4">
      <OrderStatusHeader
        history={historyResponse.history}
        latestDecision={orderResponse.latest_decision}
        order={orderResponse.order}
      />
      <FinancialSummaryCard order={orderResponse.order} />
      <Card title="Buyer Funding" subtitle="Funding visibility stays in the buyer flow even while the frozen backend limits direct chain execution.">
        <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Chain-backed funding with Freighter cannot be completed end to end from the frozen backend because no funding intent or transaction-recording API exists yet. This page keeps the exact amount visible and routes the buyer into the canonical order detail, but it does not fake on-chain finality.
        </div>
        {info ? <div className="surface-card p-4 text-sm text-ink/75">{info}</div> : null}
        <div className="flex flex-wrap gap-3">
          <button
            className="btn-secondary"
            onClick={() => setInfo(`Exact escrow amount: ${orderResponse.order.totalAmount} USDC`)}
            type="button"
          >
            Show exact funding amount
          </button>
          <Link className="btn-primary" to={`/buyer/orders/${orderResponse.order.id}`}>
            Open buyer order detail
          </Link>
        </div>
      </Card>
      <TxProgressCard helperText="Funding tx recovery cannot persist from backend without a funding transaction API." title="Funding Status" />
    </div>
  );
}
