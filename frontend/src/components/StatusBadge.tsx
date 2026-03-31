import type { OrderStatus } from "@padala-vision/shared";

const colorMap: Record<OrderStatus, string> = {
  Draft: "bg-white/[0.08] text-ink border border-line",
  Funded: "bg-gold text-night",
  RiderAssigned: "bg-coral text-night",
  InTransit: "bg-moss text-night",
  EvidenceSubmitted: "bg-white/[0.08] text-ink border border-line",
  Approved: "bg-moss text-night",
  Released: "bg-coral text-night",
  Rejected: "bg-red-600 text-white",
  Disputed: "bg-amber-600 text-white",
  Refunded: "bg-slate-700 text-white",
  Expired: "bg-slate-500 text-white",
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${colorMap[status]}`} data-testid="status-badge">
      {status}
    </span>
  );
}
