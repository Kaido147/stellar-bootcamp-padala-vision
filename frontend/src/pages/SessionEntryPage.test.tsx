import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SessionEntryPage } from "./SessionEntryPage";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../providers/AppStateProvider", () => ({
  useAppState: vi.fn(),
}));

import { useAuth } from "../providers/AuthProvider";
import { useAppState } from "../providers/AppStateProvider";

describe("SessionEntryPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      actor: null,
      enterWorkflowSession: vi.fn().mockResolvedValue({
        actor: { id: "seller-1", role: "seller", status: "active", displayName: "Seller" },
        session: {
          id: "session-1",
          status: "active",
          issuedAt: "2026-03-31T00:00:00.000Z",
          expiresAt: "2026-03-31T12:00:00.000Z",
          lastSeenAt: "2026-03-31T00:00:00.000Z",
        },
        defaultRoute: "/seller",
      }),
    } as never);

    vi.mocked(useAppState).mockReturnValue({
      selectRole: vi.fn(),
    } as never);
  });

  it("enters a workspace and navigates to the role home route", async () => {
    render(
      <MemoryRouter initialEntries={["/enter/seller"]}>
        <Routes>
          <Route path="/enter/:role" element={<SessionEntryPage />} />
          <Route path="/seller" element={<div>seller workspace</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Workspace code/i), { target: { value: "SELL-123" } });
    fireEvent.change(screen.getByLabelText(/^PIN$/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Enter Seller workspace/i }));

    expect(await screen.findByText("seller workspace")).toBeInTheDocument();
    expect(vi.mocked(useAppState).mock.results[0]?.value.selectRole).toHaveBeenCalledWith("seller");
  });
});
