import { useRef } from "react";

export function EvidenceUploader({
  file,
  previewUrl,
  progress,
  error,
  onSelect,
  onRetry,
}: {
  file: File | null;
  previewUrl: string | null;
  progress: number;
  error?: string | null;
  onSelect: (file: File | null) => void;
  onRetry?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="space-y-3">
      <div className="rounded-[1.75rem] border border-dashed border-ink/20 bg-sand/70 p-4">
        <div className="text-sm font-semibold text-ink">Delivery evidence</div>
        <div className="mt-1 text-sm text-ink/65">
          Mobile-first flow: capture or pick an image, review it here, then upload and submit for async review.
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white"
            onClick={() => inputRef.current?.click()}
            type="button"
          >
            {file ? "Replace image" : "Select image"}
          </button>
          {error && onRetry ? (
            <button
              className="rounded-full border border-ink/15 px-4 py-2 text-sm font-semibold text-ink"
              onClick={onRetry}
              type="button"
            >
              Retry upload
            </button>
          ) : null}
        </div>
        <input
          ref={inputRef}
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(event) => onSelect(event.target.files?.[0] ?? null)}
          type="file"
        />
      </div>

      <div className="rounded-[1.75rem] bg-white p-4 shadow-sm">
        <div className="text-sm font-semibold text-ink">Preview</div>
        {previewUrl ? (
          <img
            alt="Selected delivery evidence preview"
            className="mt-3 h-64 w-full rounded-[1.5rem] object-cover"
            src={previewUrl}
          />
        ) : (
          <div className="mt-3 rounded-[1.5rem] bg-sand/70 p-8 text-center text-sm text-ink/55">
            No image selected yet.
          </div>
        )}
        <div className="mt-3 text-sm text-ink/65">{file ? file.name : "Choose a parcel handoff or doorstep photo."}</div>
      </div>

      <div className="rounded-[1.75rem] bg-sand/70 p-4">
        <div className="flex items-center justify-between text-sm text-ink">
          <span>Upload progress</span>
          <span>{progress}%</span>
        </div>
        <div className="mt-2 h-3 overflow-hidden rounded-full bg-white">
          <div
            className="h-full rounded-full bg-coral transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {error ? <div className="mt-3 text-sm text-red-700">{error}</div> : null}
      </div>
    </div>
  );
}
