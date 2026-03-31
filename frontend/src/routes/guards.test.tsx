import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RoleGuard } from "./RoleGuard";

vi.mock("../providers/AppStateProvider", () => ({
  useAppState: vi.fn(),
}));

import { useAppState } from "../providers/AppStateProvider";

describe("route guards", () => {
  it("redirects to landing when no role is selected", () => {
    vi.mocked(useAppState).mockReturnValue({
      selectedRole: null,
      getDefaultPath: () => "/",
    } as never);

    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/" element={<div>landing page</div>} />
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

    expect(screen.getByText("landing page")).toBeInTheDocument();
  });

  it("blocks users without the required role", () => {
    vi.mocked(useAppState).mockReturnValue({
      selectedRole: "buyer",
      getDefaultPath: () => "/buyer",
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
