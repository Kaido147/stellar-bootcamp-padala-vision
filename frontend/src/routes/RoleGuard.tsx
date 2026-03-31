import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import { getRoleHomePath, type AppRole } from "../lib/roles";
import { useAuth } from "../providers/AuthProvider";

export function RoleGuard({
  children,
  roles,
}: PropsWithChildren<{ roles: AppRole[] }>) {
  const { actor, authReady } = useAuth();

  if (!authReady) {
    return null;
  }

  const allowed = Boolean(actor && roles.includes(actor.role));

  if (!allowed) {
    if (actor) {
      return <Navigate replace to={getRoleHomePath(actor.role)} />;
    }

    return <Navigate replace to={`/enter/${roles[0]}`} />;
  }

  return <>{children}</>;
}
