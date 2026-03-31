import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { Card } from "../components/Card";
import { ApiError } from "../lib/api";
import { useAppState } from "../providers/AppStateProvider";
import { useAuth } from "../providers/AuthProvider";

export function BuyerInviteClaimPage() {
  const navigate = useNavigate();
  const { token } = useParams();
  const { selectRole } = useAppState();
  const { claimBuyerInvite } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token) {
    return <Navigate replace to="/" />;
  }

  return (
    <div className="space-y-4">
      <Card title="Buyer Claim Link" subtitle="Claim this order, set your workspace PIN, and continue into the buyer workspace.">
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
          <form
            className="surface-card p-5"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              void claimBuyerInvite({
                token,
                pin,
                displayName: displayName.trim() || null,
              })
                .then((response) => {
                  selectRole("buyer");
                  navigate(`/buyer/orders/${response.order.orderId}`);
                })
                .catch((nextError) => {
                  setError(
                    nextError instanceof ApiError && nextError.code === "buyer_invite_invalid"
                      ? "This buyer invite is invalid or expired. Ask the seller or operator to issue a new invite link."
                      : nextError instanceof Error
                        ? nextError.message
                        : "Could not claim buyer access.",
                  );
                })
                .finally(() => setBusy(false));
            }}
          >
            <div className="section-kicker">Buyer invite</div>
            <h2 className="mt-3 font-display text-3xl text-ink">Open your buyer workspace</h2>
            <p className="mt-2 text-sm leading-6 text-ink/64">
              This one-time invite activates the buyer workspace for this order and lets you return later with your own workspace code and PIN.
            </p>

            <label className="mt-5 block text-sm font-semibold text-ink">
              Display name
              <input
                className="field-input"
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="How should we label you?"
                value={displayName}
              />
            </label>
            <label className="mt-4 block text-sm font-semibold text-ink">
              6-digit PIN
              <input
                className="field-input"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setPin(event.target.value)}
                placeholder="Create your confirmation PIN"
                type="password"
                value={pin}
              />
            </label>
            {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}
            <div className="mt-4">
              <button className="btn-primary" disabled={busy || pin.trim().length < 6} type="submit">
                {busy ? "Claiming..." : "Claim buyer access"}
              </button>
            </div>
          </form>

          <div className="surface-card p-5">
            <div className="section-kicker">What happens next</div>
            <div className="mt-3 space-y-3 text-sm leading-6 text-ink/66">
              <p>You will land in a database-backed buyer workspace instead of a one-off order page.</p>
              <p>Your PIN is also used later to approve or reject delivery from the scoped confirmation link.</p>
              <p>If this link expires or is lost, the seller or operator can reissue it.</p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
