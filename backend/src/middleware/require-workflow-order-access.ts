import type { NextFunction, Request, Response } from "express";
import { resolveOrderActorRelation, type OrderActorRelation } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { foundationRepository } from "../lib/foundation-repository.js";
import { getActorSession } from "./actor-session.js";

interface RequireWorkflowOrderAccessOptions {
  allowedRelations?: OrderActorRelation[];
  paramName?: string;
}

export function requireWorkflowOrderAccess(options: RequireWorkflowOrderAccessOptions = {}) {
  const allowedRelations = options.allowedRelations ?? ["seller_owner", "buyer_owner", "rider_owner", "operator"];
  const paramName = options.paramName ?? "orderId";

  return async function requireWorkflowOrderAccessMiddleware(req: Request, res: Response, next: NextFunction) {
    const actor = getActorSession(res);
    const rawOrderId = req.params[paramName];
    const orderId = Array.isArray(rawOrderId) ? rawOrderId[0] : rawOrderId;
    if (!orderId) {
      return next(new HttpError(400, "Order id route param is required", "workflow_order_param_missing"));
    }

    try {
      const ownership = await foundationRepository.getWorkflowOrderOwnership(orderId);
      if (!ownership) {
        return next(new HttpError(404, "Workflow order not found", "workflow_order_not_found"));
      }

      const relation = resolveOrderActorRelation({
        actor,
        ownership,
      });

      if (!allowedRelations.includes(relation)) {
        return next(new HttpError(404, "Workflow order not found", "workflow_order_forbidden"));
      }

      res.locals.workflowOrderAccess = {
        actor,
        ownership,
        relation,
      };
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export function getWorkflowOrderAccess(res: Response) {
  const access = res.locals.workflowOrderAccess;
  if (!access || typeof access.relation !== "string") {
    throw new HttpError(500, "Workflow order access context is missing", "workflow_order_access_missing");
  }

  return access as {
    actor: ReturnType<typeof getActorSession>;
    ownership: Awaited<ReturnType<typeof foundationRepository.getWorkflowOrderOwnership>> extends infer T ? Exclude<T, null> : never;
    relation: OrderActorRelation;
  };
}
