import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { OrdersService } = await import("./orders.service.js");
const { repository } = await import("../lib/repository.js");

test("createOrder requires seller wallet to match active bound wallet", async () => {
  const service = new OrdersService();
  const boundWallet = Keypair.random().publicKey();

  await repository.upsertWalletBinding({
    userId: "user-create-order",
    walletAddress: boundWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await assert.rejects(
    service.createOrder(
      {
        seller_wallet: Keypair.random().publicKey(),
        buyer_wallet: Keypair.random().publicKey(),
        item_amount: "10.00",
        delivery_fee: "2.00",
        expires_at: new Date(Date.now() + 60_000).toISOString(),
      },
      {
        userId: "user-create-order",
        email: "user@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
    ),
    /Seller wallet must match the authenticated bound wallet/,
  );
});

test("markFunded requires buyer wallet binding", async () => {
  const service = new OrdersService();
  const buyerWallet = Keypair.random().publicKey();
  const otherWallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.upsertWalletBinding({
    userId: "user-fund-order",
    walletAddress: otherWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet,
    riderWallet: null,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Draft",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await assert.rejects(
    service.markFunded(orderId, {
      userId: "user-fund-order",
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    }),
    /Buyer wallet must match the authenticated bound wallet/,
  );
});

test("submitEvidence requires rider wallet binding", async () => {
  const service = new OrdersService();
  const riderWallet = Keypair.random().publicKey();
  const wrongWallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.upsertWalletBinding({
    userId: "user-submit-evidence",
    walletAddress: wrongWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet: Keypair.random().publicKey(),
    riderWallet,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "InTransit",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await assert.rejects(
    service.submitEvidence(
      {
        order_id: orderId,
        rider_wallet: riderWallet,
        image_url: "https://example.com/evidence.jpg",
        file_hash: "hash",
        gps: { lat: 1, lng: 2 },
        timestamp: new Date().toISOString(),
      },
      {
        userId: "user-submit-evidence",
        email: "rider@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
    ),
    /Rider wallet must match the authenticated bound wallet/,
  );
});
