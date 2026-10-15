/**
 * OWASP A10 — error handling / information disclosure.
 *
 * Confirmed: lib/routeError.ts:20 scrubs 5xx messages ONLY when
 * `process.env.NODE_ENV === "production"`. If the platform identifies
 * production via `REPLIT_DEPLOYMENT` (as the app's own env handling suggests)
 * while NODE_ENV is unset/"test", raw error text (SQL, file paths, driver
 * messages) is returned to the client.
 *
 * The `it.fails` case asserts the deployment-mode behaviour we want; the
 * control proves NODE_ENV=production scrubbing already works.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

const mockState = vi.hoisted(() => ({
  storageError: null as Error | null,
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: () => {}, info: () => {}, warn: () => {}, debug: () => {}, child: () => ({ error: () => {}, info: () => {}, warn: () => {}, debug: () => {} }) },
}));
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: () => Promise.resolve({ id: "p1", userId: "user-1", role: "super_admin", isActive: true, countryCode: null, cityId: null, transportCompanyId: null }),
    createGuideRate: async () => { if (mockState.storageError) throw mockState.storageError; return { id: "gr-1" }; },
    getGlobalSettingByKey: async () => null,
    updateGlobalSetting: async () => {},
    createAuditLog: async () => {},
  },
}));
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => { app.use((req: any, _res: any, next: any) => { req.session = { userId: "user-1" }; next(); }); },
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
  registerAuthRoutes: () => {},
  passwordSchema: { _def: {} } as any,
}));
vi.mock("../../replit_integrations/auth/storage", () => ({
  authStorage: {
    getUserByUsername: async () => ({ id: "admin-1" }), // avoid seeding noise
    getUser: async () => null, getUserByEmail: async () => null,
    upsertUser: async () => ({ id: "x" }), updateUser: async () => null,
    ensureProfile: async () => null, getProfileByUserId: async () => null,
  },
}));
vi.mock("@workspace/db", async (importOriginal) => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
  const actual = await importOriginal<Record<string, unknown>>();
  const chain: any = {
    from: () => chain, where: () => chain, leftJoin: () => chain, limit: () => chain, offset: () => chain,
    orderBy: () => chain, values: () => chain, set: () => chain, onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain, returning: () => Promise.resolve([]), execute: () => Promise.resolve([]),
    then: (resolve: (rows: unknown[]) => void) => resolve([]),
  };
  const fakeDb: any = {
    select: () => chain, insert: () => chain, update: () => chain, delete: () => chain,
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fakeDb), execute: () => Promise.resolve([]),
  };
  return { ...actual, db: fakeDb };
});
vi.mock("../../lib/workers", () => ({
  queues: { countryImport: { add: vi.fn() }, cityImport: { add: vi.fn() }, sightDiscovery: { add: vi.fn() }, sightEnrichment: { add: vi.fn() }, tourAi: { add: vi.fn() }, hotelPrice: { add: vi.fn() }, flightPrice: { add: vi.fn() } },
  startWorkers: vi.fn(),
}));
vi.mock("ioredis", () => ({ default: function () { return { on: vi.fn(), quit: vi.fn() }; } }));

import { registerRoutes } from "../../routes/routes";

const SQL_ERROR = new Error(
  'ERROR: insert or update on table "guide_rates" violates foreign key constraint\n' +
  "  at INSERT INTO guide_rates(...) VALUES ($1)\n  parameters: $1 = 'x'",
);

const SQL_KEYWORDS = ["INSERT", "UPDATE", "SELECT", "ERROR:", "parameters:", "guide_rates", "violates"];

describe("OWASP A10 — 5xx error disclosure", () => {
  let app: Express;
  const originalEnv = { NODE_ENV: process.env.NODE_ENV, REPLIT_DEPLOYMENT: process.env.REPLIT_DEPLOYMENT };

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
  });

  beforeEach(() => {
    mockState.storageError = SQL_ERROR;
  });

  it("control: NODE_ENV=production scrubs the 5xx body", async () => {
    process.env.NODE_ENV = "production";
    try {
      const res = await request(app).post("/api/rates/guide").send({ guideName: "G", price: "1.00" });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Internal server error" });
    } finally {
      process.env.NODE_ENV = originalEnv.NODE_ENV;
    }
  });

  it.fails("REPLIT_DEPLOYMENT=1 (platform prod) must also scrub the 5xx body", async () => {
    process.env.NODE_ENV = originalEnv.NODE_ENV ?? "test";
    process.env.REPLIT_DEPLOYMENT = "1";
    try {
      const res = await request(app).post("/api/rates/guide").send({ guideName: "G", price: "1.00" });
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Internal server error" });
      const text = JSON.stringify(res.body);
      for (const kw of SQL_KEYWORDS) expect(text).not.toContain(kw);
    } finally {
      process.env.REPLIT_DEPLOYMENT = originalEnv.REPLIT_DEPLOYMENT;
    }
  });
});
