import { Router } from "express";
import {
  acceptRiderJob,
  approveDeliveryConfirmation,
  cancelSellerWorkflowOrder,
  claimBuyerInvite,
  confirmBuyerFunding,
  createSellerWorkflowOrderIntent,
  createBuyerFundingIntent,
  createSellerWorkflowOrder,
  enterWorkflowSession,
  getBuyerWorkflowOrder,
  getOperatorDispute,
  getOperatorReview,
  getRiderJob,
  getSellerWorkflowOrder,
  getSharedWorkflowOrder,
  getWorkflowSession,
  listBuyerWorkflowOrders,
  listOperatorDisputes,
  listOperatorReviews,
  listRiderAvailableJobs,
  listRiderJobs,
  listSellerWorkflowOrders,
  logoutWorkflowSession,
  operatorReissueConfirmation,
  pickupRiderJob,
  rejectDeliveryConfirmation,
  reissueBuyerConfirmation,
  reissueSellerBuyerInvite,
  requestBuyerFundingTopUp,
  resolveOperatorDispute,
  submitRiderProof,
  uploadRiderProof,
  viewDeliveryConfirmation,
  workflowAsync,
  workflowProofUploadMiddleware,
} from "../controllers/workflow.controller.js";
import { actorSessionMiddleware, skipToLegacyIfNoActorSessionToken } from "../middleware/actor-session.js";
import { requireActorRole } from "../middleware/require-actor-role.js";
import { requireWorkflowOrderAccess } from "../middleware/require-workflow-order-access.js";

export const workflowRouter = Router();

workflowRouter.post("/session/enter", workflowAsync(enterWorkflowSession));
workflowRouter.post("/session/logout", workflowAsync(logoutWorkflowSession));
workflowRouter.get("/session/me", workflowAsync(getWorkflowSession));

workflowRouter.post("/seller/orders", actorSessionMiddleware, requireActorRole("seller"), workflowAsync(createSellerWorkflowOrder));
workflowRouter.post("/seller/orders/create-intent", actorSessionMiddleware, requireActorRole("seller"), workflowAsync(createSellerWorkflowOrderIntent));
workflowRouter.get("/seller/orders", actorSessionMiddleware, requireActorRole("seller"), workflowAsync(listSellerWorkflowOrders));
workflowRouter.get(
  "/seller/orders/:orderId",
  actorSessionMiddleware,
  requireActorRole("seller"),
  requireWorkflowOrderAccess({ allowedRelations: ["seller_owner"] }),
  workflowAsync(getSellerWorkflowOrder),
);
workflowRouter.post(
  "/seller/orders/:orderId/cancel",
  actorSessionMiddleware,
  requireActorRole("seller"),
  requireWorkflowOrderAccess({ allowedRelations: ["seller_owner"] }),
  workflowAsync(cancelSellerWorkflowOrder),
);
workflowRouter.post(
  "/seller/orders/:orderId/buyer-invite/reissue",
  actorSessionMiddleware,
  requireActorRole("seller"),
  requireWorkflowOrderAccess({ allowedRelations: ["seller_owner"] }),
  workflowAsync(reissueSellerBuyerInvite),
);

workflowRouter.post("/buyer/invite/claim", workflowAsync(claimBuyerInvite));
workflowRouter.get("/buyer/orders", actorSessionMiddleware, requireActorRole("buyer"), workflowAsync(listBuyerWorkflowOrders));
workflowRouter.get(
  "/buyer/orders/:orderId",
  actorSessionMiddleware,
  requireActorRole("buyer"),
  requireWorkflowOrderAccess({ allowedRelations: ["buyer_owner"] }),
  workflowAsync(getBuyerWorkflowOrder),
);
workflowRouter.post(
  "/buyer/orders/:orderId/fund/intent",
  actorSessionMiddleware,
  requireActorRole("buyer"),
  requireWorkflowOrderAccess({ allowedRelations: ["buyer_owner"] }),
  workflowAsync(createBuyerFundingIntent),
);
workflowRouter.post(
  "/buyer/orders/:orderId/fund/confirm",
  actorSessionMiddleware,
  requireActorRole("buyer"),
  requireWorkflowOrderAccess({ allowedRelations: ["buyer_owner"] }),
  workflowAsync(confirmBuyerFunding),
);
workflowRouter.post(
  "/buyer/orders/:orderId/fund/top-up",
  actorSessionMiddleware,
  requireActorRole("buyer"),
  requireWorkflowOrderAccess({ allowedRelations: ["buyer_owner"] }),
  workflowAsync(requestBuyerFundingTopUp),
);
workflowRouter.post(
  "/buyer/orders/:orderId/confirmation/reissue",
  actorSessionMiddleware,
  requireActorRole("buyer"),
  requireWorkflowOrderAccess({ allowedRelations: ["buyer_owner"] }),
  workflowAsync(reissueBuyerConfirmation),
);

workflowRouter.get("/rider/jobs/available", actorSessionMiddleware, requireActorRole("rider"), workflowAsync(listRiderAvailableJobs));
workflowRouter.get("/rider/jobs/mine", actorSessionMiddleware, requireActorRole("rider"), workflowAsync(listRiderJobs));
workflowRouter.get("/rider/jobs/:orderId", actorSessionMiddleware, requireActorRole("rider"), workflowAsync(getRiderJob));
workflowRouter.post("/rider/jobs/:orderId/accept", actorSessionMiddleware, requireActorRole("rider"), workflowAsync(acceptRiderJob));
workflowRouter.post("/rider/jobs/:orderId/pickup", actorSessionMiddleware, requireActorRole("rider"), workflowAsync(pickupRiderJob));
workflowRouter.post(
  "/rider/jobs/:orderId/proof/upload",
  actorSessionMiddleware,
  requireActorRole("rider"),
  workflowProofUploadMiddleware.single("file"),
  workflowAsync(uploadRiderProof),
);
workflowRouter.post("/rider/jobs/:orderId/proof/submit", actorSessionMiddleware, requireActorRole("rider"), workflowAsync(submitRiderProof));

workflowRouter.post("/confirmations/:token/view", workflowAsync(viewDeliveryConfirmation));
workflowRouter.post("/confirmations/:token/approve", workflowAsync(approveDeliveryConfirmation));
workflowRouter.post("/confirmations/:token/reject", workflowAsync(rejectDeliveryConfirmation));

workflowRouter.get("/operator/reviews", actorSessionMiddleware, requireActorRole("operator"), workflowAsync(listOperatorReviews));
workflowRouter.get("/operator/reviews/:orderId", actorSessionMiddleware, requireActorRole("operator"), workflowAsync(getOperatorReview));
workflowRouter.get("/operator/disputes", actorSessionMiddleware, requireActorRole("operator"), workflowAsync(listOperatorDisputes));
workflowRouter.get("/operator/disputes/:disputeId", actorSessionMiddleware, requireActorRole("operator"), workflowAsync(getOperatorDispute));
workflowRouter.post("/operator/disputes/:disputeId/resolve", actorSessionMiddleware, requireActorRole("operator"), workflowAsync(resolveOperatorDispute));
workflowRouter.post("/operator/orders/:orderId/confirmation/reissue", actorSessionMiddleware, requireActorRole("operator"), workflowAsync(operatorReissueConfirmation));

workflowRouter.get(
  "/orders/:orderId",
  // Keep shared detail available as a participant-only compatibility route.
  // New frontend journeys should enter through role workspaces first.
  skipToLegacyIfNoActorSessionToken,
  actorSessionMiddleware,
  requireWorkflowOrderAccess(),
  workflowAsync(getSharedWorkflowOrder),
);
