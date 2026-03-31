import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { DisputeService } from "../services/dispute.service.js";
import { createDisputeSchema, resolveDisputeSchema } from "../validators/disputes.js";

const disputeService = new DisputeService();

function getIdParam(req: Request) {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

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
  const disputeId = getIdParam(req);
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

export async function listDisputes(req: Request, res: Response) {
  const actor = getSessionActor(res);
  res.json(await disputeService.listDisputes({ actor }));
}

export async function getDispute(req: Request, res: Response) {
  const actor = getSessionActor(res);
  res.json(await disputeService.getDisputeDetail({ actor, disputeIdOrOrderId: getIdParam(req) }));
}
