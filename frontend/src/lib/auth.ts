import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!client) {
    client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return client;
}

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export async function getSupabaseAccessToken() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export type AuthRole = "seller" | "buyer" | "rider" | "operator";

export function getAuthRoles(user: User | null): AuthRole[] {
  const values = Array.isArray(user?.app_metadata?.roles)
    ? user.app_metadata.roles.filter((value): value is string => typeof value === "string")
    : [];

  const roles: AuthRole[] = [];
  if (values.includes("seller")) {
    roles.push("seller");
  }
  if (values.includes("buyer")) {
    roles.push("buyer");
  }
  if (values.includes("rider")) {
    roles.push("rider");
  }
  if (values.includes("ops_reviewer") || values.includes("ops_admin")) {
    roles.push("operator");
  }
  return roles;
}

export function getPrimaryRole(user: User | null): AuthRole | null {
  return getAuthRoles(user)[0] ?? null;
}

export function getRoleHomePath(role: AuthRole | null) {
  switch (role) {
    case "seller":
      return "/seller/orders/new";
    case "buyer":
      return "/settings/network";
    case "rider":
      return "/rider/jobs";
    case "operator":
      return "/operator/reviews";
    default:
      return "/settings/network";
  }
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client env is missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw new Error(error.message);
  }
}

export async function signOut() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return;
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw new Error(error.message);
  }
}

export async function getInitialSession() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return {
      session: null,
      user: null,
    } as {
      session: Session | null;
      user: User | null;
    };
  }

  const { data } = await supabase.auth.getSession();
  return {
    session: data.session,
    user: data.session?.user ?? null,
  };
}
