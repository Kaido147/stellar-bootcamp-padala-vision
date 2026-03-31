import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";

export function AuthGuard({ children }: PropsWithChildren) {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-ink/70">Loading session...</div>;
  }

  if (!session) {
    return <Navigate replace to="/login" state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
