import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import type { AppRole } from "../lib/roles";
import { Card } from "../components/Card";
import { roleOptions } from "../lib/roles";
import { useAppState } from "../providers/AppStateProvider";
import { useAuth } from "../providers/AuthProvider";

function isEntryRole(value: string | undefined): value is AppRole {
  return value === "seller" || value === "buyer" || value === "rider" || value === "operator";
}

export function SessionEntryPage() {
  const navigate = useNavigate();
  const { role } = useParams();
  const { selectRole } = useAppState();
  const { actor, enterWorkflowSession } = useAuth();
  const [workspaceCode, setWorkspaceCode] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isEntryRole(role)) {
    return <Navigate replace to="/" />;
  }

  const roleOption = roleOptions.find((option) => option.value === role);
  if (!roleOption) {
    return <Navigate replace to="/" />;
  }

  if (actor?.role === role) {
    return <Navigate replace to={roleOption.homePath} />;
  }

  return (
    <div className="space-y-4">
      <Card title={`${roleOption.label} Entry`} subtitle={`Use your workspace code and PIN to reopen the ${roleOption.label.toLowerCase()} workspace.`}>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <form
            className="surface-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              void enterWorkflowSession({
                role,
                workspaceCode,
                pin,
              })
                .then((session) => {
                  selectRole(session.actor.role);
                  navigate(session.defaultRoute);
                })
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : "Could not enter workspace.");
                })
                .finally(() => setBusy(false));
            }}
          >
            <div className="section-kicker">{roleOption.eyebrow}</div>
            <h2 className="mt-3 font-display text-3xl text-ink">{roleOption.label} workspace access</h2>
            <p className="mt-2 text-sm leading-6 text-ink/64">
              Workspace sessions are database-backed and recoverable. You do not need to remember an order ID to continue.
            </p>

            <label className="mt-5 block text-sm font-semibold text-ink">
              Workspace code
              <input
                className="field-input"
                onChange={(event) => setWorkspaceCode(event.target.value)}
                placeholder="Enter your workspace code"
                value={workspaceCode}
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-ink">
              PIN
              <input
                className="field-input"
                inputMode="numeric"
                onChange={(event) => setPin(event.target.value)}
                placeholder="Enter your PIN"
                type="password"
                value={pin}
              />
            </label>
            {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <button className="btn-primary" disabled={busy || !workspaceCode.trim() || !pin.trim()} type="submit">
                {busy ? "Entering..." : `Enter ${roleOption.label} workspace`}
              </button>
            </div>
          </form>

          <div className="surface-card p-5">
            <div className="section-kicker">Demo-safe access</div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-ink/66">
              <p>Workspaces recover from the database, not from this browser alone.</p>
              <p>Sellers create orders and issue buyer claim links. Riders and operators reopen their own dashboards directly with workspace credentials.</p>
              <p>Buyers who received a seller invite should use the claim link first, then return here later for repeat access.</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
