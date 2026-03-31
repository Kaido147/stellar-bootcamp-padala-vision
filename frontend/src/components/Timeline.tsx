import type { OrderStatusHistoryEntry } from "@padala-vision/shared";

export function Timeline({ entries }: { entries: OrderStatusHistoryEntry[] }) {
  return (
    <ol className="space-y-3">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="rounded-2xl border border-ink/10 bg-sand/60 p-3"
        >
          <div className="text-sm font-semibold text-ink">{entry.newStatus}</div>
          <div className="text-xs text-ink/60">{new Date(entry.changedAt).toLocaleString()}</div>
          {entry.note ? <div className="mt-1 text-sm text-ink/75">{entry.note}</div> : null}
        </li>
      ))}
    </ol>
  );
}
