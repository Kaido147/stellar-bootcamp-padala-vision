import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";
process.env.ORACLE_SECRET_KEY = Keypair.random().secret();

const { DisputeService } = await import("./dispute.service.js");
const { ReleaseService } = await import("./release.service.js");
const { repository } = await import("../lib/repository.js");
const { clearContractRegistry, seedContractRegistry } = await import("./contract-registry.service.js");
const { ChainService } = await import("./chain.service.js");

test("only ops roles can resolve disputes", async () => {
  const fixture = await setupDisputeFixture();
  const service = new DisputeService();

  await assert.rejects(
    service.resolveDispute({
      actor: {
        userId: fixture.userId,
        email: "seller@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      },
      disputeId: fixture.disputeId,
      resolution: "reject_dispute",
      reason: "not needed",
      note: "closing",
      correlationId: "corr-resolve-1",
    }),
    /Only ops_reviewer or ops_admin can resolve disputes/,
  );
});

test("reject_dispute closes dispute and restores frozen workflow state", async () => {
  const fixture = await setupDisputeFixture("Approved");
  const service = new DisputeService();

  const result = await service.resolveDispute({
    actor: {
      userId: `ops-${randomUUID()}`,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_reviewer"],
    },
    disputeId: fixture.disputeId,
    resolution: "reject_dispute",
    reason: "evidence accepted",
    note: "restoring order workflow",
    correlationId: "corr-resolve-2",
  });

  assert.equal(result.resolution_status, "resolved");
  assert.equal(result.order_status, "Approved");
});

test("release resolution returns pending when chain proof is not provided", async () => {
  const fixture = await setupDisputeFixture();
  const service = new DisputeService();

  const result = await service.resolveDispute({
    actor: {
      userId: `ops-${randomUUID()}`,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_admin"],
    },
    disputeId: fixture.disputeId,
    resolution: "release",
    reason: "manual release approved",
    note: "awaiting chain submission",
    correlationId: "corr-resolve-3",
  });

  assert.equal(result.resolution_status, "pending");
  assert.equal(result.next_action, "chain_release_confirmation_required");
});

test("release resolution closes dispute after confirmed chain-backed release", async () => {
  const fixture = await setupDisputeFixture();

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
        ledger: 222,
      }),
    }),
  );
  const service = new DisputeService(releaseService);

  const result = await service.resolveDispute({
    actor: {
      userId: fixture.opsUserId,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_admin"],
    },
    disputeId: fixture.disputeId,
    resolution: "release",
    reason: "manual release approved",
    note: "confirmed on chain",
    txHash: "tx-dispute-release-1",
    attestationNonce: fixture.attestationNonce,
    submittedWallet: fixture.opsWallet,
    correlationId: "corr-resolve-4",
  });

  assert.equal(result.resolution_status, "resolved");
  assert.equal(result.order_status, "Released");
});

test("refund resolution remains pending without marking finality", async () => {
  const fixture = await setupDisputeFixture();
  const service = new DisputeService();

  const result = await service.resolveDispute({
    actor: {
      userId: `ops-${randomUUID()}`,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_reviewer"],
    },
    disputeId: fixture.disputeId,
    resolution: "refund",
    reason: "buyer should be refunded",
    note: "awaiting refund chain confirmation",
    correlationId: "corr-resolve-5",
  });

  assert.equal(result.resolution_status, "pending");
  assert.equal(result.next_action, "refund_chain_confirmation_required");
  assert.equal((await repository.getOrder(fixture.orderId))?.status, "Disputed");
});

async function setupDisputeFixture(startStatus: "Approved" | "EvidenceSubmitted" = "Approved") {
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
  const sellerWallet = Keypair.random().publicKey();
  const opsUserId = `ops-${randomUUID()}`;
  const opsWallet = Keypair.random().publicKey();
  const orderId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

  await repository.upsertWalletBinding({
    userId,
    walletAddress: sellerWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });
  await repository.upsertWalletBinding({
    userId: opsUserId,
    walletAddress: opsWallet,
    walletProvider: "freighter",
    challengeId: randomUUID(),
    verifiedAt: new Date().toISOString(),
  });

  await repository.createOrder({
    id: orderId,
    contractId: "escrow-staging",
    sellerWallet,
    buyerWallet: Keypair.random().publicKey(),
    riderWallet: Keypair.random().publicKey(),
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    status: startStatus,
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
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  });

  const releaseService = new ReleaseService();
  const intent = await releaseService.createReleaseIntent({
    actor: {
      userId: opsUserId,
      email: "ops@example.com",
      phone: null,
      accessToken: "token",
      roles: ["ops_admin"],
    },
    orderId,
    correlationId: "corr-intent",
  });

  const disputeService = new DisputeService();
  const open = await disputeService.openDispute({
    actor: {
      userId,
      email: "seller@example.com",
      phone: null,
      accessToken: "token",
      roles: [],
    },
    orderId,
    reasonCode: "delivery_issue",
    description: "opening dispute",
    correlationId: "corr-open",
  });

  return {
    disputeId: open.dispute_id,
    orderId,
    userId,
    opsUserId,
    opsWallet,
    attestationNonce: intent.attestation.nonce,
  };
}
