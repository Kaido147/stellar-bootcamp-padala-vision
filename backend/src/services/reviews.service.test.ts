import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { ReviewsService } = await import("./reviews.service.js");
const { repository } = await import("../lib/repository.js");

test("review queue returns order metadata and review confidence", async () => {
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Approved",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await repository.saveEvidence({
    orderId,
    imageUrl: "https://example.com/evidence.jpg",
    gpsLat: 1,
    gpsLng: 2,
    fileHash: "hash-1",
  });
  await repository.saveOracleDecision({
    orderId,
    decision: "APPROVE",
    confidence: 0.93,
    reason: "Looks valid",
    fraudFlags: ["low_light"],
    signature: null,
    issuedAt: null,
    expiresAt: null,
  });

  const service = new ReviewsService();
  const result = await service.listReviews({
    actor: {
      userId: `ops-${randomUUID()}`,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_reviewer"],
    },
  });

  const review = result.reviews.find((item) => item.order_id === orderId);
  assert.ok(review);
  assert.equal(review?.review_state, "approved");
  assert.equal(review?.confidence, 0.93);
  assert.deepEqual(review?.fraud_flags, ["low_light"]);
});

test("review detail includes evidence, history, and latest decision", async () => {
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Rejected",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await repository.saveEvidence({
    orderId,
    imageUrl: "https://example.com/evidence-2.jpg",
    gpsLat: 5,
    gpsLng: 6,
    fileHash: "hash-2",
  });
  await repository.saveOracleDecision({
    orderId,
    decision: "REJECT",
    confidence: 0.41,
    reason: "Image mismatch",
    fraudFlags: ["face_mismatch"],
    signature: null,
    issuedAt: null,
    expiresAt: null,
  });

  const service = new ReviewsService();
  const detail = await service.getReview(orderId, {
    userId: `ops-${randomUUID()}`,
    email: "ops@example.com",
    phone: null,
    accessToken: "token",
    roles: ["ops_admin"],
  });

  assert.equal(detail.order.id, orderId);
  assert.equal(detail.evidence.length, 1);
  assert.equal(detail.latest_decision?.decision, "REJECT");
  assert.ok(detail.history.length >= 1);
});
