export type AppRole = "seller" | "buyer" | "rider" | "operator";

export const ROLE_STORAGE_KEY = "padala-selected-role";

export const roleOptions = [
  {
    value: "seller",
    label: "Seller",
    eyebrow: "Create protected orders",
    description: "Launch escrow-backed orders, share funding links, and watch delivery move from funding to release.",
    homePath: "/seller/orders/new",
  },
  {
    value: "rider",
    label: "Rider",
    eyebrow: "Complete verified delivery",
    description: "Accept funded jobs, update delivery state, and upload proof that reduces payout disputes.",
    homePath: "/rider/jobs",
  },
  {
    value: "buyer",
    label: "Buyer",
    eyebrow: "Track funded orders",
    description: "Open an order, review escrow state, and follow proof, approval, release, or dispute outcomes.",
    homePath: "/buyer",
  },
] as const satisfies Array<{
  value: Extract<AppRole, "seller" | "buyer" | "rider">;
  label: string;
  eyebrow: string;
  description: string;
  homePath: string;
}>;

export function isAppRole(value: unknown): value is AppRole {
  return value === "seller" || value === "buyer" || value === "rider" || value === "operator";
}

export function getRoleHomePath(role: AppRole | null) {
  switch (role) {
    case "seller":
      return "/seller/orders/new";
    case "buyer":
      return "/buyer";
    case "rider":
      return "/rider/jobs";
    case "operator":
      return "/operator/reviews";
    default:
      return "/";
  }
}

export function getRoleLabel(role: AppRole | null) {
  return roleOptions.find((option) => option.value === role)?.label ?? "Workspace";
}

export function readStoredRole() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(ROLE_STORAGE_KEY);
    return isAppRole(raw) ? raw : null;
  } catch {
    return null;
  }
}
