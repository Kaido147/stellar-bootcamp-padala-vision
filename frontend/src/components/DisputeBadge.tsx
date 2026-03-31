import type { OrderStatus } from "@padala-vision/shared";

export function DisputeBadge({ status }: { status: OrderStatus }) {
  const active = status === "Disputed";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold ${
        active ? "bg-amber-500 text-amber-950" : "border border-line bg-night/80 text-ink/72"
      }`}
    >
      {active ? "Dispute Open" : "No Active Dispute"}
    </span>
  );
}
