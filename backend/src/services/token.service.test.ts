import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { TokenService } = await import("./token.service.js");
const { InMemoryFoundationRepository } = await import("../lib/foundation-repository.js");
const { hashOpaqueToken } = await import("../lib/foundation-security.js");

test("token service hashes, validates, consumes, and invalidates on reissue", async () => {
  const repository = new InMemoryFoundationRepository();
  const service = new TokenService(repository);

  const first = await service.issueToken({
    orderId: "order-token-1",
    actorId: "actor-1",
    type: "buyer_invite",
  });

  const stored = await repository.getOrderAccessTokenByTokenHash(hashOpaqueToken(first.token));
  assert.ok(stored);
  assert.equal(stored?.type, "buyer_invite");

  const validated = await service.validateToken(first.token, "buyer_invite");
  assert.equal(validated?.id, stored?.id);

  const second = await service.issueToken({
    orderId: "order-token-1",
    actorId: "actor-1",
    type: "buyer_invite",
  });

  assert.equal(await service.validateToken(first.token, "buyer_invite"), null);
  assert.ok(await service.validateToken(second.token, "buyer_invite"));

  const consumed = await service.consumeToken(second.token, "buyer_invite");
  assert.ok(consumed.consumedAt);
  assert.equal(await service.validateToken(second.token, "buyer_invite"), null);
});
