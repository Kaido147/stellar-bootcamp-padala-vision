import multer from "multer";
import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { OrdersService } from "../services/orders.service.js";
import { StorageService } from "../services/storage.service.js";
import {
  acceptJobSchema,
  createOrderSchema,
  evidenceSubmitSchema,
  markInTransitSchema,
  orderActionRecordSchema,
  releaseSchema,
} from "../validators/orders.js";

const ordersService = new OrdersService();
const storageService = new StorageService();
export const evidenceUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

function getIdParam(req: Request) {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

export async function createOrder(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = createOrderSchema.parse(req.body);
  const result = await ordersService.createOrder(payload, actor);
  res.status(201).json(result);
}

export async function getOrder(req: Request, res: Response) {
  res.json(await ordersService.getOrder(getIdParam(req)));
}

export async function listFundedJobs(_req: Request, res: Response) {
  res.json(await ordersService.listFundedJobs());
}

export async function acceptJob(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = acceptJobSchema.parse(req.body);
  res.json({ order: await ordersService.acceptRider(getIdParam(req), payload.rider_wallet, actor) });
}

export async function fundOrder(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const parsed = orderActionRecordSchema.safeParse(req.body);
  if (parsed.success) {
    const result = await ordersService.recordFunding({
      orderId: getIdParam(req),
      actor,
      actionIntentId: parsed.data.action_intent_id,
      txHash: parsed.data.tx_hash,
      submittedWallet: parsed.data.submitted_wallet,
      correlationId: getCorrelationId(res),
    });
    return res.status(result.action_status === "pending_confirmation" ? 202 : 200).json(result);
  }

  res.json({ order: await ordersService.markFunded(getIdParam(req), actor) });
}

export async function markInTransit(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const actionRecord = orderActionRecordSchema.safeParse(req.body);
  if (actionRecord.success) {
    const result = await ordersService.recordInTransit({
      orderId: getIdParam(req),
      actor,
      actionIntentId: actionRecord.data.action_intent_id,
      txHash: actionRecord.data.tx_hash,
      submittedWallet: actionRecord.data.submitted_wallet,
      correlationId: getCorrelationId(res),
    });
    return res.status(result.action_status === "pending_confirmation" ? 202 : 200).json(result);
  }

  const payload = markInTransitSchema.parse(req.body);
  res.json({ order: await ordersService.markInTransit(getIdParam(req), payload.rider_wallet, actor) });
}

export async function submitEvidence(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = evidenceSubmitSchema.parse(req.body);
  res.json(await ordersService.submitEvidence(payload, actor));
}

export async function uploadEvidenceFile(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Evidence file is required" });
  }

  const orderId = typeof req.body.order_id === "string" ? req.body.order_id : "";
  const riderWallet = typeof req.body.rider_wallet === "string" ? req.body.rider_wallet : "";

  if (!orderId || !riderWallet) {
    return res.status(400).json({ error: "order_id and rider_wallet are required" });
  }

  await ordersService.assertEvidenceUploadAuthorized(orderId, riderWallet, actor);

  const result = await storageService.uploadEvidenceFile({
    orderId,
    riderWallet,
    fileName: file.originalname || "evidence.jpg",
    contentType: file.mimetype || "image/jpeg",
    bytes: file.buffer,
  });

  res.status(201).json(result);
}

export async function releaseEscrow(req: Request, res: Response) {
  const payload = releaseSchema.parse(req.body);
  res.json(await ordersService.releaseEscrow(payload));
}

export async function getOrderHistory(req: Request, res: Response) {
  res.json(await ordersService.getHistory(getIdParam(req)));
}

export async function createFundIntent(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const result = await ordersService.createFundIntent({
    orderId: getIdParam(req),
    actor,
    correlationId: getCorrelationId(res),
  });
  res.status(201).json(result);
}

export async function createRiderAssignIntent(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const result = await ordersService.createRiderAssignIntent({
    orderId: getIdParam(req),
    actor,
    correlationId: getCorrelationId(res),
  });
  res.status(201).json(result);
}

export async function recordRiderAssign(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = orderActionRecordSchema.parse(req.body);
  const result = await ordersService.recordRiderAssign({
    orderId: getIdParam(req),
    actor,
    actionIntentId: payload.action_intent_id,
    txHash: payload.tx_hash,
    submittedWallet: payload.submitted_wallet,
    correlationId: getCorrelationId(res),
  });
  res.status(result.action_status === "pending_confirmation" ? 202 : 200).json(result);
}

export async function createInTransitIntent(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const result = await ordersService.createInTransitIntent({
    orderId: getIdParam(req),
    actor,
    correlationId: getCorrelationId(res),
  });
  res.status(201).json(result);
}
