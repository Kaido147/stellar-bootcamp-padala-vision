import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { ReleaseService } from "../services/release.service.js";
import { releaseIntentSchema, releaseRecordSchema } from "../validators/release.js";

const releaseService = new ReleaseService();

export async function createReleaseIntent(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = releaseIntentSchema.parse(req.body);
  const result = await releaseService.createReleaseIntent({
    actor,
    orderId: payload.order_id,
    correlationId: getCorrelationId(res),
  });

  res.status(201).json(result);
}

export async function recordRelease(req: Request, res: Response) {
  const actor = getSessionActor(res);
  const payload = releaseRecordSchema.parse(req.body);
  const result = await releaseService.recordRelease({
    actor,
    orderId: payload.order_id,
    txHash: payload.tx_hash,
    attestationNonce: payload.attestation_nonce,
    submittedWallet: payload.submitted_wallet,
    correlationId: getCorrelationId(res),
  });

  res.status(result.release_status === "pending_confirmation" ? 202 : 200).json(result);
}
