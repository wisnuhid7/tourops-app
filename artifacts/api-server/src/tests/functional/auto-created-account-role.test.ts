/**
 * Regression guardrail for QA-AUTHORIZATION-TEST-PLAN.md §5 item 5.
 *
 * Any authenticated user without a profile is silently given a default profile
 * via `storage.getOrCreateProfile`. This test locks down two things so a future
 * change (or an unexpected code path) can never hand a freshly provisioned
 * account a higher-privileged role by accident:
 *
 *   1. `getOrCreateProfile` always defaults a brand-new user to the `customer`
 *      role whenever a real admin already exists (i.e. normal operation).
 *   2. A brand-new authenticated user (no prior profile) is rejected with 403
 *      from every staff/admin-gated endpoint (GET /api/user-profiles,
 *      GET /api/hotels, GET /api/payments) and can only read its own profile.
 *
 * The database and Redis-backed workers are mocked, so the test exercises the
 * REAL `getOrCreateProfile` + `requireRole` logic without touching a live DB.
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
  idCounter: { n: 1 },
  session: { current: {} as { userId?: string } },
}));

// Fake drizzle `db` that operates on an in-memory `userProfiles` store. Only the
// query shapes used by `getOrCreateProfile`/`getProfileByUserId` are supported.
vi.mock("@workspace/db", () => {
  const { profilesStore, idCounter } = mockState;

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
    insert: () => {
      const ib: any = {
        _values: null,
        _conflict: false,
        values(v: any) {
          this._values = v;
          return this;
        },
        onConflictDoNothing() {
          if (profilesStore.some((r) => r.userId === this._values.userId)) {
            this._conflict = true;
          }
          return this;
        },
        returning() {
          if (this._conflict) return Promise.resolve([]);
          const row = { id: `gen-${idCounter.n++}`, isActive: true, ...this._values };
          profilesStore.push(row);
          return Promise.resolve([{ ...row }]);
        },
      };
      return ib;
    },
    update: () => {
      const ub: any = {
        set: () => ub,
        where: () => ub,
        returning: () => Promise.resolve([]),
      };
      return ub;
    },
  };

  // `userProfiles`/`users` are opaque markers; every other export is undefined,
  // which is fine because the executed code paths never touch them.
  return {
    db: fakeDb,
    userProfiles: { __table: "userProfiles" },
    users: { __table: "users" },
  };
});

// `eq(col, val)` is only used against userProfiles.userId on the executed paths,
// so encode the compared value in a marker the fake `where` understands.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return { ...actual, eq: (_col: any, val: any) => ({ eqUserId: val }) };
});

// Replace the auth module so we can inject a session instead of using the real
// pg-backed session store, while keeping isAuthenticated behavior realistic.
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

// Avoid Redis/BullMQ connections at import time (mirrors the other functional test).
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
import { storage } from "../../storage";
import { registerRoutes } from "../../routes/routes";

const STAFF_ROLES = [
  "admin", "super_admin", "airline_supplier", "country_manager", "city_manager",
  "hotel_manager", "transport_manager", "guide_manager", "sights_manager",
  "content_editor", "flight_agent", "tour_builder", "supplier", "tour_leader",
];

function resetStore() {
  mockState.profilesStore.length = 0;
  mockState.idCounter.n = 1;
  mockState.session.current = {};
}

describe("getOrCreateProfile default role guardrail", () => {
  beforeEach(() => resetStore());

  it("defaults a brand-new user to the customer role when a real admin exists", async () => {
    mockState.profilesStore.push({ id: "p-admin", userId: "owner-123", role: "admin" });

    const profile = await storage.getOrCreateProfile("brand-new-user");

    expect(profile.role).toBe("customer");
    // A future change to the default must be caught here: the auto-created
    // account must never land on any staff/admin role.
    expect(STAFF_ROLES).not.toContain(profile.role);
  });

  it("persists the auto-created profile as customer (read-back is stable)", async () => {
    mockState.profilesStore.push({ id: "p-admin", userId: "owner-123", role: "admin" });

    await storage.getOrCreateProfile("brand-new-user");
    const readBack = await storage.getProfileByUserId("brand-new-user");

    expect(readBack?.role).toBe("customer");
  });

  it("is idempotent: repeated calls keep the account on customer", async () => {
    mockState.profilesStore.push({ id: "p-admin", userId: "owner-123", role: "admin" });

    const first = await storage.getOrCreateProfile("brand-new-user");
    const second = await storage.getOrCreateProfile("brand-new-user");

    expect(first.role).toBe("customer");
    expect(second.role).toBe("customer");
    // No duplicate profile row was created for the same user.
    expect(mockState.profilesStore.filter((p) => p.userId === "brand-new-user")).toHaveLength(1);
  });
});

describe("brand-new authenticated user cannot reach staff/admin endpoints", () => {
  let app: Express;

  beforeEach(async () => {
    resetStore();
    // A real admin exists, so any newly provisioned account defaults to customer.
    mockState.profilesStore.push({ id: "p-admin", userId: "owner-123", role: "admin" });

    app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);

    // Authenticated as a user that has NO profile yet.
    mockState.session.current = { userId: "fresh-authenticated-user" };
  });

  it.each([
    ["/api/user-profiles"],
    ["/api/hotels"],
    ["/api/payments"],
  ])("returns 403 for %s", async (path) => {
    const res = await request(app).get(path);
    expect(res.status).toBe(403);
  });

  it("auto-provisions the account as customer on its own profile endpoint", async () => {
    const res = await request(app).get("/api/user-profile");
    expect(res.status).toBe(200);
    expect(res.body.role).toBe("customer");
  });

  it("rejects unauthenticated access to a staff endpoint with 401", async () => {
    mockState.session.current = {};
    const res = await request(app).get("/api/user-profiles");
    expect(res.status).toBe(401);
  });
});
