import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import type { AuthRole } from "../lib/auth";
import { useAuth } from "../providers/AuthProvider";

export function RoleGuard({
  children,
  roles,
}: PropsWithChildren<{ roles: AuthRole[] }>) {
  const { roles: userRoles, getDefaultPath } = useAuth();
  const allowed = roles.some((role) => userRoles.includes(role));

  if (!allowed) {
    return <Navigate replace to={getDefaultPath()} />;
  }

  return <>{children}</>;
}
