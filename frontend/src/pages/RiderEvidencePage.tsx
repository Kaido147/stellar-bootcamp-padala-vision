import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { EvidenceUploader } from "../components/EvidenceUploader";
import { LoadState } from "../components/LoadState";
import { OrderStatusHeader } from "../components/OrderStatusHeader";
import { ReviewResultCard } from "../components/ReviewResultCard";
import { useOrderData } from "../hooks/useOrderData";
import { api } from "../lib/api";
import { useWallet } from "../hooks/useWallet";

export function RiderEvidencePage() {
  const { id } = useParams();
  const wallet = useWallet();
  const { orderResponse, historyResponse, loading, error, refresh } = useOrderData(id);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!orderResponse || !historyResponse) {
    return <LoadState error={error} loading={loading} onRetry={() => void refresh()} />;
  }

  const order = orderResponse.order;

  async function submit() {
    if (!file) {
      setErrorMessage("Select an image before uploading evidence.");
      return;
    }
    if (!wallet.address) {
      setErrorMessage("Connect the rider wallet first.");
      return;
    }

    setErrorMessage(null);
    setSuccess(null);
    setProgress(10);

    try {
      const upload = await api.uploadEvidenceFile(order.id, wallet.address, file);
      setProgress(60);
      setUploadedUrl(upload.signedUrl);
      const review = await api.submitEvidence({
        order_id: order.id,
        rider_wallet: wallet.address,
        image_url: upload.signedUrl,
        storage_path: upload.storagePath,
        file_hash: upload.fileHash,
        gps: { lat: 14.5995, lng: 120.9842 },
        timestamp: new Date().toISOString(),
      });
      setProgress(100);
      setSuccess(`Evidence submitted. Review state: ${review.decision}.`);
      setFile(null);
      await refresh();
    } catch (nextError) {
      setProgress(0);
      setErrorMessage(nextError instanceof Error ? nextError.message : "Evidence upload failed.");
    }
  }

  return (
    <div className="space-y-4">
      <OrderStatusHeader history={historyResponse.history} latestDecision={orderResponse.latest_decision} order={order} />
      <Card title="Evidence Capture" subtitle="Image preview, upload progress, retry, and async review submission.">
        <EvidenceUploader
          error={errorMessage}
          file={file}
          onRetry={() => void submit()}
          onSelect={setFile}
          previewUrl={previewUrl}
          progress={progress}
        />
        {uploadedUrl ? (
          <div className="rounded-3xl bg-sand/70 p-4">
            <div className="text-sm font-semibold text-ink">Uploaded image</div>
            <img alt="Uploaded evidence preview" className="mt-3 h-56 w-full rounded-[1.5rem] object-cover" src={uploadedUrl} />
          </div>
        ) : null}
        {success ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div> : null}
        <button
          className="rounded-full bg-coral px-5 py-3 text-sm font-semibold text-white disabled:opacity-60"
          disabled={!file}
          onClick={() => void submit()}
          type="button"
        >
          Submit for review
        </button>
      </Card>
      <ReviewResultCard latestDecision={orderResponse.latest_decision} />
    </div>
  );
}
