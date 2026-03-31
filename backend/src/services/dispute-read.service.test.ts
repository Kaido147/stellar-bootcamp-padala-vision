import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { DisputeService } = await import("./dispute.service.js");
const { repository } = await import("../lib/repository.js");

test("dispute queue returns queue metadata for operators", async () => {
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const disputeId = randomUUID();
  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Disputed",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await repository.createDispute({
    id: disputeId,
    orderId,
    actorUserId: "user-1",
    actorWallet: null,
    actorRoles: [],
    frozenFromStatus: "Approved",
    reasonCode: "delivery_issue",
    description: "Package damaged",
    evidenceRefs: [],
    status: "open",
    correlationId: "corr-dispute-read-1",
    lastActivityAt: new Date().toISOString(),
    resolution: null,
    resolutionReason: null,
    resolutionNote: null,
    resolvedByUserId: null,
    resolvedByWallet: null,
    resolvedByRoles: [],
    resolvedAt: null,
  });

  const service = new DisputeService();
  const result = await service.listDisputes({
    actor: {
      userId: `ops-${randomUUID()}`,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_reviewer"],
    },
  });

  const dispute = result.disputes.find((item) => item.dispute_id === disputeId);
  assert.ok(dispute);
  assert.equal(dispute?.order_id, orderId);
  assert.equal(dispute?.resolution_available, true);
});

test("dispute detail resolves by order id for participant route compatibility", async () => {
  const service = new DisputeService();
  const sellerUserId = `seller-${randomUUID()}`;
  const sellerWallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const disputeId = randomUUID();

  await repository.upsertWalletBinding({
    userId: sellerUserId,
    walletAddress: sellerWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet,
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Disputed",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await repository.createDispute({
    id: disputeId,
    orderId,
    actorUserId: sellerUserId,
    actorWallet: sellerWallet,
    actorRoles: [],
    frozenFromStatus: "Approved",
    reasonCode: "delivery_issue",
    description: "Participant opened dispute",
    evidenceRefs: [],
    status: "open",
    correlationId: "corr-dispute-read-2",
    lastActivityAt: new Date().toISOString(),
    resolution: null,
    resolutionReason: null,
    resolutionNote: null,
    resolvedByUserId: null,
    resolvedByWallet: null,
    resolvedByRoles: [],
    resolvedAt: null,
  });

  await repository.createDisputeEvent({
    disputeId,
    orderId,
    action: "opened",
    actorUserId: sellerUserId,
    actorWallet: sellerWallet,
    actorRoles: [],
    reason: "delivery_issue",
    note: "Participant opened dispute",
    resolution: null,
    correlationId: "corr-dispute-event",
  });

  const detail = await service.getDisputeDetail({
    actor: {
      userId: sellerUserId,
      email: "seller@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    disputeIdOrOrderId: orderId,
  });

  assert.equal(detail.dispute_id, disputeId);
  assert.equal(detail.order.id, orderId);
  assert.equal(detail.events.length, 1);
});
