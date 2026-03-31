import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { ActorService } = await import("./actor.service.js");
const { InMemoryFoundationRepository } = await import("../lib/foundation-repository.js");

test("actor service creates pending buyer actor then activates it", async () => {
  const repository = new InMemoryFoundationRepository();
  const service = new ActorService(repository);

  const pending = await service.createPendingBuyerActor({
    displayName: "Buyer Pending",
  });

  assert.equal(pending.role, "buyer");
  assert.equal(pending.status, "pending_claim");
  assert.equal(pending.workspaceCode, null);

  const activated = await service.activatePendingBuyerActor({
    actorId: pending.id,
    pin: "123456",
  });

  assert.equal(activated.actor.status, "active");
  assert.equal(activated.actor.role, "buyer");
  assert.match(activated.workspaceCode, /^BUY-/);
});

test("actor service creates active demo workspace actors", async () => {
  const repository = new InMemoryFoundationRepository();
  const service = new ActorService(repository);

  const created = await service.createDemoActor({
    role: "seller",
    displayName: "Seller Demo",
    pin: "123456",
  });

  assert.equal(created.actor.role, "seller");
  assert.equal(created.actor.status, "active");
  assert.match(created.workspaceCode, /^SEL-/);
});

test("actor service lockout policy activates after repeated failed pin attempts", async () => {
  const repository = new InMemoryFoundationRepository();
  const service = new ActorService(repository);

  const created = await service.createDemoActor({
    role: "buyer",
    displayName: "Buyer Demo",
    pin: "123456",
  } as never);

  for (let index = 0; index < 4; index += 1) {
    const result = await service.verifyWorkspaceCredentials({
      role: "buyer",
      workspaceCode: created.workspaceCode,
      pin: "000000",
    });
    assert.equal(result.ok, false);
    assert.equal(result.lockedUntil, null);
  }

  const locked = await service.verifyWorkspaceCredentials({
    role: "buyer",
    workspaceCode: created.workspaceCode,
    pin: "000000",
  });

  assert.equal(locked.ok, false);
  assert.ok(locked.lockedUntil);
  assert.equal(locked.repeatedLockoutCount, 1);
});
