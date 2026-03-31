import type { GetOrderResponse, OrderHistoryResponse } from "@padala-vision/shared";
import { formatDateTime, formatRelativeCountdown } from "../lib/format";
import { StatusBadge } from "./StatusBadge";
import { Card } from "./Card";
import { DisputeBadge } from "./DisputeBadge";

export function OrderStatusHeader({
  order,
  latestDecision,
  history,
}: {
  order: GetOrderResponse["order"];
  latestDecision: GetOrderResponse["latest_decision"];
  history?: OrderHistoryResponse["history"];
}) {
  const lastHistory = history?.at(-1);

  return (
    <Card
      title={`Order #${order.id}`}
      subtitle={`Expires ${formatDateTime(order.expiresAt)} (${formatRelativeCountdown(order.expiresAt)})`}
      action={<StatusBadge status={order.status} />}
    >
      <div className="flex flex-wrap items-center gap-3">
        <DisputeBadge status={order.status} />
        <div className="rounded-full bg-sand px-3 py-2 text-xs font-semibold text-ink/70">
          Review: {latestDecision?.decision ?? "Awaiting evidence"}
        </div>
        <div className="rounded-full bg-sand px-3 py-2 text-xs font-semibold text-ink/70">
          Financial: {order.releasedAt ? "Finalized" : order.status}
        </div>
      </div>
      {lastHistory?.note ? (
        <div className="rounded-3xl bg-sand/70 p-4 text-sm text-ink/80">
          Latest workflow note: {lastHistory.note}
        </div>
      ) : null}
    </Card>
  );
}
