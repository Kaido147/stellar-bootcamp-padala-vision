export function LoadState({
  loading,
  error,
  onRetry,
  title,
}: {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  title?: string;
}) {
  if (loading) {
    return (
      <div className="surface-panel p-6">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-coral/72">Loading</div>
        <div className="mt-3 font-display text-2xl text-ink">{title ?? "Preparing your workspace"}</div>
        <div className="mt-2 text-sm text-ink/64">Gathering the latest workflow data and rebuilding this view.</div>
      </div>
    );
  }

  if (!error) {
    return null;
  }

  return (
    <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-card">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-red-500">Could not load this view</div>
      <div className="mt-3">{error}</div>
      {onRetry ? (
        <button
          className="mt-3 rounded-full border border-red-300 px-4 py-2 font-semibold"
          onClick={onRetry}
          type="button"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}
