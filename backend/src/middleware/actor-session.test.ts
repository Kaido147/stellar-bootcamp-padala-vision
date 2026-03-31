import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { createActorSessionMiddleware } = await import("./actor-session.js");
const { errorHandler } = await import("./error-handler.js");
const { correlationIdMiddleware } = await import("./correlation-id.js");

test("actor session middleware resolves session actor from cookie", async () => {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(
    createActorSessionMiddleware({
      resolveSessionActor: async () => ({
        sessionId: "session-1",
        actorId: "seller-1",
        role: "seller",
        status: "active",
      }),
    }),
  );
  app.get("/workspace", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const response = await request(app, {
    Cookie: "padala_actor_session=test-token",
  });

  assert.equal(response.status, 200);
});

test("actor session middleware fails closed when cookie is missing", async () => {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(createActorSessionMiddleware({ resolveSessionActor: async () => null }));
  app.get("/workspace", (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const response = await request(app);
  assert.equal(response.status, 401);
});

async function request(app: express.Express, headers: Record<string, string> = {}) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve test server address");
    }

    return await fetch(`http://127.0.0.1:${address.port}/workspace`, {
      headers,
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
