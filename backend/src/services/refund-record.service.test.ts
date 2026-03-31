import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { RefundService } = await import("./refund.service.js");
const { repository } = await import("../lib/repository.js");
const { clearContractRegistry, seedContractRegistry } = await import("./contract-registry.service.js");
const { ChainService } = await import("./chain.service.js");

test("confirmed refund recording finalizes the order and transaction", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const buyerUserId = `buyer-${randomUUID()}`;
  const buyerWallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.upsertWalletBinding({
    userId: buyerUserId,
    walletAddress: buyerWallet,
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
    status: "Rejected",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const chain = new ChainService({
    verifyOrderActionTransaction: async ({ txHash, orderId, contractId, submittedWallet }) => ({
      txHash,
      status: "confirmed",
      orderId,
      contractId,
      submittedWallet,
      ledger: 55,
    }),
  });
  const service = new RefundService(undefined, chain);

  const intent = await service.createRefundIntent({
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    correlationId: "corr-refund-intent-record",
  });

  const recorded = await service.recordRefund({
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    refundIntentId: intent.refund_intent_id,
    txHash: "tx-refund-1",
    submittedWallet: buyerWallet,
    correlationId: "corr-refund-record",
  });

  assert.equal(recorded.refund_status, "confirmed");
  assert.equal(recorded.order.status, "Refunded");
  assert.equal(recorded.tx?.txStatus, "confirmed");
});
