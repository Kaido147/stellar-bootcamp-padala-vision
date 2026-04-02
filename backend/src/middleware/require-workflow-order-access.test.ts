import test from "node:test";
import assert from "node:assert/strict";
import express from "express";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { createActorSessionMiddleware } = await import("./actor-session.js");
const { requireWorkflowOrderAccess } = await import("./require-workflow-order-access.js");
const { errorHandler } = await import("./error-handler.js");
const { correlationIdMiddleware } = await import("./correlation-id.js");
const { foundationRepository } = await import("../lib/foundation-repository.js");

test("requireWorkflowOrderAccess allows participants and hides orders from non-participants", async () => {
  const now = new Date().toISOString();
  await foundationRepository.createWorkflowOrder({
    id: "access-order-1",
    publicOrderCode: "ORD-ACCESS",
    workflowStatus: "funded",
    sellerWallet: "GSELLERACCESS000000000000000000000000000000000000000000",
    buyerWallet: "GBUYERACCESS0000000000000000000000000000000000000000000",
    sellerActorId: "seller-owner",
    buyerActorId: "buyer-owner",
    riderActorId: null,
    itemAmount: "10",
    deliveryFee: "2",
    totalAmount: "12",
    itemDescription: "Parcel",
    pickupLabel: "Pickup",
    dropoffLabel: "Dropoff",
    fundingDeadlineAt: now,
    lastEventType: "funding_confirmed",
    lastEventAt: now,
  });

  const app = express();
  app.use(correlationIdMiddleware);
  app.use(
    createActorSessionMiddleware({
      resolveSessionActor: async () => ({
        sessionId: "session-1",
        actorId: "seller-owner",
        role: "seller",
        status: "active",
      }),
    }),
  );
  app.get("/orders/:orderId", requireWorkflowOrderAccess(), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);

  const allowed = await request(app, "/orders/access-order-1");
  assert.equal(allowed.status, 200);

  const forbiddenApp = express();
  forbiddenApp.use(correlationIdMiddleware);
  forbiddenApp.use(
    createActorSessionMiddleware({
      resolveSessionActor: async () => ({
        sessionId: "session-2",
        actorId: "seller-outsider",
        role: "seller",
        status: "active",
      }),
    }),
  );
  forbiddenApp.get("/orders/:orderId", requireWorkflowOrderAccess(), (_req, res) => {
    res.json({ ok: true });
  });
  forbiddenApp.use(errorHandler);

  const hidden = await request(forbiddenApp, "/orders/access-order-1");
  assert.equal(hidden.status, 404);
});

async function request(app: express.Express, path: string) {
  const server = await new Promise<import("node:http").Server>((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  try {
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Failed to resolve test server address");
    }

    return await fetch(`http://127.0.0.1:${address.port}${path}`, {
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
