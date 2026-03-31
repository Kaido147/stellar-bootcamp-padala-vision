import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { RiderJobDetailResponse, RiderCreateProofUploadResponse } from "@padala-vision/shared";
import { Breadcrumbs } from "../components/Breadcrumbs";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
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
      return;
    }

    const response = await workflowApi.getRiderJob(id);
    setDetail(response);
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
      />

      <Card title="Proof Workflow" subtitle="Upload evidence, then submit the delivery proof into the new confirmation flow.">
        <label className="block text-sm font-semibold text-ink">
          Proof image
          <input
            className="mt-2 block w-full text-sm text-ink"
            onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
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
            disabled={!proofFile}
            onClick={() => {
              if (!id || !proofFile) {
                return;
              }

              setMessage(null);
              void workflowApi
                .uploadRiderProofFile(id, proofFile)
                .then((response) => {
                  setUploadResult(response);
                  setMessage("Proof image uploaded. You can now submit the proof.");
                })
                .catch((nextError) => {
                  setMessage(nextError instanceof Error ? nextError.message : "Could not upload proof.");
                });
            }}
            type="button"
          >
            Upload proof
          </button>
          <button
            className="btn-primary px-4 py-2"
            disabled={!uploadResult}
            onClick={() => {
              if (!id || !uploadResult) {
                return;
              }

              setMessage(null);
              void workflowApi
                .submitRiderProof(id, {
                  imageUrl: uploadResult.uploadUrl,
                  storagePath: uploadResult.storagePath,
                  note: proofNote.trim() || null,
                  submittedAt: new Date().toISOString(),
                })
                .then(async (response) => {
                  setMessage(
                    response.manualReviewRequired
                      ? "Proof submitted and routed to manual review."
                      : "Proof submitted and buyer confirmation has been issued.",
                  );
                  await refresh();
                })
                .catch((nextError) => {
                  setMessage(nextError instanceof Error ? nextError.message : "Could not submit proof.");
                });
            }}
            type="button"
          >
            Submit proof
          </button>
          <Link className="btn-secondary px-4 py-2" to="/rider/jobs">
            Back to workspace
          </Link>
        </div>

        {uploadResult ? (
          <div className="surface-card p-4 text-sm text-ink/64">
            Uploaded proof expires at {uploadResult.expiresAt}.
          </div>
        ) : null}
        {message ? <div className="surface-card p-4 text-sm text-ink/75">{message}</div> : null}
      </Card>
    </div>
  );
}
