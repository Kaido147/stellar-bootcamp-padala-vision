import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { ReconciliationService } from "../services/reconciliation.service.js";
import { reconcileOrderSchema } from "../validators/reconcile.js";

const reconciliationService = new ReconciliationService();

export async function reconcileOrder(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = reconcileOrderSchema.parse(req.body);
  const orderId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;

  const result = await reconciliationService.reconcileOrder({
    actor,
    orderId,
    forceRefresh: payload.force_refresh,
    correlationId: getCorrelationId(res),
  });

  res.json(result);
}
