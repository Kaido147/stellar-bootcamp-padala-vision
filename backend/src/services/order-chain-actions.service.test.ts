import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { OrdersService } = await import("./orders.service.js");
const { repository } = await import("../lib/repository.js");
const { clearContractRegistry, seedContractRegistry } = await import("./contract-registry.service.js");
const { ChainService } = await import("./chain.service.js");

test("fund intent plus confirmed recording updates the order and persists a confirmed transaction", async () => {
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
    contractId: null,
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

  const chain = new ChainService({
    verifyOrderActionTransaction: async ({ txHash, orderId, contractId, submittedWallet }) => ({
      txHash,
      status: "confirmed",
      orderId,
      contractId,
      submittedWallet,
      ledger: 44,
    }),
  });
  const service = new OrdersService(undefined, chain);

  const intent = await service.createFundIntent({
    orderId,
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    correlationId: "corr-fund-intent",
  });

  const recorded = await service.recordFunding({
    orderId,
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    actionIntentId: intent.action_intent_id,
    txHash: "tx-fund-1",
    submittedWallet: buyerWallet,
    correlationId: "corr-fund-record",
  });

  assert.equal(recorded.action_status, "confirmed");
  assert.equal(recorded.order.status, "Funded");
  assert.equal(recorded.tx?.txStatus, "confirmed");
  assert.equal((await repository.getTransactionByHash("tx-fund-1"))?.txStatus, "confirmed");
});

test("pending in-transit recording is preserved for refresh recovery via order history", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const riderUserId = `rider-${randomUUID()}`;
  const riderWallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.upsertWalletBinding({
    userId: riderUserId,
    walletAddress: riderWallet,
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
    status: "RiderAssigned",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const chain = new ChainService({
    verifyOrderActionTransaction: async ({ txHash, orderId, contractId, submittedWallet }) => ({
      txHash,
      status: "pending",
      orderId,
      contractId,
      submittedWallet,
      ledger: null,
    }),
  });
  const service = new OrdersService(undefined, chain);

  const intent = await service.createInTransitIntent({
    orderId,
    actor: {
      userId: riderUserId,
      email: "rider@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    correlationId: "corr-transit-intent",
  });

  const recorded = await service.recordInTransit({
    orderId,
    actor: {
      userId: riderUserId,
      email: "rider@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    actionIntentId: intent.action_intent_id,
    txHash: "tx-transit-1",
    submittedWallet: riderWallet,
    correlationId: "corr-transit-record",
  });

  assert.equal(recorded.action_status, "pending_confirmation");
  const history = (await service.getHistory(orderId)) as typeof service extends never ? never : {
    transactions: { txHash: string; txStatus: string }[];
    pending_transactions?: { txHash: string }[];
  };
  assert.equal(history.pending_transactions?.[0]?.txHash, "tx-transit-1");
  assert.equal(history.transactions[0]?.txStatus, "pending");
});
