import type { OrderStatus } from "@padala-vision/shared";

export function DisputeBadge({ status }: { status: OrderStatus }) {
  const active = status === "Disputed";

  return (
    <span className={`inline-flex rounded-full px-3 py-2 text-xs font-semibold ${active ? "bg-amber-200 text-amber-900" : "bg-sand text-ink/70"}`}>
      {active ? "Dispute Open" : "No Active Dispute"}
    </span>
  );
}
