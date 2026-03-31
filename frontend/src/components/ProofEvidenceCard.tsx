import { useEffect, useState } from "react";
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
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [proof?.imageUrl]);

  if (!proof) {
    return (
      <Card title="Latest Evidence" subtitle="No proof artifact is attached to this order yet.">
        <div className="surface-card p-4 text-sm text-ink/64">
          Once the rider uploads and submits delivery proof, it will appear here with its timestamp and storage reference.
        </div>
      </Card>
    );
  }

  const proofSummary =
    proof.analysis?.summary ??
    summary ??
    "Review the proof artifact together with the timeline before moving the workflow forward.";
  const analysisUnavailable = !proof.analysis || proof.analysis.analysisStatus === "unavailable";

  return (
    <Card title="Latest Evidence" subtitle="The most recent proof artifact attached to this workflow order.">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.9fr)]">
        <div className="space-y-3">
          <div className="surface-card overflow-hidden p-0">
            {proof.imageUrl && !imageFailed ? (
              <img
                alt={`Proof submitted at ${formatDateTime(proof.submittedAt)}`}
                className="h-[320px] w-full bg-night/60 object-cover"
                onError={() => setImageFailed(true)}
                src={proof.imageUrl}
              />
            ) : (
              <div className="flex h-[320px] items-center justify-center bg-night/70 p-6 text-center text-sm text-ink/60">
                The proof image could not be rendered here. Use the asset link below to inspect the original file directly.
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <MetaChip label="Submitted" value={formatDateTime(proof.submittedAt)} />
            <MetaChip label="Content type" value={proof.contentType ?? "Unknown"} />
          </div>

          <div className="surface-card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/42">Rider Note</div>
            <div className="mt-2 text-sm leading-6 text-ink/72">{proof.note ?? "No note was attached to this proof submission."}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <MetaChip label="Storage path" value={proof.storagePath ?? "Missing"} />
            <MetaChip label="File hash" value={proof.fileHash ?? "Missing"} />
          </div>
        </div>

        <div className="surface-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-coral/80">AI Proof Analysis</div>
          <div className="mt-3 text-sm leading-6 text-ink/72">
            {proofSummary}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MetaChip
              label="Quality"
              value={
                proof.analysis?.qualityAssessment
                  ? proof.analysis.qualityAssessment.replace(/_/g, " ")
                  : "Analysis unavailable"
              }
            />
            <MetaChip
              label="Confidence"
              value={proof.analysis?.confidenceLabel ? proof.analysis.confidenceLabel.replace(/_/g, " ") : "Unavailable"}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-night/80 p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/42">Operator Notes</div>
            <div className="mt-2 text-sm leading-6 text-ink/72">
              {proof.analysis?.operatorNotes ??
                "Automated proof analysis is unavailable. Review the image directly before moving the workflow forward."}
            </div>
          </div>

          {proof.analysis?.riskFlags && proof.analysis.riskFlags.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {proof.analysis.riskFlags.map((flag) => (
                <div key={flag} className="quiet-pill">
                  {flag.replace(/_/g, " ")}
                </div>
              ))}
            </div>
          ) : null}

          {analysisUnavailable ? (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Gemini proof analysis is currently unavailable. The upload still succeeded, but this proof should be reviewed directly from the image and metadata.
            </div>
          ) : null}

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
