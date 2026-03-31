import type { NextFunction, Request, Response } from "express";
import type { SessionActor } from "@padala-vision/shared";
import { HttpError } from "../lib/errors.js";
import { env } from "../config/env.js";
import { SessionService } from "../services/session.service.js";

interface CreateActorSessionMiddlewareOptions {
  resolveSessionActor?: (token: string) => Promise<SessionActor | null>;
}

export function createActorSessionMiddleware(options: CreateActorSessionMiddlewareOptions = {}) {
  const sessionService = new SessionService();
  const resolveSessionActor = options.resolveSessionActor ?? ((token: string) => sessionService.resolveSessionActor(token));

  return async function actorSessionMiddleware(req: Request, res: Response, next: NextFunction) {
    const token = getActorSessionToken(req);
    if (!token) {
      return next(new HttpError(401, "Actor session token is required", "actor_session_required"));
    }

    try {
      const actor = await resolveSessionActor(token);
      if (!actor) {
        return next(new HttpError(401, "Invalid or expired actor session", "actor_session_invalid"));
      }

      res.locals.actorSession = actor;
      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const actorSessionMiddleware = createActorSessionMiddleware();

export function skipToLegacyIfNoActorSessionToken(req: Request, _res: Response, next: NextFunction) {
  if (!getActorSessionToken(req)) {
    return next("route");
  }

  return next();
}

export function getActorSession(res: Response): SessionActor {
  const actor = res.locals.actorSession;
  if (!actor || typeof actor.actorId !== "string") {
    throw new HttpError(500, "Actor session is not available on the request context", "actor_session_missing");
  }

  return actor as SessionActor;
}

export function getActorSessionToken(req: Request) {
  const cookieToken = parseCookieHeader(req.header("cookie") ?? "")[env.ACTOR_SESSION_COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }

  const headerToken = req.header("x-actor-session-token");
  return headerToken?.trim() || null;
}

function parseCookieHeader(cookieHeader: string) {
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((accumulator, pair) => {
      const separatorIndex = pair.indexOf("=");
      if (separatorIndex === -1) {
        return accumulator;
      }

      const key = pair.slice(0, separatorIndex).trim();
      const value = pair.slice(separatorIndex + 1).trim();
      if (key) {
        accumulator[key] = decodeURIComponent(value);
      }
      return accumulator;
    }, {});
}
