import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const CORRELATION_ID_HEADER = "X-Correlation-Id";

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const headerValue = req.header(CORRELATION_ID_HEADER);
  const correlationId = headerValue && headerValue.trim().length > 0 ? headerValue.trim() : randomUUID();

  res.locals.correlationId = correlationId;
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  next();
}

export function getCorrelationId(res: Response): string {
  return typeof res.locals.correlationId === "string" ? res.locals.correlationId : "";
}

export { CORRELATION_ID_HEADER };
