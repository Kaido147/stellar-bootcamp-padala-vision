import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { DisputeService } from "../services/dispute.service.js";
import { createDisputeSchema, resolveDisputeSchema } from "../validators/disputes.js";

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

export async function resolveDispute(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const disputeId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const payload = resolveDisputeSchema.parse(req.body);
  const result = await disputeService.resolveDispute({
    actor,
    disputeId,
    resolution: payload.resolution,
    reason: payload.reason,
    note: payload.note,
    txHash: payload.tx_hash,
    attestationNonce: payload.attestation_nonce,
    submittedWallet: payload.submitted_wallet,
    correlationId: getCorrelationId(res),
  });

  res.status(result.resolution_status === "pending" ? 202 : 200).json(result);
}
