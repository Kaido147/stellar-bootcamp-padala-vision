import { useLocation, useNavigate } from "react-router-dom";
import { getRoleHomePath, resolveActiveRole, roleOptions, type AppRole } from "../lib/roles";
import { useAuth } from "../providers/AuthProvider";
import { useAppState } from "../providers/AppStateProvider";

export function RoleSwitcher({
  className = "",
  onSelect,
}: {
  className?: string;
  onSelect?: (role: AppRole) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { actor } = useAuth();
  const { selectedRole, selectRole } = useAppState();
  const activeRole = resolveActiveRole(location.pathname, actor?.role, selectedRole);

  return (
    <div className={`inline-flex flex-wrap gap-2 rounded-full border border-line bg-night/80 p-1 ${className}`}>
      {roleOptions.map((option) => {
        const active = activeRole === option.value;

        return (
          <button
            key={option.value}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              active ? "bg-coral text-night shadow-glow" : "text-ink/70 hover:bg-white/[0.04] hover:text-ink"
            }`}
            onClick={() => {
              selectRole(option.value);
              onSelect?.(option.value);
              if (actor?.role === option.value) {
                navigate(getRoleHomePath(option.value));
                return;
              }

              navigate(`/enter/${option.value}`);
            }}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
