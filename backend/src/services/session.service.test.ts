import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { ActorService } = await import("./actor.service.js");
const { SessionService } = await import("./session.service.js");
const { InMemoryFoundationRepository } = await import("../lib/foundation-repository.js");

test("session service creates, resolves, expires, and revokes actor sessions", async () => {
  const repository = new InMemoryFoundationRepository();
  const actorService = new ActorService(repository);
  const sessionService = new SessionService(repository);

  const created = await actorService.createDemoActor({
    role: "seller",
    displayName: "Seller Session",
    pin: "123456",
  });

  const issued = await sessionService.createSession(created.actor.id);
  const resolved = await sessionService.resolveSessionActor(issued.token);

  assert.equal(resolved?.actorId, created.actor.id);
  assert.equal(resolved?.role, "seller");

  const sessionRecord = await repository.getActorSessionByTokenHash((await import("../lib/foundation-security.js")).hashOpaqueToken(issued.token));
  assert.ok(sessionRecord);
  await repository.updateActorSession(sessionRecord.id, {
    expiresAt: new Date(Date.now() - 1_000).toISOString(),
  });

  assert.equal(await sessionService.resolveSessionActor(issued.token), null);

  const second = await sessionService.createSession(created.actor.id);
  assert.equal(await sessionService.revokeSession(second.token), true);
  assert.equal(await sessionService.resolveSessionActor(second.token), null);
});
