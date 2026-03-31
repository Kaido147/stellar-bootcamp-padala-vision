import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { createActorSessionMiddleware } = await import("./actor-session.js");
const { requireActorRole } = await import("./require-actor-role.js");
const { errorHandler } = await import("./error-handler.js");
const { correlationIdMiddleware } = await import("./correlation-id.js");

test("requireActorRole blocks the wrong actor role", async () => {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(
    createActorSessionMiddleware({
      resolveSessionActor: async () => ({
        sessionId: "session-1",
        actorId: "buyer-1",
        role: "buyer",
        status: "active",
      }),
    }),
  );
  app.get("/seller", requireActorRole("seller"), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const response = await request(app);
  assert.equal(response.status, 403);
});

async function request(app: express.Express) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve test server address");
    }

    return await fetch(`http://127.0.0.1:${address.port}/seller`, {
      headers: {
        Cookie: "padala_actor_session=test-token",
      },
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
  }
}
