import type { Request, Response } from "express";
import { getSessionActor } from "../middleware/auth.js";
import { getCorrelationId } from "../middleware/correlation-id.js";
import { ReleaseService } from "../services/release.service.js";
import { releaseIntentSchema } from "../validators/release.js";

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
