import { Link } from "react-router-dom";
import { Card } from "../components/Card";
import { LoadState } from "../components/LoadState";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { useEffect, useState } from "react";
import type { FundedJobsResponse } from "@padala-vision/shared";

export function RiderJobsPage() {
  const [jobs, setJobs] = useState<FundedJobsResponse["jobs"]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const result = await api.listFundedJobs();
      setJobs(result.jobs);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Failed to load jobs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  if (loading || error) {
    return <LoadState error={error} loading={loading} onRetry={() => void load()} />;
  }

  return (
    <Card title="Rider Jobs" subtitle="Funded jobs currently available from backend workflow state.">
      {jobs.length === 0 ? (
        <div className="surface-card p-5 text-sm text-ink/70">No funded jobs available right now.</div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <div key={job.id} className="surface-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-ink">Order #{job.id}</div>
                  <div className="mt-1 text-sm text-ink/65">{job.totalAmount} USDC total escrow</div>
                </div>
                <StatusBadge status={job.status} />
              </div>
              <Link className="mt-3 inline-flex text-sm font-semibold text-coral" to={`/rider/jobs/${job.id}`}>
                Open rider job
              </Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
