import type { NextFunction, Request, Response } from "express";
import type { ActorRole } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { getActorSession } from "./actor-session.js";

export function requireActorRole(...roles: ActorRole[]) {
  return function requireActorRoleMiddleware(_req: Request, res: Response, next: NextFunction) {
    const actor = getActorSession(res);
    if (!roles.includes(actor.role)) {
      return next(new HttpError(403, `This endpoint requires actor role: ${roles.join(", ")}`, "actor_role_required"));
    }

    return next();
  };
}
