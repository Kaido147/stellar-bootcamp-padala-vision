import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { useWallet } from "../hooks/useWallet";
import { NetworkMismatchBanner } from "./NetworkMismatchBanner";
import { WalletStatusBanner } from "./WalletStatusBanner";

const navItems = [
  { to: "/seller/orders/new", label: "Seller" },
  { to: "/rider/jobs", label: "Rider" },
  { to: "/operator/reviews", label: "Ops" },
  { to: "/settings/network", label: "Settings" },
];

export function AppLayout() {
  const { user, signOutUser } = useAuth();
  const wallet = useWallet();

  return (
    <div className="min-h-screen bg-shell">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-5 sm:px-6">
        <header className="rounded-[2rem] border border-white/70 bg-white/85 p-5 shadow-card backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="inline-flex rounded-full bg-ink px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.28em] text-white">
                Padala Vision
              </div>
              <h1 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
                Escrow, delivery evidence, and chain-backed release.
              </h1>
              <p className="mt-2 max-w-3xl text-sm text-ink/70">
                Backend workflow and on-chain state stay frozen and authoritative. This frontend now routes the real role flows around them.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 rounded-3xl border border-ink/10 bg-sand/60 p-4 text-sm text-ink/75">
              <div>{user?.email ?? user?.phone ?? "Authenticated user"}</div>
              <button
                className="rounded-full border border-ink/15 px-4 py-2 font-semibold text-ink transition hover:bg-ink hover:text-white"
                onClick={() => void signOutUser()}
                type="button"
              >
                Sign out
              </button>
            </div>
          </div>
        </header>

        <div className="mt-4 grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <aside className="rounded-[2rem] border border-white/70 bg-white/85 p-4 shadow-card backdrop-blur">
            <nav className="space-y-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `block rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                      isActive ? "bg-ink text-white" : "bg-sand/60 text-ink hover:bg-sand"
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
