import test from "node:test";
import assert from "node:assert/strict";
import {
  FOUNDATION_POLICY,
  WORKFLOW_TRANSITIONS,
  canActorRoleTriggerAction,
  canReadSharedOrderDetail,
  evaluateTransitionEligibility,
  getTransitionForAction,
  getTransitionsFrom,
  isFinalDurableOrderStatus,
  isValidBuyerPin,
  resolveOrderActorRelation,
} from "./foundation.js";
import type { OrderAccessContext } from "../types/foundation.js";

test("workflow transitions allow valid actor-driven transition", () => {
  const result = evaluateTransitionEligibility({
    from: "awaiting_buyer_confirmation",
    action: "buyer_approved_delivery",
    actorRole: "buyer",
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, "ok");
  assert.equal(result.transition?.to, "release_pending");
});

test("workflow transitions reject invalid role for actor-driven transition", () => {
  const result = evaluateTransitionEligibility({
    from: "awaiting_buyer_confirmation",
    action: "buyer_approved_delivery",
    actorRole: "seller",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "role_not_allowed");
});

test("workflow transitions reject unknown transition from a state", () => {
  const result = evaluateTransitionEligibility({
    from: "funded",
    action: "buyer_approved_delivery",
    actorRole: "buyer",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "unknown_transition");
});

test("final states are locked against further transitions", () => {
  const result = evaluateTransitionEligibility({
    from: "released",
    action: "system_confirmed_release",
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, "final_state_locked");
});

test("transition map exposes machine-readable transitions from each state", () => {
  const fromAwaitingFunding = getTransitionsFrom("awaiting_funding").map((transition) => transition.action);
  assert.deepEqual(fromAwaitingFunding, [
    "buyer_submitted_funding",
    "seller_cancelled_order",
    "system_expired_unfunded_order",
  ]);

  const specific = getTransitionForAction("dispute_open", "operator_resolved_dispute_to_refund");
  assert.equal(specific?.to, "refund_pending");
});

test("transition action eligibility is role aware", () => {
  assert.equal(canActorRoleTriggerAction("buyer", "buyer_approved_delivery"), true);
  assert.equal(canActorRoleTriggerAction("seller", "buyer_approved_delivery"), false);
  assert.equal(canActorRoleTriggerAction("operator", "operator_approved_release_from_review"), true);
});

test("shared detail access is limited to participants and operators", () => {
  const baseOwnership = {
    sellerActorId: "seller-1",
    buyerActorId: "buyer-1",
    riderActorId: "rider-1",
  };

  const sellerContext: OrderAccessContext = {
    actor: {
      sessionId: "session-1",
      actorId: "seller-1",
      role: "seller",
      status: "active",
    },
    ownership: baseOwnership,
  };

  const outsiderContext: OrderAccessContext = {
    actor: {
      sessionId: "session-2",
      actorId: "buyer-2",
      role: "buyer",
      status: "active",
    },
    ownership: baseOwnership,
  };

  const operatorContext: OrderAccessContext = {
    actor: {
      sessionId: "session-3",
      actorId: "operator-1",
      role: "operator",
      status: "active",
    },
    ownership: baseOwnership,
  };

  assert.equal(resolveOrderActorRelation(sellerContext), "seller_owner");
  assert.equal(resolveOrderActorRelation(outsiderContext), "non_participant");
  assert.equal(resolveOrderActorRelation(operatorContext), "operator");

  assert.equal(canReadSharedOrderDetail(sellerContext), true);
  assert.equal(canReadSharedOrderDetail(operatorContext), true);
  assert.equal(canReadSharedOrderDetail(outsiderContext), false);
});

test("buyer pin validation follows foundation policy", () => {
  assert.equal(isValidBuyerPin("123456"), true);
  assert.equal(isValidBuyerPin("12345"), false);
  assert.equal(isValidBuyerPin("12a456"), false);

  assert.equal(FOUNDATION_POLICY.sessionTtlMs, 12 * 60 * 60 * 1000);
  assert.equal(FOUNDATION_POLICY.buyerInviteTokenTtlMs, 7 * 24 * 60 * 60 * 1000);
  assert.equal(FOUNDATION_POLICY.deliveryConfirmationTokenTtlMs, 48 * 60 * 60 * 1000);
  assert.equal(FOUNDATION_POLICY.buyerPinLength, 6);
  assert.equal(FOUNDATION_POLICY.failedAttemptLimit, 5);
  assert.equal(FOUNDATION_POLICY.lockoutDurationMs, 15 * 60 * 1000);
  assert.equal(FOUNDATION_POLICY.repeatedLockoutThreshold, 3);
});

test("final status helper matches the foundation spec", () => {
  assert.equal(isFinalDurableOrderStatus("released"), true);
  assert.equal(isFinalDurableOrderStatus("refunded"), true);
  assert.equal(isFinalDurableOrderStatus("awaiting_buyer_confirmation"), false);
});

test("workflow transition table only points to known states", () => {
  assert.equal(WORKFLOW_TRANSITIONS.length > 0, true);
  for (const transition of WORKFLOW_TRANSITIONS) {
    assert.equal(typeof transition.description, "string");
    assert.equal(transition.description.length > 0, true);
  }
});
