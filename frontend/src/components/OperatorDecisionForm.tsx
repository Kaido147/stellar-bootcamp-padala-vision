import { useState } from "react";

export function OperatorDecisionForm({
  onSubmit,
}: {
  onSubmit: (payload: {
    resolution: "release" | "refund" | "reject_dispute";
    reason: string;
    note: string;
  }) => Promise<void>;
}) {
  const [resolution, setResolution] = useState<"release" | "refund" | "reject_dispute">("reject_dispute");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        void onSubmit({ resolution, reason, note }).finally(() => setBusy(false));
      }}
    >
      <label className="block text-sm font-semibold text-ink">
        Resolution
        <select
          className="mt-1 w-full rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3"
          onChange={(event) => setResolution(event.target.value as "release" | "refund" | "reject_dispute")}
          value={resolution}
        >
          <option value="reject_dispute">Reject dispute</option>
          <option value="release">Release</option>
          <option value="refund">Refund</option>
        </select>
      </label>
      <label className="block text-sm font-semibold text-ink">
        Reason
        <input
          className="mt-1 w-full rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Note
        <textarea
          className="mt-1 min-h-28 w-full rounded-2xl border border-ink/10 bg-sand/50 px-4 py-3"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </label>
      <button
        className="rounded-full bg-ink px-5 py-3 text-sm font-semibold text-white"
        disabled={busy || !reason.trim() || !note.trim()}
        type="submit"
      >
        {busy ? "Saving..." : "Submit operator decision"}
      </button>
    </form>
  );
}
