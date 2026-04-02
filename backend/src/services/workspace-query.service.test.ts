import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { WorkspaceQueryService } = await import("./workspace-query.service.js");
const { InMemoryFoundationRepository } = await import("../lib/foundation-repository.js");

test("workspace query service groups seller, buyer, rider, and operator primitives", async () => {
  const repository = new InMemoryFoundationRepository();
  const service = new WorkspaceQueryService(repository);
  const now = new Date().toISOString();
  const overdue = new Date(Date.now() - 1_000).toISOString();

  await repository.createWorkflowOrder({
    id: "w1",
    publicOrderCode: "ORD-1",
    workflowStatus: "awaiting_funding",
    sellerWallet: "GSELLERWORKSPACE100000000000000000000000000000000000000000",
    buyerWallet: "GBUYERWORKSPACE1000000000000000000000000000000000000000000",
    sellerActorId: "seller-1",
    buyerActorId: "buyer-1",
    itemAmount: "10",
    deliveryFee: "2",
    totalAmount: "12",
    itemDescription: "A",
    pickupLabel: "P1",
    dropoffLabel: "D1",
    fundingDeadlineAt: now,
    lastEventType: "order_created",
    lastEventAt: now,
  });
  await repository.createWorkflowOrder({
    id: "w2",
    publicOrderCode: "ORD-2",
    workflowStatus: "funded",
    sellerWallet: "GSELLERWORKSPACE200000000000000000000000000000000000000000",
    buyerWallet: "GBUYERWORKSPACE2000000000000000000000000000000000000000000",
    sellerActorId: "seller-1",
    buyerActorId: "buyer-1",
    itemAmount: "10",
    deliveryFee: "2",
    totalAmount: "12",
    itemDescription: "B",
    pickupLabel: "P2",
    dropoffLabel: "D2",
    fundingDeadlineAt: now,
    lastEventType: "funding_confirmed",
    lastEventAt: now,
  });
  await repository.createWorkflowOrder({
    id: "w3",
    publicOrderCode: "ORD-3",
    workflowStatus: "awaiting_buyer_confirmation",
    sellerWallet: "GSELLERWORKSPACE300000000000000000000000000000000000000000",
    buyerWallet: "GBUYERWORKSPACE3000000000000000000000000000000000000000000",
    sellerActorId: "seller-1",
    buyerActorId: "buyer-1",
    riderActorId: "rider-1",
    itemAmount: "10",
    deliveryFee: "2",
    totalAmount: "12",
    itemDescription: "C",
    pickupLabel: "P3",
    dropoffLabel: "D3",
    fundingDeadlineAt: now,
    buyerConfirmationDueAt: overdue,
    lastEventType: "proof_submitted",
    lastEventAt: now,
  });
  await repository.createWorkflowOrder({
    id: "w4",
    publicOrderCode: "ORD-4",
    workflowStatus: "manual_review",
    sellerWallet: "GSELLERWORKSPACE400000000000000000000000000000000000000000",
    buyerWallet: "GBUYERWORKSPACE4000000000000000000000000000000000000000000",
    sellerActorId: "seller-2",
    buyerActorId: "buyer-2",
    itemAmount: "10",
    deliveryFee: "2",
    totalAmount: "12",
    itemDescription: "D",
    pickupLabel: "P4",
    dropoffLabel: "D4",
    fundingDeadlineAt: now,
    lastEventType: "manual_review_opened",
    lastEventAt: now,
  });

  const sellerWorkspace = await service.listSellerWorkspace("seller-1");
  assert.equal(sellerWorkspace.needsFunding.length, 1);
  assert.equal(sellerWorkspace.activeDelivery.length, 1);
  assert.equal(sellerWorkspace.awaitingBuyerConfirmation.length, 1);

  const buyerWorkspace = await service.listBuyerWorkspace("buyer-1");
  assert.equal(buyerWorkspace.toFund.length, 1);
  assert.equal(buyerWorkspace.needsYourConfirmation.length, 1);

  const availableJobs = await service.listRiderAvailableJobs();
  assert.equal(availableJobs.length, 1);

  const assignedJobs = await service.listRiderAssignedJobs("rider-1");
  assert.equal(assignedJobs.length, 1);

  const operatorQueues = await service.listOperatorQueues();
  assert.equal(operatorQueues.manualReviewQueue.length, 1);
  assert.equal(operatorQueues.overdueBuyerConfirmations.length, 1);
});
