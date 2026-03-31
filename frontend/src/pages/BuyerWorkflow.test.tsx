import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BuyerHomePage } from "./BuyerHomePage";
import { BuyerFundPage } from "./BuyerFundPage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    listBuyerWorkflowOrders: vi.fn(),
    getBuyerWorkflowOrder: vi.fn(),
    createBuyerFundingIntent: vi.fn(),
    confirmBuyerFunding: vi.fn(),
  },
}));

vi.mock("../hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

import { workflowApi } from "../lib/api";
import { useWallet } from "../hooks/useWallet";

describe("buyer workflow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useWallet).mockReturnValue({
      address: "GBUYER",
    } as never);
  });

  it("renders workspace sections from the buyer workflow API", async () => {
    vi.mocked(workflowApi.listBuyerWorkflowOrders).mockResolvedValue({
      toFund: [
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
          lastEventType: "buyer_claimed",
          lastEventAt: "2026-03-31T00:00:00.000Z",
          dueAt: "2026-04-01T00:00:00.000Z",
          nextAction: "buyer_confirmed_funding",
          hasActiveDispute: false,
          requiresManualReview: false,
        },
      ],
      inProgress: [],
      needsYourConfirmation: [],
      closed: [],
    });

    render(
      <MemoryRouter>
        <BuyerHomePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("PV-ORDER1")).toBeInTheDocument();
    expect(screen.getByText("Needs Your Confirmation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Fund escrow/i })).toHaveAttribute("href", "/buyer/orders/order-1/fund");
  });

  it("prepares funding intent and confirms funding", async () => {
    vi.mocked(workflowApi.getBuyerWorkflowOrder).mockResolvedValue({
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
        lastEventType: "buyer_claimed",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        relation: "buyer_owner",
      },
      timeline: [],
      availableActions: [],
      confirmationTokenActive: false,
    });
    vi.mocked(workflowApi.createBuyerFundingIntent).mockResolvedValue({
      orderId: "order-1",
      actionType: "fund",
      method: "fund_order",
      contractId: "contract-1",
      rpcUrl: "https://rpc.example",
      networkPassphrase: "Test Network",
      args: {},
      replayKey: "replay-1",
    });
    vi.mocked(workflowApi.confirmBuyerFunding).mockResolvedValue({
      orderId: "order-1",
      status: "funded",
    });

    render(
      <MemoryRouter initialEntries={["/buyer/orders/order-1/fund"]}>
        <Routes>
          <Route path="/buyer/orders/:id/fund" element={<BuyerFundPage />} />
          <Route path="/buyer/orders/:id" element={<div>buyer order detail</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Funding Intent" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Record demo funding/i }));

    expect(await screen.findByText("buyer order detail")).toBeInTheDocument();
    expect(workflowApi.confirmBuyerFunding).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({ submittedWallet: "GBUYER" }),
    );
  });
});
