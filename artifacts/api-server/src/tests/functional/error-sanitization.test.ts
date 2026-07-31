/**
 * Regression guardrail for the `routeError` helper (Task 35).
 *
 * Verifies that when a storage/DB call throws an error containing SQL
 * internals (keywords, bound parameters, constraint names), the *response*
 * body is scrubbed to `{ message: "Internal server error" }` in production
 * mode, while the *server-side logger* still receives the full error so
 * observability is preserved.
 *
 * Three representative endpoints are covered:
 *  1. POST /api/rates/guide       – guide-rate creation path
 *  2. PATCH /api/user-profiles/:id – profile update path
 *  3. POST /api/tours              – tour creation path (non-slug DB error)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// Hoisted mutable state — accessible inside vi.mock() factories.
// ---------------------------------------------------------------------------
const mockState = vi.hoisted(() => ({
  session: { current: {} as { userId?: string } },
  /** Simulated super_admin profile returned by storage.getOrCreateProfile */
  profile: {
    id: "profile-1",
    userId: "user-1",
    role: "super_admin",
    isActive: true,
    countryCode: null,
    cityId: null,
    transportCompanyId: null,
  },
  /** Set per-test to the error that a storage mutation should throw */
  storageError: null as Error | null,
}));

/** Errors captured by the mocked logger.error */
const loggerErrors = vi.hoisted(() => ({ calls: [] as Array<[Record<string, unknown>, string]> }));

// ---------------------------------------------------------------------------
// Mock: logger — spy on error() to assert full-error observability
// ---------------------------------------------------------------------------
vi.mock("../../lib/logger", () => ({
  logger: {
    error: (obj: Record<string, unknown>, msg: string) => {
      loggerErrors.calls.push([obj, msg]);
    },
    info: () => {},
    warn: () => {},
    debug: () => {},
    child: () => ({
      error: () => {},
      info: () => {},
      warn: () => {},
      debug: () => {},
    }),
  },
}));

// ---------------------------------------------------------------------------
// Mock: storage — getOrCreateProfile always succeeds (admin), mutations throw
// the configured storageError so we can simulate DB failures.
// ---------------------------------------------------------------------------
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: () => Promise.resolve(mockState.profile),
    updateProfile: async (_id: string, _data: unknown) => {
      if (mockState.storageError) throw mockState.storageError;
      return mockState.profile;
    },
    createGuideRate: async (_data: unknown) => {
      if (mockState.storageError) throw mockState.storageError;
      return { id: "gr-1" };
    },
    createTour: async (_data: unknown) => {
      if (mockState.storageError) throw mockState.storageError;
      return { id: "tour-1" };
    },
    getTour: async () => null,
    // Silence any other incidental storage calls that may be wired up in
    // route registration helpers (audit logs, notifications, etc.).
    createAuditLog: async () => {},
    getGlobalSettingByKey: async () => null,
  },
}));

// ---------------------------------------------------------------------------
// Mock: auth — inject session without a real pg session store
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
  // passwordSchema referenced in routes.ts top-level import
  passwordSchema: { _def: {} } as any,
}));

// ---------------------------------------------------------------------------
// Mock: @workspace/db — spread all REAL exports (zod schemas, enums, table
// definitions — none of which open a PG socket) but replace `db` with a
// fake query builder so no actual queries run during tests.
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const chain: any = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    offset: () => chain,
    orderBy: () => chain,
    values: () => chain,
    set: () => chain,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
    returning: () => Promise.resolve([]),
    execute: () => Promise.resolve([]),
    then: (resolve: (rows: unknown[]) => void) => resolve([]),
  };
  const fakeDb: any = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fakeDb),
    execute: () => Promise.resolve([]),
  };
  return { ...actual, db: fakeDb };
});

// ---------------------------------------------------------------------------
// Mock: workers / ioredis — avoid Redis connections at import time
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Import routes AFTER all mocks are registered
// ---------------------------------------------------------------------------
import { registerRoutes } from "../../routes/routes";

// ---------------------------------------------------------------------------
// SQL-flavoured error messages — realistic representations of what Postgres
// (via the node-postgres driver) surfaces when bad data reaches the DB layer.
// The specific request body only needs to pass the Zod schema; the storage
// mock throws the SQL error unconditionally, simulating a deeper DB failure.
// ---------------------------------------------------------------------------
const SQL_ERRORS = {
  numericSyntax: new Error(
    "ERROR: invalid input syntax for type numeric: \"not_a_num\"\n" +
    "  at INSERT INTO guide_rates(price) VALUES ($1)\n" +
    "  parameters: $1 = 'not_a_num'",
  ),
  badUuid: new Error(
    'ERROR: invalid input syntax for type uuid: "not-a-real-uuid"\n' +
    "  at UPDATE user_profiles SET role = $1 WHERE id = $2\n" +
    "  parameters: $2 = 'not-a-real-uuid'",
  ),
  foreignKey: new Error(
    'ERROR: insert or update on table "tours" violates foreign key constraint "tours_country_id_fkey"\n' +
    "  DETAIL: Key (country_id)=(99999) is not present in table \"countries\".\n" +
    "  at INSERT INTO tours(...) VALUES ($1, $2, ...)",
  ),
};

/** Keywords that must NEVER appear in a sanitised production response body */
const SQL_KEYWORDS = ["INSERT", "UPDATE", "SELECT", "DELETE", "ERROR:", "parameters:", "DETAIL:", "pg_"];

function containsSqlKeywords(body: unknown): boolean {
  const text = JSON.stringify(body);
  return SQL_KEYWORDS.some((kw) => text.includes(kw));
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------
describe("routeError: DB error sanitization in production mode", () => {
  let app: Express;
  let originalNodeEnv: string | undefined;

  beforeAll(async () => {
    // Force production mode so routeError scrubs 5xx messages
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);
  });

  afterAll(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  beforeEach(() => {
    // Authenticated super_admin session
    mockState.session.current = { userId: "user-1" };
    // Reset per-test storage error and captured log calls
    mockState.storageError = null;
    loggerErrors.calls = [];
  });

  // -------------------------------------------------------------------------
  // 1. POST /api/rates/guide – non-numeric price reaching the DB
  // -------------------------------------------------------------------------
  describe("POST /api/rates/guide (numeric-syntax DB error)", () => {
    it("responds with generic message, not SQL text", async () => {
      mockState.storageError = SQL_ERRORS.numericSyntax;

      const res = await request(app)
        .post("/api/rates/guide")
        .send({
          guideName: "Test Guide",
          // Valid money string — passes the optionalMoneyString schema refine.
          // The storage mock throws the SQL error unconditionally, simulating
          // what would happen if a bad value slipped through to the DB.
          price: "123.45",
        });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Internal server error" });
      expect(containsSqlKeywords(res.body)).toBe(false);
    });

    it("logs the full SQL error server-side", async () => {
      mockState.storageError = SQL_ERRORS.numericSyntax;

      await request(app)
        .post("/api/rates/guide")
        .send({ guideName: "Test Guide", price: "123.45" });

      expect(loggerErrors.calls.length).toBeGreaterThanOrEqual(1);
      const lastCall = loggerErrors.calls[loggerErrors.calls.length - 1];
      // First argument is the object with `err`; second is the log message.
      const logObj = lastCall[0];
      expect(logObj).toHaveProperty("err");
      const errMessage = (logObj.err as any)?.message ?? "";
      expect(errMessage).toContain("invalid input syntax");
      expect(errMessage).toContain("guide_rates");
    });
  });

  // -------------------------------------------------------------------------
  // 2. PATCH /api/user-profiles/:id – bad UUID in the WHERE clause
  // -------------------------------------------------------------------------
  describe("PATCH /api/user-profiles/:id (bad-UUID DB error)", () => {
    it("responds with generic message, not SQL text", async () => {
      mockState.storageError = SQL_ERRORS.badUuid;

      const res = await request(app)
        .patch("/api/user-profiles/not-a-real-uuid")
        .send({ role: "customer" });

      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Internal server error" });
      expect(containsSqlKeywords(res.body)).toBe(false);
    });

    it("logs the full SQL error server-side", async () => {
      mockState.storageError = SQL_ERRORS.badUuid;

      await request(app)
        .patch("/api/user-profiles/not-a-real-uuid")
        .send({ role: "customer" });

      expect(loggerErrors.calls.length).toBeGreaterThanOrEqual(1);
      const lastCall = loggerErrors.calls[loggerErrors.calls.length - 1];
      const logObj = lastCall[0];
      expect(logObj).toHaveProperty("err");
      const errMessage = (logObj.err as any)?.message ?? "";
      expect(errMessage).toContain("invalid input syntax for type uuid");
    });
  });

  // -------------------------------------------------------------------------
  // 3. POST /api/tours – generic DB constraint error (not a slug violation,
  //    so it falls through to routeError rather than the clean 409 branch).
  // -------------------------------------------------------------------------
  describe("POST /api/tours (foreign-key DB error)", () => {
    it("responds with generic message, not SQL text", async () => {
      mockState.storageError = SQL_ERRORS.foreignKey;

      const res = await request(app)
        .post("/api/tours")
        .send({
          title: "Test Tour",
          // Provide the minimum fields that satisfy insertTourSchema
          slug: "test-tour-" + Date.now(),
          duration: 5,
          basePrice: "100",
        });

      // Could be 500 (routeError) — the foreign-key error is not a slug
      // violation so the slug-409 branch is NOT taken.
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ message: "Internal server error" });
      expect(containsSqlKeywords(res.body)).toBe(false);
    });

    it("logs the full SQL error server-side", async () => {
      mockState.storageError = SQL_ERRORS.foreignKey;

      await request(app)
        .post("/api/tours")
        .send({
          title: "Test Tour",
          slug: "test-tour-" + Date.now(),
          duration: 5,
          basePrice: "100",
        });

      expect(loggerErrors.calls.length).toBeGreaterThanOrEqual(1);
      const lastCall = loggerErrors.calls[loggerErrors.calls.length - 1];
      const logObj = lastCall[0];
      expect(logObj).toHaveProperty("err");
      const errMessage = (logObj.err as any)?.message ?? "";
      expect(errMessage).toContain("foreign key constraint");
    });
  });

  // -------------------------------------------------------------------------
  // Sanity check: 4xx validation errors (safe, user-facing) are NOT scrubbed
  // -------------------------------------------------------------------------
  describe("4xx validation errors are forwarded verbatim", () => {
    it("returns the real validation message for a bad role value", async () => {
      // No storage error needed — zod rejects `role: 'superuser'` before DB.
      const res = await request(app)
        .patch("/api/user-profiles/some-id")
        .send({ role: "superuser" }); // not a valid enum value

      // 400 — zod validation failure, not a DB error
      expect(res.status).toBe(400);
      // Must NOT be the generic scrubbed message — the validation text is safe.
      expect(res.body.message).not.toBe("Internal server error");
    });
  });
});
