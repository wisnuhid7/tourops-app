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

export default app;
