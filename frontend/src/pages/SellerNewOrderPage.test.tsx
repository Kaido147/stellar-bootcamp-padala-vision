import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SellerNewOrderPage } from "./SellerNewOrderPage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    createSellerWorkflowOrderIntent: vi.fn(),
    createSellerWorkflowOrder: vi.fn(),
  },
}));

vi.mock("../hooks/useWallet", () => ({
  useWallet: vi.fn(),
}));

vi.mock("../lib/soroban", () => ({
  prepareContractInvocation: vi.fn(),
  readTokenDecimals: vi.fn(),
  submitPreparedTransaction: vi.fn(),
  toAddressScVal: vi.fn((value: string) => ({ type: "address", value })),
  toI128ScVal: vi.fn((value: bigint) => ({ type: "i128", value })),
  toU64ScVal: vi.fn((value: bigint) => ({ type: "u64", value })),
  waitForTransactionFinality: vi.fn(),
}));

import { workflowApi } from "../lib/api";
import { useWallet } from "../hooks/useWallet";
import {
  prepareContractInvocation,
  readTokenDecimals,
  submitPreparedTransaction,
  waitForTransactionFinality,
} from "../lib/soroban";

describe("SellerNewOrderPage", () => {
  function mockCreateOrderApis() {
    vi.mocked(workflowApi.createSellerWorkflowOrderIntent).mockResolvedValue({
      actionType: "create_order",
      method: "create_order",
      contractId: "contract-1",
      tokenContractId: "token-1",
      rpcUrl: "https://rpc.example",
      networkPassphrase: "Test Network",
      tokenDecimals: 7,
      args: {
        seller_wallet: "GSELLER",
        buyer_wallet: "GBUYER",
        item_amount: "1000000000",
        delivery_fee: "250000000",
        expires_at: "1777777777",
      },
    });
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
    vi.mocked(readTokenDecimals).mockResolvedValue(7);
    vi.mocked(prepareContractInvocation).mockResolvedValue({
      toXDR: () => "PREPARED_XDR",
    } as never);
    vi.mocked(submitPreparedTransaction).mockResolvedValue({
      server: { getTransaction: vi.fn() },
      txHash: "create-hash-1",
      sendStatus: "PENDING",
    } as never);
    vi.mocked(waitForTransactionFinality).mockResolvedValue({ status: "SUCCESS" } as never);
  }

  function fillRequiredFields() {
    fireEvent.change(screen.getByLabelText(/Buyer display name/i), { target: { value: "Buyer" } });
    fireEvent.change(screen.getByLabelText(/Buyer wallet/i), { target: { value: "GBUYER" } });
    fireEvent.change(screen.getByLabelText(/Item description/i), { target: { value: "Parcel" } });
    fireEvent.change(screen.getByLabelText(/Pickup label/i), { target: { value: "Pickup" } });
    fireEvent.change(screen.getByLabelText(/Dropoff label/i), { target: { value: "Dropoff" } });
  }

  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();

    vi.mocked(useWallet).mockReturnValue({
      loading: false,
      connecting: false,
      address: "GSELLER",
      networkMismatch: false,
      connectWallet: vi.fn().mockResolvedValue("GSELLER"),
      signTransaction: vi.fn().mockResolvedValue("SIGNED_XDR"),
    } as never);
  });

  it("creates a workflow order and shows the buyer claim link", async () => {
    mockCreateOrderApis();

    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/seller/orders/new" element={<SellerNewOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredFields();
    fireEvent.click(screen.getByRole("button", { name: /Create order/i }));

    expect(await screen.findByDisplayValue(/buyer\/claim\/invite-token-123/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open seller detail/i })).toHaveAttribute("href", "/seller/orders/order-1");
    expect(workflowApi.createSellerWorkflowOrderIntent).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerWallet: "GSELLER",
        buyerWallet: "GBUYER",
      }),
    );
    expect(workflowApi.createSellerWorkflowOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        sellerWallet: "GSELLER",
        buyerWallet: "GBUYER",
        txHash: "create-hash-1",
        submittedWallet: "GSELLER",
      }),
    );
  });

  it("blocks submission until a non-empty seller wallet is connected, then sends that wallet", async () => {
    mockCreateOrderApis();

    let walletAddress = "";
    const connectWallet = vi.fn().mockImplementation(async () => {
      walletAddress = "GSELLER";
      return walletAddress;
    });
    const signTransaction = vi.fn().mockResolvedValue("SIGNED_XDR");

    vi.mocked(useWallet).mockImplementation(
      () =>
        ({
          loading: false,
          connecting: false,
          address: walletAddress,
          networkMismatch: false,
          connectWallet,
          signTransaction,
        }) as never,
    );

    const view = render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/seller/orders/new" element={<SellerNewOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fillRequiredFields();

    expect(screen.getByRole("button", { name: /Create order/i })).toBeDisabled();
    expect(screen.getByText("Connect seller wallet before creating an order.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Connect seller wallet/i }));
    await waitFor(() => expect(connectWallet).toHaveBeenCalledTimes(1));

    view.unmount();
    render(
      <MemoryRouter initialEntries={["/seller/orders/new"]}>
        <Routes>
          <Route path="/seller/orders/new" element={<SellerNewOrderPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByDisplayValue("GSELLER")).toBeInTheDocument();
    fillRequiredFields();
    expect(screen.getByRole("button", { name: /Create order/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Create order/i }));

    await waitFor(() =>
      expect(workflowApi.createSellerWorkflowOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          sellerWallet: "GSELLER",
          buyerWallet: "GBUYER",
        }),
      ),
    );
  });
});
