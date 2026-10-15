/**
 * OWASP A01 — Broken Access Control.
 *
 * Security regression guards for authorization gaps found during the
 * security-review engagement. Cases are written as the SECURE expectation;
 * where the current code is known to be vulnerable the test is marked
 * `it.fails` (vi tests `it.fails` = "expected to fail"). Consequence:
 *   - while the gap exists  -> the suite stays GREEN (the failure is expected)
 *   - once it is fixed      -> the test now PASSES, vitest reports it as a
 *                              failure, forcing the author to promote it.fails
 *                              -> it and lock the fix in.
 *
 * Confirmed gaps (verified against source, not inferred):
 *   1. catalogRoutes.ts:139-157 — POST/PATCH/DELETE tour-day items only call
 *      `isAuthenticated`; any authenticated customer can mutate itinerary data.
 *   2. catalogRoutes.ts:130 — GET /api/tour-days/:dayId/items has NO auth at
 *      all, leaking items (incl. unpublished tours) to anonymous callers.
 *   3. adminMiscRoutes.ts:267 — GET /api/tours/:id/price-breakdown is
 *      authentication-only and exposes cost/markup/margin to any customer.
 *   4. toursRoutes.ts:67,258 — public tour reads spread the whole DB row
 *      (`{...tour}`), leaking internal columns (markupAmount, internalNotes).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

const mockState = vi.hoisted(() => ({
  session: { current: {} as { userId?: string } },
  profile: {
    id: "profile-1",
    userId: "user-1",
    role: "customer",
    isActive: true,
    countryCode: null,
    cityId: null,
    transportCompanyId: null,
  },
  tour: {
    id: "tour-1",
    title: "Public Tour",
    slug: "public-tour",
    duration: 5,
    description: "desc",
    basePrice: "100",
    countries: ["Indonesia"],
    isPublished: true,
    // internal-only columns that must never reach a public response:
    markupAmount: "150",
    internalNotes: "INTERNAL: supplier cost 42, margin 60%",
  } as any,
  dayItems: [{ id: "item-1", tourDayId: "day-1", title: "Visit temple" }],
  created: [] as any[],
  updated: [] as any[],
  deleted: [] as any[],
}));

vi.mock("../../lib/logger", () => ({
  logger: {
    error: () => {},
    info: () => {},
    warn: () => {},
    debug: () => {},
    child: () => ({ error: () => {}, info: () => {}, warn: () => {}, debug: () => {} }),
  },
}));

vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: () => Promise.resolve(mockState.profile),
    getTour: async () => mockState.tour,
    getTourDays: async () => [],
    getTourDayItems: async () => mockState.dayItems,
    createTourDayItem: async (d: any) => {
      mockState.created.push(d);
      return { id: "item-new", ...d };
    },
    updateTourDayItem: async (id: string, d: any) => {
      mockState.updated.push({ id, d });
      return { id, ...d };
    },
    deleteTourDayItem: async (id: string) => {
      mockState.deleted.push(id);
    },
    getPublishedTours: async () => (mockState.tour ? [mockState.tour] : []),
    getAllCountries: async () => [],
    getAnalytics: async () => ({ totalBookings: 1 }),
    getGlobalSettingByKey: async () => null,
    updateGlobalSetting: async () => {},
    createAuditLog: async () => {},
  },
}));

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
  passwordSchema: { _def: {} } as any,
}));

vi.mock("../../replit_integrations/auth/storage", () => ({
  authStorage: {
    getUserByUsername: async () => null,
    getUser: async () => null,
    getUserByEmail: async () => null,
    upsertUser: async () => ({ id: "admin-1" }),
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
    from: () => chain, where: () => chain, leftJoin: () => chain, limit: () => chain,
    offset: () => chain, orderBy: () => chain, values: () => chain, set: () => chain,
    onConflictDoNothing: () => chain, onConflictDoUpdate: () => chain,
    returning: () => Promise.resolve([]), execute: () => Promise.resolve([]),
    then: (resolve: (rows: unknown[]) => void) => resolve([]),
  };
  const fakeDb: any = {
    select: () => chain, insert: () => chain, update: () => chain, delete: () => chain,
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fakeDb),
    execute: () => Promise.resolve([]),
  };
  return { ...actual, db: fakeDb };
});

vi.mock("../../lib/workers", () => ({
  queues: {
    countryImport: { add: vi.fn() }, cityImport: { add: vi.fn() }, sightDiscovery: { add: vi.fn() },
    sightEnrichment: { add: vi.fn() }, tourAi: { add: vi.fn() }, hotelPrice: { add: vi.fn() },
    flightPrice: { add: vi.fn() },
  },
  startWorkers: vi.fn(),
}));
vi.mock("ioredis", () => ({ default: function () { return { on: vi.fn(), quit: vi.fn() }; } }));

// Keep the fire-and-forget translation/enrichment hooks inert + deterministic.
vi.mock("../../lib/tour-translation", () => ({
  autoFillTourTranslations: async () => {},
  maybeAutoTranslateTourInBackground: () => {},
}));
vi.mock("../../lib/entity-translation", () => ({
  maybeAutoTranslateEntitiesInBackground: () => {},
}));
vi.mock("../../lib/pricing", () => ({
  pricingService: {
    calculateTourPrice: async () => ({
      currency: "USD",
      totalPrice: 1000,
      perPersonBase: 1000,
      baseCost: 400,
      markupAmount: 600,
      margin: 60,
      netProfit: 600,
      breakdown: [],
    }),
  },
}));

import { registerRoutes } from "../../routes/routes";

describe("OWASP A01 — Broken Access Control", () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
  });

  beforeEach(() => {
    mockState.session.current = { userId: "user-1" }; // authenticated customer
    mockState.created = [];
    mockState.updated = [];
    mockState.deleted = [];
  });

  // ---------------------------------------------------------------------------
  // CONTROL TESTS — prove the harness + middleware actually enforce roles.
  // These MUST pass; if they fail, the it.fails cases below are meaningless.
  // ---------------------------------------------------------------------------
  describe("control: existing role middleware works", () => {
    it("anonymous request to a role-gated admin route is rejected with 401", async () => {
      mockState.session.current = {};
      const res = await request(app).get("/api/admin/analytics");
      expect(res.status).toBe(401);
    });

    it("customer request to a role-gated admin route is rejected with 403", async () => {
      const res = await request(app).get("/api/admin/analytics");
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // A01(a) — GET /api/tour-days/:dayId/items is completely unauthenticated.
  // ---------------------------------------------------------------------------
  describe("A01: unauthenticated tour-day item read (catalogRoutes.ts:130)", () => {
    it("anonymous caller must not read tour-day items (expect 401)", async () => {
      mockState.session.current = {}; // anonymous
      const res = await request(app).get("/api/tour-days/day-1/items");
      expect(res.status).toBe(401);
    });
  });

  // ---------------------------------------------------------------------------
  // A01(b) — tour-day item mutations require only authentication.
  // ---------------------------------------------------------------------------
  describe("A01: authenticated customer can mutate itinerary items (catalogRoutes.ts:139-157)", () => {
    it("customer POST /api/tour-days/:dayId/items must be forbidden (expect 403, no write)", async () => {
      const res = await request(app)
        .post("/api/tour-days/day-1/items")
        .send({ title: "Injected stop", startTime: "09:00" });
      expect(res.status).toBe(403);
      expect(mockState.created.length).toBe(0);
    });

    it("customer PATCH /api/tour-day-items/:id must be forbidden (expect 403, no write)", async () => {
      const res = await request(app)
        .patch("/api/tour-day-items/item-1")
        .send({ title: "Tampered" });
      expect(res.status).toBe(403);
      expect(mockState.updated.length).toBe(0);
    });

    it("customer DELETE /api/tour-day-items/:id must be forbidden (expect 403, no delete)", async () => {
      const res = await request(app).delete("/api/tour-day-items/item-1");
      expect(res.status).toBe(403);
      expect(mockState.deleted.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // A01(c) — internal price breakdown is authentication-only.
  // ---------------------------------------------------------------------------
  describe("A01: price breakdown exposes internal cost/margin (adminMiscRoutes.ts:267)", () => {
    it("customer GET /api/tours/:id/price-breakdown must be forbidden (expect 403)", async () => {
      const res = await request(app).get("/api/tours/tour-1/price-breakdown");
      expect(res.status).toBe(403);
    });
  });

  // ---------------------------------------------------------------------------
  // A01(d) — public tour reads spread the full row (internal columns leak).
  // ---------------------------------------------------------------------------
  describe("A01: public tour endpoints leak internal columns (toursRoutes.ts:67,258)", () => {
    const INTERNAL_KEYS = ["markupAmount", "internalNotes"];

    it("anonymous GET /api/tours/:id must not expose markupAmount/internalNotes", async () => {
      mockState.session.current = {};
      const res = await request(app).get("/api/tours/tour-1");
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      for (const k of INTERNAL_KEYS) expect(body).not.toContain(k);
    });

    it("anonymous GET /api/tours/public must not expose markupAmount/internalNotes", async () => {
      mockState.session.current = {};
      const res = await request(app).get("/api/tours/public");
      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      for (const k of INTERNAL_KEYS) expect(body).not.toContain(k);
    });
  });
});
