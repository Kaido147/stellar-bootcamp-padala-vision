import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.APP_ENV = "staging";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { WorkflowApiService } = await import("./workflow-api.service.js");
const { env } = await import("../config/env.js");
const { foundationRepository } = await import("../lib/foundation-repository.js");
const { repository } = await import("../lib/repository.js");
const { clearContractRegistry, seedContractRegistry } = await import("./contract-registry.service.js");

const buyerActor = {
  sessionId: "session-buyer",
  actorId: "buyer-actor",
  role: "buyer" as const,
  status: "active" as const,
};

function createFundingTokenStub() {
  return {
    inspectToken: async () => ({
      contractId: "token-contract",
      symbol: "PUSD",
      name: "PUSD:issuer",
      decimals: 7,
      adminAddress: Keypair.random().publicKey(),
      assetCode: "PUSD",
      assetIssuer: Keypair.random().publicKey(),
      isStellarAssetContract: true,
      trustlineRequired: true,
    }),
    mintBuyerTopUp: async () => ({
      status: "minted" as const,
      txHash: "top-up-tx",
      mintedAmount: "1250000000",
      balanceAfter: "1250000000",
    }),
  };
}

test("createBuyerFundingIntent resolves chain metadata from the active contract registry row", async () => {
  await clearContractRegistry();
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: `escrow-${randomUUID()}`,
    tokenContractId: `token-${randomUUID()}`,
    oraclePublicKey: `oracle-${randomUUID()}`,
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Test Network",
  });

  const orderId = `workflow-order-${randomUUID()}`;
  const buyerWallet = Keypair.random().publicKey();
  await foundationRepository.createWorkflowOrder({
    id: orderId,
    publicOrderCode: "PV-FUND-INTENT",
    workflowStatus: "awaiting_funding",
    contractId: null,
    onChainOrderId: "77",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet,
    riderWallet: null,
    sellerActorId: "seller-actor",
    buyerActorId: buyerActor.actorId,
    riderActorId: null,
    itemAmount: "100.00",
    deliveryFee: "25.00",
    totalAmount: "125.00",
    itemDescription: "Parcel",
    pickupLabel: "Pickup",
    dropoffLabel: "Dropoff",
    fundingDeadlineAt: "2026-04-10T00:00:00.000Z",
    lastEventType: "buyer_claimed",
    lastEventAt: "2026-04-01T00:00:00.000Z",
  });

  const service = new WorkflowApiService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createFundingTokenStub() as never,
  );
  const intent = await service.createBuyerFundingIntent(buyerActor, orderId);

  assert.equal(intent.orderId, orderId);
  assert.equal(intent.method, "fund_order");
  assert.equal(intent.rpcUrl, "https://staging-rpc.example");
  assert.equal(intent.networkPassphrase, "Staging Test Network");
  assert.equal(intent.onChainOrderId, "77");
  assert.equal(intent.buyerWallet, buyerWallet);
  assert.equal(intent.fundingStatus, "not_started");
  assert.ok(intent.actionIntentId);
  assert.ok(intent.contractId.startsWith("escrow-"));
  assert.ok(intent.tokenContractId.startsWith("token-"));
  assert.equal(intent.token.symbol, "PUSD");
  assert.equal(intent.token.assetCode, "PUSD");
  assert.equal(intent.setup.xlmFriendbotUrl, null);

  const storedIntent = await repository.getChainActionIntentById(intent.actionIntentId);
  assert.ok(storedIntent);
  assert.equal(storedIntent?.orderId, orderId);
  assert.equal(storedIntent?.method, "fund_order");
  assert.equal(storedIntent?.actorWallet, buyerWallet);
});

test("confirmBuyerFunding keeps the order in funding_pending until chain verification confirms success", async () => {
  await clearContractRegistry();
  const contractId = `escrow-${randomUUID()}`;
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: contractId,
    tokenContractId: `token-${randomUUID()}`,
    oraclePublicKey: `oracle-${randomUUID()}`,
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Test Network",
  });

  const orderId = `workflow-order-${randomUUID()}`;
  const buyerWallet = Keypair.random().publicKey();
  await foundationRepository.createWorkflowOrder({
    id: orderId,
    publicOrderCode: "PV-FUND-PENDING",
    workflowStatus: "awaiting_funding",
    contractId,
    onChainOrderId: "101",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet,
    riderWallet: null,
    sellerActorId: "seller-actor",
    buyerActorId: buyerActor.actorId,
    riderActorId: null,
    itemAmount: "100.00",
    deliveryFee: "25.00",
    totalAmount: "125.00",
    itemDescription: "Parcel",
    pickupLabel: "Pickup",
    dropoffLabel: "Dropoff",
    fundingDeadlineAt: "2026-04-10T00:00:00.000Z",
    lastEventType: "buyer_claimed",
    lastEventAt: "2026-04-01T00:00:00.000Z",
  });

  const service = new WorkflowApiService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      verifyOrderActionTransaction: async () => ({
        txHash: "funding-pending-tx",
        status: "pending",
        orderId: "101",
        contractId,
        submittedWallet: buyerWallet,
        ledger: 555,
      }),
    } as never,
    undefined,
    undefined,
    createFundingTokenStub() as never,
  );

  const intent = await service.createBuyerFundingIntent(buyerActor, orderId);
  const result = await service.confirmBuyerFunding(buyerActor, orderId, {
    actionIntentId: intent.actionIntentId,
    txHash: "funding-pending-tx",
    submittedWallet: buyerWallet,
  });

  assert.equal(result.status, "funding_pending");
  assert.equal(result.chainStatus, "pending");

  const storedOrder = await foundationRepository.getWorkflowOrder(orderId);
  assert.equal(storedOrder?.workflowStatus, "funding_pending");
  assert.equal(storedOrder?.fundingStatus, "pending");
  assert.equal(storedOrder?.fundingTxHash, "funding-pending-tx");
  assert.equal(storedOrder?.lastChainReconciliationStatus, "funding_pending");

  const storedTx = await repository.getTransactionByHash("funding-pending-tx");
  assert.equal(storedTx?.txStatus, "pending");

  const records = await repository.listChainActionRecordsByOrder(orderId);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.status, "pending");
});

test("confirmBuyerFunding re-verifies an existing tx hash and only marks the order funded after confirmed chain success", async () => {
  await clearContractRegistry();
  const contractId = `escrow-${randomUUID()}`;
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: contractId,
    tokenContractId: `token-${randomUUID()}`,
    oraclePublicKey: `oracle-${randomUUID()}`,
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Staging Test Network",
  });

  const orderId = `workflow-order-${randomUUID()}`;
  const buyerWallet = Keypair.random().publicKey();
  await foundationRepository.createWorkflowOrder({
    id: orderId,
    publicOrderCode: "PV-FUND-CONFIRM",
    workflowStatus: "funding_pending",
    contractId,
    onChainOrderId: "202",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet,
    riderWallet: null,
    fundingTxHash: "funding-refresh-tx",
    fundingStatus: "pending",
    lastChainReconciliationStatus: "funding_pending",
    sellerActorId: "seller-actor",
    buyerActorId: buyerActor.actorId,
    riderActorId: null,
    itemAmount: "100.00",
    deliveryFee: "25.00",
    totalAmount: "125.00",
    itemDescription: "Parcel",
    pickupLabel: "Pickup",
    dropoffLabel: "Dropoff",
    fundingDeadlineAt: "2026-04-10T00:00:00.000Z",
    lastEventType: "funding_submitted",
    lastEventAt: "2026-04-01T00:00:00.000Z",
  });

  const intentId = randomUUID();
  await repository.createChainActionIntent({
    id: intentId,
    orderId,
    actionType: "fund",
    actorUserId: `workflow:${buyerActor.actorId}`,
    actorWallet: buyerWallet,
    actorRoles: ["buyer"],
    contractId,
    environment: "staging",
    method: "fund_order",
    args: { order_id: "202" },
    replayKey: randomUUID(),
    correlationId: `test-intent:${orderId}`,
  });
  await repository.createChainActionRecord({
    chainActionIntentId: intentId,
    orderId,
    actionType: "fund",
    txHash: "funding-refresh-tx",
    submittedWallet: buyerWallet,
    contractId,
    status: "pending",
    correlationId: `test-record:${orderId}`,
    confirmedAt: null,
    chainLedger: 111,
  });
  await repository.createTransaction({
    orderId,
    txHash: "funding-refresh-tx",
    txType: "workflow_fund",
    txStatus: "pending",
  });

  const service = new WorkflowApiService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    {
      verifyOrderActionTransaction: async () => ({
        txHash: "funding-refresh-tx",
        status: "confirmed",
        orderId: "202",
        contractId,
        submittedWallet: buyerWallet,
        ledger: 777,
      }),
    } as never,
    undefined,
    undefined,
    createFundingTokenStub() as never,
  );

  const result = await service.confirmBuyerFunding(buyerActor, orderId, {
    txHash: "funding-refresh-tx",
    submittedWallet: buyerWallet,
  });

  assert.equal(result.status, "funded");
  assert.equal(result.chainStatus, "confirmed");

  const storedOrder = await foundationRepository.getWorkflowOrder(orderId);
  assert.equal(storedOrder?.workflowStatus, "funded");
  assert.equal(storedOrder?.fundingStatus, "confirmed");
  assert.equal(storedOrder?.fundingTxHash, "funding-refresh-tx");
  assert.equal(storedOrder?.lastChainReconciliationStatus, "funding_confirmed");

  const storedTx = await repository.getTransactionByHash("funding-refresh-tx");
  assert.equal(storedTx?.txStatus, "confirmed");

  const storedRecord = await repository.getChainActionRecordByTxHash("funding-refresh-tx");
  assert.equal(storedRecord?.status, "confirmed");
  assert.equal(storedRecord?.chainLedger, 777);
  assert.ok(storedRecord?.confirmedAt);
});

test("requestBuyerFundingTopUp returns a testnet mint result without changing funded state", async () => {
  env.TOKEN_ADMIN_SECRET = Keypair.random().secret();
  await clearContractRegistry();
  const contractId = `escrow-${randomUUID()}`;
  await seedContractRegistry({
    environment: "staging",
    escrowContractId: contractId,
    tokenContractId: `token-${randomUUID()}`,
    oraclePublicKey: `oracle-${randomUUID()}`,
    rpcUrl: "https://staging-rpc.example",
    networkPassphrase: "Test SDF Network ; September 2015",
  });

  const orderId = `workflow-order-${randomUUID()}`;
  const buyerWallet = Keypair.random().publicKey();
  await foundationRepository.createWorkflowOrder({
    id: orderId,
    publicOrderCode: "PV-FUND-TOPUP",
    workflowStatus: "awaiting_funding",
    contractId,
    onChainOrderId: "303",
    sellerWallet: Keypair.random().publicKey(),
    buyerWallet,
    riderWallet: null,
    sellerActorId: "seller-actor",
    buyerActorId: buyerActor.actorId,
    riderActorId: null,
    itemAmount: "100.00",
    deliveryFee: "25.00",
    totalAmount: "125.00",
    itemDescription: "Parcel",
    pickupLabel: "Pickup",
    dropoffLabel: "Dropoff",
    fundingDeadlineAt: "2026-04-10T00:00:00.000Z",
    lastEventType: "buyer_claimed",
    lastEventAt: "2026-04-01T00:00:00.000Z",
  });

  const service = new WorkflowApiService(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    createFundingTokenStub() as never,
  );

  const result = await service.requestBuyerFundingTopUp(buyerActor, orderId);

  assert.equal(result.status, "minted");
  assert.equal(result.txHash, "top-up-tx");
  assert.equal(result.token.symbol, "PUSD");
  assert.equal(result.mintedAmount, "125");
  assert.equal(result.balanceAfter, "125");

  const storedOrder = await foundationRepository.getWorkflowOrder(orderId);
  assert.equal(storedOrder?.workflowStatus, "awaiting_funding");
  assert.equal(storedOrder?.fundingStatus, "not_started");
});
