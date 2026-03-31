import type { GetOrderResponse } from "@padala-vision/shared";
import { humanizeKey } from "../lib/format";
import { Card } from "./Card";

export function ReviewResultCard({
  latestDecision,
}: {
  latestDecision: GetOrderResponse["latest_decision"];
}) {
  if (!latestDecision) {
    return (
      <Card title="Review State" subtitle="No backend review result has been recorded yet.">
        <div className="rounded-2xl bg-sand/70 p-4 text-sm text-ink/70">Review pending or evidence not submitted.</div>
      </Card>
    );
  }

  const stateLabel =
    latestDecision.decision === "MANUAL_REVIEW"
      ? "Manual review required"
      : latestDecision.decision === "REJECT"
        ? "Rejected"
        : "Approved";

  return (
    <Card title="Review State" subtitle="Gemini/manual review output returned by backend.">
      <div className="rounded-3xl bg-sand/70 p-4">
        <div className="text-sm font-semibold text-ink">{stateLabel}</div>
        <div className="mt-1 text-sm text-ink/70">{latestDecision.reason}</div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-sand/70 p-4 text-sm text-ink">
          Confidence: {Math.round(latestDecision.confidence * 100)}%
        </div>
        <div className="rounded-2xl bg-sand/70 p-4 text-sm text-ink">
          Fraud flags: {latestDecision.fraudFlags.length ? latestDecision.fraudFlags.map(humanizeKey).join(", ") : "None"}
        </div>
      </div>
    </Card>
  );
}
