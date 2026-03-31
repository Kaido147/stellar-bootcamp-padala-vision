import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RiderJobPage } from "./RiderJobPage";
import { RiderJobsPage } from "./RiderJobsPage";

vi.mock("../lib/api", () => ({
  workflowApi: {
    listRiderAvailableJobs: vi.fn(),
    listRiderJobs: vi.fn(),
    getRiderJob: vi.fn(),
    pickupRiderJob: vi.fn(),
    uploadRiderProofFile: vi.fn(),
    submitRiderProof: vi.fn(),
    acceptRiderJob: vi.fn(),
  },
}));

import { workflowApi } from "../lib/api";

describe("rider workflow pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:proof-preview"),
      revokeObjectURL: vi.fn(),
    });
  });

  it("renders available and active rider jobs", async () => {
    vi.mocked(workflowApi.listRiderAvailableJobs).mockResolvedValue({
      jobs: [
        {
          orderId: "order-1",
          orderCode: "PV-ORDER1",
          pickupLabel: "Pickup",
          dropoffLabel: "Dropoff",
          itemAmount: "100.00",
          deliveryFee: "25.00",
          totalAmount: "125.00",
          fundingConfirmedAt: "2026-03-31T00:00:00.000Z",
          dueAt: "2026-04-01T00:00:00.000Z",
        },
      ],
    });
    vi.mocked(workflowApi.listRiderJobs).mockResolvedValue({
      jobs: [
        {
          orderId: "order-2",
          orderCode: "PV-ORDER2",
          status: "in_transit",
          sellerDisplayName: "Seller",
          buyerDisplayName: "Buyer",
          riderDisplayName: "Rider",
          itemAmount: "100.00",
          deliveryFee: "25.00",
          totalAmount: "125.00",
          lastEventType: "parcel_picked_up",
          lastEventAt: "2026-03-31T00:00:00.000Z",
          dueAt: null,
          nextAction: "rider_submitted_proof",
          hasActiveDispute: false,
          requiresManualReview: false,
        },
      ],
    });
    vi.mocked(workflowApi.acceptRiderJob).mockResolvedValue({
      orderId: "order-1",
      status: "rider_assigned",
    });

    render(
      <MemoryRouter>
        <RiderJobsPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText("PV-ORDER1")).toBeInTheDocument();
    expect(screen.getByText("My Active Jobs")).toBeInTheDocument();
    expect(screen.getByText("PV-ORDER2")).toBeInTheDocument();
  });

  it("uploads and submits rider proof from the job detail page", async () => {
    vi.mocked(workflowApi.getRiderJob).mockResolvedValue({
      order: {
        orderId: "order-2",
        orderCode: "PV-ORDER2",
        status: "in_transit",
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
        lastEventType: "parcel_picked_up",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        relation: "rider_owner",
      },
      timeline: [],
      availableActions: ["rider_submitted_proof"],
      latestProof: null,
    });
    vi.mocked(workflowApi.uploadRiderProofFile).mockResolvedValue({
      uploadUrl: "https://example.test/proof.jpg",
      storagePath: "proofs/order-2.jpg",
      expiresAt: "2026-04-01T00:00:00.000Z",
      fileHash: "hash-123",
      contentType: "image/jpeg",
    });
    vi.mocked(workflowApi.submitRiderProof).mockResolvedValue({
      orderId: "order-2",
      status: "awaiting_buyer_confirmation",
      confirmationIssued: true,
      manualReviewRequired: false,
      latestProof: {
        imageUrl: "https://example.test/proof.jpg",
        storagePath: "proofs/order-2.jpg",
        fileHash: "hash-123",
        contentType: "image/jpeg",
        submittedAt: "2026-03-31T00:00:00.000Z",
        note: "Front door handoff",
        analysis: {
          analysisStatus: "available",
          summary: "The image appears to show a parcel handoff at the front door.",
          qualityAssessment: "clear",
          confidenceLabel: "high",
          riskFlags: [],
          operatorNotes: "The proof is visually usable.",
          decisionSuggestion: "Wait for buyer confirmation.",
        },
      },
    });

    render(
      <MemoryRouter initialEntries={["/rider/jobs/order-2"]}>
        <Routes>
          <Route path="/rider/jobs/:id" element={<RiderJobPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText(/Proof Workflow/i)).toBeInTheDocument();
    const file = new File(["proof"], "proof.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText(/Proof image/i), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole("button", { name: /Upload proof/i }));

    expect(await screen.findByText(/Proof image uploaded/i)).toBeInTheDocument();
    expect(screen.getByAltText(/Proof submitted at/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Submit proof/i }));
    expect(await screen.findByText(/buyer confirmation has been issued/i)).toBeInTheDocument();
    expect(await screen.findAllByText(/The image appears to show a parcel handoff at the front door/i)).toHaveLength(2);
    expect(workflowApi.submitRiderProof).toHaveBeenCalledWith(
      "order-2",
      expect.objectContaining({
        imageUrl: "https://example.test/proof.jpg",
        fileHash: "hash-123",
        contentType: "image/jpeg",
      }),
    );
  });
});
