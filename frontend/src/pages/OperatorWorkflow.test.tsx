import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorDisputeDetailPage, OperatorDisputesPage } from "./OperatorDisputesPage";
import { OperatorReviewsPage } from "./OperatorReviewsPage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    listOperatorReviews: vi.fn(),
    listOperatorDisputes: vi.fn(),
    getOperatorDispute: vi.fn(),
    resolveOperatorDispute: vi.fn(),
  },
}));

import { workflowApi } from "../lib/api";

describe("operator workflow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders review and dispute queue data from the workflow API", async () => {
    vi.mocked(workflowApi.listOperatorReviews).mockResolvedValue({
      manualReviewQueue: [
        {
          orderId: "order-1",
          orderCode: "PV-ORDER1",
          status: "manual_review",
          sellerDisplayName: "Seller",
          buyerDisplayName: "Buyer",
          riderDisplayName: "Rider",
          itemAmount: "100.00",
          deliveryFee: "25.00",
          totalAmount: "125.00",
          lastEventType: "manual_review_opened",
          lastEventAt: "2026-03-31T00:00:00.000Z",
          dueAt: null,
          nextAction: "operator_resolved_dispute_to_release",
          hasActiveDispute: false,
          requiresManualReview: true,
          aiRiskFlags: [],
          aiSummary: "Proof is available but still needs operator review.",
          decisionSuggestion: "Inspect the proof and decide whether the buyer should confirm or the case should escalate.",
          recommendedAction: "operator_resolved_dispute_to_release",
        },
      ],
      overdueBuyerConfirmations: [],
      settlementExceptions: [],
    });
    vi.mocked(workflowApi.listOperatorDisputes).mockResolvedValue({
      disputes: [
        {
          disputeId: "dispute-1",
          orderId: "order-2",
          orderCode: "PV-ORDER2",
          orderStatus: "dispute_open",
          openedAt: "2026-03-31T00:00:00.000Z",
          sellerDisplayName: "Seller",
          buyerDisplayName: "Buyer",
          riderDisplayName: "Rider",
          aiRiskFlags: [],
          aiSummary: "A dispute is open and waiting for operator action.",
          decisionSuggestion: "Review the dispute context and resolve toward release, refund, or rejection.",
        },
      ],
    });

    render(
      <MemoryRouter>
        <OperatorReviewsPage />
        <OperatorDisputesPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("PV-ORDER1")).toBeInTheDocument();
    expect(await screen.findByText("PV-ORDER2")).toBeInTheDocument();
    expect(screen.getByText(/Proof is available but still needs operator review/i)).toBeInTheDocument();
  });

  it("submits an operator dispute resolution", async () => {
    vi.mocked(workflowApi.getOperatorDispute).mockResolvedValue({
      disputeId: "dispute-1",
      disputeOpenedAt: "2026-03-31T00:00:00.000Z",
      aiSummary: "The buyer says the proof does not match the delivery handoff.",
      aiRiskFlags: ["DISPUTE_OPEN", "DISPUTE_REASON_PROOF_MISMATCH"],
      decisionSuggestion: "Review the dispute and resolve toward release or refund.",
      proofSummary: "Latest proof was submitted before the dispute opened.",
      order: {
        orderId: "order-2",
        orderCode: "PV-ORDER2",
        status: "dispute_open",
        itemDescription: "Parcel",
        pickupLabel: "Pickup",
        dropoffLabel: "Dropoff",
        itemAmount: "100.00",
        deliveryFee: "25.00",
        totalAmount: "125.00",
        seller: { id: "seller-1", role: "seller", status: "active", displayName: "Seller" },
        buyer: { id: "buyer-1", role: "buyer", status: "active", displayName: "Buyer" },
        rider: { id: "rider-1", role: "rider", status: "active", displayName: "Rider" },
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
        fundingDeadlineAt: "2026-04-01T00:00:00.000Z",
        buyerConfirmationDueAt: null,
        lastEventType: "dispute_opened",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        relation: "operator",
      },
      timeline: [],
      availableActions: [],
      latestProof: {
        imageUrl: "https://example.test/proof.jpg",
        storagePath: "proofs/order-2.jpg",
        fileHash: null,
        submittedAt: "2026-03-31T00:00:00.000Z",
        note: "Front door handoff",
      },
    });
    vi.mocked(workflowApi.resolveOperatorDispute).mockResolvedValue({
      disputeId: "dispute-1",
      orderId: "order-2",
      status: "release_pending",
    });

    render(
      <MemoryRouter initialEntries={["/operator/disputes/dispute-1"]}>
        <Routes>
          <Route path="/operator/disputes/:id" element={<OperatorDisputeDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(await screen.findByLabelText(/Note/i), { target: { value: "Resolve to release" } });
    fireEvent.click(screen.getByRole("button", { name: /Submit resolution/i }));

    expect(await screen.findByText(/Order moved to release_pending/i)).toBeInTheDocument();
    expect(workflowApi.resolveOperatorDispute).toHaveBeenCalledWith(
      "dispute-1",
      expect.objectContaining({ resolution: "reject_dispute", note: "Resolve to release" }),
    );
  });
});
