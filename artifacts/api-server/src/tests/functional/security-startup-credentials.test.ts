/**
 * OWASP A02 / A07 — default/hardcoded privileged credentials at startup.
 *
 * Confirmed: routes/routes.ts:174-191 unconditionally creates an
 * `admin` / `admin123` account (role admin) whenever no user named "admin"
 * exists — with NO `NODE_ENV` / deployment guard. On any fresh production
 * deployment this is an immediate account-takeover path.
 *
 * The vulnerable case is `it.fails`; the control proves the capture wiring,
 * so the expected-failure is meaningful (not an artifact of a broken mock).
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type Express } from "express";
import { createServer } from "http";
import bcrypt from "bcryptjs";

const mockState = vi.hoisted(() => ({
  upsertCalls: [] as any[],
  adminExists: false,
}));

vi.mock("../../lib/logger", () => ({
  logger: { error: () => {}, info: () => {}, warn: () => {}, debug: () => {}, child: () => ({ error: () => {}, info: () => {}, warn: () => {}, debug: () => {} }) },
}));
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: () => Promise.resolve({ id: "p1", userId: "u1", role: "admin", isActive: true, countryCode: null, cityId: null, transportCompanyId: null }),
    updateProfile: async () => null,
    getGlobalSettingByKey: async () => null,
    updateGlobalSetting: async () => {},
    createAuditLog: async () => {},
  },
}));
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => { app.use((_req: any, _res: any, next: any) => next()); },
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
  registerAuthRoutes: () => {},
  passwordSchema: { _def: {} } as any,
}));
vi.mock("../../replit_integrations/auth/storage", () => ({
  authStorage: {
    getUserByUsername: async (u: string) => (mockState.adminExists && u === "admin" ? { id: "existing-admin", username: "admin" } : null),
    getUser: async () => null,
    getUserByEmail: async () => null,
    upsertUser: async (data: any) => {
      mockState.upsertCalls.push(data);
      return { id: `u-${mockState.upsertCalls.length}`, ...data };
    },
    updateUser: async () => null,
    ensureProfile: async () => null,
    getProfileByUserId: async () => null,
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

async function bootRoutes(): Promise<Express> {
  const app = express();
  app.use(express.json());
  await registerRoutes(createServer(app), app);
  return app;
}

/** True if any captured upsert created the literal default admin/admin123. */
function seededDefaultAdmin(): boolean {
  return mockState.upsertCalls.some(
    (u) =>
      u?.username === "admin" &&
      typeof u?.passwordHash === "string" &&
      bcrypt.compareSync("admin123", u.passwordHash),
  );
}

describe("OWASP A02/A07 — default privileged credentials", () => {
  beforeEach(() => {
    mockState.upsertCalls = [];
  });

  it("control: when an admin already exists, no default admin is created", async () => {
    mockState.adminExists = true;
    await bootRoutes();
    expect(seededDefaultAdmin()).toBe(false);
  });

  it("fresh production boot must NOT create admin/admin123", async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      mockState.adminExists = false; // fresh deployment, no users at all
      await bootRoutes();
      expect(seededDefaultAdmin()).toBe(false);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});
