/**
 * Regression guardrail for QA-AUTHORIZATION-TEST-PLAN.md §5 item 2.
 *
 * The supplier rate-card endpoints were once registered twice: an early
 * `isAuthenticated`-only handler shadowed a later role-gated duplicate, so
 * Express served the ungated one and ANY authenticated user (including a plain
 * `customer`) could read and write confidential supplier pricing.
 *
 * This test locks the fix down: a logged-in `customer` must be rejected with
 * 403 from every rate-card endpoint (read AND write), while a staff role that
 * IS allowed on the gate (e.g. `country_manager`) is NOT rejected with 403.
 * If a shadowed, ungated duplicate is ever reintroduced, the customer requests
 * would start returning 200 and these tests would fail.
 *
 * The database and Redis-backed workers are mocked, so the test exercises the
 * REAL `requireRole` gate wired onto the REAL route registrations without
 * touching a live DB.
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
import { registerRoutes } from "../../routes/routes";

// The confidential supplier rate-card surfaces called out in the QA plan.
const RATE_PATHS = [
  "/api/rates/hotel",
  "/api/rates/guide",
  "/api/rates/sights",
  "/api/rates/airline",
] as const;

function resetStore() {
  mockState.profilesStore.length = 0;
  mockState.idCounter.n = 1;
  mockState.session.current = {};
}

describe("supplier rate cards are gated away from non-staff users", () => {
  let app: Express;

  beforeEach(async () => {
    resetStore();
    // A real admin exists (so getOrCreateProfile never treats a session user as
    // a bootstrap admin), plus an explicit customer and country_manager profile.
    mockState.profilesStore.push({ id: "p-admin", userId: "owner-123", role: "admin" });
    mockState.profilesStore.push({ id: "p-customer", userId: "customer-user", role: "customer" });
    mockState.profilesStore.push({ id: "p-cmgr", userId: "cmgr-user", role: "country_manager" });
    mockState.profilesStore.push({ id: "p-tb", userId: "tourbuilder-user", role: "tour_builder" });

    app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);
  });

  describe("a logged-in customer", () => {
    beforeEach(() => {
      mockState.session.current = { userId: "customer-user" };
    });

    it.each(RATE_PATHS)("cannot READ %s (403)", async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(403);
    });

    it.each(RATE_PATHS)("cannot WRITE %s (403)", async (path) => {
      const res = await request(app).post(path).send({ price: 999 });
      expect(res.status).toBe(403);
    });
  });

  describe("an unauthenticated visitor", () => {
    beforeEach(() => {
      mockState.session.current = {};
    });

    it.each(RATE_PATHS)("is rejected reading %s (401)", async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(401);
    });
  });

  describe("an allowed staff role (country_manager)", () => {
    beforeEach(() => {
      mockState.session.current = { userId: "cmgr-user" };
    });

    // The gate must let allowed staff through — proving these tests are not just
    // passing because every request is blanket-denied.
    it.each(RATE_PATHS)("is NOT forbidden from reading %s", async (path) => {
      const res = await request(app).get(path);
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });

  describe("a tour_builder assembling itineraries", () => {
    beforeEach(() => {
      mockState.session.current = { userId: "tourbuilder-user" };
    });

    it("can READ /api/rates/guide to assign guides in itinerary", async () => {
      const res = await request(app).get("/api/rates/guide");
      expect(res.status).not.toBe(403);
      expect(res.status).not.toBe(401);
    });
  });
});
