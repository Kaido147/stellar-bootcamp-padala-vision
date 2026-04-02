import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Keypair } from "@stellar/stellar-sdk";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "";
process.env.SUPABASE_SERVICE_ROLE_KEY = "";

const { createApp } = await import("../app.js");
const { env } = await import("../config/env.js");
const { ActorService } = await import("../services/actor.service.js");
const { ChainService } = await import("../services/chain.service.js");
const { clearContractRegistry, seedContractRegistry } = await import("../services/contract-registry.service.js");

test("workflow v1 routes wire the redesigned backend API surface", async (t) => {
  const originalVerifyCreateOrderTransaction = ChainService.prototype.verifyCreateOrderTransaction;
  const originalVerifyOrderActionTransaction = ChainService.prototype.verifyOrderActionTransaction;

  ChainService.prototype.verifyCreateOrderTransaction = async function mockVerifyCreateOrderTransaction(input) {
    return {
      txHash: input.txHash,
      status: "confirmed",
      contractId: input.contractId,
      submittedWallet: input.submittedWallet,
      sellerWallet: input.sellerWallet,
      buyerWallet: input.buyerWallet,
      onChainOrderId: String(Math.floor(Date.now() / 1000)),
      ledger: 123456,
    };
  };

  ChainService.prototype.verifyOrderActionTransaction = async function mockVerifyOrderActionTransaction(input) {
    return {
      txHash: input.txHash,
      status: "confirmed",
      orderId: input.orderId,
      contractId: input.contractId,
      submittedWallet: input.submittedWallet,
      riderWallet: input.riderWallet ?? null,
      ledger: 123457,
    };
  };

  await clearContractRegistry();
  await seedContractRegistry({
    environment: env.APP_ENV,
    escrowContractId: `escrow-${randomUUID()}`,
    tokenContractId: `token-${randomUUID()}`,
    oraclePublicKey: `oracle-${randomUUID()}`,
    rpcUrl: "https://rpc.test.invalid",
    networkPassphrase: "Test SDF Network ; September 2015",
  });

  const actorService = new ActorService();
  const suiteId = randomUUID().slice(0, 8);

  const seller = await actorService.createDemoActor({
    role: "seller",
    displayName: `Seller ${suiteId}`,
    pin: "123456",
  });
  const otherSeller = await actorService.createDemoActor({
    role: "seller",
    displayName: `Other Seller ${suiteId}`,
    pin: "123456",
  });
  const rider = await actorService.createDemoActor({
    role: "rider",
    displayName: `Rider ${suiteId}`,
    pin: "123456",
  });
  const operator = await actorService.createDemoActor({
    role: "operator",
    displayName: `Operator ${suiteId}`,
    pin: "123456",
  });

  const app = createApp();
  const server = await listen(app);
  const baseUrl = getBaseUrl(server);

  t.after(async () => {
    ChainService.prototype.verifyCreateOrderTransaction = originalVerifyCreateOrderTransaction;
    ChainService.prototype.verifyOrderActionTransaction = originalVerifyOrderActionTransaction;
    await closeServer(server);
  });

  await t.test("session enter/logout/me supports actor cookies", async () => {
    const entered = await apiRequest(baseUrl, "/api/session/enter", {
      method: "POST",
      json: {
        role: "seller",
        workspaceCode: seller.workspaceCode,
        pin: "123456",
      },
    });

    assert.equal(entered.status, 201);
    assert.equal(entered.data.actor.role, "seller");
    const sellerCookie = requireCookie(entered);

    const me = await apiRequest(baseUrl, "/api/session/me", {
      cookie: sellerCookie,
    });
    assert.equal(me.status, 200);
    assert.equal(me.data.session.actor.id, seller.actor.id);

    const logout = await apiRequest(baseUrl, "/api/session/logout", {
      method: "POST",
      cookie: sellerCookie,
    });
    assert.equal(logout.status, 200);
    assert.equal(logout.data.ok, true);
    assert.match(logout.setCookie ?? "", new RegExp(`^${env.ACTOR_SESSION_COOKIE_NAME}=`));

    const staleSession = await apiRequest(baseUrl, "/api/session/me", {
      cookie: sellerCookie,
    });
    assert.equal(staleSession.status, 200);
    assert.equal(staleSession.data.session, null);
  });

  await t.test("seller and buyer routes support order creation, invite reissue, claim, repeat buyer entry, and cancellation", async () => {
    const sellerCookie = await enterWorkspace(baseUrl, seller.workspaceCode, "123456", "seller");
    const created = await createWorkflowOrder(baseUrl, sellerCookie, "buyer-a");

    assert.equal(created.status, 201);
    const orderId = created.data.order.orderId as string;
    const invite1 = created.data.buyerInvite.token as string;

    const sellerList = await apiRequest(baseUrl, "/api/seller/orders", {
      cookie: sellerCookie,
    });
    assert.equal(sellerList.status, 200);
    assert.ok(sellerList.data.needsFunding.some((order: { orderId: string }) => order.orderId === orderId));

    const sellerDetail = await apiRequest(baseUrl, `/api/seller/orders/${orderId}`, {
      cookie: sellerCookie,
    });
    assert.equal(sellerDetail.status, 200);
    assert.equal(sellerDetail.data.order.orderId, orderId);
    assert.equal(sellerDetail.data.buyerInviteActive, true);

    const wrongRole = await apiRequest(baseUrl, "/api/buyer/orders", {
      cookie: sellerCookie,
    });
    assert.equal(wrongRole.status, 403);

    const reissued = await apiRequest(baseUrl, `/api/seller/orders/${orderId}/buyer-invite/reissue`, {
      method: "POST",
      cookie: sellerCookie,
    });
    assert.equal(reissued.status, 200);
    const invite2 = reissued.data.buyerInvite.token as string;
    assert.notEqual(invite1, invite2);

    const staleInviteClaim = await apiRequest(baseUrl, "/api/buyer/invite/claim", {
      method: "POST",
      json: {
        token: invite1,
        pin: "654321",
        displayName: `Buyer ${suiteId} stale`,
      },
    });
    assert.equal(staleInviteClaim.status, 401);

    const claimed = await apiRequest(baseUrl, "/api/buyer/invite/claim", {
      method: "POST",
      json: {
        token: invite2,
        pin: "654321",
        displayName: `Buyer ${suiteId} active`,
      },
    });
    assert.equal(claimed.status, 201);
    assert.equal(claimed.data.actor.role, "buyer");
    assert.equal(claimed.data.order.orderId, orderId);
    const buyerCookie = requireCookie(claimed);
    const buyerWorkspaceCode = claimed.data.workspaceCode as string;

    const buyerRepeatEntry = await apiRequest(baseUrl, "/api/session/enter", {
      method: "POST",
      json: {
        role: "buyer",
        workspaceCode: buyerWorkspaceCode,
        pin: "654321",
      },
    });
    assert.equal(buyerRepeatEntry.status, 201);
    assert.equal(buyerRepeatEntry.data.actor.role, "buyer");

    const buyerList = await apiRequest(baseUrl, "/api/buyer/orders", {
      cookie: buyerCookie,
    });
    assert.equal(buyerList.status, 200);
    assert.ok(buyerList.data.toFund.some((order: { orderId: string }) => order.orderId === orderId));

    const buyerDetail = await apiRequest(baseUrl, `/api/buyer/orders/${orderId}`, {
      cookie: buyerCookie,
    });
    assert.equal(buyerDetail.status, 200);
    assert.equal(buyerDetail.data.confirmationTokenActive, false);

    const cancelled = await apiRequest(baseUrl, `/api/seller/orders/${orderId}/cancel`, {
      method: "POST",
      cookie: sellerCookie,
    });
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.data.status, "cancelled");

    const recancelled = await apiRequest(baseUrl, `/api/seller/orders/${orderId}/cancel`, {
      method: "POST",
      cookie: sellerCookie,
    });
    assert.equal(recancelled.status, 409);
  });

  await t.test("buyer funding, rider fulfillment, shared detail access, and confirmation approval work through HTTP", async () => {
    const sellerCookie = await enterWorkspace(baseUrl, seller.workspaceCode, "123456", "seller");
    const riderCookie = await enterWorkspace(baseUrl, rider.workspaceCode, "123456", "rider");
    const otherSellerCookie = await enterWorkspace(baseUrl, otherSeller.workspaceCode, "123456", "seller");

    const flow = await createClaimedOrder(baseUrl, sellerCookie, "buyer-b", "445566");
    const { orderId, buyerCookie, buyerWallet } = flow;

    const funded = await fundWorkflowOrder(baseUrl, orderId, buyerCookie, buyerWallet);
    assert.equal(funded.status, 200);
    assert.equal(funded.data.status, "funded");

    const availableJobs = await apiRequest(baseUrl, "/api/rider/jobs/available", {
      cookie: riderCookie,
    });
    assert.equal(availableJobs.status, 200);
    assert.ok(availableJobs.data.jobs.some((job: { orderId: string }) => job.orderId === orderId));

    const accepted = await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/accept`, {
      method: "POST",
      cookie: riderCookie,
    });
    assert.equal(accepted.status, 200);
    assert.equal(accepted.data.status, "rider_assigned");

    const myJobs = await apiRequest(baseUrl, "/api/rider/jobs/mine", {
      cookie: riderCookie,
    });
    assert.equal(myJobs.status, 200);
    assert.ok(myJobs.data.jobs.some((job: { orderId: string }) => job.orderId === orderId));

    const pickedUp = await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/pickup`, {
      method: "POST",
      cookie: riderCookie,
      json: {
        pickedUpAt: new Date().toISOString(),
      },
    });
    assert.equal(pickedUp.status, 200);
    assert.equal(pickedUp.data.status, "in_transit");

    const upload = await uploadProofFile(baseUrl, orderId, riderCookie);
    assert.equal(upload.status, 201);
    assert.ok(upload.data.uploadUrl);

    const submitted = await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/proof/submit`, {
      method: "POST",
      cookie: riderCookie,
      json: {
        imageUrl: upload.data.uploadUrl,
        storagePath: upload.data.storagePath,
        fileHash: `hash-${randomUUID()}`,
        note: "Delivered successfully",
        submittedAt: new Date().toISOString(),
      },
    });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.data.status, "awaiting_buyer_confirmation");

    const confirmationIssued = await apiRequest(baseUrl, `/api/buyer/orders/${orderId}/confirmation/reissue`, {
      method: "POST",
      cookie: buyerCookie,
    });
    assert.equal(confirmationIssued.status, 200);
    const confirmationToken = confirmationIssued.data.deliveryConfirmation.token as string;

    const confirmationView = await apiRequest(baseUrl, `/api/confirmations/${confirmationToken}/view`, {
      method: "POST",
    });
    assert.equal(confirmationView.status, 200);
    assert.equal(confirmationView.data.orderId, orderId);

    const approved = await apiRequest(baseUrl, `/api/confirmations/${confirmationToken}/approve`, {
      method: "POST",
      json: {
        pin: "445566",
      },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.data.status, "release_pending");

    const replayed = await apiRequest(baseUrl, `/api/confirmations/${confirmationToken}/approve`, {
      method: "POST",
      json: {
        pin: "445566",
      },
    });
    assert.equal(replayed.status, 401);

    const sharedOrder = await apiRequest(baseUrl, `/api/orders/${orderId}`, {
      cookie: buyerCookie,
    });
    assert.equal(sharedOrder.status, 200);
    assert.equal(sharedOrder.data.order.relation, "buyer_owner");

    const hiddenSharedOrder = await apiRequest(baseUrl, `/api/orders/${orderId}`, {
      cookie: otherSellerCookie,
    });
    assert.equal(hiddenSharedOrder.status, 404);

    const invalidCancel = await apiRequest(baseUrl, `/api/seller/orders/${orderId}/cancel`, {
      method: "POST",
      cookie: sellerCookie,
    });
    assert.equal(invalidCancel.status, 409);
  });

  await t.test("operator review endpoints expose manual-review workflow orders", async () => {
    const sellerCookie = await enterWorkspace(baseUrl, seller.workspaceCode, "123456", "seller");
    const riderCookie = await enterWorkspace(baseUrl, rider.workspaceCode, "123456", "rider");
    const operatorCookie = await enterWorkspace(baseUrl, operator.workspaceCode, "123456", "operator");

    const flow = await createClaimedOrder(baseUrl, sellerCookie, "buyer-c", "223344");
    const { orderId, buyerCookie, buyerWallet } = flow;

    const funded = await fundWorkflowOrder(baseUrl, orderId, buyerCookie, buyerWallet);
    assert.equal(funded.status, 200);
    await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/accept`, {
      method: "POST",
      cookie: riderCookie,
    });
    await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/pickup`, {
      method: "POST",
      cookie: riderCookie,
      json: {
        pickedUpAt: new Date().toISOString(),
      },
    });

    const upload = await uploadProofFile(baseUrl, orderId, riderCookie);
    const manualReview = await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/proof/submit`, {
      method: "POST",
      cookie: riderCookie,
      json: {
        imageUrl: upload.data.uploadUrl,
        storagePath: upload.data.storagePath,
        fileHash: `hash-${randomUUID()}`,
        note: "manual_review required due to suspicious handoff",
        submittedAt: new Date().toISOString(),
      },
    });
    assert.equal(manualReview.status, 200);
    assert.equal(manualReview.data.status, "manual_review");

    const reviews = await apiRequest(baseUrl, "/api/operator/reviews", {
      cookie: operatorCookie,
    });
    assert.equal(reviews.status, 200);
    assert.ok(reviews.data.manualReviewQueue.some((item: { orderId: string }) => item.orderId === orderId));

    const reviewDetail = await apiRequest(baseUrl, `/api/operator/reviews/${orderId}`, {
      cookie: operatorCookie,
    });
    assert.equal(reviewDetail.status, 200);
    assert.equal(reviewDetail.data.order.status, "manual_review");

    const operatorReissue = await apiRequest(baseUrl, `/api/operator/orders/${orderId}/confirmation/reissue`, {
      method: "POST",
      cookie: operatorCookie,
    });
    assert.equal(operatorReissue.status, 200);
    assert.equal(operatorReissue.data.deliveryConfirmation.type, "delivery_confirmation");
  });

  await t.test("buyer rejection opens disputes and operator dispute endpoints resolve them", async () => {
    const sellerCookie = await enterWorkspace(baseUrl, seller.workspaceCode, "123456", "seller");
    const riderCookie = await enterWorkspace(baseUrl, rider.workspaceCode, "123456", "rider");
    const operatorCookie = await enterWorkspace(baseUrl, operator.workspaceCode, "123456", "operator");

    const flow = await createClaimedOrder(baseUrl, sellerCookie, "buyer-d", "112233");
    const { orderId, buyerCookie, buyerWallet } = flow;

    const funded = await fundWorkflowOrder(baseUrl, orderId, buyerCookie, buyerWallet);
    assert.equal(funded.status, 200);
    await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/accept`, {
      method: "POST",
      cookie: riderCookie,
    });
    await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/pickup`, {
      method: "POST",
      cookie: riderCookie,
      json: {
        pickedUpAt: new Date().toISOString(),
      },
    });

    const upload = await uploadProofFile(baseUrl, orderId, riderCookie);
    await apiRequest(baseUrl, `/api/rider/jobs/${orderId}/proof/submit`, {
      method: "POST",
      cookie: riderCookie,
      json: {
        imageUrl: upload.data.uploadUrl,
        storagePath: upload.data.storagePath,
        fileHash: `hash-${randomUUID()}`,
        note: "Delivered, buyer to confirm",
        submittedAt: new Date().toISOString(),
      },
    });

    const confirmationIssued = await apiRequest(baseUrl, `/api/buyer/orders/${orderId}/confirmation/reissue`, {
      method: "POST",
      cookie: buyerCookie,
    });
    const confirmationToken = confirmationIssued.data.deliveryConfirmation.token as string;

    const rejected = await apiRequest(baseUrl, `/api/confirmations/${confirmationToken}/reject`, {
      method: "POST",
      json: {
        pin: "112233",
        reasonCode: "proof_mismatch",
        note: "The recipient photo does not match the handoff.",
      },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.data.status, "dispute_open");
    const disputeId = rejected.data.disputeId as string;

    const disputes = await apiRequest(baseUrl, "/api/operator/disputes", {
      cookie: operatorCookie,
    });
    assert.equal(disputes.status, 200);
    assert.ok(disputes.data.disputes.some((item: { disputeId: string }) => item.disputeId === disputeId));

    const disputeDetail = await apiRequest(baseUrl, `/api/operator/disputes/${disputeId}`, {
      cookie: operatorCookie,
    });
    assert.equal(disputeDetail.status, 200);
    assert.equal(disputeDetail.data.disputeId, disputeId);

    const resolved = await apiRequest(baseUrl, `/api/operator/disputes/${disputeId}/resolve`, {
      method: "POST",
      cookie: operatorCookie,
      json: {
        resolution: "release",
        note: "Operator resolved in favor of release",
      },
    });
    assert.equal(resolved.status, 200);
    assert.equal(resolved.data.status, "release_pending");

    const reresolve = await apiRequest(baseUrl, `/api/operator/disputes/${disputeId}/resolve`, {
      method: "POST",
      cookie: operatorCookie,
      json: {
        resolution: "release",
      },
    });
    assert.equal(reresolve.status, 404);
  });
});

function createOrderPayload(label: string) {
  const sellerWallet = Keypair.random().publicKey();
  const buyerWallet = Keypair.random().publicKey();
  return {
    buyerDisplayName: `Buyer ${label} ${randomUUID().slice(0, 4)}`,
    buyerContactLabel: `${label}@example.test`,
    sellerWallet,
    buyerWallet,
    itemDescription: `Parcel ${label}`,
    pickupLabel: `Pickup ${label}`,
    dropoffLabel: `Dropoff ${label}`,
    itemAmount: "100.00",
    deliveryFee: "25.00",
    totalAmount: "125.00",
    fundingDeadlineAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

async function createClaimedOrder(baseUrl: string, sellerCookie: string, label: string, buyerPin: string) {
  const created = await createWorkflowOrder(baseUrl, sellerCookie, label);
  assert.equal(created.status, 201);

  const claimed = await apiRequest(baseUrl, "/api/buyer/invite/claim", {
    method: "POST",
    json: {
      token: created.data.buyerInvite.token,
      pin: buyerPin,
      displayName: `Buyer ${label} active`,
    },
  });
  assert.equal(claimed.status, 201);

  return {
    orderId: created.data.order.orderId as string,
    buyerCookie: requireCookie(claimed),
    buyerWorkspaceCode: claimed.data.workspaceCode as string,
    buyerWallet: created.meta.buyerWallet as string,
  };
}

async function createWorkflowOrder(baseUrl: string, sellerCookie: string, label: string) {
  const payload = createOrderPayload(label);
  const intent = await apiRequest(baseUrl, "/api/seller/orders/create-intent", {
    method: "POST",
    cookie: sellerCookie,
    json: {
      sellerWallet: payload.sellerWallet,
      buyerWallet: payload.buyerWallet,
      itemDescription: payload.itemDescription,
      pickupLabel: payload.pickupLabel,
      dropoffLabel: payload.dropoffLabel,
      itemAmount: payload.itemAmount,
      deliveryFee: payload.deliveryFee,
      totalAmount: payload.totalAmount,
      fundingDeadlineAt: payload.fundingDeadlineAt,
    },
  });
  assert.equal(intent.status, 201);
  assert.equal(intent.data.actionType, "create_order");

  const created = await apiRequest(baseUrl, "/api/seller/orders", {
    method: "POST",
    cookie: sellerCookie,
    json: {
      ...payload,
      txHash: `create-tx-${randomUUID()}`,
      submittedWallet: payload.sellerWallet,
    },
  });

  return {
    ...created,
    meta: {
      sellerWallet: payload.sellerWallet,
      buyerWallet: payload.buyerWallet,
    },
  };
}

async function fundWorkflowOrder(baseUrl: string, orderId: string, buyerCookie: string, buyerWallet: string) {
  const fundingIntent = await apiRequest(baseUrl, `/api/buyer/orders/${orderId}/fund/intent`, {
    method: "POST",
    cookie: buyerCookie,
  });
  assert.equal(fundingIntent.status, 201);
  assert.equal(fundingIntent.data.actionType, "fund");

  return apiRequest(baseUrl, `/api/buyer/orders/${orderId}/fund/confirm`, {
    method: "POST",
    cookie: buyerCookie,
    json: {
      actionIntentId: fundingIntent.data.actionIntentId,
      txHash: `fund-tx-${randomUUID()}`,
      submittedWallet: buyerWallet,
    },
  });
}

async function enterWorkspace(baseUrl: string, workspaceCode: string, pin: string, role: "seller" | "buyer" | "rider" | "operator") {
  const response = await apiRequest(baseUrl, "/api/session/enter", {
    method: "POST",
    json: {
      role,
      workspaceCode,
      pin,
    },
  });

  assert.equal(response.status, 201);
  return requireCookie(response);
}

async function uploadProofFile(baseUrl: string, orderId: string, cookie: string) {
  const form = new FormData();
  form.append("file", new Blob(["proof-bytes"], { type: "image/jpeg" }), "proof.jpg");

  return apiRequest(baseUrl, `/api/rider/jobs/${orderId}/proof/upload`, {
    method: "POST",
    cookie,
    form,
  });
}

function requireCookie(response: ApiResponse) {
  assert.ok(response.setCookie, "expected Set-Cookie header");
  return response.setCookie.split(";")[0];
}

async function listen(app: ReturnType<typeof createApp>) {
  return await new Promise<import("node:http").Server>((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function getBaseUrl(server: import("node:http").Server) {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to resolve server address");
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: import("node:http").Server) {
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

interface ApiResponse {
  status: number;
  data: any;
  setCookie: string | null;
}

async function apiRequest(
  baseUrl: string,
  path: string,
  input: {
    method?: string;
    cookie?: string;
    json?: unknown;
    form?: FormData;
  } = {},
): Promise<ApiResponse> {
  const headers = new Headers();
  if (input.cookie) {
    headers.set("Cookie", input.cookie);
  }

  let body: BodyInit | undefined;
  if (input.form) {
    body = input.form;
  } else if (input.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(input.json);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: input.method ?? "GET",
    headers,
    body,
  });

  const raw = await response.text();
  return {
    status: response.status,
    data: raw ? JSON.parse(raw) : null,
    setCookie: response.headers.get("set-cookie"),
  };
}
