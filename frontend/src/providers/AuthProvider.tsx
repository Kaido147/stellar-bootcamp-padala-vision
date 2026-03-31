import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type {
  BuyerClaimInviteRequest,
  BuyerClaimInviteResponse,
  EnterWorkspaceSessionRequest,
  EnterWorkspaceSessionResponse,
  SessionView,
} from "@padala-vision/shared";
import { workflowApi, WORKFLOW_SESSION_INVALID_EVENT } from "../lib/api";

interface AuthContextValue {
  authReady: boolean;
  authError: string | null;
  session: SessionView | null;
  actor: SessionView["actor"] | null;
  refreshSession: () => Promise<SessionView | null>;
  enterWorkflowSession: (payload: EnterWorkspaceSessionRequest) => Promise<EnterWorkspaceSessionResponse>;
  claimBuyerInvite: (payload: BuyerClaimInviteRequest) => Promise<BuyerClaimInviteResponse>;
  logoutWorkflowSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: PropsWithChildren) {
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionView | null>(null);

  useEffect(() => {
    void refreshSession();
  }, []);

  useEffect(() => {
    function handleInvalidSession(event: Event) {
      const detail =
        event instanceof CustomEvent && typeof event.detail?.message === "string"
          ? event.detail.message
          : "Your workspace session is no longer active. Re-enter your workspace to continue.";

      setSession(null);
      setAuthError(detail);
      setAuthReady(true);
    }

    window.addEventListener(WORKFLOW_SESSION_INVALID_EVENT, handleInvalidSession);
    return () => window.removeEventListener(WORKFLOW_SESSION_INVALID_EVENT, handleInvalidSession);
  }, []);

  async function refreshSession() {
    try {
      const response = await workflowApi.getWorkflowSession();
      setSession(response.session);
      setAuthError(null);
      setAuthReady(true);
      return response.session;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Failed to load session.");
      setSession(null);
      setAuthReady(true);
      return null;
    }
  }

  async function enterWorkflowSession(payload: EnterWorkspaceSessionRequest) {
    const nextSession = await workflowApi.enterWorkflowSession(payload);
    setSession(nextSession);
    setAuthError(null);
    setAuthReady(true);
    return nextSession;
  }

  async function claimBuyerInvite(payload: BuyerClaimInviteRequest) {
    const nextSession = await workflowApi.claimBuyerInvite(payload);
    setSession(nextSession);
    setAuthError(null);
    setAuthReady(true);
    return nextSession;
  }

  async function logoutWorkflowSession() {
    await workflowApi.logoutWorkflowSession();
    setSession(null);
    setAuthError(null);
    setAuthReady(true);
  }

  return (
    <AuthContext.Provider
      value={{
        authReady,
        authError,
        session,
        actor: session?.actor ?? null,
        refreshSession,
        enterWorkflowSession,
        claimBuyerInvite,
        logoutWorkflowSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}
