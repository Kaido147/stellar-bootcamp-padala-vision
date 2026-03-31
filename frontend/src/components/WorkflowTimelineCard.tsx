import type { OrderTimelineEntry } from "@padala-vision/shared";
import { formatDateTime, humanizeKey } from "../lib/format";
import { formatRoleLabel, formatWorkflowEvent } from "../lib/workflow";
import { Card } from "./Card";

export function WorkflowTimelineCard({
  timeline,
}: {
  timeline: OrderTimelineEntry[];
}) {
  return (
    <Card title="Timeline" subtitle="Operational events stay attached to the same order record.">
      <ol className="space-y-3">
        {timeline.map((entry) => (
          <li key={entry.id} className="surface-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="font-semibold text-ink">{formatWorkflowEvent(entry.type)}</div>
              <div className="text-xs text-ink/52">{formatDateTime(entry.occurredAt)}</div>
            </div>
            <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-coral/72">
              {formatRoleLabel(entry.actorRole)}
            </div>
            <div className="mt-2 text-sm text-ink/64">
              {entry.note ?? `${formatRoleLabel(entry.actorRole)} updated this order.`}
            </div>
            {Object.entries(entry.metadata).filter(([, value]) => value !== null && value !== undefined).length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(entry.metadata)
                  .filter(([, value]) => value !== null && value !== undefined)
                  .slice(0, 4)
                  .map(([key, value]) => (
                    <div key={key} className="quiet-pill">
                      {humanizeKey(key)}: {String(value)}
                    </div>
                  ))}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}
