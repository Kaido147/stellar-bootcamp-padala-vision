import type { ReactNode } from "react";
import type { OrderDetailEnvelope } from "@padala-vision/shared";
import { Card } from "./Card";
import { KeyValueList } from "./KeyValueList";
import { ProofEvidenceCard } from "./ProofEvidenceCard";
import { WorkflowStatusBadge } from "./WorkflowStatusBadge";
import { WorkflowTimelineCard } from "./WorkflowTimelineCard";
import { formatDateTime, formatRelativeCountdown } from "../lib/format";
import { describeWorkflowStatus, formatWorkflowAction } from "../lib/workflow";

export function WorkflowOrderDetailContent({
  detail,
  detailTitle,
  detailSubtitle,
  actions,
  proofSummary,
}: {
  detail: OrderDetailEnvelope;
  detailTitle: string;
  detailSubtitle: string;
  actions?: ReactNode;
  proofSummary?: string | null;
}) {
  const { order } = detail;

  return (
    <div className="space-y-4">
      <Card
        action={<WorkflowStatusBadge status={order.status} />}
        subtitle={`${detailSubtitle} ${describeWorkflowStatus(order.status)} Last updated ${formatDateTime(order.lastEventAt)}.`}
        title={detailTitle}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Order" value={order.orderCode} />
          <SummaryChip label="Escrow total" value={`${order.totalAmount} PUSD`} />
          <SummaryChip
            label="Buyer deadline"
            value={order.buyerConfirmationDueAt ? formatRelativeCountdown(order.buyerConfirmationDueAt) : "Not active"}
          />
        </div>
      </Card>

      <Card title="Order Summary" subtitle="Participants, locations, and funding window at a glance.">
        <KeyValueList
          items={[
            { label: "Seller", value: order.seller.displayName },
            { label: "Buyer", value: order.buyer.displayName },
            { label: "Rider", value: order.rider?.displayName ?? "Not assigned" },
            { label: "Pickup", value: order.pickupLabel },
            { label: "Dropoff", value: order.dropoffLabel },
            { label: "Item", value: order.itemDescription },
            { label: "Funding deadline", value: formatDateTime(order.fundingDeadlineAt) },
            { label: "Buyer confirmation due", value: formatDateTime(order.buyerConfirmationDueAt) },
          ]}
        />
      </Card>

      <Card title="Financial Summary" subtitle="The escrow amounts used for this workflow order.">
        <KeyValueList
          items={[
            { label: "Item amount", value: `${order.itemAmount} PUSD` },
            { label: "Delivery fee", value: `${order.deliveryFee} PUSD` },
            { label: "Escrow total", value: `${order.totalAmount} PUSD` },
            { label: "Current relation", value: order.relation.replace(/_/g, " ") },
          ]}
        />
      </Card>

      <Card title="Available Actions" subtitle="Actions are role-aware and derived from the canonical workflow model.">
        <div className="flex flex-wrap gap-2">
          {detail.availableActions.length > 0 ? (
            detail.availableActions.map((action) => (
              <div key={action} className="quiet-pill">
                {formatWorkflowAction(action)}
              </div>
            ))
          ) : (
            <div className="text-sm text-ink/64">No direct actions are available from this state.</div>
          )}
        </div>
        {actions}
      </Card>

      <ProofEvidenceCard proof={detail.latestProof ?? null} summary={proofSummary} />

      <WorkflowTimelineCard timeline={detail.timeline} />
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
