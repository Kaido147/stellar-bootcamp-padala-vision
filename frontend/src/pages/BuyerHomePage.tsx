import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { WorkflowOrderCard } from "../components/WorkflowOrderCard";
import { WorkflowWorkspaceSection } from "../components/WorkflowWorkspaceSection";
import { useAsyncData } from "../hooks/useAsyncData";
import { workflowApi } from "../lib/api";

export function BuyerHomePage() {
  const { data, loading, error } = useAsyncData(() => workflowApi.listBuyerWorkflowOrders(), []);

  if (!data) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Card subtitle="Buyer rediscovery now comes from your workspace orders, not from manually entering an order ID." title="Buyer Workspace">
        <div className="grid gap-3 sm:grid-cols-4">
          <SummaryChip label="To fund" value={String(data.toFund.length)} />
          <SummaryChip label="In progress" value={String(data.inProgress.length)} />
          <SummaryChip label="Needs confirmation" value={String(data.needsYourConfirmation.length)} />
          <SummaryChip label="Closed" value={String(data.closed.length)} />
        </div>
      </Card>

      <WorkflowWorkspaceSection empty="No buyer orders need funding right now." subtitle="These orders are waiting for you to fund escrow." title="To Fund">
        {data.toFund.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Seller: ${order.sellerDisplayName}`}
            extraAction={
              <Link className="btn-primary px-4 py-2" to={`/buyer/orders/${order.orderId}/fund`}>
                Fund escrow
              </Link>
            }
            href={`/buyer/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No buyer orders are in progress." subtitle="Funded, assigned, in-transit, and operator-routed orders remain visible here." title="In Progress">
        {data.inProgress.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Seller: ${order.sellerDisplayName}`}
            href={`/buyer/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No orders are waiting for your delivery decision." subtitle="Open these orders to reissue a confirmation link or move into the confirmation route." title="Needs Your Confirmation">
        {data.needsYourConfirmation.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Seller: ${order.sellerDisplayName}`}
            href={`/buyer/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No buyer orders are closed yet." subtitle="Released, refunded, cancelled, and expired orders stay discoverable here." title="Closed">
        {data.closed.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Seller: ${order.sellerDisplayName}`}
            href={`/buyer/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>
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
