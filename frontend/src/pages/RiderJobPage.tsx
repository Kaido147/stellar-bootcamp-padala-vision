import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { OrderProofArtifact, RiderJobDetailResponse, RiderCreateProofUploadResponse } from "@padala-vision/shared";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { ProofEvidenceCard } from "../components/ProofEvidenceCard";
import { WorkflowOrderDetailContent } from "../components/WorkflowOrderDetailContent";
import { workflowApi } from "../lib/api";

export function RiderJobPage() {
  const { id } = useParams();
  const [detail, setDetail] = useState<RiderJobDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<RiderCreateProofUploadResponse | null>(null);
  const [proofNote, setProofNote] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submittedProof, setSubmittedProof] = useState<OrderProofArtifact | null>(null);
  const [isUploadingProof, setIsUploadingProof] = useState(false);
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);

  useEffect(() => {
    if (!proofFile) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(proofFile);
    setPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [proofFile]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setError("Order id is missing.");
      return;
    }

    const orderId = id;

    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await workflowApi.getRiderJob(orderId);
        if (!cancelled) {
          setDetail(response);
        }
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : "Could not load rider job.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!detail) {
    return <LoadState error={error} loading={loading} />;
  }

  async function refresh() {
    if (!id) {
      return null;
    }

    const response = await workflowApi.getRiderJob(id);
    setDetail(response);
    return response;
  }

  function handleProofFileChange(file: File | null) {
    setProofFile(file);
    setUploadResult(null);
    setSubmittedProof(null);
    setMessage(null);
  }

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Rider jobs", to: "/rider/jobs" }, { label: detail.order.orderCode }]} />

      <WorkflowOrderDetailContent
        actions={
          <div className="mt-4 flex flex-wrap gap-3">
            {detail.order.status === "rider_assigned" ? (
              <button
                className="btn-primary px-4 py-2"
                onClick={() => {
                  if (!id) {
                    return;
                  }

                  setMessage(null);
                  void workflowApi
                    .pickupRiderJob(id, { pickedUpAt: new Date().toISOString() })
                    .then(async () => {
                      setMessage("Pickup recorded. The order is now in transit.");
                      await refresh();
                    })
                    .catch((nextError) => {
                      setMessage(nextError instanceof Error ? nextError.message : "Could not mark pickup.");
                    });
                }}
                type="button"
              >
                Mark pickup
              </button>
            ) : null}
          </div>
        }
        detail={detail}
        detailSubtitle="Keep the rider workflow operational: pickup, upload proof, and submit delivery evidence."
        detailTitle={`Rider Job ${detail.order.orderCode}`}
        showProofEvidence={false}
      />

      <Card title="Proof Workflow" subtitle="Upload evidence, then submit the delivery proof into the new confirmation flow.">
        <label className="block text-sm font-semibold text-ink">
          Proof image
          <input
            className="mt-2 block w-full text-sm text-ink"
            accept="image/*"
            onChange={(event) => handleProofFileChange(event.target.files?.[0] ?? null)}
            type="file"
          />
        </label>

        <label className="block text-sm font-semibold text-ink">
          Note
          <textarea
            className="field-input min-h-28"
            onChange={(event) => setProofNote(event.target.value)}
            placeholder="Describe the handoff or flag manual review if needed."
            value={proofNote}
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            className="btn-secondary px-4 py-2"
            disabled={!proofFile || isUploadingProof || isSubmittingProof}
            onClick={() => {
              if (!id || !proofFile) {
                return;
              }

              setMessage(null);
              setIsUploadingProof(true);
              void workflowApi
                .uploadRiderProofFile(id, proofFile)
                .then((response) => {
                  setUploadResult(response);
                  setMessage("Proof image uploaded and previewed below. Submit it to run Gemini proof analysis.");
                })
                .catch((nextError) => {
                  setMessage(nextError instanceof Error ? nextError.message : "Could not upload proof.");
                })
                .finally(() => {
                  setIsUploadingProof(false);
                });
            }}
            type="button"
          >
            {isUploadingProof ? "Uploading..." : "Upload proof"}
          </button>
          <button
            className="btn-primary px-4 py-2"
            disabled={!uploadResult || isUploadingProof || isSubmittingProof || Boolean(submittedProof)}
            onClick={() => {
              if (!id || !uploadResult) {
                return;
              }

                  setMessage("Submitting proof and running AI analysis...");
                  setIsSubmittingProof(true);
                  void workflowApi
                .submitRiderProof(id, {
                  imageUrl: uploadResult.uploadUrl,
                  storagePath: uploadResult.storagePath,
                  fileHash: uploadResult.fileHash ?? null,
                  contentType: uploadResult.contentType ?? proofFile?.type ?? null,
                  note: proofNote.trim() || null,
                  submittedAt: new Date().toISOString(),
                })
                .then(async (response) => {
                  const refreshed = await refresh();
                  const nextProof = response.latestProof ?? refreshed?.latestProof ?? null;
                  if (!nextProof) {
                    throw new Error("Proof submitted, but the analyzed proof could not be loaded. Refresh this page.");
                  }
                  setSubmittedProof(nextProof);
                  const analysisAvailable = nextProof.analysis?.analysisStatus === "available";
                  setMessage(
                    analysisAvailable
                      ? response.manualReviewRequired
                        ? "Proof submitted, AI analysis is attached, and the order was routed to manual review."
                        : "Proof submitted, AI analysis is attached, and buyer confirmation has been issued."
                      : "Proof submitted, but AI analysis is unavailable. Review proof manually.",
                  );
                })
                .catch((nextError) => {
                  setMessage(nextError instanceof Error ? nextError.message : "Could not submit proof.");
                })
                .finally(() => {
                  setIsSubmittingProof(false);
                });
            }}
            type="button"
          >
            {isSubmittingProof ? "Submitting..." : "Submit proof"}
          </button>
          <Link className="btn-secondary px-4 py-2" to="/rider/jobs">
            Back to workspace
          </Link>
        </div>

        {submittedProof ? (
          <ProofEvidenceCard mode="submitted" proof={submittedProof} summary={submittedProof.analysis?.summary ?? null} />
        ) : isSubmittingProof && previewUrl ? (
          <ProofEvidenceCard
            mode="preview"
            proof={{
              imageUrl: previewUrl,
              storagePath: uploadResult?.storagePath ?? null,
              fileHash: uploadResult?.fileHash ?? null,
              contentType: uploadResult?.contentType ?? proofFile?.type ?? null,
              submittedAt: new Date().toISOString(),
              note: proofNote.trim() || null,
              analysis: null,
            }}
            summary="Submitting proof and running AI analysis..."
          />
        ) : previewUrl ? (
          <ProofEvidenceCard
            mode="preview"
            proof={{
              imageUrl: previewUrl,
              storagePath: uploadResult?.storagePath ?? null,
              fileHash: uploadResult?.fileHash ?? null,
              contentType: uploadResult?.contentType ?? proofFile?.type ?? null,
              submittedAt: new Date().toISOString(),
              note: proofNote.trim() || null,
              analysis: null,
            }}
            summary="Preview the uploaded image here before you submit it into the workflow."
          />
        ) : null}

        {uploadResult ? (
          <div className="surface-card p-4 text-sm text-ink/64">
            Uploaded proof expires at {uploadResult.expiresAt}. The direct proof asset link remains available from the evidence card.
          </div>
        ) : null}
        {message ? <div className="surface-card p-4 text-sm text-ink/75">{message}</div> : null}
      </Card>
    </div>
  );
}
