import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "./AuthProvider";

vi.mock("../lib/api", () => ({
  WORKFLOW_SESSION_INVALID_EVENT: "padala:workflow-session-invalid",
  workflowApi: {
    getWorkflowSession: vi.fn(),
    enterWorkflowSession: vi.fn(),
    claimBuyerInvite: vi.fn(),
    logoutWorkflowSession: vi.fn(),
  },
}));

import { workflowApi, WORKFLOW_SESSION_INVALID_EVENT } from "../lib/api";

function Probe() {
  const { actor, authError, authReady } = useAuth();
  return (
    <div>
      <div>{authReady ? "ready" : "loading"}</div>
      <div>{actor?.role ?? "no-actor"}</div>
      <div>{authError ?? "no-error"}</div>
    </div>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("clears the session when the workflow session invalidation event fires", async () => {
    vi.mocked(workflowApi.getWorkflowSession).mockResolvedValue({
      session: {
        actor: { id: "seller-1", role: "seller", status: "active", displayName: "Seller" },
        session: {
          id: "session-1",
          status: "active",
          issuedAt: "2026-03-31T00:00:00.000Z",
          expiresAt: "2026-03-31T12:00:00.000Z",
          lastSeenAt: "2026-03-31T00:00:00.000Z",
        },
        defaultRoute: "/seller",
      },
    });

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    expect(await screen.findByText("seller")).toBeInTheDocument();

    window.dispatchEvent(
      new CustomEvent(WORKFLOW_SESSION_INVALID_EVENT, {
        detail: {
          message: "Invalid or expired actor session",
        },
      }),
    );

    await waitFor(() => expect(screen.getByText("no-actor")).toBeInTheDocument());
    expect(screen.getByText("Invalid or expired actor session")).toBeInTheDocument();
  });
});
