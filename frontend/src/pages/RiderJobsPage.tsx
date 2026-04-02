import { Link, useNavigate } from "react-router-dom";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { WorkflowOrderCard } from "../components/WorkflowOrderCard";
import { WorkflowWorkspaceSection } from "../components/WorkflowWorkspaceSection";
import { useAsyncData } from "../hooks/useAsyncData";
import { workflowApi } from "../lib/api";
import { formatDateTime, formatRelativeCountdown } from "../lib/format";

export function RiderJobsPage() {
  const navigate = useNavigate();
  const { data, loading, error } = useAsyncData(
    async () => {
      const [available, mine] = await Promise.all([workflowApi.listRiderAvailableJobs(), workflowApi.listRiderJobs()]);
      return {
        available: available.jobs,
        active: mine.jobs.filter((job) => !["awaiting_buyer_confirmation", "released", "refunded", "cancelled", "expired"].includes(job.status)),
        delivered: mine.jobs.filter((job) => ["awaiting_buyer_confirmation", "released", "refunded"].includes(job.status)),
      };
    },
    [],
  );

  if (!data) {
    return <LoadState error={error} loading={loading} />;
  }

  return (
    <div className="space-y-4">
      <Card subtitle="Riders can now discover open work and reopen their assigned jobs from a real workspace." title="Rider Workspace">
        <div className="grid gap-3 sm:grid-cols-3">
          <SummaryChip label="Available jobs" value={String(data.available.length)} />
          <SummaryChip label="My active jobs" value={String(data.active.length)} />
          <SummaryChip label="Recently delivered" value={String(data.delivered.length)} />
        </div>
      </Card>

      <WorkflowWorkspaceSection empty="No funded jobs are available right now." subtitle="These jobs are funded and ready for a rider to accept." title="Available Jobs">
        {data.available.map((job) => (
          <div className="surface-card p-4" key={job.orderId}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-display text-xl text-ink">{job.orderCode}</div>
                <div className="mt-1 text-sm text-ink/62">
                  {job.pickupLabel} to {job.dropoffLabel}
                </div>
              </div>
              <div className="quiet-pill">{`${job.totalAmount} PUSD`}</div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <SummaryChip label="Funded at" value={formatDateTime(job.fundingConfirmedAt)} />
              <SummaryChip label="Due" value={job.dueAt ? `${formatDateTime(job.dueAt)} (${formatRelativeCountdown(job.dueAt)})` : "Not scheduled"} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className="btn-primary px-4 py-2"
                onClick={() => {
                  void workflowApi.acceptRiderJob(job.orderId).then(() => {
                    navigate(`/rider/jobs/${job.orderId}`);
                  });
                }}
                type="button"
              >
                Accept job
              </button>
            </div>
          </div>
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No rider-assigned jobs are active." subtitle="Assigned and in-transit jobs stay here until delivery is completed." title="My Active Jobs">
        {data.active.map((job) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${job.buyerDisplayName}`}
            href={`/rider/jobs/${job.orderId}`}
            key={job.orderId}
            order={job}
          />
        ))}
      </WorkflowWorkspaceSection>

      <WorkflowWorkspaceSection empty="No recently delivered jobs yet." subtitle="Proof-submitted and settled jobs remain visible for rediscovery." title="Recently Delivered">
        {data.delivered.map((job) => (
          <WorkflowOrderCard
            counterpartLabel={`Buyer: ${job.buyerDisplayName}`}
            href={`/rider/jobs/${job.orderId}`}
            key={job.orderId}
            order={job}
          />
        ))}
      </WorkflowWorkspaceSection>
    </div>
  );
}

function SummaryChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="surface-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink/42">{label}</div>
      <div className="mt-2 text-sm text-ink/78">{value}</div>
    </div>
  );
}
