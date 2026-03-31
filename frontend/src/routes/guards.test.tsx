import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { AuthGuard } from "./AuthGuard";
import { RoleGuard } from "./RoleGuard";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../providers/AuthProvider";

describe("route guards", () => {
  it("redirects unauthenticated users from auth guard", () => {
    vi.mocked(useAuth).mockReturnValue({
      loading: false,
      session: null,
      roles: [],
      getDefaultPath: () => "/settings/network",
    } as never);

    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route
            path="/seller/orders/new"
            element={
              <AuthGuard>
                <div>secret</div>
              </AuthGuard>
            }
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText("login page")).toBeInTheDocument();
  });

  it("blocks users without the required role", () => {
    vi.mocked(useAuth).mockReturnValue({
      roles: ["buyer"],
      getDefaultPath: () => "/settings/network",
    } as never);

    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/settings/network" element={<div>settings page</div>} />
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

    expect(screen.getByText("settings page")).toBeInTheDocument();
  });
});
