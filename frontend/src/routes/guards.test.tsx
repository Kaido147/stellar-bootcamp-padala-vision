import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleGuard } from "./RoleGuard";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../providers/AuthProvider";

describe("route guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to seller entry when no actor session exists", () => {
    vi.mocked(useAuth).mockReturnValue({
      authReady: true,
      actor: null,
    } as never);

    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/enter/seller" element={<div>seller entry</div>} />
          <Route
            path="/seller/orders/new"
            element={
              <RoleGuard roles={["seller"]}>
                <div>seller only</div>
              </RoleGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("seller entry")).toBeInTheDocument();
  });

  it("blocks users without the required role", () => {
    vi.mocked(useAuth).mockReturnValue({
      authReady: true,
      actor: { id: "buyer-1", role: "buyer", status: "active", displayName: "Buyer" },
    } as never);

    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/buyer" element={<div>buyer home</div>} />
          <Route
            path="/seller/orders/new"
            element={
              <RoleGuard roles={["seller"]}>
                <div>seller only</div>
              </RoleGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("buyer home")).toBeInTheDocument();
  });
});
