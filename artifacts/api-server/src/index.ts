import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { registerRoutes } from "./routes/routes";
import { runStartupMaintenance } from "./seed-core";
import { initEmailSystem } from "./lib/email";
import { runMigrations } from "./db-migrations";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const httpServer = http.createServer(app);

async function main() {
  initEmailSystem();

  // Apply any pending schema migrations before routes are registered.
  try {
    await runMigrations();
  } catch (err) {
    logger.error({ err }, "Database migration failed — aborting startup");
    process.exit(1);
  }

  await registerRoutes(httpServer, app);

  // Data-only, idempotent self-heal: remap legacy roles and create any
  // missing demo accounts. Never modifies existing users or schema.
  try {
    await runStartupMaintenance();
  } catch (err) {
    logger.error({ err }, "Startup maintenance failed (continuing)");
  }

  httpServer.listen(port, () => {
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start server");
  process.exit(1);
});
