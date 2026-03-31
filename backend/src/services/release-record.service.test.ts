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
const { ChainService } = await import("./chain.service.js");

test("release recording returns pending status without finalizing before chain confirmation", async () => {
  const { service, orderId, nonce, wallet } = await setupReleaseIntentFixture();

  const pendingChain = new ChainService({
    verifyReleaseTransaction: async ({ txHash, orderId, contractId, attestationNonce, submittedWallet }) => ({
      txHash,
      status: "pending",
      orderId,
      contractId,
      attestationNonce,
      submittedWallet,
      ledger: null,
    }),
  });

  const releaseService = new ReleaseService(undefined, pendingChain);
  const result = await releaseService.recordRelease({
    actor: {
      userId: service.userId,
      email: "participant@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    txHash: "tx-pending-1",
    attestationNonce: nonce,
    submittedWallet: wallet,
    correlationId: "corr-record-1",
  });

  assert.equal(result.release_status, "pending_confirmation");
  assert.equal(result.financial_finality, false);
  assert.equal((await repository.getOrder(orderId))?.status, "Approved");
});

test("release recording confirms and finalizes only after verified chain success", async () => {
  const { service, orderId, nonce, wallet } = await setupReleaseIntentFixture();

  const confirmedChain = new ChainService({
    verifyReleaseTransaction: async ({ txHash, orderId, contractId, attestationNonce, submittedWallet }) => ({
      txHash,
      status: "confirmed",
      orderId,
      contractId,
      attestationNonce,
      submittedWallet,
      ledger: 12345,
    }),
  });

  const releaseService = new ReleaseService(undefined, confirmedChain);
  const result = await releaseService.recordRelease({
    actor: {
      userId: service.userId,
      email: "participant@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    txHash: "tx-confirmed-1",
    attestationNonce: nonce,
    submittedWallet: wallet,
    correlationId: "corr-record-2",
  });

  assert.equal(result.release_status, "confirmed");
  assert.equal(result.financial_finality, true);
  assert.equal(result.order.status, "Released");
  assert.equal(result.tx?.txHash, "tx-confirmed-1");
});

test("duplicate tx hash safely replays an already confirmed release", async () => {
  const { service, orderId, nonce, wallet } = await setupReleaseIntentFixture();

  const confirmedChain = new ChainService({
    verifyReleaseTransaction: async ({ txHash, orderId, contractId, attestationNonce, submittedWallet }) => ({
      txHash,
      status: "confirmed",
      orderId,
      contractId,
      attestationNonce,
      submittedWallet,
      ledger: 12345,
    }),
  });

  const releaseService = new ReleaseService(undefined, confirmedChain);
  await releaseService.recordRelease({
    actor: {
      userId: service.userId,
      email: "participant@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    txHash: "tx-confirmed-2",
    attestationNonce: nonce,
    submittedWallet: wallet,
    correlationId: "corr-record-3",
  });

  const replay = await releaseService.recordRelease({
    actor: {
      userId: service.userId,
      email: "participant@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    txHash: "tx-confirmed-2",
    attestationNonce: nonce,
    submittedWallet: wallet,
    correlationId: "corr-record-4",
  });

  assert.equal(replay.release_status, "confirmed");
  assert.equal(replay.tx?.txHash, "tx-confirmed-2");
});

test("already released orders fail closed", async () => {
  const { service, orderId, nonce, wallet } = await setupReleaseIntentFixture();

  await repository.updateOrderStatus(orderId, "Released", "Already finalized", {
    releasedAt: new Date().toISOString(),
  });

  const releaseService = new ReleaseService(
    undefined,
    new ChainService({
      verifyReleaseTransaction: async ({ txHash, orderId, contractId, attestationNonce, submittedWallet }) => ({
        txHash,
        status: "confirmed",
        orderId,
        contractId,
        attestationNonce,
        submittedWallet,
      }),
    }),
  );

  await assert.rejects(
    releaseService.recordRelease({
      actor: {
        userId: service.userId,
        email: "participant@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
      orderId,
      txHash: "tx-confirmed-3",
      attestationNonce: nonce,
      submittedWallet: wallet,
      correlationId: "corr-record-5",
    }),
    /already been released/,
  );
});

async function setupReleaseIntentFixture() {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: "escrow-staging",
    tokenContractId: "token-staging",
    oraclePublicKey: "oracle-staging",
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Passphrase",
  });

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

  const baseService = new ReleaseService();
  const intent = await baseService.createReleaseIntent({
    actor: {
      userId,
      email: "participant@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    correlationId: "corr-intent",
  });

  return {
    service: { userId },
    orderId,
    nonce: intent.attestation.nonce,
    wallet,
  };
}
