import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { StateTransitionService } = await import("./state-transition.service.js");
const { InMemoryFoundationRepository } = await import("../lib/foundation-repository.js");

test("state transition service applies shared foundation transitions and emits timeline events", async () => {
  const repository = new InMemoryFoundationRepository();
  const service = new StateTransitionService(repository);

  await repository.createWorkflowOrder({
    id: "workflow-order-1",
    publicOrderCode: "ORD-1001",
    workflowStatus: "awaiting_buyer_confirmation",
    sellerWallet: "GSELLERSTATE000000000000000000000000000000000000000000",
    buyerWallet: "GBUYERSTATE0000000000000000000000000000000000000000000",
    sellerActorId: "seller-1",
    buyerActorId: "buyer-1",
    riderActorId: "rider-1",
    itemAmount: "10.00",
    deliveryFee: "2.00",
    totalAmount: "12.00",
    itemDescription: "Medicine",
    pickupLabel: "Clinic",
    dropoffLabel: "Home",
    fundingDeadlineAt: new Date(Date.now() + 86_400_000).toISOString(),
    lastEventType: "buyer_confirmation_token_issued",
    lastEventAt: new Date().toISOString(),
  });

  const result = await service.transitionOrder({
    orderId: "workflow-order-1",
    action: "buyer_approved_delivery",
    actorRole: "buyer",
    actorId: "buyer-1",
  });

  assert.equal(result.order.workflowStatus, "release_pending");
  assert.equal(result.event.type, "buyer_confirmed");

  await assert.rejects(
    service.transitionOrder({
      orderId: "workflow-order-1",
      action: "buyer_rejected_delivery",
      actorRole: "seller",
      actorId: "seller-1",
    }),
    /Transition is not allowed|Actor role is not allowed/,
  );
});
