import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../providers/AppStateProvider", () => ({
  useAppState: vi.fn(),
}));

vi.mock("../hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

import { useAuth } from "../providers/AuthProvider";
import { useAppState } from "../providers/AppStateProvider";
import { useWallet } from "../hooks/useWallet";

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useWallet).mockReturnValue({
      address: null,
      networkMismatch: false,
    } as never);
  });

  it("logs out and clears the selected role", () => {
    const clearRole = vi.fn();
    const logoutWorkflowSession = vi.fn();

    vi.mocked(useAuth).mockReturnValue({
      actor: { id: "seller-1", role: "seller", status: "active", displayName: "Seller" },
      logoutWorkflowSession,
    } as never);
    vi.mocked(useAppState).mockReturnValue({
      selectedRole: "seller",
      clearRole,
    } as never);

    render(
      <MemoryRouter initialEntries={["/seller"]}>
        <Routes>
          <Route path="/" element={<AppLayout />}>
            <Route path="seller" element={<div>seller page</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Log out/i }));

    expect(clearRole).toHaveBeenCalled();
    expect(logoutWorkflowSession).toHaveBeenCalled();
  });
});
