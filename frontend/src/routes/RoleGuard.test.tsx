import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RoleGuard } from "./RoleGuard";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { useAuth } from "../providers/AuthProvider";

describe("RoleGuard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated users to the workspace entry route", async () => {
    vi.mocked(useAuth).mockReturnValue({
      authReady: true,
      actor: null,
    } as never);

    render(
      <MemoryRouter initialEntries={["/seller"]}>
        <Routes>
          <Route
            path="/seller"
            element={
              <RoleGuard roles={["seller"]}>
                <div>seller workspace</div>
              </RoleGuard>
            }
          />
          <Route path="/enter/seller" element={<div>seller entry</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("seller entry")).toBeInTheDocument();
  });
});
