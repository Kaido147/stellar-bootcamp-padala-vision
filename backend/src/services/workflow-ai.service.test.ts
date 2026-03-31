import test from "node:test";
import assert from "node:assert/strict";
import { WorkflowAiService } from "./workflow-ai.service.js";

const service = new WorkflowAiService();

test("workflow ai queue preview raises proof and dispute flags with a decision suggestion", () => {
  const advice = service.buildQueuePreview({
    order: {
      id: "order-1",
      publicOrderCode: "PV-ORDER1",
      workflowStatus: "manual_review",
      sellerActorId: "seller-1",
      buyerActorId: "buyer-1",
      riderActorId: "rider-1",
      itemAmount: "100.00",
      deliveryFee: "25.00",
      totalAmount: "125.00",
      itemDescription: "Parcel",
      pickupLabel: "Pickup",
      dropoffLabel: "Dropoff",
      fundingDeadlineAt: "2026-04-01T00:00:00.000Z",
      buyerConfirmationDueAt: "2026-03-30T00:00:00.000Z",
      riderAcceptDueAt: null,
      deliveryDueAt: null,
      manualReviewReason: "proof_requires_review",
      lastEventType: "proof_submitted",
      lastEventAt: "2026-03-31T00:00:00.000Z",
      deliveredAt: "2026-03-31T00:00:00.000Z",
      buyerConfirmedAt: null,
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
    },
    timeline: [
      {
        id: "evt-1",
        type: "proof_submitted",
        occurredAt: "2026-03-31T00:00:00.000Z",
        actorId: "rider-1",
        actorRole: "rider",
        note: "manual_review requested by rider",
        metadata: {
          imageUrl: "https://example.test/proof.jpg",
          storagePath: null,
          fileHash: null,
        },
      },
    ],
    dispute: {
      id: "dispute-1",
      orderId: "order-1",
      actorUserId: "buyer-1",
      actorWallet: null,
      actorRoles: ["buyer"],
      frozenFromStatus: "Disputed",
      reasonCode: "proof_mismatch",
      description: "Proof does not match delivery",
      evidenceRefs: [],
      status: "open",
      correlationId: "corr-1",
      lastActivityAt: "2026-03-31T00:00:00.000Z",
      resolution: null,
      resolutionReason: null,
      resolutionNote: null,
      resolvedByUserId: null,
      resolvedByWallet: null,
      resolvedByRoles: [],
      resolvedAt: null,
      createdAt: "2026-03-31T00:00:00.000Z",
      updatedAt: "2026-03-31T00:00:00.000Z",
    },
  });

  assert.match(advice.summary, /buyer dispute is open/i);
  assert.ok(advice.riskFlags.includes("MANUAL_REVIEW_STATE"));
  assert.ok(advice.riskFlags.includes("DISPUTE_OPEN"));
  assert.ok(advice.riskFlags.includes("PROOF_STORAGE_REFERENCE_MISSING"));
  assert.match(advice.decisionSuggestion, /release, or refund/i);
});
