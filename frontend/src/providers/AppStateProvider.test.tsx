import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ROLE_STORAGE_KEY } from "../lib/roles";
import { AppStateProvider, useAppState } from "./AppStateProvider";

vi.mock("./AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "./AuthProvider";

function Probe() {
  const { selectedRole } = useAppState();
  return <div>{selectedRole ?? "none"}</div>;
}

describe("AppStateProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("prefers the actor session role over the stored preferred role", async () => {
    window.localStorage.setItem(ROLE_STORAGE_KEY, "buyer");
    vi.mocked(useAuth).mockReturnValue({
      actor: { id: "seller-1", role: "seller", status: "active", displayName: "Seller" },
    } as never);

    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );

    expect(screen.getByText("seller")).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(ROLE_STORAGE_KEY)).toBe("seller"));
  });

  it("falls back to the stored preferred role when no actor session exists", () => {
    window.localStorage.setItem(ROLE_STORAGE_KEY, "rider");
    vi.mocked(useAuth).mockReturnValue({
      actor: null,
    } as never);

    render(
      <AppStateProvider>
        <Probe />
      </AppStateProvider>,
    );

    expect(screen.getByText("rider")).toBeInTheDocument();
  });
});
