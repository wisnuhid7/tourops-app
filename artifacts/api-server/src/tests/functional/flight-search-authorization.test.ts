/**
 * Regression guardrail for the flight-search endpoint.
 *
 * GET /api/flights/search was recently deduplicated and gated behind login +
 * role checks (admins and `flight_agent`). A prior regression had a shadowed
 * duplicate route re-opening a supposedly gated surface, so this test locks the
 * flight-search gate down:
 *   - an unauthenticated visitor gets 401
 *   - a logged-in customer (wrong role) gets 403
 *   - an allowed staff role (flight_agent / admin) is NOT rejected with 401/403
 *
 * The database, Redis-backed workers, and the airline search service are mocked,
 * so the test exercises the REAL `requireRole` gate wired onto the REAL route
 * registrations without touching a live DB or external flight API.
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

// Avoid Redis/BullMQ connections at import time (mirrors the other functional tests).
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

// Stub the airline service so an authorized request does not hit a real flight
// API. It returns a marker array we can assert against for the success case.
const FLIGHT_RESULTS = [{ id: "flight-1", price: 123 }];
vi.mock("../../lib/airline", () => ({
  airlineService: {
    searchFlights: vi.fn(async () => FLIGHT_RESULTS),
  },
}));

// Import AFTER the mocks are registered.
import { registerRoutes } from "../../routes/routes";

const SEARCH_PATH = "/api/flights/search";
const VALID_QUERY = { origin: "TLV", destination: "JFK", date: "2026-08-01" };

function resetStore() {
  mockState.profilesStore.length = 0;
  mockState.idCounter.n = 1;
  mockState.session.current = {};
}

describe("flight search is locked to logged-in staff", () => {
  let app: Express;

  beforeEach(async () => {
    resetStore();
    // A real admin exists (so getOrCreateProfile never treats a session user as
    // a bootstrap admin), plus explicit customer, flight_agent, and admin actors.
    mockState.profilesStore.push({ id: "p-owner", userId: "owner-123", role: "admin" });
    mockState.profilesStore.push({ id: "p-customer", userId: "customer-user", role: "customer" });
    mockState.profilesStore.push({ id: "p-agent", userId: "agent-user", role: "flight_agent" });
    mockState.profilesStore.push({ id: "p-admin", userId: "admin-user", role: "admin" });

    app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);
  });

  it("rejects an unauthenticated visitor with 401", async () => {
    mockState.session.current = {};
    const res = await request(app).get(SEARCH_PATH).query(VALID_QUERY);
    expect(res.status).toBe(401);
  });

  it("rejects a logged-in customer (wrong role) with 403", async () => {
    mockState.session.current = { userId: "customer-user" };
    const res = await request(app).get(SEARCH_PATH).query(VALID_QUERY);
    expect(res.status).toBe(403);
  });

  it("allows a flight_agent to search", async () => {
    mockState.session.current = { userId: "agent-user" };
    const res = await request(app).get(SEARCH_PATH).query(VALID_QUERY);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FLIGHT_RESULTS);
  });

  it("allows an admin to search", async () => {
    mockState.session.current = { userId: "admin-user" };
    const res = await request(app).get(SEARCH_PATH).query(VALID_QUERY);
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200);
    expect(res.body).toEqual(FLIGHT_RESULTS);
  });
});
