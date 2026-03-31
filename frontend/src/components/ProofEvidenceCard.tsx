import type { OrderProofArtifact } from "@padala-vision/shared";
import { formatDateTime } from "../lib/format";
import { Card } from "./Card";

export function ProofEvidenceCard({
  proof,
  summary,
}: {
  proof?: OrderProofArtifact | null;
  summary?: string | null;
}) {
  if (!proof) {
    return (
      <Card title="Latest Evidence" subtitle="No proof artifact is attached to this order yet.">
        <div className="surface-card p-4 text-sm text-ink/64">
          Once the rider uploads and submits delivery proof, it will appear here with its timestamp and storage reference.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Latest Evidence" subtitle="The most recent proof artifact attached to this workflow order.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.92fr)]">
        <div className="space-y-3">
          <div className="surface-card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/42">Submitted</div>
            <div className="mt-2 text-sm text-ink/76">{formatDateTime(proof.submittedAt)}</div>
          </div>
          <div className="surface-card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/42">Operator Note</div>
            <div className="mt-2 text-sm leading-6 text-ink/72">{proof.note ?? "No note was attached to this proof submission."}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetaChip label="Storage path" value={proof.storagePath ?? "Missing"} />
            <MetaChip label="File hash" value={proof.fileHash ?? "Missing"} />
          </div>
        </div>

        <div className="surface-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-coral/80">Proof Summary</div>
          <div className="mt-3 text-sm leading-6 text-ink/72">
            {summary ?? "Review the proof artifact together with the timeline before moving the workflow forward."}
          </div>
          {proof.imageUrl ? (
            <a
              className="btn-secondary mt-4 inline-flex px-4 py-2"
              href={proof.imageUrl}
              rel="noreferrer"
              target="_blank"
            >
              Open proof asset
            </a>
          ) : (
            <div className="mt-4 text-sm text-ink/58">No direct proof URL is currently available.</div>
          )}
        </div>
      </div>
    </Card>
  );
}

function MetaChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-night/80 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{label}</div>
      <div className="mt-2 text-sm break-all text-ink/76">{value}</div>
    </div>
  );
}
