import type { PropsWithChildren } from "react";
import { Navigate } from "react-router-dom";
import type { AppRole } from "../lib/roles";
import { useAppState } from "../providers/AppStateProvider";

export function RoleGuard({
  children,
  roles,
}: PropsWithChildren<{ roles: AppRole[] }>) {
  const { selectedRole, getDefaultPath } = useAppState();
  const allowed = Boolean(selectedRole && roles.includes(selectedRole));

  if (!allowed) {
    return <Navigate replace to={selectedRole ? getDefaultPath() : "/"} />;
  }

  return <>{children}</>;
}
