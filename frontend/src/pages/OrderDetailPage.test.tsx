import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OrderDetailPage } from "./OrderDetailPage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    getSharedWorkflowOrder: vi.fn(),
  },
}));

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { workflowApi } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";

describe("OrderDetailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects shared detail links back into the seller workspace", async () => {
    vi.mocked(useAuth).mockReturnValue({
      actor: { id: "seller-1", role: "seller", status: "active", displayName: "Seller" },
      authReady: true,
    } as never);
    vi.mocked(workflowApi.getSharedWorkflowOrder).mockResolvedValue({
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
        buyer: { id: "buyer-1", role: "buyer", status: "active", displayName: "Buyer" },
        rider: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
        fundingDeadlineAt: "2026-04-01T00:00:00.000Z",
        buyerConfirmationDueAt: null,
        lastEventType: "buyer_invite_issued",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        relation: "seller_owner",
      },
      timeline: [],
      availableActions: [],
    });

    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route path="/orders/:id" element={<OrderDetailPage audience="timeline" />} />
          <Route path="/seller/orders/:id" element={<div>seller detail</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText("seller detail")).toBeInTheDocument();
  });

  it("shows a workspace re-entry message when no actor session exists", async () => {
    vi.mocked(useAuth).mockReturnValue({
      actor: null,
      authReady: true,
    } as never);
    vi.mocked(workflowApi.getSharedWorkflowOrder).mockResolvedValue({
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
        buyer: { id: "buyer-1", role: "buyer", status: "active", displayName: "Buyer" },
        rider: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
        fundingDeadlineAt: "2026-04-01T00:00:00.000Z",
        buyerConfirmationDueAt: null,
        lastEventType: "buyer_invite_issued",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        relation: "seller_owner",
      },
      timeline: [],
      availableActions: [],
    });

    render(
      <MemoryRouter initialEntries={["/orders/order-1"]}>
        <Routes>
          <Route path="/orders/:id" element={<OrderDetailPage audience="timeline" />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Shared order links are now a compatibility path/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Go to home/i })).toHaveAttribute("href", "/");
  });
});
