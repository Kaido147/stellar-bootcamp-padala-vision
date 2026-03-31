import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { HttpError } from "../lib/errors.js";
import { repository } from "../lib/repository.js";
import { CORRELATION_ID_HEADER, getCorrelationId } from "./correlation-id.js";

const IDEMPOTENCY_HEADER = "Idempotency-Key";
const IDEMPOTENT_METHODS = new Set(["POST"]);

export async function idempotencyMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!IDEMPOTENT_METHODS.has(req.method.toUpperCase())) {
    return next();
  }

  if (req.is("multipart/form-data")) {
    return next();
  }

  const idempotencyKey = req.header(IDEMPOTENCY_HEADER)?.trim();
  if (!idempotencyKey) {
    return next(new HttpError(400, "Idempotency-Key header is required", "idempotency_required"));
  }

  const scopePath = `${req.baseUrl}${req.path}` || req.originalUrl;
  const scopeKey = buildScopeKey(req.method, scopePath, idempotencyKey, getActorScope(req));
  const requestHash = hashRequest(req);
  const existing = await repository.claimIdempotencyRecord({
    scopeKey,
    method: req.method.toUpperCase(),
    path: scopePath,
    idempotencyKey,
    requestHash,
    correlationId: getCorrelationId(res),
  });

  if (existing.requestHash !== requestHash) {
    return next(new HttpError(409, "Idempotency-Key conflicts with a different request payload", "idempotency_conflict"));
  }

  if (existing.state === "completed") {
    res.setHeader(CORRELATION_ID_HEADER, existing.correlationId);
    res.locals.correlationId = existing.correlationId;
    return res.status(existing.responseStatus ?? 200).json(existing.responseBody ?? {});
  }

  if (existing.state === "in_progress" && existing.correlationId !== getCorrelationId(res)) {
    return next(new HttpError(409, "A request with this Idempotency-Key is already in progress", "idempotency_in_progress"));
  }

  let responseCaptured = false;
  let responseBody: unknown;

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    responseCaptured = true;
    responseBody = body;
    return originalJson(body);
  }) as Response["json"];

  res.on("finish", async () => {
    try {
      if (!responseCaptured) {
        await repository.deleteIdempotencyRecord(scopeKey);
        return;
      }

      if (res.statusCode >= 500) {
        await repository.deleteIdempotencyRecord(scopeKey);
        return;
      }

      await repository.completeIdempotencyRecord(scopeKey, {
        responseStatus: res.statusCode,
        responseBody,
      });
    } catch (error) {
      console.error("Failed to finalize idempotency record", error);
    }
  });

  res.on("close", async () => {
    if (res.writableFinished) {
      return;
    }

    try {
      await repository.deleteIdempotencyRecord(scopeKey);
    } catch (error) {
      console.error("Failed to clean up idempotency record after connection close", error);
    }
  });

  return next();
}

function buildScopeKey(method: string, path: string, idempotencyKey: string, actorScope: string) {
  return `${method.toUpperCase()}:${path}:${actorScope}:${idempotencyKey}`;
}

function hashRequest(req: Request) {
  const payload = stableStringify({
    method: req.method.toUpperCase(),
    path: `${req.baseUrl}${req.path}` || req.originalUrl,
    body: req.body ?? null,
    query: req.query ?? {},
  });

  return createHash("sha256").update(payload).digest("hex");
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function getActorScope(req: Request) {
  const authorization = req.header("Authorization")?.trim();
  if (!authorization) {
    return "public";
  }

  return createHash("sha256").update(authorization).digest("hex");
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = sortValue((value as Record<string, unknown>)[key]);
        return result;
      }, {});
  }

  return value;
}
