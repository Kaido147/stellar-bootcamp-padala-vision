import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { correlationIdMiddleware, CORRELATION_ID_HEADER } = await import("./correlation-id.js");
const { idempotencyMiddleware } = await import("./idempotency.js");
const { createAuthSessionMiddleware, getSessionActor } = await import("./auth.js");
const { errorHandler } = await import("./error-handler.js");

test("correlation middleware preserves inbound header", async () => {
  const app = buildApp({
    auth: createAuthSessionMiddleware({
      resolveSessionActor: async () => ({
        userId: "user-1",
        email: "user@example.com",
        phone: null,
        accessToken: "valid-token",
      }),
    }),
  });

  const response = await issueRequest(app, "/api/ping", {
    method: "GET",
    headers: {
      Authorization: "Bearer valid-token",
      [CORRELATION_ID_HEADER]: "corr-123",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get(CORRELATION_ID_HEADER), "corr-123");
});

test("idempotency replays duplicate POST responses for the same key and payload", async () => {
  const app = buildApp({
    auth: createAuthSessionMiddleware({
      resolveSessionActor: async () => ({
        userId: "user-1",
        email: "user@example.com",
        phone: null,
        accessToken: "valid-token",
      }),
    }),
  });

  const first = await issueRequest(app, "/api/echo", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "same-request",
    },
    body: JSON.stringify({ amount: "12.50" }),
  });
  const firstJson = await first.json();

  const second = await issueRequest(app, "/api/echo", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "same-request",
    },
    body: JSON.stringify({ amount: "12.50" }),
  });
  const secondJson = await second.json();

  assert.equal(first.status, 201);
  assert.deepEqual(secondJson, firstJson);
  assert.equal(second.status, 201);
  assert.equal(second.headers.get(CORRELATION_ID_HEADER), first.headers.get(CORRELATION_ID_HEADER));
});

test("idempotency rejects same key with a different payload", async () => {
  const app = buildApp({
    auth: createAuthSessionMiddleware({
      resolveSessionActor: async () => ({
        userId: "user-1",
        email: "user@example.com",
        phone: null,
        accessToken: "valid-token",
      }),
    }),
  });

  await issueRequest(app, "/api/echo", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "conflict-key",
    },
    body: JSON.stringify({ amount: "12.50" }),
  });

  const conflict = await issueRequest(app, "/api/echo", {
    method: "POST",
    headers: {
      Authorization: "Bearer valid-token",
      "Content-Type": "application/json",
      "Idempotency-Key": "conflict-key",
    },
    body: JSON.stringify({ amount: "15.00" }),
  });
  const conflictJson = await conflict.json();

  assert.equal(conflict.status, 409);
  assert.equal(conflictJson.error, "Idempotency-Key conflicts with a different request payload");
});

test("idempotency scope is isolated by authorization header", async () => {
  const app = buildApp({
    auth: createAuthSessionMiddleware({
      resolveSessionActor: async (accessToken) => ({
        userId: accessToken,
        email: `${accessToken}@example.com`,
        phone: null,
        accessToken,
      }),
    }),
  });

  const first = await issueRequest(app, "/api/echo", {
    method: "POST",
    headers: {
      Authorization: "Bearer token-a",
      "Content-Type": "application/json",
      "Idempotency-Key": "shared-key",
    },
    body: JSON.stringify({ amount: "12.50" }),
  });

  const second = await issueRequest(app, "/api/echo", {
    method: "POST",
    headers: {
      Authorization: "Bearer token-b",
      "Content-Type": "application/json",
      "Idempotency-Key": "shared-key",
    },
    body: JSON.stringify({ amount: "12.50" }),
  });

  const firstJson = await first.json();
  const secondJson = await second.json();

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.equal(firstJson.user_id, "token-a");
  assert.equal(secondJson.user_id, "token-b");
});

test("auth middleware rejects missing bearer token", async () => {
  const app = buildApp({
    auth: createAuthSessionMiddleware({
      resolveSessionActor: async () => null,
    }),
  });

  const response = await issueRequest(app, "/api/ping");
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error, "Authorization bearer token is required");
});

test("auth middleware attaches session actor for valid tokens", async () => {
  const app = buildApp({
    auth: createAuthSessionMiddleware({
      resolveSessionActor: async (accessToken) => ({
        userId: "user-123",
        email: "actor@example.com",
        phone: null,
        accessToken,
      }),
    }),
  });

  const response = await issueRequest(app, "/api/ping", {
    headers: {
      Authorization: "Bearer valid-token",
    },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user_id, "user-123");
});

function buildApp(input: { auth: express.RequestHandler }) {
  const app = express();

  app.use(correlationIdMiddleware);
  app.use(express.json());
  app.use("/api", idempotencyMiddleware);
  app.use("/api", input.auth);

  app.get("/api/ping", (_req, res) => {
    const actor = getSessionActor(res);
    res.json({ ok: true, user_id: actor.userId });
  });

  app.post("/api/echo", (req, res) => {
    const actor = getSessionActor(res);
    res.status(201).json({
      created: true,
      body: req.body,
      user_id: actor.userId,
    });
  });

  app.use(errorHandler);
  return app;
}

async function issueRequest(app: express.Express, path: string, init: RequestInit = {}) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve test server address");
    }

    return await fetch(`http://127.0.0.1:${address.port}${path}`, init);
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
