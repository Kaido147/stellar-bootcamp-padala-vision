import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SellerWorkspacePage } from "./SellerWorkspacePage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    listSellerWorkflowOrders: vi.fn(),
  },
}));

import { workflowApi } from "../lib/api";

describe("SellerWorkspacePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads seller workspace sections from the workflow API", async () => {
    vi.mocked(workflowApi.listSellerWorkflowOrders).mockResolvedValue({
      needsFunding: [
        {
          orderId: "order-1",
          orderCode: "PV-ORDER1",
          status: "awaiting_funding",
          sellerDisplayName: "Seller",
          buyerDisplayName: "Buyer",
          riderDisplayName: null,
          itemAmount: "100.00",
          deliveryFee: "25.00",
          totalAmount: "125.00",
          lastEventType: "buyer_invite_issued",
          lastEventAt: "2026-03-31T00:00:00.000Z",
          dueAt: "2026-04-01T00:00:00.000Z",
          nextAction: "seller_cancelled_order",
          hasActiveDispute: false,
          requiresManualReview: false,
        },
      ],
      activeDelivery: [],
      awaitingBuyerConfirmation: [],
      needsAttention: [],
      closed: [],
    });

    render(
      <MemoryRouter>
        <SellerWorkspacePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("PV-ORDER1")).toBeInTheDocument();
    expect(screen.getByText("Needs Funding")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Create Order/i })).toHaveAttribute("href", "/seller/orders/new");
  });
});
