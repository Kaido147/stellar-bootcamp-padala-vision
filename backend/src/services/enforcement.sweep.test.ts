import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { RefundService } = await import("./refund.service.js");
const { ReconciliationService } = await import("./reconciliation.service.js");
const { ChainService } = await import("./chain.service.js");
const { repository } = await import("../lib/repository.js");
const { clearContractRegistry, seedContractRegistry } = await import("./contract-registry.service.js");

test("operator refund intent requires active wallet binding", async () => {
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
    riderWallet: null,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Funded",
    fundedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 - 5_000).toISOString(),
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await assert.rejects(
    new RefundService().createRefundIntent({
      actor: {
        userId: `ops-${randomUUID()}`,
        email: "ops@example.com",
        phone: null,
        accessToken: "token",
        roles: ["ops_admin"],
      },
      orderId,
      correlationId: "corr-enforce-1",
    }),
    /Active wallet binding is required/,
  );
});

test("operator reconcile requires active wallet binding", async () => {
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
    riderWallet: null,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Draft",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  const service = new ReconciliationService(
    new ChainService({
      getOrderState: async ({ orderId, contractId }) => ({
        orderId,
        contractId,
        status: "Funded",
        proven: true,
      }),
    }),
  );

  await assert.rejects(
    service.reconcileOrder({
      actor: {
        userId: `ops-${randomUUID()}`,
        email: "ops@example.com",
        phone: null,
        accessToken: "token",
        roles: ["ops_reviewer"],
      },
      orderId,
      correlationId: "corr-enforce-2",
    }),
    /Active wallet binding is required/,
  );
});
