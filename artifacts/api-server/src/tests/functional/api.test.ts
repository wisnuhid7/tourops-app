import { describe, it, expect, beforeAll, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// Import-time side effects must be stubbed BEFORE importing the routes, so we
// never boot the real HTTP server (src/index.ts) or require a live database,
// Redis, or PORT. We build the Express app in-test and register the routes,
// mirroring src/tests/functional/auto-created-account-role.test.ts.
// ---------------------------------------------------------------------------

// A minimal in-memory drizzle stub. These functional tests exercise routes
// that do not touch the DB directly, but importing the routes/storage modules
// loads `@workspace/db`, so it must resolve without opening a real connection.
vi.mock("@workspace/db", () => {
  const chain: any = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    values: () => chain,
    set: () => chain,
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve([]),
    then: (resolve: (rows: any[]) => void) => resolve([]),
  };
  const fakeDb: any = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
  };
  return new Proxy(
    { db: fakeDb },
    {
      // Every table/type export used by storage resolves to an opaque marker.
      get: (target, prop) =>
        prop in target ? (target as any)[prop] : { __table: String(prop) },
    },
  );
});

// Keep isAuthenticated realistic (401 when no session) without a pg session store.
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (_app: Express) => {},
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
  registerAuthRoutes: () => {},
}));

// Avoid Redis/BullMQ connections at import time.
vi.mock("../../lib/workers", () => ({
  queues: {
    countryImport: { add: vi.fn().mockResolvedValue({ id: "1" }) },
    cityImport: { add: vi.fn().mockResolvedValue({ id: "1" }) },
    sightDiscovery: { add: vi.fn().mockResolvedValue({ id: "1" }) },
    sightEnrichment: { add: vi.fn().mockResolvedValue({ id: "1" }) },
    tourAi: { add: vi.fn().mockResolvedValue({ id: "1" }) },
    hotelPrice: { add: vi.fn().mockResolvedValue({ id: "1" }) },
    flightPrice: { add: vi.fn().mockResolvedValue({ id: "1" }) },
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

describe("Functional API Tests", () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);
  });

  // /api/hotels/search is auth-gated (supplier catalog hardening): anonymous
  // requests are rejected before parameter validation runs.
  it("GET /api/hotels/search should return 401 when unauthenticated (params missing)", async () => {
    const response = await request(app).get("/api/hotels/search");
    expect(response.status).toBe(401);
  });

  it("GET /api/hotels/search should return 401 when unauthenticated (params valid)", async () => {
    const response = await request(app).get(
      "/api/hotels/search?city=Palestine&countryCode=PS",
    );
    expect(response.status).toBe(401);
  });

  it("POST /api/admin/scraper/block should require authentication", async () => {
    const response = await request(app)
      .post("/api/admin/scraper/block")
      .send({ domain: "malicious.com" });
    expect([401, 403]).toContain(response.status);
  });
});
