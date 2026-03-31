import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SellerNewOrderPage } from "./SellerNewOrderPage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    createSellerWorkflowOrder: vi.fn(),
  },
}));

import { workflowApi } from "../lib/api";

describe("SellerNewOrderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a workflow order and shows the buyer claim link", async () => {
    vi.mocked(workflowApi.createSellerWorkflowOrder).mockResolvedValue({
      order: {
        orderId: "order-1",
        orderCode: "PV-ORDER1",
        status: "awaiting_funding",
        itemDescription: "Parcel",
        pickupLabel: "Pickup",
        dropoffLabel: "Dropoff",
        itemAmount: "100.00",
        deliveryFee: "25.00",
        totalAmount: "125.00",
        seller: { id: "seller-1", role: "seller", status: "active", displayName: "Seller" },
        buyer: { id: "buyer-1", role: "buyer", status: "pending_claim", displayName: "Buyer" },
        rider: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
        fundingDeadlineAt: "2026-04-01T00:00:00.000Z",
        buyerConfirmationDueAt: null,
        lastEventType: "buyer_invite_issued",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        relation: "seller_owner",
      },
      buyerInvite: {
        type: "buyer_invite",
        token: "invite-token-123",
        expiresAt: "2026-04-07T00:00:00.000Z",
        oneTimeUse: true,
      },
    });

    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/seller/orders/new" element={<SellerNewOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText(/Buyer display name/i), { target: { value: "Buyer" } });
    fireEvent.change(screen.getByLabelText(/Item description/i), { target: { value: "Parcel" } });
    fireEvent.change(screen.getByLabelText(/Pickup label/i), { target: { value: "Pickup" } });
    fireEvent.change(screen.getByLabelText(/Dropoff label/i), { target: { value: "Dropoff" } });
    fireEvent.click(screen.getByRole("button", { name: /Create order/i }));

    expect(await screen.findByDisplayValue(/buyer\/claim\/invite-token-123/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open seller detail/i })).toHaveAttribute("href", "/seller/orders/order-1");
  });
});
