import type { TxStage } from "../lib/stellar";
import { getExplorerUrl } from "../lib/stellar";
import { Card } from "./Card";

const stages: TxStage[] = ["Prepare", "Sign", "Submitted", "Confirming", "Confirmed"];

export function TxProgressCard({
  title = "Transaction Status",
  stage,
  txHash,
  error,
  helperText,
}: {
  title?: string;
  stage?: TxStage | null;
  txHash?: string | null;
  error?: string | null;
  helperText?: string;
}) {
  const normalized = error ? "Failed" : stage;

  return (
    <Card title={title} subtitle={helperText}>
      <div className="grid gap-2 sm:grid-cols-5">
        {stages.map((value, index) => {
          const activeIndex = normalized ? stages.indexOf(normalized === "Failed" ? "Confirming" : normalized) : -1;
          const active = index <= activeIndex;
          return (
            <div
              key={value}
              className={`rounded-2xl border px-3 py-3 text-center text-xs font-semibold ${
                active ? "border-ink bg-ink text-white" : "border-ink/10 bg-sand/60 text-ink/55"
              }`}
            >
              {value}
            </div>
          );
        })}
      </div>
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}
      {txHash ? (
        <div className="rounded-2xl bg-sand/70 p-3 text-sm text-ink/75">
          <div className="font-semibold text-ink">Tx hash</div>
          <div className="mt-1 break-all font-mono text-xs">{txHash}</div>
          <a className="mt-2 inline-flex font-semibold text-coral" href={getExplorerUrl(txHash)} rel="noreferrer" target="_blank">
            Open explorer
          </a>
        </div>
      ) : null}
    </Card>
  );
}
