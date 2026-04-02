import type { DurableOrderStatus } from "@padala-vision/shared";
import { formatWorkflowStatus } from "../lib/workflow";

const toneMap: Record<DurableOrderStatus, string> = {
  awaiting_funding: "border border-line bg-white/[0.06] text-ink",
  funding_pending: "bg-sky-600 text-white",
  funding_failed: "bg-red-600 text-white",
  funded: "bg-gold text-night",
  rider_assigned: "bg-coral text-night",
  in_transit: "bg-moss text-night",
  awaiting_buyer_confirmation: "bg-white/[0.08] text-ink border border-line",
  manual_review: "bg-amber-600 text-white",
  dispute_open: "bg-red-600 text-white",
  release_pending: "bg-coral text-night",
  released: "bg-coral text-night",
  refund_pending: "bg-slate-700 text-white",
  refunded: "bg-slate-700 text-white",
  cancelled: "bg-slate-500 text-white",
  expired: "bg-slate-500 text-white",
};

export function WorkflowStatusBadge({ status }: { status: DurableOrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${toneMap[status]}`}>
      {formatWorkflowStatus(status)}
    </span>
  );
}
