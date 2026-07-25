import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import path from "path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CSRF guard: the session cookie is SameSite=None (required for the Replit
// preview iframe), so browsers will attach it to cross-site requests. Reject
// state-changing requests whose Origin doesn't match the host we're serving.
// Requests without an Origin header (curl, server-to-server) are allowed.
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
app.use((req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const origin = req.get("origin");
  if (!origin || origin === "null") {
    // No Origin: non-browser client. "null" origin: sandboxed/opaque context —
    // allow it since the preview iframe can report an opaque origin, and such
    // contexts don't carry our credentialed cookie unless partitioned to us.
    return next();
  }
  try {
    const originHost = new URL(origin).host;
    const requestHost =
      req.get("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
    if (originHost === requestHost) return next();
  } catch {
    // Unparseable Origin — fall through to rejection.
  }
  return res.status(403).json({ message: "Cross-origin request blocked" });
});

app.use("/api", router);

// Serve uploaded images (multer writes to <cwd>/uploads/images).
// Exposed under /api/uploads so the shared proxy routes browser requests here
// (only /api/* reaches this server; bare /uploads is swallowed by the web app).
// The bare /uploads mount is kept for direct/local access back-compat.
const uploadsStatic = express.static(path.join(process.cwd(), "uploads"), {
  fallthrough: false,
  setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
});
app.use("/api/uploads", uploadsStatic);
app.use("/uploads", uploadsStatic);

// Global error handler — MUST be last. Returns a generic JSON error and never
// leaks stack traces or internal file paths (previously Express's default HTML
// error page exposed absolute paths on malformed request bodies).
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Body-parser raises a SyntaxError with `type: "entity.parse.failed"` for
  // malformed JSON, and a 413 for oversized bodies.
  const isJsonParseError = err?.type === "entity.parse.failed" || err instanceof SyntaxError;
  const status = err?.status || err?.statusCode || (isJsonParseError ? 400 : 500);
  const message = isJsonParseError
    ? "Invalid JSON body"
    : status < 500
      ? (err?.message || "Bad request")
      : "Internal server error";
  logger.error({ err, url: req.url, method: req.method }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(status).json({ message });
});

export default app;
