import multer from "multer";
import type { NextFunction, Request, Response } from "express";
import type { EnterWorkspaceSessionRequest } from "@padala-vision/shared";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { getActorSession, getActorSessionToken } from "../middleware/actor-session.js";
import { WorkflowApiService } from "../services/workflow-api.service.js";
import {
  approveConfirmationSchema,
  buyerConfirmFundingSchema,
  buyerInviteClaimSchema,
  operatorResolveDisputeSchema,
  rejectConfirmationSchema,
  riderPickupSchema,
  riderSubmitProofSchema,
  sellerCreateWorkflowOrderIntentSchema,
  sellerCreateWorkflowOrderSchema,
  sessionEnterSchema,
} from "../validators/workflow.js";
import { env } from "../config/env.js";

const workflowApiService = new WorkflowApiService();
export const workflowProofUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function getOrderIdParam(req: Request) {
  const orderId = req.params.orderId;
  return Array.isArray(orderId) ? orderId[0] : orderId;
}

function getTokenParam(req: Request) {
  const token = req.params.token;
  return Array.isArray(token) ? token[0] : token;
}

function getDisputeIdParam(req: Request) {
  const disputeId = req.params.disputeId;
  return Array.isArray(disputeId) ? disputeId[0] : disputeId;
}

function setActorSessionCookie(res: Response, token: string) {
  res.cookie(env.ACTOR_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}

function clearActorSessionCookie(res: Response) {
  res.clearCookie(env.ACTOR_SESSION_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    path: "/",
  });
}

export async function enterWorkflowSession(req: Request, res: Response) {
  const payload = sessionEnterSchema.parse(req.body) as EnterWorkspaceSessionRequest;
  const result = await workflowApiService.enterSession(payload);
  setActorSessionCookie(res, result.token);
  res.status(201).json({
    actor: result.actor,
    session: result.session,
    defaultRoute: result.defaultRoute,
  });
}

export async function logoutWorkflowSession(req: Request, res: Response) {
  const token = getActorSessionToken(req);
  clearActorSessionCookie(res);
  res.json(await workflowApiService.logoutSession(token));
}

export async function getWorkflowSession(req: Request, res: Response) {
  res.json(await workflowApiService.getCurrentSession(getActorSessionToken(req)));
}

export async function createSellerWorkflowOrder(req: Request, res: Response) {
  const payload = sellerCreateWorkflowOrderSchema.parse(req.body);
  res.status(201).json(await workflowApiService.createSellerOrder(getActorSession(res), payload));
}

export async function createSellerWorkflowOrderIntent(req: Request, res: Response) {
  const payload = sellerCreateWorkflowOrderIntentSchema.parse(req.body);
  res.status(201).json(await workflowApiService.createSellerOrderIntent(getActorSession(res), payload));
}

export async function listSellerWorkflowOrders(_req: Request, res: Response) {
  res.json(await workflowApiService.listSellerOrders(getActorSession(res)));
}

export async function getSellerWorkflowOrder(req: Request, res: Response) {
  res.json(await workflowApiService.getSellerOrder(getActorSession(res), getOrderIdParam(req)));
}

export async function cancelSellerWorkflowOrder(req: Request, res: Response) {
  res.json(await workflowApiService.cancelSellerOrder(getActorSession(res), getOrderIdParam(req)));
}

export async function reissueSellerBuyerInvite(req: Request, res: Response) {
  res.json(await workflowApiService.reissueBuyerInvite(getActorSession(res), getOrderIdParam(req)));
}

export async function claimBuyerInvite(req: Request, res: Response) {
  const payload = buyerInviteClaimSchema.parse(req.body);
  const result = await workflowApiService.claimBuyerInvite(payload);
  setActorSessionCookie(res, result.token);
  res.status(201).json({
    actor: result.actor,
    session: result.session,
    defaultRoute: result.defaultRoute,
    workspaceCode: result.workspaceCode,
    order: result.order,
  });
}

export async function listBuyerWorkflowOrders(_req: Request, res: Response) {
  res.json(await workflowApiService.listBuyerOrders(getActorSession(res)));
}

export async function getBuyerWorkflowOrder(req: Request, res: Response) {
  res.json(await workflowApiService.getBuyerOrder(getActorSession(res), getOrderIdParam(req)));
}

export async function createBuyerFundingIntent(req: Request, res: Response) {
  const orderId = getOrderIdParam(req);
  res.status(201).json(await workflowApiService.createBuyerFundingIntent(getActorSession(res), orderId));
}

export async function confirmBuyerFunding(req: Request, res: Response) {
  const payload = buyerConfirmFundingSchema.parse(req.body);
  res.json(await workflowApiService.confirmBuyerFunding(getActorSession(res), getOrderIdParam(req), payload));
}

export async function requestBuyerFundingTopUp(req: Request, res: Response) {
  res.status(201).json(await workflowApiService.requestBuyerFundingTopUp(getActorSession(res), getOrderIdParam(req)));
}

export async function reissueBuyerConfirmation(req: Request, res: Response) {
  res.json(await workflowApiService.reissueBuyerConfirmation(getActorSession(res), getOrderIdParam(req)));
}

export async function listRiderAvailableJobs(_req: Request, res: Response) {
  res.json(await workflowApiService.listRiderAvailableJobs(getActorSession(res)));
}

export async function listRiderJobs(_req: Request, res: Response) {
  res.json(await workflowApiService.listRiderJobs(getActorSession(res)));
}

export async function getRiderJob(req: Request, res: Response) {
  res.json(await workflowApiService.getRiderJob(getActorSession(res), getOrderIdParam(req)));
}

export async function acceptRiderJob(req: Request, res: Response) {
  res.json(await workflowApiService.acceptRiderJob(getActorSession(res), getOrderIdParam(req)));
}

export async function pickupRiderJob(req: Request, res: Response) {
  const payload = riderPickupSchema.parse(req.body);
  res.json(await workflowApiService.pickupRiderJob(getActorSession(res), getOrderIdParam(req), payload));
}

export async function uploadRiderProof(req: Request, res: Response) {
  res.status(201).json(await workflowApiService.uploadRiderProof(getActorSession(res), getOrderIdParam(req), req.file));
}

export async function submitRiderProof(req: Request, res: Response) {
  const payload = riderSubmitProofSchema.parse(req.body);
  res.json(await workflowApiService.submitRiderProof(getActorSession(res), getOrderIdParam(req), payload));
}

export async function viewDeliveryConfirmation(req: Request, res: Response) {
  res.json(await workflowApiService.viewConfirmation(getTokenParam(req)));
}

export async function approveDeliveryConfirmation(req: Request, res: Response) {
  const payload = approveConfirmationSchema.parse(req.body);
  res.json(await workflowApiService.approveConfirmation(getTokenParam(req), payload));
}

export async function rejectDeliveryConfirmation(req: Request, res: Response) {
  const payload = rejectConfirmationSchema.parse(req.body);
  res.json(await workflowApiService.rejectConfirmation(getTokenParam(req), payload));
}

export async function listOperatorReviews(_req: Request, res: Response) {
  res.json(await workflowApiService.listOperatorReviews(getActorSession(res)));
}

export async function getOperatorReview(req: Request, res: Response) {
  res.json(await workflowApiService.getOperatorReview(getActorSession(res), getOrderIdParam(req)));
}

export async function listOperatorDisputes(_req: Request, res: Response) {
  res.json(await workflowApiService.listOperatorDisputes(getActorSession(res)));
}

export async function getOperatorDispute(req: Request, res: Response) {
  res.json(await workflowApiService.getOperatorDispute(getActorSession(res), getDisputeIdParam(req)));
}

export async function resolveOperatorDispute(req: Request, res: Response) {
  const payload = operatorResolveDisputeSchema.parse(req.body);
  res.json(await workflowApiService.resolveOperatorDispute(getActorSession(res), getDisputeIdParam(req), payload));
}

export async function operatorReissueConfirmation(req: Request, res: Response) {
  res.json(await workflowApiService.operatorReissueConfirmation(getActorSession(res), getOrderIdParam(req)));
}

export async function getSharedWorkflowOrder(req: Request, res: Response) {
  res.json(await workflowApiService.getSharedOrderDetail(getActorSession(res), getOrderIdParam(req)));
}

export function workflowAsync(handler: (req: Request, res: Response, next: NextFunction) => Promise<void>) {
  return function wrapped(req: Request, res: Response, next: NextFunction) {
    void handler(req, res, next).catch(next);
  };
}
