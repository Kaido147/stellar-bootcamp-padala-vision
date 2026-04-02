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
    requestBuyerFundingTopUp: vi.fn(),
  },
}));

vi.mock("../hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("../lib/soroban", () => ({
  prepareContractInvocation: vi.fn(),
  submitPreparedTransaction: vi.fn(),
  toU64ScVal: vi.fn((value: bigint) => ({ type: "u64", value })),
  waitForTransactionFinality: vi.fn(),
}));

vi.mock("../lib/stellar", () => ({
  loadHorizonAccount: vi.fn(),
  prepareTrustlineTransaction: vi.fn(),
  submitClassicTransaction: vi.fn(),
}));

import { workflowApi } from "../lib/api";
import { useWallet } from "../hooks/useWallet";
import {
  prepareContractInvocation,
  submitPreparedTransaction,
  waitForTransactionFinality,
} from "../lib/soroban";
import { loadHorizonAccount } from "../lib/stellar";

describe("buyer workflow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useWallet).mockReturnValue({
      address: "GBUYER",
      networkMismatch: false,
      networkPassphrase: "Test Network",
      connectWallet: vi.fn().mockResolvedValue("GBUYER"),
      signTransaction: vi.fn().mockResolvedValue("SIGNED_XDR"),
    } as never);
    vi.mocked(loadHorizonAccount).mockResolvedValue({
      balances: [
        { asset_type: "native", balance: "10.0000000" },
        {
          asset_type: "credit_alphanum4",
          asset_code: "PUSD",
          asset_issuer: "GISSUER",
          balance: "125.0000000",
        },
      ],
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
          nextAction: "buyer_submitted_funding",
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
        chain: {
          contractId: "contract-1",
          onChainOrderId: "77",
          sellerWallet: "GSELLER",
          buyerWallet: "GBUYER",
          riderWallet: null,
          fundingStatus: "not_started",
          fundingTxHash: null,
          orderCreatedTxHash: "create-hash-1",
          lastChainReconciliationStatus: null,
          lastChainReconciledAt: null,
          lastChainError: null,
        },
      },
      timeline: [],
      availableActions: [],
      confirmationTokenActive: false,
    });
    vi.mocked(workflowApi.createBuyerFundingIntent).mockResolvedValue({
      orderId: "order-1",
      actionIntentId: "intent-1",
      actionType: "fund",
      method: "fund_order",
      contractId: "contract-1",
      tokenContractId: "token-1",
      tokenDecimals: 7,
      onChainOrderId: "77",
      buyerWallet: "GBUYER",
      fundingStatus: "not_started",
      existingFundingTxHash: null,
      rpcUrl: "https://rpc.example",
      networkPassphrase: "Test Network",
      token: {
        contractId: "token-1",
        symbol: "PUSD",
        name: "PUSD:GISSUER",
        decimals: 7,
        adminAddress: "GISSUER",
        assetCode: "PUSD",
        assetIssuer: "GISSUER",
        isStellarAssetContract: true,
        trustlineRequired: true,
      },
      setup: {
        demoTopUpAvailable: true,
        xlmFriendbotUrl: "https://friendbot.stellar.org/?addr=GBUYER",
      },
      args: {},
      replayKey: "replay-1",
    });
    vi.mocked(workflowApi.confirmBuyerFunding).mockResolvedValue({
      orderId: "order-1",
      status: "funded",
      txHash: "fund-hash-1",
      chainStatus: "confirmed",
    });
    vi.mocked(prepareContractInvocation).mockResolvedValue({
      toXDR: () => "PREPARED_XDR",
    } as never);
    vi.mocked(submitPreparedTransaction).mockResolvedValue({
      server: { getTransaction: vi.fn() },
      txHash: "fund-hash-1",
      sendStatus: "PENDING",
    } as never);
    vi.mocked(waitForTransactionFinality).mockResolvedValue({ status: "SUCCESS" } as never);

    render(
      <MemoryRouter initialEntries={["/buyer/orders/order-1/fund"]}>
        <Routes>
          <Route path="/buyer/orders/:id/fund" element={<BuyerFundPage />} />
          <Route path="/buyer/orders/:id" element={<div>buyer order detail</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByRole("heading", { name: "Funding Intent" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: /Fund with PUSD/i }));

    expect(await screen.findByText("buyer order detail")).toBeInTheDocument();
    expect(workflowApi.confirmBuyerFunding).toHaveBeenCalledWith(
      "order-1",
      expect.objectContaining({
        actionIntentId: "intent-1",
        txHash: "fund-hash-1",
        submittedWallet: "GBUYER",
      }),
    );
  });
});
