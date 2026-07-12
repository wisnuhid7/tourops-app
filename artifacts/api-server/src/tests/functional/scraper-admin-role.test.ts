/**
 * Regression guardrail: the scraper kill-switch endpoints
 * (POST /api/admin/scraper/block and /api/admin/scraper/unblock) are gated by
 * `requireRole(req, res, ADMIN_ROLES)`. The functional suite already checks that
 * an *anonymous* caller is rejected (401). This test locks down the next risk:
 *
 *   1. An *authenticated but non-admin* user (e.g. a customer, or a staff role
 *      that is not admin/super_admin) must be rejected with 403.
 *   2. An authenticated admin succeeds (scraperSafety is mocked so no real
 *      blocklist state is mutated).
 *
 * Without this, a future change to `requireRole`/`ADMIN_ROLES` could silently
 * let non-admins block/unblock scraper domains.
 *
 * The database and Redis-backed workers are mocked, and the session is injected
 * (mirroring auto-created-account-role.test.ts) so the test exercises the REAL
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
  profilesStore: [] as Array<{ id: string; userId: string; role: string; isActive?: boolean }>,
  session: { current: {} as { userId?: string } },
}));

// Hoisted spies for the scraper kill-switch so they can be referenced inside the
// (hoisted) vi.mock factory below.
const scraperSpies = vi.hoisted(() => ({
  blockDomain: vi.fn(),
  unblockDomain: vi.fn(),
}));

// Fake drizzle `db` operating on an in-memory `userProfiles` store. Only the
// query shapes used by `getProfileByUserId`/`getOrCreateProfile` are supported.
vi.mock("@workspace/db", () => {
  const { profilesStore } = mockState;

  const makeSelect = () => {
    const state: { filter: { eqUserId?: string } | null } = { filter: null };
    const builder: any = {
      from: () => builder,
      where: (pred: any) => {
        state.filter = pred;
        return builder;
      },
      leftJoin: () => builder,
      limit: () => builder,
      orderBy: () => builder,
      then: (resolve: (rows: any[]) => void, reject: (e: unknown) => void) => {
        try {
          let rows = profilesStore.slice();
          if (state.filter && "eqUserId" in state.filter) {
            rows = rows.filter((r) => r.userId === state.filter!.eqUserId);
          }
          resolve(rows.map((r) => ({ ...r })));
        } catch (e) {
          reject(e);
        }
      },
    };
    return builder;
  };

  const fakeDb: any = {
    select: () => makeSelect(),
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => ({ returning: () => Promise.resolve([]) }),
        returning: () => Promise.resolve([]),
      }),
    }),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
  };

  return {
    db: fakeDb,
    userProfiles: { __table: "userProfiles" },
    users: { __table: "users" },
  };
});

// `eq(col, val)` is only used against userProfiles.userId on the executed paths.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: (_col: any, val: any) => ({ eqUserId: val }) };
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

// Mock the scraper kill-switch so admin success does not mutate real state.
const { blockDomain, unblockDomain } = scraperSpies;
vi.mock("../../lib/scraperSafety", () => ({
  scraperSafety: {
    blockDomain: scraperSpies.blockDomain,
    unblockDomain: scraperSpies.unblockDomain,
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

describe("admin-only scraper controls reject non-admin staff", () => {
  let app: Express;

  beforeEach(async () => {
    mockState.profilesStore.length = 0;
    mockState.session.current = {};
    blockDomain.mockClear();
    unblockDomain.mockClear();
    app = await buildApp();
  });

  // Any authenticated role that is NOT admin/super_admin must be forbidden.
  it.each([
    ["customer"],
    ["content_editor"],
    ["tour_builder"],
    ["country_manager"],
  ])("rejects role %s from POST /api/admin/scraper/block with 403", async (role) => {
    mockState.profilesStore.push({ id: "p1", userId: "staff-1", role });
    mockState.session.current = { userId: "staff-1" };

    const res = await request(app)
      .post("/api/admin/scraper/block")
      .send({ domain: "malicious.com" });

    expect(res.status).toBe(403);
    expect(blockDomain).not.toHaveBeenCalled();
  });

  it.each([
    ["customer"],
    ["content_editor"],
    ["tour_builder"],
    ["country_manager"],
  ])("rejects role %s from POST /api/admin/scraper/unblock with 403", async (role) => {
    mockState.profilesStore.push({ id: "p1", userId: "staff-1", role });
    mockState.session.current = { userId: "staff-1" };

    const res = await request(app)
      .post("/api/admin/scraper/unblock")
      .send({ domain: "malicious.com" });

    expect(res.status).toBe(403);
    expect(unblockDomain).not.toHaveBeenCalled();
  });

  it.each([
    ["admin"],
    ["super_admin"],
  ])("allows role %s to block a domain", async (role) => {
    mockState.profilesStore.push({ id: "p-admin", userId: "admin-1", role });
    mockState.session.current = { userId: "admin-1" };

    const res = await request(app)
      .post("/api/admin/scraper/block")
      .send({ domain: "malicious.com" });

    expect(res.status).toBe(200);
    expect(blockDomain).toHaveBeenCalledWith("malicious.com");
  });

  it.each([
    ["admin"],
    ["super_admin"],
  ])("allows role %s to unblock a domain", async (role) => {
    mockState.profilesStore.push({ id: "p-admin", userId: "admin-1", role });
    mockState.session.current = { userId: "admin-1" };

    const res = await request(app)
      .post("/api/admin/scraper/unblock")
      .send({ domain: "malicious.com" });

    expect(res.status).toBe(200);
    expect(unblockDomain).toHaveBeenCalledWith("malicious.com");
  });

  it("still rejects an anonymous caller with 401", async () => {
    mockState.session.current = {};

    const res = await request(app)
      .post("/api/admin/scraper/block")
      .send({ domain: "malicious.com" });

    expect(res.status).toBe(401);
    expect(blockDomain).not.toHaveBeenCalled();
  });
});
