import type { Response } from "express";
import { logger } from "./logger";

/**
 * Centralised route-error responder.
 *
 * Logs the full error server-side (including SQL details, stack traces, etc.)
 * but only returns a generic "Internal server error" to the client when the
 * status is 5xx, preventing DB internals from leaking in production.
 * 4xx errors (validation, auth) are forwarded verbatim since those messages
 * are safe to surface.
 */
export function routeError(res: Response, e: unknown): void {
  const err = e as any;
  const status: number = err?.statusCode || err?.status || 500;
  logger.error({ err }, "route error");
  if (res.headersSent) return;
  const isServerError = status >= 500;
  const message =
    isServerError && process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err?.message ||
        (isServerError ? "Internal server error" : "Bad request");
  res.status(status).json({ message });
}
