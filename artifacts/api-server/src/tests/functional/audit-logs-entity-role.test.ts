/**
 * Regression guardrail: the *per-entity* audit-history endpoints
 *
 *   - GET /api/audit-logs/:entityType/:entityId   (routes.ts ~line 1043)
 *   - GET /api/audit-logs/:type/:id               (routes.ts ~line 2922, a
 *                                                   shadowed duplicate of the
 *                                                   first — Express serves the
 *                                                   first-registered route)
 *
 * expose the full change history for a single record and are gated ONLY by
 * `requireRole(req, res, ADMIN_ROLES)` on top of `isAuthenticated`. The global
 * GET /api/admin/audit-logs endpoint already has a role regression test
 * (admin-users-audit-role.test.ts); this locks down the per-entity variants,
 * which leak the same sensitive data scoped to a specific record.
 *
 * It asserts:
 *   1. An *authenticated but non-admin* staff role is rejected with 403 and the
 *      underlying storage.getAuditLogs read never runs.
 *   2. An authenticated admin (and super_admin) succeeds with 200.
 *   3. An anonymous caller is rejected with 401 before any role check.
 *
 * Without this, dropping the requireRole call (or a change to
 * requireRole/ADMIN_ROLES) could silently let any authenticated non-admin
 * staff read another record's audit trail.
 *
 * `storage` and `authStorage` are mocked (mirroring the session-injection
 * pattern in admin-users-audit-role.test.ts) so the test exercises the REAL
 * `requireRole` logic without touching a live DB.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// Shared, hoisted mutable state used by the module mocks below.
// ---------------------------------------------------------------------------
const mockState = vi.hoisted(() => ({
  profilesByUserId: {} as Record<string, { id: string; userId: string; role: string }>,
  session: { current: {} as { userId?: string } },
}));

const storageSpies = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
}));

// Mock the domain storage. `getOrCreateProfile` backs the real `requireRole`.
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: async (userId: string) => {
      const p = mockState.profilesByUserId[userId];
      if (p) return p;
      // Mirror real behaviour: unknown users get a default (non-privileged)
      // "customer" profile rather than throwing.
      return { id: `auto-${userId}`, userId, role: "customer" };
    },
    getProfileByUserId: async (userId: string) => mockState.profilesByUserId[userId],
    getAuditLogs: storageSpies.getAuditLogs,
  },
}));

// Mock the auth-side user storage (only used by the one-time admin seed step).
vi.mock("../../replit_integrations/auth/storage", () => ({
  authStorage: {
    getUserByUsername: vi.fn().mockResolvedValue(undefined),
    upsertUser: vi.fn().mockResolvedValue({ id: "u-seed", username: "seed" }),
    getUser: vi.fn().mockResolvedValue(undefined),
  },
}));

// Minimal `@workspace/db` stub so importing routes.ts does not open a real
// database connection (routes.ts imports table symbols at module load).
vi.mock("@workspace/db", () => {
  const table = (name: string) => ({ __table: name });
  return new Proxy(
    {
      db: {},
      countries: table("countries"),
      cities: table("cities"),
      tourDays: table("tourDays"),
      tourDepartures: table("tourDepartures"),
    },
    {
      get: (target: any, prop: string) => (prop in target ? target[prop] : table(String(prop))),
    },
  );
});

// Inject a session instead of using the real pg-backed session store, while
// keeping isAuthenticated behavior realistic (401 with no session.userId).
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => {
    app.use((req, _res, next) => {
      (req as any).session = mockState.session.current;
      next();
    });
  },
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
  registerAuthRoutes: () => {},
}));

// Avoid Redis/BullMQ connections at import time.
vi.mock("../../lib/workers", () => ({
  queues: {
    countryImport: { add: vi.fn() },
    cityImport: { add: vi.fn() },
    sightDiscovery: { add: vi.fn() },
    sightEnrichment: { add: vi.fn() },
    tourAi: { add: vi.fn() },
    hotelPrice: { add: vi.fn() },
    flightPrice: { add: vi.fn() },
  },
  startWorkers: vi.fn(),
}));
vi.mock("ioredis", () => ({
  default: function () {
    return { on: vi.fn(), quit: vi.fn() };
  },
}));

// Import AFTER the mocks are registered.
import { registerRoutes } from "../../routes/routes";

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  return app;
}

const NON_ADMIN_ROLES: [string][] = [
  ["customer"],
  ["content_editor"],
  ["tour_builder"],
  ["country_manager"],
  ["hotel_manager"],
];
const ADMIN_ROLES: [string][] = [["admin"], ["super_admin"]];

// The two shadowed registrations both match a two-segment path under
// /api/audit-logs; Express serves the first-registered one. We exercise the
// public URL shape both variants share.
const ENTITY_AUDIT_URL = "/api/audit-logs/tour/tour-123";

function loginAs(userId: string, role: string) {
  mockState.profilesByUserId[userId] = { id: `p-${userId}`, userId, role };
  mockState.session.current = { userId };
}

describe("per-entity audit history stays admin-only for non-admin staff", () => {
  let app: Express;

  beforeEach(async () => {
    for (const k of Object.keys(mockState.profilesByUserId)) delete mockState.profilesByUserId[k];
    mockState.session.current = {};

    // Build the app FIRST so the one-time "seed default admin" setup runs
    // before we reset the read spy, keeping setup calls out of assertions.
    app = await buildApp();

    storageSpies.getAuditLogs.mockReset().mockResolvedValue([{ id: "log-1", action: "update" }]);
  });

  // ---- non-admin staff are rejected --------------------------------------
  it.each(NON_ADMIN_ROLES)(
    "rejects role %s from GET /api/audit-logs/:entityType/:entityId with 403",
    async (role) => {
      loginAs("staff-1", role);

      const res = await request(app).get(ENTITY_AUDIT_URL);

      expect(res.status).toBe(403);
      expect(storageSpies.getAuditLogs).not.toHaveBeenCalled();
    },
  );

  // ---- admins succeed ----------------------------------------------------
  it.each(ADMIN_ROLES)("allows role %s to read a record's audit history", async (role) => {
    loginAs("admin-1", role);

    const res = await request(app).get(ENTITY_AUDIT_URL);

    expect(res.status).toBe(200);
    expect(storageSpies.getAuditLogs).toHaveBeenCalledWith("tour", "tour-123");
    expect(res.body).toEqual([{ id: "log-1", action: "update" }]);
  });

  // ---- anonymous callers are rejected before role checks -----------------
  it("still rejects an anonymous caller from GET /api/audit-logs/:entityType/:entityId with 401", async () => {
    mockState.session.current = {};

    const res = await request(app).get(ENTITY_AUDIT_URL);

    expect(res.status).toBe(401);
    expect(storageSpies.getAuditLogs).not.toHaveBeenCalled();
  });
});
