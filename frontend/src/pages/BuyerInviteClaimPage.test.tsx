import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../lib/api";
import { BuyerInviteClaimPage } from "./BuyerInviteClaimPage";

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../providers/AppStateProvider", () => ({
  useAppState: vi.fn(),
}));

import { useAuth } from "../providers/AuthProvider";
import { useAppState } from "../providers/AppStateProvider";

describe("BuyerInviteClaimPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      claimBuyerInvite: vi.fn(),
    } as never);

    vi.mocked(useAppState).mockReturnValue({
      selectRole: vi.fn(),
    } as never);
  });

  it("shows a clear expired-invite message", async () => {
    vi.mocked(useAuth).mockReturnValue({
      claimBuyerInvite: vi.fn().mockRejectedValue(new ApiError("Buyer invite token is invalid or expired", 401, "buyer_invite_invalid")),
    } as never);

    render(
      <MemoryRouter initialEntries={["/buyer/claim/invite-1"]}>
        <Routes>
          <Route path="/buyer/claim/:token" element={<BuyerInviteClaimPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/6-digit PIN/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Claim buyer access/i }));

    expect(
      await screen.findByText(/This buyer invite is invalid or expired\. Ask the seller or operator to issue a new invite link\./i),
    ).toBeInTheDocument();
  });
});
