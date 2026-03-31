export function LoadState({
  loading,
  error,
  onRetry,
}: {
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  if (loading) {
    return <div className="surface-panel p-6 text-sm text-ink/70">Loading...</div>;
  }

  if (!error) {
    return null;
  }

  return (
    <div className="rounded-[2rem] border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-card">
      <div>{error}</div>
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
