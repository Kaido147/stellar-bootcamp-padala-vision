import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { DisputeService } from "../services/dispute.service.js";
import { createDisputeSchema } from "../validators/disputes.js";

const disputeService = new DisputeService();

export async function createDispute(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = createDisputeSchema.parse(req.body);
  const result = await disputeService.openDispute({
    actor,
    orderId: payload.order_id,
    reasonCode: payload.reason_code,
    description: payload.description,
    evidenceRefs: payload.evidence_refs,
    correlationId: getCorrelationId(res),
  });

  res.status(201).json(result);
}
