import multer from "multer";
import type { Request, Response } from "express";
import { OrdersService } from "../services/orders.service.js";
import { StorageService } from "../services/storage.service.js";
import {
  acceptJobSchema,
  createOrderSchema,
  evidenceSubmitSchema,
  markInTransitSchema,
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
  const payload = createOrderSchema.parse(req.body);
  const result = await ordersService.createOrder(payload);
  res.status(201).json(result);
}

export async function getOrder(req: Request, res: Response) {
  res.json(await ordersService.getOrder(getIdParam(req)));
}

export async function listFundedJobs(_req: Request, res: Response) {
  res.json(await ordersService.listFundedJobs());
}

export async function acceptJob(req: Request, res: Response) {
  const payload = acceptJobSchema.parse(req.body);
  res.json({ order: await ordersService.acceptRider(getIdParam(req), payload.rider_wallet) });
}

export async function fundOrder(req: Request, res: Response) {
  res.json({ order: await ordersService.markFunded(getIdParam(req)) });
}

export async function markInTransit(req: Request, res: Response) {
  const payload = markInTransitSchema.parse(req.body);
  res.json({ order: await ordersService.markInTransit(getIdParam(req), payload.rider_wallet) });
}

export async function submitEvidence(req: Request, res: Response) {
  const payload = evidenceSubmitSchema.parse(req.body);
  res.json(await ordersService.submitEvidence(payload));
}

export async function uploadEvidenceFile(req: Request, res: Response) {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Evidence file is required" });
  }

  const orderId = typeof req.body.order_id === "string" ? req.body.order_id : "";
  const riderWallet = typeof req.body.rider_wallet === "string" ? req.body.rider_wallet : "";

  if (!orderId || !riderWallet) {
    return res.status(400).json({ error: "order_id and rider_wallet are required" });
  }

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
