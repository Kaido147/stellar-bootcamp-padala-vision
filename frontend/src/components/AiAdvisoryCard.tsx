import { Card } from "./Card";

export function AiAdvisoryCard({
  title = "Gemini Advisory",
  subtitle,
  summary,
  riskFlags,
  decisionSuggestion,
}: {
  title?: string;
  subtitle: string;
  summary?: string | null;
  riskFlags?: string[];
  decisionSuggestion?: string | null;
}) {
  return (
    <Card title={title} subtitle={subtitle}>
      <div className="space-y-4">
        <div className="surface-card p-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-coral/80">Advisory Summary</div>
          <div className="mt-3 text-sm leading-6 text-ink/72">
            {summary ?? "No Gemini summary is available for this record yet."}
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.9fr)]">
          <div className="surface-card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/42">Risk Flags</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {riskFlags && riskFlags.length > 0 ? (
                riskFlags.map((flag) => (
                  <div key={flag} className="quiet-pill">
                    {flag.replace(/_/g, " ")}
                  </div>
                ))
              ) : (
                <div className="text-sm text-ink/62">No elevated risk flags were raised from the available context.</div>
              )}
            </div>
          </div>

          <div className="surface-card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/42">Suggested Next Move</div>
            <div className="mt-3 text-sm leading-6 text-ink/72">
              {decisionSuggestion ?? "Continue from the next explicit human decision point in the workflow."}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
