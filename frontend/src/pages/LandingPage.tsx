import { Link, useNavigate } from "react-router-dom";
import { RoleEntryButton } from "../components/landing/RoleEntryButton";
import { LandingSection } from "../components/landing/LandingSection";
import { getRoleHomePath } from "../lib/roles";
import { useAppState } from "../providers/AppStateProvider";

const trustChips = ["On-chain escrow", "Proof-based verification", "Live order timeline"];

const steps = [
  {
    title: "Buyer funds escrow",
    body: "The order is created once, funded visibly, and tracked with an auditable state transition.",
  },
  {
    title: "Rider completes delivery and uploads proof",
    body: "Proof capture stays attached to the order, creating a clear verification handoff instead of a vague completion claim.",
  },
  {
    title: "Release happens after verification",
    body: "Review, release, refund, or dispute outcomes remain visible in the same operational timeline.",
  },
];

const trustCards = [
  {
    title: "Escrow on-chain",
    body: "Funds stay anchored to a chain-backed release path instead of informal handoff promises.",
  },
  {
    title: "Proof-based verification",
    body: "Delivery evidence is captured, uploaded, and reviewed before the happy path finalizes.",
  },
  {
    title: "Dispute and refund visibility",
    body: "Participants can see when the flow branches into dispute resolution instead of being left in the dark.",
  },
  {
    title: "Full order timeline",
    body: "Creation, funding, assignment, proof, review, and release all live in one stateful record.",
  },
];

const timelineSteps = [
  "Order Created",
  "Escrow Funded",
  "Rider Assigned",
  "In Transit",
  "Proof Uploaded",
  "Review Approved",
  "Release Confirmed",
];

const roleFeaturePanels = [
  {
    role: "seller",
    title: "Seller control without extra back-and-forth",
    body: "Create an order quickly, share a payment flow, and watch funding, rider progress, proof review, and payout from one workspace.",
    bullets: ["Create escrow-ready orders", "Watch delivery move in real time", "Reduce fake completion claims"],
  },
  {
    role: "rider",
    title: "Rider flow built for proof and payout clarity",
    body: "Accept work, mark the order in transit, and upload evidence without losing the operational context that matters later.",
    bullets: ["Review funded jobs", "Upload delivery proof", "Reduce payout disputes"],
  },
  {
    role: "buyer",
    title: "Buyer trust without blind release pressure",
    body: "Fund once, track the order live, and understand exactly where a release, refund, or dispute sits in the workflow.",
    bullets: ["Track funded escrow state", "Inspect proof and review", "See release or dispute outcomes"],
  },
] as const;

export function LandingPage() {
  const navigate = useNavigate();
  const { selectedRole } = useAppState();

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="surface-panel relative overflow-hidden px-5 py-5 sm:px-8 sm:py-6">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-coral/60 to-transparent" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="section-kicker">Padala Vision</div>
              <div className="mt-2 text-sm text-ink/60">Verified delivery escrow for real orders, proof, and release.</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <a className="btn-secondary" href="#how-it-works">
                Explore How It Works
              </a>
              {selectedRole ? (
                <button
                  className="btn-primary"
                  onClick={() => navigate(getRoleHomePath(selectedRole))}
                  type="button"
                >
                  Continue as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
                </button>
              ) : null}
            </div>
          </div>
        </header>

        <section className="surface-panel relative overflow-hidden px-5 py-8 sm:px-8 sm:py-10">
          <div className="absolute -left-20 top-0 h-72 w-72 rounded-full bg-coral/14 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-emerald-400/10 blur-3xl" />
          <div className="relative grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(360px,0.95fr)] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-night/80 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/68">
                Trust-tech delivery platform
              </div>
              <h1 className="mt-5 max-w-3xl font-display text-5xl leading-[1.02] text-ink sm:text-6xl">
                Delivery trust with escrow, proof, and release in one operational flow.
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/70">
                Sellers create protected orders, buyers fund visible escrow, riders upload proof, and every release or dispute step stays attached to a live timeline.
              </p>

              <div className="mt-8 grid gap-3 md:grid-cols-3">
                <RoleEntryButton role="seller" />
                <RoleEntryButton role="rider" />
                <RoleEntryButton role="buyer" />
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                {trustChips.map((chip) => (
                  <div key={chip} className="rounded-full border border-line bg-white/[0.03] px-4 py-2 text-sm text-ink/72">
                    {chip}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-xl">
              <div className="absolute -left-8 top-12 hidden h-32 w-32 rounded-full bg-coral/20 blur-3xl sm:block" />
              <div className="rounded-[2rem] border border-line bg-gradient-to-b from-white/[0.08] to-white/[0.03] p-4 shadow-card">
                <div className="rounded-[1.75rem] border border-line bg-night/90 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-coral/90">Live Workflow</div>
                      <div className="mt-2 font-display text-3xl text-ink">Order #4821</div>
                    </div>
                    <div className="rounded-full border border-coral/20 bg-coral/12 px-3 py-2 text-xs font-semibold text-coral">
                      Release-ready
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    {[
                      "Escrow Funded",
                      "Rider Assigned",
                      "Proof Uploaded",
                      "Review Approved",
                    ].map((label, index) => (
                      <div key={label} className="rounded-2xl border border-line bg-white/[0.04] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-ink/45">Step 0{index + 1}</div>
                        <div className="mt-2 text-sm font-semibold text-ink">{label}</div>
                        <div className="mt-2 h-1.5 rounded-full bg-white/[0.08]">
                          <div className="h-full rounded-full bg-coral" style={{ width: `${82 - index * 11}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-[1.5rem] border border-line bg-white/[0.03] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="text-xs uppercase tracking-[0.18em] text-ink/45">Verification lane</div>
                        <div className="mt-2 text-sm text-ink/70">Proof is attached, reviewed, and then reflected in release state.</div>
                      </div>
                      <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs font-semibold text-emerald-300">
                        Release Confirmed
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pointer-events-none absolute -left-6 top-12 hidden rounded-2xl border border-line bg-night/95 px-4 py-3 shadow-card md:block">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Escrow</div>
                  <div className="mt-2 text-sm font-semibold text-ink">Funded and locked</div>
                </div>
                <div className="pointer-events-none absolute -right-3 bottom-12 hidden rounded-2xl border border-line bg-night/95 px-4 py-3 shadow-card md:block">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-ink/45">Review</div>
                  <div className="mt-2 text-sm font-semibold text-ink">Approved for release</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <LandingSection
          eyebrow="How It Works"
          subtitle="The platform keeps funding, fulfillment, proof, and resolution in the same visible order lifecycle."
          title="A clean three-step path from order creation to release."
        >
          <div id="how-it-works" className="grid gap-4 lg:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="surface-card p-5">
                <div className="text-sm font-semibold uppercase tracking-[0.22em] text-coral/90">0{index + 1}</div>
                <div className="mt-3 font-display text-2xl text-ink">{step.title}</div>
                <p className="mt-3 text-sm leading-6 text-ink/68">{step.body}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        <div className="grid gap-6 xl:grid-cols-3">
          {roleFeaturePanels.map((panel) => (
            <LandingSection
              key={panel.role}
              eyebrow={panel.role}
              subtitle={panel.body}
              title={panel.title}
            >
              <div className="surface-card space-y-3 p-5">
                {panel.bullets.map((bullet) => (
                  <div key={bullet} className="rounded-2xl border border-line bg-night/80 px-4 py-3 text-sm text-ink/78">
                    {bullet}
                  </div>
                ))}
                <RoleEntryButton className="mt-4 w-full" role={panel.role} variant="secondary" />
              </div>
            </LandingSection>
          ))}
        </div>

        <LandingSection
          eyebrow="Trust and Security"
          subtitle="This product is about delivery confidence, evidence review, and accountable release logic, not speculation."
          title="Built to make trust visible."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {trustCards.map((card) => (
              <div key={card.title} className="surface-card p-5">
                <div className="font-display text-2xl text-ink">{card.title}</div>
                <p className="mt-3 text-sm leading-6 text-ink/68">{card.body}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        <LandingSection
          eyebrow="Order Timeline"
          subtitle="Every important handoff becomes legible as the order moves from creation to confirmed release."
          title="A timeline that makes state changes obvious."
        >
          <div className="surface-card p-5 sm:p-6">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-7">
              {timelineSteps.map((step, index) => (
                <div key={step} className="relative rounded-2xl border border-line bg-night/85 p-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-ink/40">0{index + 1}</div>
                  <div className="mt-2 text-sm font-semibold text-ink">{step}</div>
                  <div className="mt-4 h-1.5 rounded-full bg-white/[0.08]">
                    <div className="h-full rounded-full bg-coral" style={{ width: index === timelineSteps.length - 1 ? "100%" : "86%" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </LandingSection>

        <LandingSection
          aside={<Link className="btn-secondary" to="/settings/network">Open Network Setup</Link>}
          eyebrow="Start Here"
          subtitle="Choose the role that matches how you participate in the order, then move directly into that workspace."
          title="Start with the role that fits you."
        >
          <div className="grid gap-3 md:grid-cols-3">
            <RoleEntryButton role="seller" variant="secondary" />
            <RoleEntryButton role="rider" variant="secondary" />
            <RoleEntryButton role="buyer" variant="secondary" />
          </div>
        </LandingSection>
      </div>
    </div>
  );
}
