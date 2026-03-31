import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { Card } from "../components/Card";
import { useAuth } from "../providers/AuthProvider";

export function LoginPage() {
  const { configured, session, signIn, getDefaultPath } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (session) {
    return <Navigate replace to={(location.state as { from?: string } | null)?.from ?? getDefaultPath()} />;
  }

  return (
    <div className="min-h-screen bg-shell px-4 py-8">
      <div className="mx-auto max-w-md">
        <Card title="Login" subtitle="Supabase auth entry for protected Padala Vision routes.">
          {!configured ? (
            <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              Missing `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the frontend env. Login cannot work until those public Supabase client values are configured.
            </div>
          ) : null}
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              setError(null);
              void signIn(email, password)
                .catch((nextError) => {
                  setError(nextError instanceof Error ? nextError.message : "Unable to sign in.");
                })
                .finally(() => setBusy(false));
            }}
          >
            <label className="block text-sm font-semibold text-ink">
              Email
              <input
                className="mt-1 w-full rounded-2xl border border-ink/10 bg-sand/60 px-4 py-3"
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                value={email}
              />
            </label>
            <label className="block text-sm font-semibold text-ink">
              Password
              <input
                className="mt-1 w-full rounded-2xl border border-ink/10 bg-sand/60 px-4 py-3"
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                value={password}
              />
            </label>
            {error ? <div className="rounded-2xl bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
            <button
              className="w-full rounded-full bg-ink px-5 py-3 font-semibold text-white disabled:opacity-60"
              disabled={!configured || busy}
              type="submit"
            >
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
