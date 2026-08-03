/**
 * Versioned database migration runner.
 *
 * SQL migration files are copied into dist/migrations/ at build time (see
 * build.mjs), so they are always co-located with the bundle regardless of the
 * deployment environment. The runner applies any file not yet recorded in the
 * schema_migrations tracking table. All SQL is idempotent (IF NOT EXISTS /
 * DO-EXCEPTION guards), so replaying an already-applied file is safe.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./lib/logger";

/** Absolute path to the migrations directory that was copied into dist/. */
const MIGRATIONS_DIR = path.resolve(
  // fileURLToPath gives the physical path of THIS file (dist/index.mjs when
  // bundled). path.dirname turns that into the directory (dist/). The
  // migrations folder is copied there by build.mjs.
  path.dirname(fileURLToPath(import.meta.url)),
  "migrations",
);

async function ensureMigrationsTable(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text    PRIMARY KEY,
      applied_at  timestamp DEFAULT now()
    )
  `);
}

async function appliedVersions(): Promise<Set<string>> {
  const rows = await db.execute<{ version: string }>(
    sql`SELECT version FROM schema_migrations ORDER BY version`,
  );
  return new Set(rows.rows.map((r) => r.version));
}

export async function runMigrations(): Promise<void> {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    logger.info("No migrations directory found — skipping.");
    return;
  }

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // lexicographic = 0001_ before 0002_

  if (files.length === 0) {
    logger.info("No migration files found.");
    return;
  }

  await ensureMigrationsTable();
  const applied = await appliedVersions();

  for (const file of files) {
    if (applied.has(file)) {
      logger.debug({ file }, "Migration already applied, skipping");
      continue;
    }

    const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    logger.info({ file }, "Applying migration");

    // Execute the entire file as a single statement batch.
    // Wrapping in a transaction so a partial failure leaves the DB unchanged.
    await db.transaction(async (tx) => {
      await tx.execute(sql.raw(sqlText));
      await tx.execute(
        sql`INSERT INTO schema_migrations (version) VALUES (${file})`,
      );
    });

    logger.info({ file }, "Migration applied successfully");
  }
}
