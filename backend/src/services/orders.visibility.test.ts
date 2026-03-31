import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { OrdersService } = await import("./orders.service.js");
const { repository } = await import("../lib/repository.js");

test("created orders remain retrievable immediately after creation", async () => {
  const service = new OrdersService();
  const sellerWallet = Keypair.random().publicKey();
  const buyerWallet = Keypair.random().publicKey();

  await repository.upsertWalletBinding({
    userId: "user-order-visibility",
    walletAddress: sellerWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  const created = await service.createOrder(
    {
      seller_wallet: sellerWallet,
      buyer_wallet: buyerWallet,
      item_amount: "10.00",
      delivery_fee: "2.00",
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    },
    {
      userId: "user-order-visibility",
      email: "seller@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
  );

  const fetched = await service.getOrder(created.order_id);

  assert.equal(fetched.order.id, created.order_id);
  assert.equal(fetched.order.sellerWallet, sellerWallet);
  assert.equal(fetched.order.buyerWallet, buyerWallet);
  assert.equal(fetched.order.status, "Draft");
});
