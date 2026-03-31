import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { DisputeService } = await import("./dispute.service.js");
const { repository } = await import("../lib/repository.js");

test("participant with bound wallet can open a dispute and freeze the order", async () => {
  const service = new DisputeService();
  const userId = `user-${randomUUID()}`;
  const wallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.upsertWalletBinding({
    userId,
    walletAddress: wallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: wallet,
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Approved",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await service.openDispute({
    actor: {
      userId,
      email: "seller@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    reasonCode: "delivery_issue",
    description: "Package was not delivered correctly.",
    evidenceRefs: ["evidence-1"],
    correlationId: "corr-dispute-1",
  });

  assert.equal(result.dispute_status, "OPEN");
  assert.equal(result.order_status, "Disputed");
  assert.equal((await repository.getOrder(orderId))?.status, "Disputed");
});

test("only one open dispute per order is allowed", async () => {
  const service = new DisputeService();
  const userId = `user-${randomUUID()}`;
  const wallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.upsertWalletBinding({
    userId,
    walletAddress: wallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: wallet,
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Approved",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await service.openDispute({
    actor: {
      userId,
      email: "seller@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    reasonCode: "delivery_issue",
    description: "First dispute.",
    correlationId: "corr-dispute-2",
  });

  await assert.rejects(
    service.openDispute({
      actor: {
        userId,
        email: "seller@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
      orderId,
      reasonCode: "second_attempt",
      description: "Should fail.",
      correlationId: "corr-dispute-3",
    }),
    /open dispute already exists/,
  );
});

test("released or refunded orders cannot be disputed", async () => {
  const service = new DisputeService();
  const userId = `user-${randomUUID()}`;
  const wallet = Keypair.random().publicKey();

  for (const status of ["Released", "Refunded"] as const) {
    const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}${status}`;
    await repository.upsertWalletBinding({
      userId,
      walletAddress: wallet,
      walletProvider: "freighter",
      challengeId: randomUUID(),
      verifiedAt: new Date().toISOString(),
    });

    await repository.createOrder({
      id: orderId,
      contractId: "escrow-staging",
      sellerWallet: wallet,
      buyerWallet: Keypair.random().publicKey(),
      riderWallet: Keypair.random().publicKey(),
      itemAmount: "10.00",
      deliveryFee: "2.00",
      totalAmount: "12.00",
      status,
      fundedAt: null,
      releasedAt: status === "Released" ? new Date().toISOString() : null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });

    await assert.rejects(
      service.openDispute({
        actor: {
          userId,
          email: "seller@example.com",
          phone: null,
          accessToken: "token",
          roles: [],
        },
        orderId,
        reasonCode: "delivery_issue",
        description: "Should fail.",
        correlationId: `corr-dispute-${status}`,
      }),
      /Finalized orders cannot be disputed/,
    );
  }
});

test("operator can open dispute without participant wallet match", async () => {
  const service = new DisputeService();
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
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await service.openDispute({
    actor: {
      userId: `ops-${randomUUID()}`,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_reviewer"],
    },
    orderId,
    reasonCode: "manual_review",
    description: "Operator opened dispute.",
    correlationId: "corr-dispute-ops",
  });

  assert.equal(result.dispute_status, "OPEN");
  assert.equal(result.order_status, "Disputed");
});
