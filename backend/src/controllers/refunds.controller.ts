import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { RefundService } from "../services/refund.service.js";
import { refundIntentSchema, refundRecordSchema } from "../validators/refunds.js";

const refundService = new RefundService();

export async function createRefundIntent(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = refundIntentSchema.parse(req.body);
  const result = await refundService.createRefundIntent({
    actor,
    orderId: payload.order_id,
    correlationId: getCorrelationId(res),
  });

  res.status(201).json(result);
}

export async function recordRefund(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = refundRecordSchema.parse(req.body);
  const result = await refundService.recordRefund({
    actor,
    orderId: payload.order_id,
    refundIntentId: payload.refund_intent_id,
    txHash: payload.tx_hash,
    submittedWallet: payload.submitted_wallet,
    correlationId: getCorrelationId(res),
  });

  res.status(result.refund_status === "pending_confirmation" ? 202 : 200).json(result);
}
