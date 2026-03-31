import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { readStoredRole, ROLE_STORAGE_KEY, type AppRole } from "../lib/roles";
import { useAuth } from "./AuthProvider";

interface WalletBindingCache {
  wallet_address: string;
  wallet_provider: string;
  bound_at: string;
  status: "active" | "revoked";
}

interface AppStateContextValue {
  selectedRole: AppRole | null;
  roles: AppRole[];
  walletBinding: WalletBindingCache | null;
  selectRole: (role: AppRole) => void;
  clearRole: () => void;
  rememberWalletBinding: (binding: WalletBindingCache) => void;
  clearWalletBinding: () => void;
}

const AppStateContext = createContext<AppStateContextValue | null>(null);
const WALLET_STORAGE_KEY = "padala-wallet-binding";

function readWalletBinding() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(WALLET_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as WalletBindingCache) : null;
  } catch {
    return null;
  }
}

export function AppStateProvider({ children }: PropsWithChildren) {
  const { actor } = useAuth();
  const [preferredRole, setPreferredRole] = useState<AppRole | null>(() => readStoredRole());
  const [walletBinding, setWalletBinding] = useState<WalletBindingCache | null>(() => readWalletBinding());

  useEffect(() => {
    if (!actor?.role) {
      return;
    }

    setPreferredRole((current) => (current === actor.role ? current : actor.role));
    window.localStorage.setItem(ROLE_STORAGE_KEY, actor.role);
  }, [actor?.role]);

  const selectedRole = actor?.role ?? preferredRole;

  const value = useMemo<AppStateContextValue>(
    () => ({
      selectedRole,
      roles: selectedRole ? [selectedRole] : [],
      walletBinding,
      selectRole: (role) => {
        setPreferredRole(role);
        window.localStorage.setItem(ROLE_STORAGE_KEY, role);
      },
      clearRole: () => {
        setPreferredRole(null);
        window.localStorage.removeItem(ROLE_STORAGE_KEY);
      },
      rememberWalletBinding: (binding) => {
        setWalletBinding(binding);
        window.localStorage.setItem(WALLET_STORAGE_KEY, JSON.stringify(binding));
      },
      clearWalletBinding: () => {
        setWalletBinding(null);
        window.localStorage.removeItem(WALLET_STORAGE_KEY);
      },
    }),
    [selectedRole, walletBinding],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error("useAppState must be used inside AppStateProvider");
  }

  return context;
}
