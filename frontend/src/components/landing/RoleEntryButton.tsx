import { useNavigate } from "react-router-dom";
import { roleOptions, type AppRole } from "../../lib/roles";
import { useAppState } from "../../providers/AppStateProvider";

export function RoleEntryButton({
  role,
  variant = "primary",
  density = "regular",
  className = "",
}: {
  role: Extract<AppRole, "seller" | "buyer" | "rider">;
  variant?: "primary" | "secondary";
  density?: "compact" | "regular";
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
      className={`group rounded-[1.75rem] border text-left transition duration-200 ${
        variant === "primary"
          ? "border-coral/20 bg-coral/[0.08] hover:-translate-y-0.5 hover:border-coral/35 hover:bg-coral/[0.11]"
          : "border-line bg-white/[0.02] hover:-translate-y-0.5 hover:border-coral/20 hover:bg-white/[0.04]"
      } ${density === "compact" ? "px-4 py-4" : "px-5 py-5"} ${className}`}
      onClick={() => {
        selectRole(role);
        navigate(option.homePath);
      }}
      type="button"
    >
      <div className={`${density === "compact" ? "text-[10px]" : "text-[11px]"} font-semibold uppercase tracking-[0.26em] text-coral/82`}>
        {option.eyebrow}
      </div>
      <div className={`mt-3 flex items-start justify-between gap-3 ${density === "compact" ? "md:items-center" : ""}`}>
        <div>
          <div className={`${density === "compact" ? "text-xl" : "text-2xl"} font-display text-ink`}>{option.label}</div>
          <div className={`mt-2 max-w-sm ${density === "compact" ? "text-[13px] leading-6 text-ink/62" : "text-sm leading-6 text-ink/66"}`}>
            {option.description}
          </div>
        </div>
        <span className="rounded-full border border-coral/16 bg-coral/[0.07] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-coral transition group-hover:border-coral/28">
          Enter
        </span>
      </div>
    </button>
  );
}
