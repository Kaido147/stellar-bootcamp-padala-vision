import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { WorkflowOrderCard } from "../components/WorkflowOrderCard";
import { WorkflowWorkspaceSection } from "../components/WorkflowWorkspaceSection";
import { useAsyncData } from "../hooks/useAsyncData";
import { workflowApi } from "../lib/api";

export function SellerWorkspacePage() {
  const { data, loading, error } = useAsyncData(() => workflowApi.listSellerWorkflowOrders(), []);

  if (!data) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Card
        action={
          <Link className="btn-primary px-4 py-2" to="/seller/orders/new">
            Create Order
          </Link>
        }
        subtitle="Seller discovery is now database-backed, so your orders reopen from the workspace instead of browser memory."
        title="Seller Workspace"
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Needs funding" value={String(data.needsFunding.length)} />
          <SummaryChip label="Active delivery" value={String(data.activeDelivery.length)} />
          <SummaryChip label="Needs attention" value={String(data.needsAttention.length)} />
        </div>
      </Card>

      <WorkflowWorkspaceSection empty="No seller orders are waiting on funding." subtitle="Newly created orders stay here until the buyer funds escrow." title="Needs Funding">
        {data.needsFunding.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/seller/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No active deliveries are in motion." subtitle="Track funded, assigned, and in-transit orders from one list." title="Active Delivery">
        {data.activeDelivery.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/seller/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No orders are waiting for buyer delivery confirmation." subtitle="These orders have rider proof and now need the buyer's explicit confirmation." title="Awaiting Buyer Confirmation">
        {data.awaitingBuyerConfirmation.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/seller/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No seller orders need attention right now." subtitle="Reviews, disputes, and settlement exceptions appear here." title="Needs Attention">
        {data.needsAttention.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/seller/orders/${order.orderId}`}
            key={order.orderId}
            order={order}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No seller orders are closed yet." subtitle="Released, refunded, cancelled, and expired orders stay visible for rediscovery." title="Closed">
        {data.closed.map((order) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${order.buyerDisplayName}`}
            href={`/seller/orders/${order.orderId}`}
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
