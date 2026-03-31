import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors.js";
import { getSupabaseAdminClient } from "../lib/supabase.js";

export interface SessionActor {
  userId: string;
  email: string | null;
  phone: string | null;
  accessToken: string;
  roles: string[];
}

interface CreateAuthSessionMiddlewareOptions {
  resolveSessionActor?: (accessToken: string) => Promise<SessionActor | null>;
}

export function createAuthSessionMiddleware(options: CreateAuthSessionMiddlewareOptions = {}) {
  const resolveSessionActor = options.resolveSessionActor ?? defaultResolveSessionActor;

  return async function authSessionMiddleware(req: Request, res: Response, next: NextFunction) {
    const accessToken = getBearerToken(req);
    if (!accessToken) {
      return next(new HttpError(401, "Authorization bearer token is required", "auth_token_required"));
    }

    try {
      const actor = await resolveSessionActor(accessToken);
      if (!actor) {
        return next(new HttpError(401, "Invalid or expired session", "auth_invalid_session"));
      }

      res.locals.sessionActor = actor;
      return next();
    } catch (error) {
      if (error instanceof HttpError) {
        return next(error);
      }

      return next(error);
    }
  };
}

export const authSessionMiddleware = createAuthSessionMiddleware();

export function getSessionActor(res: Response): SessionActor {
  const actor = res.locals.sessionActor;
  if (!actor || typeof actor.userId !== "string") {
    throw new HttpError(500, "Session actor is not available on the request context", "auth_actor_missing");
  }

  return actor as SessionActor;
}

async function defaultResolveSessionActor(accessToken: string): Promise<SessionActor | null> {
  const client = getSupabaseAdminClient();
  if (!client) {
    throw new HttpError(503, "Supabase auth is not configured", "auth_unavailable");
  }

  const { data, error } = await client.auth.getUser(accessToken);
  if (error || !data.user) {
    return null;
  }

  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    phone: data.user.phone ?? null,
    accessToken,
    roles: Array.isArray(data.user.app_metadata?.roles)
      ? data.user.app_metadata.roles.filter((value): value is string => typeof value === "string")
      : [],
  };
}

function getBearerToken(req: Request): string | null {
  const authorization = req.header("Authorization");
  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim() || null;
}
