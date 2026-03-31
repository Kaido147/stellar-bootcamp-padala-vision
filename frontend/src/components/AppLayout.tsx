import { Link, NavLink, Outlet } from "react-router-dom";
import { useWallet } from "../hooks/useWallet";
import { getRoleLabel, roleOptions } from "../lib/roles";
import { useAppState } from "../providers/AppStateProvider";
import { NetworkMismatchBanner } from "./NetworkMismatchBanner";
import { RoleSwitcher } from "./RoleSwitcher";
import { WalletStatusBanner } from "./WalletStatusBanner";

export function AppLayout() {
  const { selectedRole, clearRole } = useAppState();
  const wallet = useWallet();
  const selectedRoleOption = roleOptions.find((option) => option.value === selectedRole);
  const navItems = [
    selectedRoleOption
      ? { to: selectedRoleOption.homePath, label: `${selectedRoleOption.label} workspace` }
      : null,
    { to: "/bind-wallet", label: "Wallet binding" },
    { to: "/settings/network", label: "Network" },
  ].filter((item): item is { to: string; label: string } => Boolean(item));

  return (
    <div className="min-h-screen bg-shell px-4 py-5 sm:px-6">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col">
        <header className="surface-panel relative overflow-hidden p-5 sm:p-6">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-coral/60 to-transparent" />
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="max-w-3xl">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="section-kicker">Padala Vision</div>
                  <Link className="text-sm font-semibold text-ink/65 hover:text-ink" to="/">
                    Back to home
                  </Link>
                </div>
                <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
                  {selectedRole ? `${getRoleLabel(selectedRole)} workspace` : "Verified delivery escrow workspace"}
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/65">
                  Enter directly by role, move through the real order routes, and only connect a wallet when the flow actually needs a chain or wallet-bound action.
                </p>
              </div>

              <div className="flex flex-col items-start gap-4 xl:items-end">
                <RoleSwitcher />
                <div className="flex flex-wrap items-center gap-3 text-sm text-ink/62">
                  <div className="rounded-full border border-line bg-night/85 px-4 py-2">
                    {selectedRole ? `Current role: ${getRoleLabel(selectedRole)}` : "Choose a role at any time"}
                  </div>
                  {selectedRole ? (
                    <button className="btn-secondary px-4 py-2" onClick={() => clearRole()} type="button">
                      Clear role
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="surface-card p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Role mode</div>
                <div className="mt-2 text-sm text-ink/82">
                  {selectedRoleOption?.description ?? "No role is locked yet. Pick Seller, Rider, or Buyer to personalize access."}
                </div>
              </div>
              <div className="surface-card p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Wallet readiness</div>
                <div className="mt-2 text-sm text-ink/82">
                  {wallet.address ? "Wallet connected and ready for chain-bound steps." : "Browse freely now, then connect only when an action requires it."}
                </div>
              </div>
              <div className="surface-card p-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-ink/45">Workflow promise</div>
                <div className="mt-2 text-sm text-ink/82">
                  Escrow, proof, review, disputes, and release stay visible as one order timeline.
                </div>
              </div>
            </div>
          </div>
        </header>

        <div className="mt-4 grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="surface-panel p-4">
            <nav className="space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isActive
                        ? "bg-coral text-night shadow-glow"
                        : "border border-line bg-white/[0.02] text-ink/75 hover:border-coral/30 hover:bg-white/[0.05] hover:text-ink"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <div className="mt-4 space-y-3">
              <WalletStatusBanner />
              {wallet.networkMismatch ? <NetworkMismatchBanner /> : null}
            </div>
          </aside>

          <main className="space-y-4">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
