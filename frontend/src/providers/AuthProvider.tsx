import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  getAuthRoles,
  getInitialSession,
  getPrimaryRole,
  getRoleHomePath,
  getSupabaseClient,
  isSupabaseConfigured,
  signInWithPassword,
  signOut,
  type AuthRole,
} from "../lib/auth";

interface WalletBindingCache {
  wallet_address: string;
  wallet_provider: string;
  bound_at: string;
  status: "active" | "revoked";
}

interface AuthContextValue {
  configured: boolean;
  loading: boolean;
  session: Session | null;
  user: User | null;
  roles: AuthRole[];
  primaryRole: AuthRole | null;
  walletBinding: WalletBindingCache | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOutUser: () => Promise<void>;
  rememberWalletBinding: (binding: WalletBindingCache) => void;
  clearWalletBinding: () => void;
  getDefaultPath: () => string;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const STORAGE_KEY = "padala-wallet-binding";

export function AuthProvider({ children }: PropsWithChildren) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [walletBinding, setWalletBinding] = useState<WalletBindingCache | null>(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as WalletBindingCache) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    let mounted = true;
    const supabase = getSupabaseClient();

    void getInitialSession().then((data) => {
      if (!mounted) {
        return;
      }
      setSession(data.session);
      setUser(data.user);
      setLoading(false);
    });

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured: isSupabaseConfigured(),
      loading,
      session,
      user,
      roles: getAuthRoles(user),
      primaryRole: getPrimaryRole(user),
      walletBinding,
      signIn: (email, password) => signInWithPassword(email, password),
      signOutUser: async () => {
        await signOut();
        setWalletBinding(null);
        window.localStorage.removeItem(STORAGE_KEY);
      },
      rememberWalletBinding: (binding) => {
        setWalletBinding(binding);
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(binding));
      },
      clearWalletBinding: () => {
        setWalletBinding(null);
        window.localStorage.removeItem(STORAGE_KEY);
      },
      getDefaultPath: () => getRoleHomePath(getPrimaryRole(user)),
    }),
    [loading, session, user, walletBinding],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
