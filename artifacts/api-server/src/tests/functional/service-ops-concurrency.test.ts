/**
 * Concurrency guards and authorization tests for service-ops routes.
 *
 * Covers:
 *   1. PATCH /api/payment-schedule/:id/record-payment
 *      - Compare-and-swap prevents double-recording: when two requests read the
 *        same paidAmount snapshot before either write lands, exactly one succeeds
 *        (200) and the other gets 409.
 *      - Non-finance roles are rejected (403).
 *   2. GET /api/supplier/service-requests
 *      - Returns only the calling supplier's own rows (supplier isolation).
 *      - Non-supplier roles get 403.
 *   3. PATCH /api/supplier/service-requests/:id/respond
 *      - Responds 404 (not 403) when the request ID belongs to a different supplier.
 *      - CAS: concurrent status update returns 409.
 *   4. GET|POST /api/test-data/*
 *      - Returns 403 for any role other than super_admin.
 *      - Returns 403 even for super_admin when REPLIT_DEPLOYMENT is set.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// All helper functions and mutable state are hoisted so they are available
// when vi.mock() factories run (vi.mock calls are hoisted to the top of the
// compiled output, before any non-hoisted module-level code).
// ---------------------------------------------------------------------------
const { mockState, makeCol, makeTable, applyConditions } = vi.hoisted(() => {
  type PSRow = {
    id: string; bookingId: string; installmentNumber: number; label: string;
    percentage: string; amount: string; paidAmount: string; currency: string;
    status: string; dueDate: Date; createdAt: Date; updatedAt: Date; notes: string | null;
  };
  type SRRow = {
    id: string; bookingId: string; supplierUserId: string; serviceType: string;
    status: string; agreedRate: string | null; currency: string; location: string | null;
    notesForSupplier: string | null; supplierResponse: string | null;
    respondedAt: Date | null; serviceDate: Date | null; quantity: number | null;
    paxCount: number | null; createdBy: string | null; createdAt: Date; updatedAt: Date;
  };
  type ProfileRow = { userId: string; role: string };

  const mockState = {
    /** Mutable payment-schedule store (CAS operates against this). */
    psStore: [] as PSRow[],
    /**
     * When non-null, db.select().from(bookingPaymentSchedules) returns a snapshot
     * of THIS row instead of the live store value.  Used to simulate both concurrent
     * requests reading the same stale paidAmount before either write commits.
     */
    psSelectSnapshot: null as PSRow | null,
    /** Mutable service-request store. */
    srStore: [] as SRRow[],
    /**
     * When true, the next update on bookingServiceRequests returns [] (simulating
     * a CAS failure from a concurrent modification), then resets to false.
     */
    srNextUpdateEmpty: false,
    /** User-profile store looked up by requireRole / getProfileRole. */
    profileStore: [] as ProfileRow[],
    /** The session userId injected into every request. */
    session: { current: {} as { userId?: string } },
  };

  function makeCol(table: string, col: string): any {
    return { __col: col, __table: table };
  }

  function makeTable(tableName: string, cols: string[]): any {
    const t: any = { __tableName: tableName };
    for (const col of cols) t[col] = makeCol(tableName, col);
    return t;
  }

  /** Apply tagged eq/inArray/and conditions to a row; returns true when ALL match. */
  function applyConditions(row: any, conds: any[]): boolean {
    for (const cond of conds) {
      if (!cond) continue;
      if (cond.__eq) {
        if (String(row[cond.__eq.col]) !== String(cond.__eq.val)) return false;
      } else if (cond.__inArray) {
        if (!cond.__inArray.vals.includes(row[cond.__inArray.col])) return false;
      } else if (cond.__and) {
        if (!applyConditions(row, cond.__and)) return false;
      }
    }
    return true;
  }

  return { mockState, makeCol, makeTable, applyConditions };
});

// ---------------------------------------------------------------------------
// @workspace/db  — in-memory stores for the three tables touched by the routes.
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", () => {
  const bookingPaymentSchedules = makeTable("bookingPaymentSchedules", [
    "id", "bookingId", "installmentNumber", "label", "percentage",
    "amount", "paidAmount", "currency", "status", "dueDate",
    "createdAt", "updatedAt", "notes",
  ]);
  const bookingServiceRequests = makeTable("bookingServiceRequests", [
    "id", "bookingId", "supplierUserId", "serviceType", "status",
    "agreedRate", "currency", "location", "notesForSupplier", "supplierResponse",
    "respondedAt", "serviceDate", "quantity", "paxCount", "createdBy",
    "createdAt", "updatedAt",
  ]);
  const userProfiles = makeTable("userProfiles", [
    "id", "userId", "role", "companyName", "accountType", "isActive", "createdAt", "updatedAt",
  ]);
  const bookings = makeTable("bookings", ["id", "bookingCode", "customerId", "leaderUserId"]);

  // Not exercised in the paths under test; just needs to exist so the import resolves.
  const insertBookingServiceRequestSchema = {
    safeParse: () => ({ success: false, error: { issues: [{ message: "mock" }] } }),
  };

  function makeSelectChain() {
    let activeTable: any = null;
    const whereConds: any[] = [];
    const chain: any = {
      from(table: any) { activeTable = table; return chain; },
      where(cond: any) { whereConds.push(cond); return chain; },
      orderBy() { return chain; },
      limit()   { return chain; },
      leftJoin(){ return chain; },
      then(resolve: (rows: any[]) => void, reject: (e: unknown) => void) {
        try {
          const name = activeTable?.__tableName;
          let store: any[] = [];
          if (name === "bookingPaymentSchedules") {
            store = mockState.psSelectSnapshot
              ? [mockState.psSelectSnapshot]
              : mockState.psStore.slice();
          } else if (name === "bookingServiceRequests") {
            store = mockState.srStore.slice();
          } else if (name === "userProfiles") {
            store = mockState.profileStore.slice();
          }
          resolve(store.filter(r => applyConditions(r, whereConds)).map(r => ({ ...r })));
        } catch (e) { reject(e); }
      },
    };
    return chain;
  }

  function makeUpdateChain(table: any) {
    const name = table?.__tableName;
    let setData: any = {};
    const whereConds: any[] = [];
    const chain: any = {
      set(data: any) { setData = data; return chain; },
      where(cond: any) { whereConds.push(cond); return chain; },
      returning(): Promise<any[]> {
        if (name === "bookingPaymentSchedules") {
          const idx = mockState.psStore.findIndex(r => applyConditions(r, whereConds));
          if (idx === -1) return Promise.resolve([]);
          Object.assign(mockState.psStore[idx], setData);
          return Promise.resolve([{ ...mockState.psStore[idx] }]);
        }
        if (name === "bookingServiceRequests") {
          if (mockState.srNextUpdateEmpty) {
            mockState.srNextUpdateEmpty = false;
            return Promise.resolve([]);
          }
          const idx = mockState.srStore.findIndex(r => applyConditions(r, whereConds));
          if (idx === -1) return Promise.resolve([]);
          Object.assign(mockState.srStore[idx], setData);
          return Promise.resolve([{ ...mockState.srStore[idx] }]);
        }
        return Promise.resolve([]);
      },
    };
    return chain;
  }

  const fakeDb: any = {
    select: () => makeSelectChain(),
    insert: () => ({ values: () => ({ returning: () => Promise.resolve([]) }) }),
    update: (table: any) => makeUpdateChain(table),
    delete: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }),
    transaction: async (fn: (tx: any) => Promise<any>) => fn(fakeDb),
    execute: () => Promise.resolve([]),
  };

  return new Proxy(
    { db: fakeDb, bookingPaymentSchedules, bookingServiceRequests, userProfiles, bookings, insertBookingServiceRequestSchema },
    { get(target, prop) { return prop in target ? (target as any)[prop] : { __table: String(prop) }; } },
  );
});

// ---------------------------------------------------------------------------
// drizzle-orm — return tagged marker objects for eq/and/inArray so
// applyConditions can interpret them; spread the real module for everything else.
// ---------------------------------------------------------------------------
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    eq:      (col: any, val: any)    => ({ __eq:      { col: col?.__col ?? "?", table: col?.__table ?? "?", val } }),
    and:     (...args: any[])         => ({ __and: args }),
    inArray: (col: any, vals: any[]) => ({ __inArray: { col: col?.__col ?? "?", table: col?.__table ?? "?", vals } }),
    desc:    () => ({}),
  };
});

// ---------------------------------------------------------------------------
// Auth — inject the mutable session; keep isAuthenticated behaviour realistic.
// ---------------------------------------------------------------------------
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => {
    app.use((req: any, _res: any, next: any) => {
      req.session = mockState.session.current;
      next();
    });
  },
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
  registerAuthRoutes: () => {},
  passwordSchema: { parse: (v: any) => v },
}));

// ---------------------------------------------------------------------------
// Storage — provide getOrCreateProfile (used by requireRole) and stub the rest.
// ---------------------------------------------------------------------------
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: async (userId: string) => {
      const p = mockState.profileStore.find(r => r.userId === userId);
      if (!p) { const e: any = new Error("No profile"); e.statusCode = 403; throw e; }
      return p;
    },
    createAuditLog: async () => ({}),
    getBooking:     async () => null,
  },
}));

// ---------------------------------------------------------------------------
// test-seed — real env-var guard logic kept; heavy operations stubbed out.
// ---------------------------------------------------------------------------
vi.mock("../../test-seed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../test-seed")>();
  return {
    ...actual,
    runTestSeed:      vi.fn().mockResolvedValue({}),
    resetTestData:    vi.fn().mockResolvedValue({}),
    runValidationOnly: vi.fn().mockResolvedValue([]),
    latestSeedRun:    vi.fn().mockResolvedValue(null),
  };
});

// ---------------------------------------------------------------------------
// Avoid Redis / BullMQ connections at import time.
// ---------------------------------------------------------------------------
vi.mock("../../lib/workers", () => ({
  queues: {
    countryImport:  { add: vi.fn() },
    cityImport:     { add: vi.fn() },
    sightDiscovery: { add: vi.fn() },
    sightEnrichment:{ add: vi.fn() },
    tourAi:         { add: vi.fn() },
    hotelPrice:     { add: vi.fn() },
    flightPrice:    { add: vi.fn() },
  },
  startWorkers: vi.fn(),
}));
vi.mock("ioredis", () => ({
  default: function () { return { on: vi.fn(), quit: vi.fn() }; },
}));

// Import AFTER all mocks are registered.
import { registerRoutes } from "../../routes/routes";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function resetState() {
  mockState.psStore.length = 0;
  mockState.psSelectSnapshot = null;
  mockState.srStore.length = 0;
  mockState.srNextUpdateEmpty = false;
  mockState.profileStore.length = 0;
  mockState.session.current = {};
}

const BASE_PS: any = {
  bookingId: "bkg-1", installmentNumber: 2, label: "Second Payment",
  percentage: "30", amount: "100.00", paidAmount: "0.00", currency: "USD",
  status: "pending", dueDate: new Date("2026-09-01"),
  createdAt: new Date(), updatedAt: new Date(), notes: null,
};

const BASE_SR: any = {
  bookingId: "bkg-1", serviceType: "hotel", agreedRate: "200", currency: "USD",
  location: "Jerusalem", notesForSupplier: "Test notes", supplierResponse: null,
  respondedAt: null, serviceDate: new Date("2026-10-15"), quantity: 10,
  paxCount: 20, createdBy: "user-ops-1", createdAt: new Date(), updatedAt: new Date(),
};

// ===========================================================================
// 1. PATCH /api/payment-schedule/:id/record-payment
// ===========================================================================
describe("PATCH /api/payment-schedule/:id/record-payment", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    mockState.profileStore.push(
      { userId: "finance-user", role: "accounting" },
      { userId: "ops-user",    role: "operations_manager" },
      { userId: "customer",    role: "customer" },
    );
    mockState.psStore.push({ id: "ps-1", ...BASE_PS });

    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
  });

  afterEach(() => { delete process.env.REPLIT_DEPLOYMENT; });

  it("records a partial payment and returns 200 for an authorised finance role", async () => {
    mockState.session.current = { userId: "finance-user" };
    const res = await request(app)
      .patch("/api/payment-schedule/ps-1/record-payment")
      .send({ amount: "50.00" });

    expect(res.status).toBe(200);
    expect(res.body.paidAmount).toBe("50.00");
    expect(res.body.status).toBe("partially_paid");
  });

  it("marks the installment as paid when the full amount is recorded", async () => {
    mockState.session.current = { userId: "ops-user" };
    const res = await request(app)
      .patch("/api/payment-schedule/ps-1/record-payment")
      .send({ amount: "100.00" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("paid");
  });

  it("returns 400 when the payment would exceed the installment amount", async () => {
    mockState.session.current = { userId: "finance-user" };
    const res = await request(app)
      .patch("/api/payment-schedule/ps-1/record-payment")
      .send({ amount: "150.00" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/exceed/i);
  });

  it("returns 404 when the installment does not exist", async () => {
    mockState.session.current = { userId: "finance-user" };
    const res = await request(app)
      .patch("/api/payment-schedule/nonexistent/record-payment")
      .send({ amount: "10.00" });

    expect(res.status).toBe(404);
  });

  it("returns 403 when the caller lacks the finance role (customer)", async () => {
    mockState.session.current = { userId: "customer" };
    const res = await request(app)
      .patch("/api/payment-schedule/ps-1/record-payment")
      .send({ amount: "10.00" });

    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .patch("/api/payment-schedule/ps-1/record-payment")
      .send({ amount: "10.00" });

    expect(res.status).toBe(401);
  });

  it("CAS — returns 409 when the installment was modified concurrently", async () => {
    // The live store already reflects a prior write (paidAmount="50.00"), but
    // the snapshot (simulating an earlier read by a racing request) still shows
    // "0.00".  The handler reads "0.00" from the snapshot, tries to UPDATE WHERE
    // paidAmount="0.00", finds the live store has "50.00", gets back [] → 409.
    mockState.psStore[0].paidAmount = "50.00";
    mockState.psSelectSnapshot = { id: "ps-1", ...BASE_PS, paidAmount: "0.00" };

    mockState.session.current = { userId: "finance-user" };
    const res = await request(app)
      .patch("/api/payment-schedule/ps-1/record-payment")
      .send({ amount: "50.00" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/concurrently/i);
  });

  it("CAS — exactly one of two concurrent requests succeeds; the other gets 409", async () => {
    // Both handlers will call db.select() and receive the snapshot (paidAmount="0.00").
    // The first handler to run its update commits "50.00" to the live store.
    // The second handler issues UPDATE WHERE paidAmount="0.00", but the store now
    // holds "50.00" → no row matches → [] → 409.
    mockState.psSelectSnapshot = { id: "ps-1", ...BASE_PS, paidAmount: "0.00" };
    mockState.session.current = { userId: "finance-user" };

    const [r1, r2] = await Promise.all([
      request(app).patch("/api/payment-schedule/ps-1/record-payment").send({ amount: "50.00" }),
      request(app).patch("/api/payment-schedule/ps-1/record-payment").send({ amount: "50.00" }),
    ]);

    const statuses = [r1.status, r2.status].sort();
    expect(statuses).toEqual([200, 409]);
  });
});

// ===========================================================================
// 2. GET /api/supplier/service-requests — supplier isolation
// ===========================================================================
describe("GET /api/supplier/service-requests", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    mockState.profileStore.push(
      { userId: "supplier-a", role: "supplier" },
      { userId: "supplier-b", role: "hotel_manager" },
      { userId: "ops-user",   role: "operations_manager" },
      { userId: "customer",   role: "customer" },
    );
    mockState.srStore.push(
      { id: "sr-a1", supplierUserId: "supplier-a", status: "sent",      ...BASE_SR },
      { id: "sr-b1", supplierUserId: "supplier-b", status: "confirmed", ...BASE_SR },
      // Pending draft for supplier-a — must NOT appear (pending is ops-only).
      { id: "sr-a2", supplierUserId: "supplier-a", status: "pending",   ...BASE_SR },
    );

    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
  });

  it("returns only the calling supplier's own rows (not other suppliers')", async () => {
    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app).get("/api/supplier/service-requests");

    expect(res.status).toBe(200);
    const ids = res.body.map((r: any) => r.id);
    expect(ids).toContain("sr-a1");
    expect(ids).not.toContain("sr-b1");
  });

  it("does not expose pending (draft) rows to the supplier", async () => {
    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app).get("/api/supplier/service-requests");

    expect(res.status).toBe(200);
    expect(res.body.map((r: any) => r.id)).not.toContain("sr-a2");
  });

  it("does not leak the createdBy field to the supplier (supplierView strips it)", async () => {
    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app).get("/api/supplier/service-requests");

    expect(res.status).toBe(200);
    for (const row of res.body) {
      expect(row).not.toHaveProperty("createdBy");
    }
  });

  it("returns 403 for a non-supplier role (operations_manager)", async () => {
    mockState.session.current = { userId: "ops-user" };
    const res = await request(app).get("/api/supplier/service-requests");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a customer role", async () => {
    mockState.session.current = { userId: "customer" };
    const res = await request(app).get("/api/supplier/service-requests");
    expect(res.status).toBe(403);
  });

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app).get("/api/supplier/service-requests");
    expect(res.status).toBe(401);
  });
});

// ===========================================================================
// 3. PATCH /api/supplier/service-requests/:id/respond — isolation + CAS
// ===========================================================================
describe("PATCH /api/supplier/service-requests/:id/respond", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    mockState.profileStore.push(
      { userId: "supplier-a", role: "supplier" },
      { userId: "supplier-b", role: "hotel_manager" },
      { userId: "ops-user",   role: "operations_manager" },
    );
    mockState.srStore.push(
      { id: "sr-a1", supplierUserId: "supplier-a", status: "sent", ...BASE_SR },
      { id: "sr-b1", supplierUserId: "supplier-b", status: "sent", ...BASE_SR },
    );

    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
  });

  it("allows the assigned supplier to confirm their own request (200)", async () => {
    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app)
      .patch("/api/supplier/service-requests/sr-a1/respond")
      .send({ status: "confirmed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("confirmed");
  });

  it("returns 404 (not 403) when a supplier targets another supplier's request", async () => {
    // supplier-a must NOT learn whether sr-b1 exists — 404 masks existence.
    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app)
      .patch("/api/supplier/service-requests/sr-b1/respond")
      .send({ status: "confirmed" });

    expect(res.status).toBe(404);
  });

  it("returns 404 for a completely unknown request id", async () => {
    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app)
      .patch("/api/supplier/service-requests/nonexistent/respond")
      .send({ status: "confirmed" });

    expect(res.status).toBe(404);
  });

  it("returns 400 when rejecting without a reason note", async () => {
    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app)
      .patch("/api/supplier/service-requests/sr-a1/respond")
      .send({ status: "rejected" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/note|reason|explaining/i);
  });

  it("returns 403 for a non-supplier role (operations_manager)", async () => {
    mockState.session.current = { userId: "ops-user" };
    const res = await request(app)
      .patch("/api/supplier/service-requests/sr-a1/respond")
      .send({ status: "confirmed" });

    expect(res.status).toBe(403);
  });

  it("CAS — returns 409 when the request was concurrently modified", async () => {
    // Force the next update to return [] (simulating CAS failure).
    mockState.srNextUpdateEmpty = true;

    mockState.session.current = { userId: "supplier-a" };
    const res = await request(app)
      .patch("/api/supplier/service-requests/sr-a1/respond")
      .send({ status: "confirmed" });

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/concurrently/i);
  });
});

// ===========================================================================
// 4. /api/test-data/* — super_admin only; blocked when REPLIT_DEPLOYMENT is set
// ===========================================================================
describe("/api/test-data/* endpoints", () => {
  let app: Express;

  beforeEach(async () => {
    delete process.env.REPLIT_DEPLOYMENT;
    delete process.env.NODE_ENV;

    resetState();
    mockState.profileStore.push(
      { userId: "super-admin", role: "super_admin" },
      { userId: "admin-user",  role: "admin" },
      { userId: "ops-user",    role: "operations_manager" },
      { userId: "customer",    role: "customer" },
    );

    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
  });

  afterEach(() => {
    delete process.env.REPLIT_DEPLOYMENT;
    delete process.env.NODE_ENV;
  });

  const TEST_DATA_ENDPOINTS = [
    { method: "get",  path: "/api/test-data/status" },
    { method: "post", path: "/api/test-data/seed" },
    { method: "post", path: "/api/test-data/reset" },
    { method: "post", path: "/api/test-data/validate" },
  ] as const;

  it.each([
    ["admin",              "admin-user"],
    ["operations_manager", "ops-user"],
    ["customer",           "customer"],
  ])("role '%s' is rejected (403) on all test-data endpoints", async (_role, userId) => {
    mockState.session.current = { userId };
    for (const { method, path } of TEST_DATA_ENDPOINTS) {
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status).toBe(403);
    }
  });

  it.each(TEST_DATA_ENDPOINTS)(
    "unauthenticated request to $method $path returns 401",
    async ({ method, path }) => {
      mockState.session.current = {};
      const res = await (request(app) as any)[method](path).send({});
      expect(res.status).toBe(401);
    },
  );

  it.each(TEST_DATA_ENDPOINTS)(
    "REPLIT_DEPLOYMENT blocks $method $path even for super_admin (403)",
    async ({ method, path }) => {
      process.env.REPLIT_DEPLOYMENT = "1";
      mockState.session.current = { userId: "super-admin" };

      const res = await (request(app) as any)[method](path).send({});
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/blocked.*production|production.*blocked/i);
    },
  );
});
