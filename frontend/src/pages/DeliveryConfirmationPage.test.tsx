import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryConfirmationPage } from "./DeliveryConfirmationPage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    viewDeliveryConfirmation: vi.fn(),
    approveDeliveryConfirmation: vi.fn(),
    rejectDeliveryConfirmation: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;

    constructor(message: string, status: number, code?: string) {
      super(message);
      this.status = status;
      this.code = code;
    }
  },
}));

vi.mock("../providers/AuthProvider", () => ({
  useAuth: vi.fn(),
}));

import { ApiError, workflowApi } from "../lib/api";
import { useAuth } from "../providers/AuthProvider";

describe("DeliveryConfirmationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      actor: { id: "buyer-1", role: "buyer", status: "active", displayName: "Buyer" },
    } as never);

    vi.mocked(workflowApi.viewDeliveryConfirmation).mockResolvedValue({
      orderId: "order-1",
      orderCode: "PV-ORDER1",
      sellerDisplayName: "Seller",
      buyerDisplayName: "Buyer",
      riderDisplayName: "Rider",
      itemAmount: "100.00",
      deliveryFee: "25.00",
      totalAmount: "125.00",
      status: "awaiting_buyer_confirmation",
      proofSubmittedAt: "2026-03-31T00:00:00.000Z",
      confirmationExpiresAt: "2026-04-01T00:00:00.000Z",
      requiresPin: true,
      latestProof: {
        imageUrl: "https://example.test/proof.jpg",
        storagePath: "proofs/order-1.jpg",
        fileHash: "hash-123",
        contentType: "image/jpeg",
        submittedAt: "2026-03-31T00:00:00.000Z",
        note: "Front desk handoff",
        analysis: {
          analysisStatus: "available",
          summary: "The image appears to show the package at the front desk.",
          qualityAssessment: "clear",
          confidenceLabel: "high",
          riskFlags: ["RECIPIENT_NOT_VISIBLE"],
          operatorNotes: "The package is visible, but the recipient is not clearly shown.",
          decisionSuggestion: "Review the image and confirm only if it matches your delivery.",
        },
      },
    });
  });

  it("approves delivery with a PIN", async () => {
    vi.mocked(workflowApi.approveDeliveryConfirmation).mockResolvedValue({
      orderId: "order-1",
      status: "release_pending",
    });

    render(
      <MemoryRouter initialEntries={["/confirm/delivery/token-1"]}>
        <Routes>
          <Route path="/confirm/delivery/:token" element={<DeliveryConfirmationPage />} />
          <Route path="/buyer/orders/:id" element={<div>buyer detail</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/The image appears to show the package at the front desk/i)).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText(/Confirmation PIN/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Approve delivery/i }));

    expect(await screen.findByText("buyer detail")).toBeInTheDocument();
    expect(workflowApi.approveDeliveryConfirmation).toHaveBeenCalledWith("token-1", { pin: "123456" });
  });

  it("rejects delivery and surfaces the dispute result", async () => {
    vi.mocked(workflowApi.rejectDeliveryConfirmation).mockResolvedValue({
      orderId: "order-1",
      status: "dispute_open",
      disputeId: "dispute-1",
    });

    render(
      <MemoryRouter initialEntries={["/confirm/delivery/token-1"]}>
        <Routes>
          <Route path="/confirm/delivery/:token" element={<DeliveryConfirmationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText(/Confirmation PIN/i), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /Reject and open dispute/i }));

    expect(await screen.findByText(/Dispute dispute-1 is now open/i)).toBeInTheDocument();
    expect(workflowApi.rejectDeliveryConfirmation).toHaveBeenCalledWith(
      "token-1",
      expect.objectContaining({ pin: "123456", reasonCode: "delivery_issue" }),
    );
  });

  it("shows a clear expired-link message", async () => {
    vi.mocked(workflowApi.viewDeliveryConfirmation).mockRejectedValue(
      new ApiError("Confirmation token is invalid or expired", 401, "confirmation_token_invalid"),
    );

    render(
      <MemoryRouter initialEntries={["/confirm/delivery/token-1"]}>
        <Routes>
          <Route path="/confirm/delivery/:token" element={<DeliveryConfirmationPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(
      await screen.findByText(/This confirmation link is invalid or expired\. Reissue it from the buyer workspace or operator review queue\./i),
    ).toBeInTheDocument();
  });
});
