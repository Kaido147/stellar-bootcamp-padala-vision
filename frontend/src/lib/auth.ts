import { createClient, type Session, type SupabaseClient, type User } from "@supabase/supabase-js";

interface AuthState {
  authReady: boolean;
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  authError: string | null;
}

const DEV_AUTH_CONTEXT = "Dev auth bootstrap";

let supabaseClient: SupabaseClient | null = null;
let authBootstrapPromise: Promise<void> | null = null;
let authListenerRegistered = false;

let authState: AuthState = {
  authReady: false,
  session: null,
  user: null,
  accessToken: null,
  authError: null,
};

const listeners = new Set<() => void>();

function readSupabaseUrl() {
  return import.meta.env.VITE_SUPABASE_URL?.trim() || null;
}

function readSupabaseKey() {
  return (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    null
  );
}

function readDevEmail() {
  return import.meta.env.VITE_DEV_AUTH_EMAIL?.trim() || null;
}

function readDevPassword() {
  return import.meta.env.VITE_DEV_AUTH_PASSWORD?.trim() || null;
}

function describeAuthError(message: string) {
  return `${DEV_AUTH_CONTEXT} failed: ${message}`;
}

function emitAuthState() {
  for (const listener of listeners) {
    listener();
  }
}

function setAuthState(nextState: Partial<AuthState>) {
  authState = {
    ...authState,
    ...nextState,
  };
  emitAuthState();
}

function applySession(session: Session | null, authError: string | null = null) {
  setAuthState({
    authReady: true,
    session,
    user: session?.user ?? null,
    accessToken: session?.access_token ?? null,
    authError,
  });
}

function getSupabaseClient() {
  if (supabaseClient) {
    return supabaseClient;
  }

  const url = readSupabaseUrl();
  const key = readSupabaseKey();

  if (!url) {
    throw new Error("missing Supabase URL. Set VITE_SUPABASE_URL.");
  }

  if (!key) {
    throw new Error(
      "missing Supabase public key. Set VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY.",
    );
  }

  supabaseClient = createClient(url, key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return supabaseClient;
}

function ensureAuthListener() {
  if (authListenerRegistered) {
    return;
  }

  const client = getSupabaseClient();
  client.auth.onAuthStateChange((_event, session) => {
    applySession(session, null);
  });
  authListenerRegistered = true;
}

async function signInWithDevCredentials(client: SupabaseClient) {
  const email = readDevEmail();
  const password = readDevPassword();

  if (!email || !password) {
    throw new Error(
      "missing dev credentials. Set VITE_DEV_AUTH_EMAIL and VITE_DEV_AUTH_PASSWORD for hidden local auth.",
    );
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`bad credentials or Supabase unreachable: ${error.message}`);
  }

  return data.session ?? null;
}

export async function initializeAuthBootstrap() {
  if (authBootstrapPromise) {
    return authBootstrapPromise;
  }

  authBootstrapPromise = (async () => {
    try {
      const client = getSupabaseClient();
      ensureAuthListener();

      const {
        data: { session },
        error,
      } = await client.auth.getSession();

      if (error) {
        throw new Error(`could not read current session: ${error.message}`);
      }

      if (session) {
        applySession(session, null);
        return;
      }

      const nextSession = await signInWithDevCredentials(client);
      applySession(nextSession, null);
    } catch (error) {
      applySession(null, describeAuthError(error instanceof Error ? error.message : "unknown error"));
    }
  })();

  return authBootstrapPromise;
}

export function subscribeToAuthState(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getAuthState() {
  return authState;
}

export async function waitForAuthBootstrap() {
  await initializeAuthBootstrap();
  return getAuthState();
}

export function getAccessToken() {
  return authState.accessToken;
}

export function getSupabaseAuthClient() {
  return getSupabaseClient();
}
