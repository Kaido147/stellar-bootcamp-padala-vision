import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors.js";
import { getSessionActor } from "./auth.js";

export function requireRole(...roles: string[]) {
  return function requireRoleMiddleware(_req: Request, res: Response, next: NextFunction) {
    const actor = getSessionActor(res);
    const hasRole = roles.some((role) => actor.roles.includes(role));

    if (!hasRole) {
      return next(
        new HttpError(403, `This endpoint requires one of: ${roles.join(", ")}`, "role_required"),
      );
    }

    return next();
  };
}
