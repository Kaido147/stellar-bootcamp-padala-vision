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
    eyebrow: "Seller",
    title: "Seller control without extra back-and-forth",
    body: "Create an order quickly, share a payment flow, and watch funding, rider progress, proof review, and payout from one workspace.",
    bullets: ["Create escrow-ready orders", "Watch delivery move in real time", "Reduce fake completion claims"],
    visualTitle: "Order creation stays crisp and operational",
    visualNote: "A seller can launch the order, share the funding path, and monitor the full workflow without juggling separate tools.",
    stats: ["Escrow amount set", "Buyer link shared", "Timeline visible"],
  },
  {
    role: "rider",
    eyebrow: "Rider",
    title: "Rider flow built for proof and payout clarity",
    body: "Accept work, mark the order in transit, and upload evidence without losing the operational context that matters later.",
    bullets: ["Review funded jobs", "Upload delivery proof", "Reduce payout disputes"],
    visualTitle: "Proof capture becomes part of the workflow",
    visualNote: "The rider experience centers on state updates and evidence, so delivery confirmation feels structured instead of improvised.",
    stats: ["Job accepted", "In transit", "Proof uploaded"],
  },
  {
    role: "buyer",
    eyebrow: "Buyer",
    title: "Buyer trust without blind release pressure",
    body: "Fund once, track the order live, and understand exactly where a release, refund, or dispute sits in the workflow.",
    bullets: ["Track funded escrow state", "Inspect proof and review", "See release or dispute outcomes"],
    visualTitle: "Buyer visibility stays calm and complete",
    visualNote: "Funding, review, release, and disputes remain legible from one order view, so the buyer always knows what comes next.",
    stats: ["Escrow tracked", "Review state visible", "Release or dispute recorded"],
  },
] as const;

export function LandingPage() {
  const navigate = useNavigate();
  const { selectedRole } = useAppState();

  return (
    <div className="min-h-screen px-4 py-5 sm:px-6 sm:py-6">
      <div className="mx-auto max-w-7xl space-y-10 sm:space-y-14">
        <header className="surface-panel relative overflow-hidden px-5 py-5 sm:px-8 sm:py-6">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-coral/60 to-transparent" />
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="section-kicker">Padala Vision</div>
              <div className="mt-2 text-sm text-ink/60">Verified delivery escrow for real orders, proof, and release.</div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {selectedRole ? (
                <button
                  className="btn-primary"
                  onClick={() => navigate(getRoleHomePath(selectedRole))}
                  type="button"
                >
                  Continue as {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)}
                </button>
              ) : null}
              <a className="btn-secondary" href="#how-it-works">
                Explore How It Works
              </a>
            </div>
          </div>
        </header>

        <section className="surface-panel relative overflow-hidden px-5 py-8 sm:px-8 sm:py-12">
          <div className="absolute -left-16 top-0 h-64 w-64 rounded-full bg-coral/10 blur-3xl" />
          <div className="absolute bottom-0 right-8 h-64 w-64 rounded-full bg-emerald-400/[0.06] blur-3xl" />
          <div className="relative grid gap-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(340px,0.82fr)] lg:items-center">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-line bg-night/72 px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-ink/62">
                Trust-tech delivery platform
              </div>
              <h1 className="mt-6 max-w-3xl font-display text-[2.95rem] leading-[1.03] text-ink sm:text-[4.2rem]">
                Delivery trust with escrow, proof, and release in one operational flow.
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-ink/66 sm:text-lg">
                Sellers create protected orders, buyers fund visible escrow, riders upload proof, and every release or dispute step stays attached to a live timeline.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3">
                {selectedRole ? (
                  <button
                    className="btn-primary"
                    onClick={() => navigate(getRoleHomePath(selectedRole))}
                    type="button"
                  >
                    Continue in {selectedRole.charAt(0).toUpperCase() + selectedRole.slice(1)} workspace
                  </button>
                ) : null}
                <a className="btn-secondary" href="#how-it-works">
                  Explore the flow
                </a>
              </div>

              <div className="mt-7">
                <div className="text-xs font-semibold uppercase tracking-[0.24em] text-ink/42">Enter directly by role</div>
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <RoleEntryButton density="compact" role="seller" variant="secondary" />
                  <RoleEntryButton density="compact" role="rider" variant="secondary" />
                  <RoleEntryButton density="compact" role="buyer" variant="secondary" />
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-2.5">
                {trustChips.map((chip) => (
                  <div key={chip} className="quiet-pill">
                    {chip}
                  </div>
                ))}
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-lg">
              <div className="rounded-[2rem] border border-line bg-gradient-to-b from-white/[0.06] to-white/[0.02] p-4 shadow-card">
                <div className="landing-track p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-[0.2em] text-coral/84">Live Workflow</div>
                      <div className="mt-2 font-display text-3xl text-ink">Order #4821</div>
                      <div className="mt-2 text-sm text-ink/60">Escrow funded, proof in review, release staged.</div>
                    </div>
                    <div className="rounded-full border border-coral/14 bg-coral/[0.08] px-3 py-2 text-xs font-semibold text-coral">
                      Controlled flow
                    </div>
                  </div>

                  <div className="mt-7 space-y-3">
                    {[
                      {
                        label: "Escrow Funded",
                        detail: "Buyer has locked the order amount before dispatch.",
                        status: "Complete",
                      },
                      {
                        label: "Proof Uploaded",
                        detail: "Rider submitted handoff evidence for verification.",
                        status: "Reviewing",
                      },
                      {
                        label: "Release Confirmed",
                        detail: "The workflow can finalize once the review lane clears.",
                        status: "Queued",
                      },
                    ].map((item, index) => (
                      <div key={item.label} className="flex items-start gap-4 rounded-2xl border border-line bg-white/[0.03] p-4">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-coral/18 bg-coral/[0.08] text-xs font-semibold text-coral">
                          0{index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="text-sm font-semibold text-ink">{item.label}</div>
                            <div className="text-xs uppercase tracking-[0.18em] text-ink/42">{item.status}</div>
                          </div>
                          <div className="mt-1 text-sm leading-6 text-ink/60">{item.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 rounded-[1.5rem] border border-line bg-white/[0.025] p-4">
                    <div className="text-xs uppercase tracking-[0.18em] text-ink/42">Verification lane</div>
                    <div className="mt-2 text-sm leading-6 text-ink/64">
                      One calm timeline keeps escrow state, rider evidence, review output, and release decisions easy to inspect.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <LandingSection
          className="bg-white/[0.02]"
          eyebrow="How It Works"
          subtitle="The platform keeps funding, fulfillment, proof, and resolution in the same visible order lifecycle."
          title="A clean three-step path from order creation to release."
        >
          <div id="how-it-works" className="grid gap-4 lg:grid-cols-3">
            {steps.map((step, index) => (
              <div key={step.title} className="rounded-[1.75rem] border border-line bg-night/78 p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full border border-coral/18 bg-coral/[0.08] text-sm font-semibold text-coral">
                    0{index + 1}
                  </div>
                  <div className="font-display text-[1.45rem] leading-7 text-ink">{step.title}</div>
                </div>
                <p className="mt-4 text-sm leading-7 text-ink/64">{step.body}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        <div className="landing-divider" />

        <div className="space-y-8 sm:space-y-10">
          {roleFeaturePanels.map((panel) => (
            <LandingSection
              key={panel.role}
              className="bg-white/[0.024]"
              contentClassName="grid gap-6 lg:grid-cols-[minmax(0,0.92fr)_minmax(280px,0.78fr)] lg:items-center"
              eyebrow={panel.eyebrow}
              subtitle={panel.body}
              title={panel.title}
            >
              <div className={`space-y-5 ${panel.role === "rider" ? "lg:order-2" : ""}`}>
                <div className="grid gap-3 sm:grid-cols-3">
                  {panel.bullets.map((bullet) => (
                    <div key={bullet} className="rounded-2xl border border-line bg-night/76 px-4 py-4 text-sm leading-6 text-ink/74">
                      {bullet}
                    </div>
                  ))}
                </div>
                <RoleEntryButton className="max-w-md" role={panel.role} variant="secondary" />
              </div>

              <div className={`landing-track p-5 sm:p-6 ${panel.role === "rider" ? "lg:order-1" : ""}`}>
                <div className="text-xs font-semibold uppercase tracking-[0.22em] text-coral/78">{panel.eyebrow} view</div>
                <div className="mt-3 font-display text-2xl text-ink">{panel.visualTitle}</div>
                <p className="mt-3 max-w-lg text-sm leading-7 text-ink/62">{panel.visualNote}</p>
                <div className="mt-6 space-y-3">
                  {panel.stats.map((stat, index) => (
                    <div key={stat} className="flex items-center gap-3 rounded-2xl border border-line bg-white/[0.03] px-4 py-3">
                      <div className="h-2.5 w-2.5 rounded-full bg-coral/80" />
                      <div className="flex-1 text-sm text-ink/76">{stat}</div>
                      <div className="text-xs uppercase tracking-[0.18em] text-ink/38">0{index + 1}</div>
                    </div>
                  ))}
                </div>
              </div>
            </LandingSection>
          ))}
        </div>

        <LandingSection
          className="bg-white/[0.02]"
          eyebrow="Trust and Security"
          subtitle="This product is about delivery confidence, evidence review, and accountable release logic, not speculation."
          title="Built to make trust visible."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {trustCards.map((card) => (
              <div key={card.title} className="rounded-[1.6rem] border border-line bg-night/78 p-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-coral/18 bg-coral/[0.08] text-sm font-semibold text-coral">
                  0{trustCards.findIndex((item) => item.title === card.title) + 1}
                </div>
                <div className="mt-4 font-display text-[1.45rem] leading-7 text-ink">{card.title}</div>
                <p className="mt-3 text-sm leading-7 text-ink/62">{card.body}</p>
              </div>
            ))}
          </div>
        </LandingSection>

        <LandingSection
          className="bg-white/[0.024]"
          eyebrow="Order Timeline"
          subtitle="Every important handoff becomes legible as the order moves from creation to confirmed release."
          title="A timeline that makes state changes obvious."
        >
          <div className="landing-track p-5 sm:p-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
              {timelineSteps.map((step, index) => (
                <div key={step} className="relative rounded-2xl border border-line bg-white/[0.03] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-ink/40">0{index + 1}</div>
                    <div className={`h-2.5 w-2.5 rounded-full ${index === timelineSteps.length - 1 ? "bg-coral" : "bg-ink/35"}`} />
                  </div>
                  <div className="mt-4 text-sm font-semibold leading-6 text-ink">{step}</div>
                </div>
              ))}
            </div>
          </div>
        </LandingSection>

        <LandingSection
          className="text-center"
          eyebrow="Start Here"
          subtitle="Choose the role that matches how you participate in the order, then move directly into that workspace."
          title="Start with the role that fits you."
        >
          <div className="mx-auto max-w-3xl">
            <div className="grid gap-3 md:grid-cols-3">
              <RoleEntryButton density="compact" role="seller" variant="secondary" />
              <RoleEntryButton density="compact" role="rider" variant="secondary" />
              <RoleEntryButton density="compact" role="buyer" variant="secondary" />
            </div>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
              <Link className="btn-secondary" to="/settings/network">
                Open Network Setup
              </Link>
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
        </LandingSection>
      </div>
    </div>
  );
}
