import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { RefundService } from "../services/refund.service.js";
import { refundIntentSchema } from "../validators/refunds.js";

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
