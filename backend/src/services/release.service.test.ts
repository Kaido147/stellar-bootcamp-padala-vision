import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.ORACLE_SECRET_KEY = Keypair.random().secret();

const { ReleaseService } = await import("./release.service.js");
const { repository } = await import("../lib/repository.js");
const { clearContractRegistry, seedContractRegistry } = await import("./contract-registry.service.js");

test("release intent returns contract metadata and signed attestation for a bound participant", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new ReleaseService();
  const userId = `user-${randomUUID()}`;
  const wallet = `G${"A".repeat(55)}`;
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
    buyerWallet: `G${"B".repeat(55)}`,
    riderWallet: `G${"C".repeat(55)}`,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Approved",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await repository.saveOracleDecision({
    orderId,
    decision: "APPROVE",
    confidence: 0.97,
    reason: "Approved for release",
    fraudFlags: [],
    signature: "legacy-signature",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  });

  const result = await service.createReleaseIntent({
    actor: {
      userId,
      email: "participant@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    correlationId: "corr-release-1",
  });

  assert.equal(result.contract_id, "escrow-staging");
  assert.equal(result.method, "submit_release");
  assert.equal(result.attestation.environment, "staging");
  assert.equal(result.attestation.contractId, "escrow-staging");
  assert.equal(result.replay_key, result.attestation.nonce);
});

test("release intent blocks disputed orders", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new ReleaseService();
  const userId = `user-${randomUUID()}`;
  const wallet = `G${"D".repeat(55)}`;
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
    buyerWallet: `G${"E".repeat(55)}`,
    riderWallet: `G${"F".repeat(55)}`,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Disputed",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await assert.rejects(
    service.createReleaseIntent({
      actor: {
        userId,
        email: "participant@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
      orderId,
      correlationId: "corr-release-2",
    }),
    /blocked while the order is disputed/,
  );
});

test("release intent fails closed when approval context is expired", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new ReleaseService();
  const userId = `user-${randomUUID()}`;
  const wallet = `G${"1".repeat(55)}`;
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
    buyerWallet: `G${"2".repeat(55)}`,
    riderWallet: `G${"3".repeat(55)}`,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Approved",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await repository.saveOracleDecision({
    orderId,
    decision: "APPROVE",
    confidence: 0.97,
    reason: "Approved for release",
    fraudFlags: [],
    signature: "legacy-signature",
    issuedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
    expiresAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  });

  await assert.rejects(
    service.createReleaseIntent({
      actor: {
        userId,
        email: "participant@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
      orderId,
      correlationId: "corr-release-3",
    }),
    /Approved release context has expired/,
  );
});

test("release intent allows operators without participant wallet match", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

  const service = new ReleaseService();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet: `G${"4".repeat(55)}`,
    buyerWallet: `G${"5".repeat(55)}`,
    riderWallet: `G${"6".repeat(55)}`,
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: "Approved",
    fundedAt: null,
    releasedAt: null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  });

  await repository.saveOracleDecision({
    orderId,
    decision: "APPROVE",
    confidence: 0.97,
    reason: "Approved for release",
    fraudFlags: [],
    signature: "legacy-signature",
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
  });

  const result = await service.createReleaseIntent({
    actor: {
      userId: `ops-${randomUUID()}`,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_reviewer"],
    },
    orderId,
    correlationId: "corr-release-4",
  });

  assert.equal(result.contract_id, "escrow-staging");
});
