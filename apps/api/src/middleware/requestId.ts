import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

/**
 * Attach a unique request ID to every incoming request.
 * - Reuses `X-Request-ID` header if the caller already set one.
 * - Exposes the ID back via the `X-Request-ID` response header so clients
 *   and upstream proxies can correlate logs.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const supplied = req.headers["x-request-id"];
  const id = typeof supplied === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(supplied)
    ? supplied : randomUUID();
  req.requestId = id;
  res.setHeader("X-Request-ID", id);
  next();
}
