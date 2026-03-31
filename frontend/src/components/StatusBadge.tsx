import type { OrderStatus } from "@padala-vision/shared";

const colorMap: Record<OrderStatus, string> = {
  Draft: "bg-ink text-white",
  Funded: "bg-gold text-ink",
  RiderAssigned: "bg-coral text-white",
  InTransit: "bg-moss text-white",
  EvidenceSubmitted: "bg-ink text-white",
  Approved: "bg-moss text-white",
  Released: "bg-coral text-white",
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
