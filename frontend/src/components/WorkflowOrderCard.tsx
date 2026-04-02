import type { ReactNode } from "react";
import type { WorkspaceOrderCard } from "@padala-vision/shared";
import { Link } from "react-router-dom";
import { formatDateTime, formatRelativeCountdown } from "../lib/format";
import { describeWorkflowStatus, formatWorkflowAction, formatWorkflowEvent } from "../lib/workflow";
import { WorkflowStatusBadge } from "./WorkflowStatusBadge";

export function WorkflowOrderCard({
  order,
  href,
  counterpartLabel,
  extraAction,
}: {
  order: WorkspaceOrderCard & {
    aiSummary?: string | null;
    decisionSuggestion?: string | null;
  };
  href?: string;
  counterpartLabel: string;
  extraAction?: ReactNode;
}) {
  const body = (
    <div className="surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-display text-xl text-ink">{order.orderCode}</div>
          <div className="mt-1 text-sm text-ink/62">{counterpartLabel}</div>
        </div>
        <WorkflowStatusBadge status={order.status} />
      </div>

      <div className="mt-3 text-sm leading-6 text-ink/64">{describeWorkflowStatus(order.status)}</div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Total" value={`${order.totalAmount} PUSD`} />
        <Stat label="Latest event" value={formatWorkflowEvent(order.lastEventType)} />
        <Stat
          label="Due"
          value={order.dueAt ? `${formatDateTime(order.dueAt)} (${formatRelativeCountdown(order.dueAt)})` : "Not scheduled"}
        />
        <Stat label="Next action" value={formatWorkflowAction(order.nextAction)} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-ink/62">
        <span>Rider: {order.riderDisplayName ?? "Unassigned"}</span>
        {order.requiresManualReview ? <span className="quiet-pill">Manual review</span> : null}
        {order.hasActiveDispute ? <span className="quiet-pill">Dispute open</span> : null}
      </div>

      {order.aiSummary ? (
        <div className="mt-4 rounded-2xl border border-line bg-white/[0.03] px-4 py-3 text-sm leading-6 text-ink/68">
          {order.aiSummary}
        </div>
      ) : null}

      {order.decisionSuggestion ? (
        <div className="mt-3 text-sm font-semibold text-coral/80">Suggested next move: {order.decisionSuggestion}</div>
      ) : null}

      {href || extraAction ? (
        <div className="mt-4 flex flex-wrap gap-3">
          {href ? (
            <Link className="btn-secondary px-4 py-2" to={href}>
              Open details
            </Link>
          ) : null}
          {extraAction}
        </div>
      ) : null}
    </div>
  );

  return body;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-night/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{label}</div>
      <div className="mt-2 text-sm text-ink/78">{value}</div>
    </div>
  );
}
