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
          className="field-input"
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
          className="field-input"
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </label>
      <label className="block text-sm font-semibold text-ink">
        Note
        <textarea
          className="field-input min-h-28"
          onChange={(event) => setNote(event.target.value)}
          value={note}
        />
      </label>
      <button
        className="btn-primary"
        disabled={busy || !reason.trim() || !note.trim()}
        type="submit"
      >
        {busy ? "Saving..." : "Submit operator decision"}
      </button>
    </form>
  );
}
