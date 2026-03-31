import test from "node:test";
import assert from "node:assert/strict";
import { env } from "../config/env.js";
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

test("workflow proof analysis falls back safely when Gemini is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("forced Gemini outage");
  };

  try {
    const advice = await service.analyzeProof({
      order: {
        id: "order-2",
        publicOrderCode: "PV-ORDER2",
        workflowStatus: "awaiting_buyer_confirmation",
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
        buyerConfirmationDueAt: "2026-04-02T00:00:00.000Z",
        riderAcceptDueAt: null,
        deliveryDueAt: null,
        manualReviewReason: null,
        lastEventType: "proof_submitted",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        deliveredAt: "2026-03-31T00:00:00.000Z",
        buyerConfirmedAt: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      },
      timeline: [],
      proof: {
        imageUrl: "https://example.test/proof.jpg",
        storagePath: "orders/order-2/proof.jpg",
        fileHash: "abc123",
        contentType: "image/jpeg",
        submittedAt: "2026-03-31T00:00:00.000Z",
        note: "Front desk handoff",
      },
    });

    assert.equal(advice.analysisStatus, "unavailable");
    assert.equal(advice.qualityAssessment, "analysis_unavailable");
    assert.equal(advice.confidenceLabel, "unavailable");
    assert.ok(advice.riskFlags.includes("PROOF_ANALYSIS_UNAVAILABLE"));
    assert.match(advice.operatorNotes ?? "", /automated analysis is unavailable/i);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("workflow proof analysis uses Gemini path when key is present", async () => {
  assert.equal(Boolean(env.GEMINI_API_KEY), true);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input: string | URL | Request) => {
    const url = String(input);

    if (url.includes("example.test/proof.jpg")) {
      return new Response(Buffer.from("image-bytes"), {
        status: 200,
        headers: {
          "content-type": "image/jpeg",
        },
      });
    }

    if (url.includes("generativelanguage.googleapis.com")) {
      return new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      summary: "The image appears to show a parcel handoff.",
                      risk_flags: ["RECIPIENT_NOT_VISIBLE"],
                      decision_suggestion: "Review the proof, then wait for buyer confirmation.",
                      quality_assessment: "clear",
                      confidence_label: "high",
                      operator_notes: "The parcel is visible and the image is usable for review.",
                    }),
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    throw new Error(`Unexpected fetch target: ${url}`);
  };

  try {
    const advice = await service.analyzeProof({
      order: {
        id: "order-3",
        publicOrderCode: "PV-ORDER3",
        workflowStatus: "awaiting_buyer_confirmation",
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
        buyerConfirmationDueAt: "2026-04-02T00:00:00.000Z",
        riderAcceptDueAt: null,
        deliveryDueAt: null,
        manualReviewReason: null,
        lastEventType: "proof_submitted",
        lastEventAt: "2026-03-31T00:00:00.000Z",
        deliveredAt: "2026-03-31T00:00:00.000Z",
        buyerConfirmedAt: null,
        createdAt: "2026-03-31T00:00:00.000Z",
        updatedAt: "2026-03-31T00:00:00.000Z",
      },
      timeline: [],
      proof: {
        imageUrl: "https://example.test/proof.jpg",
        storagePath: "orders/order-3/proof.jpg",
        fileHash: "abc123",
        contentType: "image/jpeg",
        submittedAt: "2026-03-31T00:00:00.000Z",
        note: "Front desk handoff",
      },
    });

    assert.equal(advice.analysisStatus, "available");
    assert.equal(advice.qualityAssessment, "clear");
    assert.equal(advice.confidenceLabel, "high");
    assert.match(advice.summary ?? "", /parcel handoff/i);
    assert.ok(advice.riskFlags.includes("RECIPIENT_NOT_VISIBLE"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
