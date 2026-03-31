import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { requireRole } = await import("./require-role.js");
const { correlationIdMiddleware } = await import("./correlation-id.js");
const { createAuthSessionMiddleware } = await import("./auth.js");
const { errorHandler } = await import("./error-handler.js");

test("requireRole blocks actors without required role", async () => {
  const app = express();
  app.use(correlationIdMiddleware);
  app.use(
    createAuthSessionMiddleware({
      resolveSessionActor: async () => ({
        userId: "user-1",
        email: "user@example.com",
        phone: null,
        accessToken: "token",
        roles: [],
      }),
    }),
  );
  app.post("/ops", requireRole("ops_reviewer", "ops_admin"), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const response = await request(app);
  const body = await response.json();

  assert.equal(response.status, 403);
  assert.match(body.error, /requires one of/);
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

    return await fetch(`http://127.0.0.1:${address.port}/ops`, {
      method: "POST",
      headers: {
        Authorization: "Bearer token",
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
