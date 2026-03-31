import type { OrderHistoryResponse } from "@padala-vision/shared";
import { formatDateTime } from "../lib/format";
import { Card } from "./Card";

export function EventTimeline({
  history,
  transactions,
}: {
  history: OrderHistoryResponse["history"];
  transactions: OrderHistoryResponse["transactions"];
}) {
  return (
    <Card title="Timeline" subtitle="Backend workflow changes and confirmed transaction records.">
      <ol className="space-y-3">
        {history.map((entry) => (
          <li key={entry.id} className="surface-card p-4">
            <div className="text-sm font-semibold text-ink">{entry.newStatus}</div>
            <div className="mt-1 text-xs text-ink/55">{formatDateTime(entry.changedAt)}</div>
            {entry.note ? <div className="mt-2 text-sm text-ink/75">{entry.note}</div> : null}
          </li>
        ))}
        {transactions.map((tx) => (
          <li key={tx.id} className="surface-card p-4">
            <div className="text-sm font-semibold text-ink">
              {tx.txType} transaction {tx.txStatus}
            </div>
            <div className="mt-1 break-all font-mono text-xs text-ink/55">{tx.txHash}</div>
            <div className="mt-1 text-xs text-ink/55">{formatDateTime(tx.createdAt)}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
