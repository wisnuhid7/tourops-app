/**
 * Regression guardrail: the sensitive admin-only endpoints
 *
 *   - GET   /api/admin/audit-logs
 *   - POST  /api/admin/users
 *   - PATCH /api/admin/users/:id/password
 *
 * are all gated by `requireRole(req, res, ADMIN_ROLES)`. The functional suite
 * already covers the scraper kill-switch; this test locks down the audit-log
 * and user-management surface, which is arguably more sensitive (leaking audit
 * history, or letting a non-admin mint accounts / reset any password).
 *
 * It asserts:
 *   1. An *authenticated but non-admin* staff role is rejected with 403 and the
 *      underlying storage mutation never runs.
 *   2. An authenticated admin (and super_admin) succeeds.
 *   3. An anonymous caller is still rejected with 401.
 *
 * Without this, a future change to `requireRole`/`ADMIN_ROLES` could silently
 * expose audit logs or user management to non-admin staff.
 *
 * `storage` and `authStorage` are mocked (mirroring the session-injection
 * pattern in scraper-admin-role.test.ts) so the test exercises the REAL
 * `requireRole` logic without touching a live DB.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";
import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Shared, hoisted mutable state used by the module mocks below.
// ---------------------------------------------------------------------------
const mockState = vi.hoisted(() => ({
  // role of the currently "logged in" user (keyed by userId)
  profilesByUserId: {} as Record<string, { id: string; userId: string; role: string }>,
  session: { current: {} as { userId?: string } },
}));

// Hoisted spies for the storage/authStorage side-effects so they can be
// referenced inside the (hoisted) vi.mock factories below and asserted on.
const storageSpies = vi.hoisted(() => ({
  getAuditLogs: vi.fn(),
  updateProfile: vi.fn(),
}));
const authSpies = vi.hoisted(() => ({
  getUserByUsername: vi.fn(),
  upsertUser: vi.fn(),
  getUser: vi.fn(),
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
    updateProfile: storageSpies.updateProfile,
    getAuditLogs: storageSpies.getAuditLogs,
  },
}));

// Mock the auth-side user storage used by the user-management routes.
vi.mock("../../replit_integrations/auth/storage", () => ({
  authStorage: {
    getUserByUsername: authSpies.getUserByUsername,
    upsertUser: authSpies.upsertUser,
    getUser: authSpies.getUser,
    // Explicit provisioning used by POST /api/admin/users (fail-closed
    // getOrCreateProfile no longer creates profiles).
    ensureProfile: async (userId: string) => {
      const p = { id: `p-${userId}`, userId, role: "customer" };
      mockState.profilesByUserId[userId] = p;
      return p;
    },
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
      // Any insert*Schema / table symbol imported is returned as a harmless stub.
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
  // Real export used by the admin password-reset route (unified policy).
  passwordSchema: z.string().min(8, "Password must be at least 8 characters"),
  MIN_PASSWORD_LENGTH: 8,
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

function loginAs(userId: string, role: string) {
  mockState.profilesByUserId[userId] = { id: `p-${userId}`, userId, role };
  mockState.session.current = { userId };
}

describe("admin-only audit logs & user management reject non-admin staff", () => {
  let app: Express;

  beforeEach(async () => {
    for (const k of Object.keys(mockState.profilesByUserId)) delete mockState.profilesByUserId[k];
    mockState.session.current = {};

    // Build the app FIRST — registerRoutes runs a one-time "seed default admin"
    // step that calls authStorage.getUserByUsername/upsertUser. Resetting the
    // spies afterwards keeps those setup-time calls out of our assertions.
    app = await buildApp();

    storageSpies.getAuditLogs.mockReset().mockResolvedValue([{ id: "log-1", action: "test" }]);
    storageSpies.updateProfile.mockReset().mockResolvedValue({ id: "prof-1", role: "content_editor" });
    authSpies.getUserByUsername.mockReset().mockResolvedValue(undefined);
    authSpies.upsertUser
      .mockReset()
      .mockResolvedValue({ id: "u-new", username: "newuser", firstName: "New", lastName: null, email: null });
    authSpies.getUser
      .mockReset()
      .mockResolvedValue({ id: "u-target", username: "target", firstName: "T", lastName: null, email: null });
  });

  // ---- GET /api/admin/audit-logs -----------------------------------------
  it.each(NON_ADMIN_ROLES)("rejects role %s from GET /api/admin/audit-logs with 403", async (role) => {
    loginAs("staff-1", role);

    const res = await request(app).get("/api/admin/audit-logs");

    expect(res.status).toBe(403);
    expect(storageSpies.getAuditLogs).not.toHaveBeenCalled();
  });

  it.each(ADMIN_ROLES)("allows role %s to read audit logs", async (role) => {
    loginAs("admin-1", role);

    const res = await request(app).get("/api/admin/audit-logs");

    expect(res.status).toBe(200);
    expect(storageSpies.getAuditLogs).toHaveBeenCalled();
    expect(res.body).toEqual([{ id: "log-1", action: "test" }]);
  });

  // ---- POST /api/admin/users ---------------------------------------------
  const newUserPayload = {
    username: "newuser",
    password: "secret123", // must satisfy the unified >= 8 char policy
    firstName: "New",
    role: "content_editor",
  };

  it.each(NON_ADMIN_ROLES)("rejects role %s from POST /api/admin/users with 403", async (role) => {
    loginAs("staff-1", role);

    const res = await request(app).post("/api/admin/users").send(newUserPayload);

    expect(res.status).toBe(403);
    expect(authSpies.upsertUser).not.toHaveBeenCalled();
  });

  it.each(ADMIN_ROLES)("allows role %s to create a user", async (role) => {
    loginAs("admin-1", role);

    const res = await request(app).post("/api/admin/users").send(newUserPayload);

    expect(res.status).toBe(200);
    expect(authSpies.upsertUser).toHaveBeenCalledTimes(1);
    expect(res.body.user).toMatchObject({ id: "u-new", username: "newuser" });
  });

  // ---- PATCH /api/admin/users/:id/password -------------------------------
  it.each(NON_ADMIN_ROLES)(
    "rejects role %s from PATCH /api/admin/users/:id/password with 403",
    async (role) => {
      loginAs("staff-1", role);

      const res = await request(app)
        .patch("/api/admin/users/u-target/password")
        .send({ password: "newsecret" });

      expect(res.status).toBe(403);
      expect(authSpies.upsertUser).not.toHaveBeenCalled();
    },
  );

  it.each(ADMIN_ROLES)("allows role %s to reset a user's password", async (role) => {
    loginAs("admin-1", role);

    const res = await request(app)
      .patch("/api/admin/users/u-target/password")
      .send({ password: "newsecret" });

    expect(res.status).toBe(200);
    expect(authSpies.upsertUser).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({ success: true });
  });

  // ---- Anonymous callers are rejected before role checks -----------------
  it("still rejects an anonymous caller from GET /api/admin/audit-logs with 401", async () => {
    mockState.session.current = {};

    const res = await request(app).get("/api/admin/audit-logs");

    expect(res.status).toBe(401);
    expect(storageSpies.getAuditLogs).not.toHaveBeenCalled();
  });

  it("still rejects an anonymous caller from POST /api/admin/users with 401", async () => {
    mockState.session.current = {};

    const res = await request(app).post("/api/admin/users").send(newUserPayload);

    expect(res.status).toBe(401);
    expect(authSpies.upsertUser).not.toHaveBeenCalled();
  });

  it("still rejects an anonymous caller from PATCH /api/admin/users/:id/password with 401", async () => {
    mockState.session.current = {};

    const res = await request(app)
      .patch("/api/admin/users/u-target/password")
      .send({ password: "newsecret" });

    expect(res.status).toBe(401);
    expect(authSpies.upsertUser).not.toHaveBeenCalled();
  });
});
