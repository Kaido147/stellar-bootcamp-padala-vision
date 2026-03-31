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

test("buyer can request immediate refund intent after rejection", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new RefundService();
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
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Rejected",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await service.createRefundIntent({
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    correlationId: "corr-refund-1",
  });

  assert.equal(result.method, "refund_order");
  assert.equal(result.eligibility_basis, "rejected");
});

test("funded but unaccepted timeout becomes eligible after 2 hours", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new RefundService();
  const buyerUserId = `buyer-${randomUUID()}`;
  const buyerWallet = Keypair.random().publicKey();
  const fundedAt = new Date(Date.now() - 2 * 60 * 60 * 1000 - 5_000).toISOString();
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
    status: "Funded",
    fundedAt,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await service.createRefundIntent({
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    correlationId: "corr-refund-2",
  });

  assert.equal(result.eligibility_basis, "timeout_funded_unaccepted");
});

test("assigned but not in transit timeout becomes eligible after 1 hour", async () => {
  const fixture = await setupTimedOrderFixture("RiderAssigned", 60 * 60 * 1000 + 5_000);
  const service = new RefundService();

  const result = await service.createRefundIntent({
    actor: fixture.actor,
    orderId: fixture.orderId,
    correlationId: "corr-refund-3",
  });

  assert.equal(result.eligibility_basis, "timeout_assigned_not_in_transit");
});

test("in transit timeout becomes eligible after 8 hours", async () => {
  const fixture = await setupTimedOrderFixture("InTransit", 8 * 60 * 60 * 1000 + 5_000);
  const service = new RefundService();

  const result = await service.createRefundIntent({
    actor: fixture.actor,
    orderId: fixture.orderId,
    correlationId: "corr-refund-4",
  });

  assert.equal(result.eligibility_basis, "timeout_in_transit");
});

test("dispute inactivity timeout becomes eligible after 24 hours", async () => {
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
  const disputeId = randomUUID();

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
    actorUserId: buyerUserId,
    actorWallet: buyerWallet,
    actorRoles: [],
    frozenFromStatus: "Approved",
    reasonCode: "delivery_issue",
    description: "disputed",
    evidenceRefs: [],
    status: "open",
    correlationId: "corr-dispute-refund",
    lastActivityAt: new Date(Date.now() - 24 * 60 * 60 * 1000 - 5_000).toISOString(),
    resolution: null,
    resolutionReason: null,
    resolutionNote: null,
    resolvedByUserId: null,
    resolvedByWallet: null,
    resolvedByRoles: [],
    resolvedAt: null,
  });

  const service = new RefundService();
  const result = await service.createRefundIntent({
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    correlationId: "corr-refund-5",
  });

  assert.equal(result.eligibility_basis, "dispute_inactive");
});

test("operator can request refund intent without buyer wallet match", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new RefundService();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const fundedAt = new Date(Date.now() - 2 * 60 * 60 * 1000 - 5_000).toISOString();
  const operatorUserId = `ops-${randomUUID()}`;
  const operatorWallet = Keypair.random().publicKey();

  await repository.upsertWalletBinding({
    userId: operatorUserId,
    walletAddress: operatorWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: null,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Funded",
    fundedAt,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const result = await service.createRefundIntent({
    actor: {
      userId: operatorUserId,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_admin"],
    },
    orderId,
    correlationId: "corr-refund-6",
  });

  assert.equal(result.eligibility_basis, "timeout_funded_unaccepted");
});

test("refund intent fails closed when order is not eligible", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new RefundService();
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
    status: "Funded",
    fundedAt: new Date().toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await assert.rejects(
    service.createRefundIntent({
      actor: {
        userId: buyerUserId,
        email: "buyer@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
      orderId,
      correlationId: "corr-refund-7",
    }),
    /Order is not eligible for refund/,
  );
});

async function setupTimedOrderFixture(status: "RiderAssigned" | "InTransit", ageMs: number) {
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
  const startedAt = new Date(Date.now() - ageMs).toISOString();

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
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Funded",
    fundedAt: new Date(Date.now() - ageMs - 5_000).toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });
  await repository.updateOrderStatus(orderId, "RiderAssigned", "Assigned", {});
  await repository.updateOrderStatus(orderId, status, "Timed state", {});

  const history = await repository.getHistory(orderId);
  const targetEntry = [...history].reverse().find((entry) => entry.newStatus === status);
  if (targetEntry) {
    targetEntry.changedAt = startedAt;
  }

  return {
    orderId,
    actor: {
      userId: buyerUserId,
      email: "buyer@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
  };
}
