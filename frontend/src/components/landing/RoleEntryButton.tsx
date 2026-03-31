import { useNavigate } from "react-router-dom";
import { roleOptions, type AppRole } from "../../lib/roles";
import { useAppState } from "../../providers/AppStateProvider";

export function RoleEntryButton({
  role,
  variant = "primary",
  className = "",
}: {
  role: Extract<AppRole, "seller" | "buyer" | "rider">;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const navigate = useNavigate();
  const { selectRole } = useAppState();
  const option = roleOptions.find((item) => item.value === role);

  if (!option) {
    return null;
  }

  return (
    <button
      className={`group rounded-[1.75rem] border px-5 py-4 text-left transition duration-200 ${
        variant === "primary"
          ? "border-coral/30 bg-coral/12 hover:-translate-y-0.5 hover:border-coral/50 hover:bg-coral/16"
          : "border-line bg-white/[0.03] hover:-translate-y-0.5 hover:border-coral/30 hover:bg-white/[0.05]"
      } ${className}`}
      onClick={() => {
        selectRole(role);
        navigate(option.homePath);
      }}
      type="button"
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-coral/90">{option.eyebrow}</div>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-display text-2xl text-ink">{option.label}</div>
          <div className="mt-2 max-w-sm text-sm leading-6 text-ink/68">{option.description}</div>
        </div>
        <span className="rounded-full border border-coral/20 bg-coral/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-coral transition group-hover:border-coral/40">
          Enter
        </span>
      </div>
    </button>
  );
}
