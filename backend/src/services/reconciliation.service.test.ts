import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { repository } = await import("../lib/repository.js");
const { ChainService } = await import("./chain.service.js");
const { ReconciliationService } = await import("./reconciliation.service.js");
const { clearContractRegistry, seedContractRegistry } = await import("./contract-registry.service.js");

test("only ops roles can reconcile orders", async () => {
  const { orderId } = await setupOrder("Draft");
  const service = new ReconciliationService(
    new ChainService({
      getOrderState: async ({ orderId, contractId }) => ({
        orderId,
        contractId,
        status: "Funded",
        proven: true,
        ledger: 101,
      }),
    }),
  );

  await assert.rejects(
    service.reconcileOrder({
      actor: {
        userId: `user-${randomUUID()}`,
        email: "user@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
      orderId,
      correlationId: "corr-reconcile-1",
    }),
    /Only ops_reviewer or ops_admin can reconcile orders/,
  );
});

test("reconcile adopts proven funded state from chain", async () => {
  const { orderId } = await setupOrder("Draft");
  const service = new ReconciliationService(
    new ChainService({
      getOrderState: async ({ orderId, contractId }) => ({
        orderId,
        contractId,
        status: "Funded",
        proven: true,
        ledger: 102,
        observedAt: new Date().toISOString(),
      }),
    }),
  );

  const result = await service.reconcileOrder({
    actor: opsActor(),
    orderId,
    correlationId: "corr-reconcile-2",
  });

  assert.equal(result.chain_state, "Funded");
  assert.equal(result.final_state, "Funded");
  assert.equal((await repository.getOrder(orderId))?.status, "Funded");
});

test("reconcile adopts proven released state and creates transaction when needed", async () => {
  const { orderId } = await setupOrder("Approved");
  const service = new ReconciliationService(
    new ChainService({
      getOrderState: async ({ orderId, contractId }) => ({
        orderId,
        contractId,
        status: "Released",
        proven: true,
        txHash: "tx-reconcile-release-1",
        ledger: 103,
        observedAt: new Date().toISOString(),
      }),
    }),
  );

  const result = await service.reconcileOrder({
    actor: opsActor(),
    orderId,
    forceRefresh: true,
    correlationId: "corr-reconcile-3",
  });

  assert.equal(result.final_state, "Released");
  assert.equal((await repository.getTransactionByHash("tx-reconcile-release-1"))?.txHash, "tx-reconcile-release-1");
});

test("reconcile fails closed on ambiguous chain state", async () => {
  const { orderId } = await setupOrder("Funded");
  const service = new ReconciliationService(
    new ChainService({
      getOrderState: async ({ orderId, contractId }) => ({
        orderId,
        contractId,
        status: "InTransit",
        proven: true,
        ambiguous: true,
      }),
    }),
  );

  await assert.rejects(
    service.reconcileOrder({
      actor: opsActor(),
      orderId,
      correlationId: "corr-reconcile-4",
    }),
    /ambiguous order state/,
  );
});

test("reconcile fails closed on conflicting final state", async () => {
  const { orderId } = await setupOrder("Released");
  const service = new ReconciliationService(
    new ChainService({
      getOrderState: async ({ orderId, contractId }) => ({
        orderId,
        contractId,
        status: "Refunded",
        proven: true,
        txHash: "tx-reconcile-refund-1",
        ledger: 104,
      }),
    }),
  );

  await assert.rejects(
    service.reconcileOrder({
      actor: opsActor(),
      orderId,
      correlationId: "corr-reconcile-5",
    }),
    /final states conflict/,
  );
});

async function setupOrder(status: "Draft" | "Funded" | "Approved" | "Released") {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

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
    status,
    fundedAt: status === "Funded" || status === "Approved" || status === "Released" ? new Date().toISOString() : null,
    releasedAt: status === "Released" ? new Date().toISOString() : null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  return { orderId };
}

function opsActor() {
  return {
    userId: `ops-${randomUUID()}`,
    email: "ops@example.com",
    phone: null,
    accessToken: "token",
    roles: ["ops_reviewer"],
  };
}
