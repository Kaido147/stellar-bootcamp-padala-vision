import { useEffect, useState } from "react";
import type {
  CreateOrderResponse,
  EvidenceSubmitResponse,
  OrderHistoryResponse,
  OrderRecord,
} from "@padala-vision/shared";
import { PhoneShell } from "./components/PhoneShell";
import { SectionCard } from "./components/SectionCard";
import { StatusBadge } from "./components/StatusBadge";
import { Timeline } from "./components/Timeline";
import { useWallet } from "./hooks/useWallet";
import { api } from "./lib/api";
import { submitReleaseTransaction } from "./lib/stellar";

type Screen = "seller" | "buyer" | "rider" | "timeline";

export default function App() {
  const [screen, setScreen] = useState<Screen>("seller");
  const [order, setOrder] = useState<OrderRecord | null>(null);
  const [history, setHistory] = useState<OrderHistoryResponse | null>(null);
  const [jobs, setJobs] = useState<OrderRecord[]>([]);
  const [decision, setDecision] = useState<EvidenceSubmitResponse | null>(null);
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [evidencePreviewUrl, setEvidencePreviewUrl] = useState<string | null>(null);
  const [releaseHash, setReleaseHash] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const wallet = useWallet();

  useEffect(() => {
    if (!order) return;
    void refreshOrder(order.id);
  }, [order?.id]);

  useEffect(() => {
    if (!evidenceFile) {
      setEvidencePreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(evidenceFile);
    setEvidencePreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [evidenceFile]);

  async function refreshOrder(orderId: string) {
    const [orderResponse, historyResponse] = await Promise.all([api.getOrder(orderId), api.getHistory(orderId)]);
    setOrder(orderResponse.order);
    setHistory(historyResponse);
  }

  async function handleCreateOrder() {
    setBusy(true);
    try {
      const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
      const created: CreateOrderResponse = await api.createOrder({
        seller_wallet: "GSELLERPADALAVISIONDEMO",
        buyer_wallet: "GBUYERPADALAVISIONDEMO",
        item_amount: "15",
        delivery_fee: "3",
        expires_at: expiresAt,
      });
      setOrder(created.order);
      await refreshOrder(created.order.id);
      setScreen("buyer");
    } finally {
      setBusy(false);
    }
  }

  async function handleFundOrder() {
    if (!order) return;
    setBusy(true);
    try {
      await api.fundOrder(order.id);
      await refreshOrder(order.id);
      const funded = await api.listFundedJobs();
      setJobs(funded.jobs);
      setScreen("rider");
    } finally {
      setBusy(false);
    }
  }

  async function handleAcceptJob() {
    if (!order) return;
    setBusy(true);
    setReleaseError(null);
    try {
      const rider = wallet.address || "GRIDERPADALAVISIONDEMO";
      await api.acceptJob(order.id, rider);
      await api.markInTransit(order.id, rider);
      await refreshOrder(order.id);
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmitEvidence() {
    if (!order) return;
    setBusy(true);
    try {
      const rider = wallet.address || "GRIDERPADALAVISIONDEMO";
      if (!evidenceFile) {
        throw new Error("Please select a delivery photo before submitting evidence.");
      }

      const upload = await api.uploadEvidenceFile(order.id, rider, evidenceFile);
      const result = await api.submitEvidence({
        order_id: order.id,
        rider_wallet: rider,
        image_url: upload.signedUrl,
        storage_path: upload.storagePath,
        file_hash: upload.fileHash,
        gps: {
          lat: 14.5995,
          lng: 120.9842,
        },
        timestamp: new Date().toISOString(),
      });
      setDecision(result);
      if (result.attestation) {
        const chainRelease = await submitReleaseTransaction({
          orderId: order.id,
          attestation: result.attestation,
          sourceAddress: wallet.address || undefined,
        });
        setReleaseHash(chainRelease.hash);
        await api.releaseEscrow({
          order_id: order.id,
          attestation: result.attestation,
          tx_hash: chainRelease.hash,
          tx_status: chainRelease.status,
        });
      }
      await refreshOrder(order.id);
      setEvidenceFile(null);
      setEvidencePreviewUrl(null);
      setScreen("timeline");
    } catch (error) {
      setReleaseError(error instanceof Error ? error.message : "Evidence submission failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <header className="mb-6">
        <div className="mb-2 inline-flex rounded-full bg-coral px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-white">
          Padala-Vision v2
        </div>
        <h1 className="font-display text-4xl leading-none text-ink">Escrow for social selling, with a signed delivery oracle.</h1>
        <p className="mt-3 text-sm text-ink/70">
          Minimized-trust payout flow for same-day local delivery. On-chain release is deterministic after valid oracle approval.
        </p>
      </header>

      <nav className="mb-4 grid grid-cols-4 gap-2 rounded-2xl bg-ink p-2 text-xs text-white">
        {(["seller", "buyer", "rider", "timeline"] as Screen[]).map((value) => (
          <button
            key={value}
            className={`rounded-xl px-2 py-3 capitalize ${screen === value ? "bg-white text-ink" : "bg-transparent text-white/80"}`}
            onClick={() => setScreen(value)}
            type="button"
          >
            {value}
          </button>
        ))}
      </nav>

      <div className="space-y-4">
        {screen === "seller" ? (
          <SectionCard
            title="Seller Create Order"
            subtitle="Demo scenario uses item amount 15 and delivery fee 3."
          >
            <div className="rounded-2xl bg-sand p-3 text-sm text-ink/80">
              A seller creates a single-parcel escrow order and shares the order link with the buyer.
            </div>
            <button
              className="w-full rounded-2xl bg-coral px-4 py-3 font-semibold text-white"
              disabled={busy}
              onClick={handleCreateOrder}
              type="button"
            >
              {busy ? "Creating..." : "Create Demo Order"}
            </button>
            {order ? (
              <div className="rounded-2xl border border-moss/30 bg-moss/10 p-3 text-sm">
                Order created: <div className="mt-1 break-all font-mono text-xs">{order.id}</div>
              </div>
            ) : null}
          </SectionCard>
        ) : null}

        {screen === "buyer" ? (
          <SectionCard
            title="Buyer Fund Order"
            subtitle="Connect a wallet or use the fallback demo wallet."
            action={order ? <StatusBadge status={order.status} /> : null}
          >
            <button
              className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 font-semibold"
              onClick={wallet.connectWallet}
              type="button"
            >
              {wallet.address ? `Wallet: ${wallet.address.slice(0, 10)}...` : "Connect Freighter"}
            </button>
            {order ? (
              <div className="rounded-2xl bg-sand p-4 text-sm">
                <div>Item amount: 15 USDC</div>
                <div>Delivery fee: 3 USDC</div>
                <div className="mt-1 font-semibold">Total escrow: {order.totalAmount} USDC</div>
              </div>
            ) : null}
            <button
              className="w-full rounded-2xl bg-gold px-4 py-3 font-semibold text-ink"
              disabled={!order || busy}
              onClick={handleFundOrder}
              type="button"
            >
              {busy ? "Locking..." : "Fund Escrow"}
            </button>
          </SectionCard>
        ) : null}

        {screen === "rider" ? (
          <>
            <SectionCard
              title="Rider Available Jobs"
              subtitle="Funded jobs appear here for same-day local delivery."
            >
              <button
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 font-semibold"
                onClick={wallet.connectWallet}
                type="button"
              >
                {wallet.address ? `Rider wallet: ${wallet.address.slice(0, 10)}...` : "Connect Rider Wallet"}
              </button>
              <div className="space-y-3">
                {jobs.length === 0 ? (
                  <div className="rounded-2xl bg-sand p-3 text-sm text-ink/70">
                    Fund the order first to make a job appear here.
                  </div>
                ) : (
                  jobs.map((job) => (
                    <div key={job.id} className="rounded-2xl border border-ink/10 bg-sand/60 p-3">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold">{job.totalAmount} USDC escrow</span>
                        <StatusBadge status={job.status} />
                      </div>
                      <div className="mt-2 text-xs text-ink/70">{job.id}</div>
                    </div>
                  ))
                )}
              </div>
              <button
                className="w-full rounded-2xl bg-moss px-4 py-3 font-semibold text-white"
                disabled={!order || busy}
                onClick={handleAcceptJob}
                type="button"
              >
                {busy ? "Updating..." : "Accept Job and Mark In Transit"}
              </button>
              <label className="block rounded-2xl border border-dashed border-ink/20 bg-white p-4 text-sm text-ink/75">
                <span className="mb-2 block font-semibold text-ink">Delivery Photo</span>
                <input
                  accept="image/*"
                  capture="environment"
                  className="block w-full text-sm"
                  onChange={(event) => setEvidenceFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
                <span className="mt-2 block text-xs text-ink/60">
                  {evidenceFile ? `Selected: ${evidenceFile.name}` : "Choose a parcel handoff or doorstep photo for Gemini review."}
                </span>
              </label>
              {evidencePreviewUrl ? (
                <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
                  <img
                    alt="Selected delivery evidence preview"
                    className="h-56 w-full object-cover"
                    src={evidencePreviewUrl}
                  />
                </div>
              ) : null}
              <button
                className="w-full rounded-2xl bg-ink px-4 py-3 font-semibold text-white"
                disabled={!order || busy || order.status !== "InTransit" || !evidenceFile}
                onClick={handleSubmitEvidence}
                type="button"
              >
                {busy ? "Uploading..." : evidenceFile ? "Submit Selected Photo" : "Choose a Photo First"}
              </button>
              <div className="rounded-2xl bg-sand p-3 text-xs text-ink/70">
                The rider flow now uses the actual selected file. You should see the chosen image preview above before submission.
              </div>
            </SectionCard>

            {decision ? (
              <SectionCard title="Oracle Result" subtitle="Structured decision from the backend oracle">
                <div className="rounded-2xl bg-sand p-3 text-sm">
                  <div className="font-semibold">{decision.decision}</div>
                  <div>Confidence: {(decision.confidence * 100).toFixed(1)}%</div>
                  <div className="mt-1 text-ink/75">{decision.reason}</div>
                </div>
                {releaseError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                    {releaseError}
                  </div>
                ) : null}
                {releaseHash ? (
                  <div className="rounded-2xl border border-moss/30 bg-moss/10 p-3 text-sm text-ink">
                    Release tx hash:
                    <div className="mt-1 break-all font-mono text-xs">{releaseHash}</div>
                  </div>
                ) : null}
              </SectionCard>
            ) : null}
          </>
        ) : null}

        {screen === "timeline" ? (
          <SectionCard
            title="Shared Timeline"
            subtitle="Unified view across seller, buyer, and rider."
            action={order ? <StatusBadge status={order.status} /> : null}
          >
            {history ? <Timeline entries={history.history} /> : <div className="text-sm text-ink/70">Create an order to begin the timeline.</div>}
            {history?.transactions[0] ? (
              <div className="rounded-2xl bg-ink p-4 text-sm text-white">
                <div className="font-semibold">Release Transaction</div>
                <div className="mt-2 break-all font-mono text-xs">{history.transactions[0].txHash}</div>
              </div>
            ) : null}
          </SectionCard>
        ) : null}
      </div>
    </PhoneShell>
  );
}
