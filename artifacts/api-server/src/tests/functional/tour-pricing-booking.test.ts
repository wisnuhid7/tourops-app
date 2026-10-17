/**
 * Regression tests for server-authoritative tour pricing (Task #49).
 *
 * Covers:
 * 1. publicTourPricing: cheapest same-currency room is selected; rooms priced
 *    in a foreign currency are excluded entirely.
 * 2. roomsNeeded = Math.ceil(partySize / occupancy) – verified for doble
 *    (occupancy 2) and triple (occupancy 3) with odd party sizes.
 * 3. A customer's client-supplied totalPrice is ALWAYS ignored; the server
 *    recomputes it from perPersonPrice × partySize.
 * 4. A staff member's explicit totalPrice IS honoured when there is no
 *    departure or tour to derive a price from.
 * 5. 400 is returned when departureId doesn't belong to the given tourId
 *    (including the case where the departure doesn't exist at all).
 * 6. The booked total equals perPersonBase × partySize + accommodationCost
 *    when the party fills rooms exactly (no rounding artefact from a
 *    per-person split).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// Hoisted mutable state – shared between vi.mock factories and individual tests.
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  session: { current: {} as { userId?: string } },
  profiles: [] as Array<{ id: string; userId: string; role: string; isActive?: boolean }>,
  departures: new Map<string, { id: string; tourId: string; pricePerPerson: string | null }>(),
  tourPricing: { totalPrice: 1000, currency: "USD" } as { totalPrice: number; currency: string },
  accByRoomType: new Map<
    string,
    { total: string; currency: string; nights: number; breakdown: any[]; warnings: string[] }
  >(),
  createdBooking: null as any,
  tours: [] as any[],
  offersRoomTypes: false,
}));

// ---------------------------------------------------------------------------
// Mock: @workspace/db – prevent real DB connections.
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async (importOriginal) => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
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
    for: () => chain,
    onConflictDoNothing: () => chain,
    returning: () => Promise.resolve([]),
    then: (resolve: (rows: any[]) => void) => resolve([]),
  };
  const fakeDb: any = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fakeDb),
  };
  return {
    ...actual,
    db: fakeDb,
  };
});

// ---------------------------------------------------------------------------
// Mock: auth – inject session without a real pg-backed session store.
// ---------------------------------------------------------------------------
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => {
    app.use((req: any, _res: any, next: any) => {
      req.session = state.session.current;
      next();
    });
  },
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
  registerAuthRoutes: () => {},
}));

// ---------------------------------------------------------------------------
// Mock: workers – avoid Redis/BullMQ connections.
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
// Mock: email / emailQueue – avoid SMTP connections during tests.
// ---------------------------------------------------------------------------
vi.mock("../../lib/email", () => ({
  sendNewBookingNotification: vi.fn(),
  sendEmail: vi.fn(),
  initEmailSystem: vi.fn(),
}));
vi.mock("../../lib/emailQueue", () => ({
  getQueueStats: vi.fn().mockResolvedValue({}),
  addEmailJob: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: tour-translation – avoid AI calls in fire-and-forget translate helper.
// ---------------------------------------------------------------------------
vi.mock("../../lib/tour-translation", () => ({
  autoFillTourTranslations: vi.fn().mockResolvedValue(undefined),
  maybeAutoTranslateTourInBackground: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: storage – fully controlled per-test via `state`.
// ---------------------------------------------------------------------------
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: async (userId: string) =>
      state.profiles.find((p) => p.userId === userId) ??
      { id: userId, userId, role: "customer", isActive: true },
    getProfileByUserId: async (userId: string) =>
      state.profiles.find((p) => p.userId === userId),
    getProfileByUserIdWithEmail: async (userId: string) =>
      state.profiles.find((p) => p.userId === userId) ?? null,
    getAllProfiles: async () => state.profiles,
    getDeparture: async (id: string) => state.departures.get(id) ?? undefined,
    getPublishedTours: async () => state.tours.filter((t) => t.isPublished),
    getTour: async (id: string) => state.tours.find((t) => t.id === id),
    getAffiliateByCode: async () => undefined,
    createBooking: async (data: any) => {
      const booking = { id: "booking-1", ...data };
      state.createdBooking = booking;
      return booking;
    },
    getAllCountries: async () => [],
    updateProfile: async () => ({}),
  },
}));

// ---------------------------------------------------------------------------
// Mock: pricingService – return controlled per-test values.
// ---------------------------------------------------------------------------
vi.mock("../../lib/pricing", () => ({
  pricingService: {
    calculateTourPrice: async (_tourId: string) => state.tourPricing,
  },
}));

// ---------------------------------------------------------------------------
// Mock: rate-resolver – control accommodationForTour and tourOffersRoomTypes.
// The real constants (BOOKING_ROOM_TYPES) are preserved via importOriginal.
// ---------------------------------------------------------------------------
vi.mock("../../services/rate-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/rate-resolver")>();
  return {
    ...actual,
    accommodationForTour: async (_db: any, _tourId: string, roomType: string) =>
      state.accByRoomType.get(roomType) ?? {
        total: "0",
        currency: "USD",
        nights: 0,
        breakdown: [],
        warnings: [],
      },
    tourOffersRoomTypes: async () => state.offersRoomTypes,
  };
});

// Import routes AFTER all mocks are registered.
import { registerRoutes } from "../../routes/routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal booking body; overrides are merged in. */
const booking = (overrides: Record<string, unknown> = {}) => ({
  bookingType: "private_family",
  partySizeExpected: 1,
  ...overrides,
});

function resetState() {
  state.session.current = {};
  state.profiles.length = 0;
  state.departures.clear();
  state.tours = [];
  state.createdBooking = null;
  state.accByRoomType.clear();
  state.offersRoomTypes = false;
  state.tourPricing = { totalPrice: 1000, currency: "USD" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("server-authoritative tour pricing", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      if (!req.headers["idempotency-key"]) {
        req.headers["idempotency-key"] = crypto.randomUUID();
      }
      next();
    });
    const server = createServer(app);
    await registerRoutes(server, app);
  });

  // =========================================================================
  // 1. publicTourPricing: cheapest same-currency room; foreign currency skipped
  // =========================================================================
  describe("publicTourPricing: cheapest same-currency room selection", () => {
    beforeEach(() => {
      state.tours = [{ id: "tour-1", isPublished: true, title: "Test Tour", countries: [] }];
      state.tourPricing = { totalPrice: 1000, currency: "USD" };

      // matrimonial 300 USD  → 300/2 = 150/person
      // doble        200 USD  → 200/2 = 100/person  ← cheapest in USD
      // triple       150 EUR  → skip (foreign currency)
      state.accByRoomType.set("matrimonial", { total: "300", currency: "USD", nights: 3, breakdown: [], warnings: [] });
      state.accByRoomType.set("doble",       { total: "200", currency: "USD", nights: 3, breakdown: [], warnings: [] });
      state.accByRoomType.set("triple",      { total: "150", currency: "EUR", nights: 3, breakdown: [], warnings: [] });
    });

    it("picks the cheapest USD room (doble) and ignores the EUR room (triple)", async () => {
      state.profiles.push({ id: "p-admin", userId: "staff-1", role: "admin" });
      state.session.current = { userId: "staff-1" };

      const res = await request(app).get("/api/tours/tour-1");

      expect(res.status).toBe(200);
      // doble: 200/2 = 100 — cheaper than matrimonial (150)
      expect(res.body.publicPricing.accommodationFrom).toBe(100);
      expect(res.body.publicPricing.perPersonFrom).toBe(1100); // 1000 + 100
      expect(res.body.publicPricing.currency).toBe("USD");
    });

    it("uses matrimonial when doble is foreign currency", async () => {
      state.profiles.push({ id: "p-admin", userId: "staff-1", role: "admin" });
      state.session.current = { userId: "staff-1" };

      // Override: doble is now EUR; only matrimonial is USD
      state.accByRoomType.set("doble", { total: "200", currency: "EUR", nights: 3, breakdown: [], warnings: [] });

      const res = await request(app).get("/api/tours/tour-1");

      expect(res.status).toBe(200);
      expect(res.body.publicPricing.accommodationFrom).toBe(150); // 300/2
      expect(res.body.publicPricing.perPersonFrom).toBe(1150);
    });

    it("returns zero accommodationFrom when ALL rooms are foreign currency", async () => {
      state.profiles.push({ id: "p-admin", userId: "staff-1", role: "admin" });
      state.session.current = { userId: "staff-1" };

      state.accByRoomType.set("matrimonial", { total: "300", currency: "EUR", nights: 3, breakdown: [], warnings: [] });
      state.accByRoomType.set("doble",       { total: "200", currency: "EUR", nights: 3, breakdown: [], warnings: [] });
      // triple already EUR from beforeEach

      const res = await request(app).get("/api/tours/tour-1");

      expect(res.status).toBe(200);
      expect(res.body.publicPricing.accommodationFrom).toBe(0);
      expect(res.body.publicPricing.perPersonFrom).toBe(1000);
    });
  });

  // =========================================================================
  // 2. roomsNeeded = Math.ceil(partySize / occupancy)
  // =========================================================================
  describe("booking creation: rooms needed = ceil(partySize / occupancy)", () => {
    beforeEach(() => {
      state.profiles.push({ id: "p-cust", userId: "cust-1", role: "customer" });
      state.session.current = { userId: "cust-1" };
      state.tours = [{ id: "tour-2", isPublished: true, title: "T2", currency: "USD", basePrice: "500" }];
      state.tourPricing = { totalPrice: 500, currency: "USD" };
      state.offersRoomTypes = true;
    });

    it("3 pax in doble (occupancy 2) → ceil(3/2)=2 rooms → accommodationCost = 2×100 = 200", async () => {
      // doble: 100 total per room
      state.accByRoomType.set("doble", { total: "100", currency: "USD", nights: 1, breakdown: [], warnings: [] });

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-2", roomType: "doble", partySizeExpected: 3 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.accommodationCost).toBe("200.00");
    });

    it("4 pax in triple (occupancy 3) → ceil(4/3)=2 rooms → accommodationCost = 2×100 = 200", async () => {
      state.accByRoomType.set("triple", { total: "100", currency: "USD", nights: 1, breakdown: [], warnings: [] });

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-2", roomType: "triple", partySizeExpected: 4 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.accommodationCost).toBe("200.00");
    });

    it("1 pax in doble → Math.max(1, ceil(1/2))=1 room minimum", async () => {
      state.accByRoomType.set("doble", { total: "100", currency: "USD", nights: 1, breakdown: [], warnings: [] });

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-2", roomType: "doble", partySizeExpected: 1 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.accommodationCost).toBe("100.00"); // 1 room minimum
    });

    it("6 pax in triple (occupancy 3) → ceil(6/3)=2 rooms exactly", async () => {
      state.accByRoomType.set("triple", { total: "150", currency: "USD", nights: 1, breakdown: [], warnings: [] });

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-2", roomType: "triple", partySizeExpected: 6 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.accommodationCost).toBe("300.00"); // 2 rooms × 150
    });
  });

  // =========================================================================
  // 3. Customer totalPrice is IGNORED – server computes from perPerson × party
  // =========================================================================
  describe("booking creation: customer-supplied totalPrice is ignored", () => {
    beforeEach(() => {
      state.profiles.push({ id: "p-cust", userId: "cust-1", role: "customer" });
      state.session.current = { userId: "cust-1" };
      state.tours = [{ id: "tour-3", isPublished: true, title: "T3", currency: "USD", basePrice: "500" }];
      state.tourPricing = { totalPrice: 500, currency: "USD" };
      state.offersRoomTypes = false;
    });

    it("server computes 500×2=1000; tampered client value 99999 is discarded", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-3", partySizeExpected: 2, totalPrice: 99999 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.totalPrice).toBe(1000); // 500 × 2
      expect(state.createdBooking.totalPrice).not.toBe(99999);
    });

    it("even a zero client totalPrice is ignored; server still derives the correct amount", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-3", partySizeExpected: 3, totalPrice: 0 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.totalPrice).toBe(1500); // 500 × 3
    });
  });

  // =========================================================================
  // 4. Staff totalPrice IS honoured when no tour is specified
  // =========================================================================
  describe("booking creation: staff totalPrice override", () => {
    beforeEach(() => {
      state.profiles.push({ id: "p-admin", userId: "admin-1", role: "admin" });
      state.session.current = { userId: "admin-1" };
    });

    it("staff-supplied totalPrice passes through when no tourId is given", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ totalPrice: 1500, customerId: "cust-99", partySizeExpected: 2 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.totalPrice).toBe(1500);
    });

    it("staff-supplied totalPrice is still overridden when a tourId is given (per-person takes precedence)", async () => {
      state.tours = [{ id: "tour-5", isPublished: true, title: "T5", currency: "USD", basePrice: "600" }];
      state.tourPricing = { totalPrice: 600, currency: "USD" };
      state.offersRoomTypes = false;

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-5", totalPrice: 9999, customerId: "cust-99", partySizeExpected: 2 }));

      expect(res.status).toBe(200);
      // perPersonPrice=600 wins; 600×2=1200 not the staff-supplied 9999
      expect(state.createdBooking.totalPrice).toBe(1200);
      expect(state.createdBooking.totalPrice).not.toBe(9999);
    });
  });

  // =========================================================================
  // 5. 400 when departureId doesn't belong to the given tourId
  // =========================================================================
  describe("booking creation: departure ownership guard", () => {
    beforeEach(() => {
      state.profiles.push({ id: "p-cust", userId: "cust-1", role: "customer" });
      state.session.current = { userId: "cust-1" };
      // dep-wrong belongs to a DIFFERENT tour
      state.departures.set("dep-wrong", {
        id: "dep-wrong",
        tourId: "tour-OTHER",
        pricePerPerson: "400",
      });
    });

    it("returns 400 with descriptive message when departure belongs to a different tour", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-3", departureId: "dep-wrong", partySizeExpected: 1 }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/departure does not belong/i);
    });

    it("returns 400 when departureId is not found at all", async () => {
      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-3", departureId: "dep-nonexistent", partySizeExpected: 1 }));

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/departure does not belong/i);
    });

    it("succeeds when departure does belong to the given tourId", async () => {
      state.profiles[0] = { id: "p-cust", userId: "cust-1", role: "customer" };
      state.tours = [{ id: "tour-3", isPublished: true, title: "T3", currency: "USD", basePrice: "400" }];
      state.tourPricing = { totalPrice: 400, currency: "USD" };
      state.offersRoomTypes = false;
      state.departures.set("dep-right", {
        id: "dep-right",
        tourId: "tour-3",
        pricePerPerson: "400",
      });

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-3", departureId: "dep-right", partySizeExpected: 2 }));

      expect(res.status).toBe(200);
      // departure price per person = 400; 400 × 2 = 800
      expect(state.createdBooking.totalPrice).toBe(800);
    });
  });

  // =========================================================================
  // 6. Display price = booked total when party fills rooms exactly
  // =========================================================================
  describe("booking creation: exact room fill – no rounding artefacts", () => {
    beforeEach(() => {
      state.profiles.push({ id: "p-cust", userId: "cust-1", role: "customer" });
      state.session.current = { userId: "cust-1" };
      state.tours = [{ id: "tour-4", isPublished: true, title: "T4", currency: "USD", basePrice: "600" }];
      state.tourPricing = { totalPrice: 600, currency: "USD" };
      state.offersRoomTypes = true;
    });

    it("2 pax in matrimonial (occupancy 2): totalPrice = 600×2 + ceil(2/2)×300 = 1500", async () => {
      state.accByRoomType.set("matrimonial", { total: "300", currency: "USD", nights: 3, breakdown: [], warnings: [] });

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-4", roomType: "matrimonial", partySizeExpected: 2 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.accommodationCost).toBe("300.00"); // 1 room × 300
      expect(state.createdBooking.totalPrice).toBe(1500);           // 1200 + 300
    });

    it("6 pax in doble (occupancy 2): totalPrice = 600×6 + ceil(6/2)×200 = 4200", async () => {
      state.accByRoomType.set("doble", { total: "200", currency: "USD", nights: 2, breakdown: [], warnings: [] });

      const res = await request(app)
        .post("/api/bookings")
        .send(booking({ tourId: "tour-4", roomType: "doble", partySizeExpected: 6 }));

      expect(res.status).toBe(200);
      expect(state.createdBooking.accommodationCost).toBe("600.00"); // 3 rooms × 200
      expect(state.createdBooking.totalPrice).toBe(4200);            // 3600 + 600
    });

    it("publicPricing: perPersonFrom = perPersonBase + cheapest-room/occupancy (no drift)", async () => {
      // Only matrimonial offered; per person = 300/2 = 150
      state.accByRoomType.set("matrimonial", { total: "300", currency: "USD", nights: 3, breakdown: [], warnings: [] });
      state.accByRoomType.set("doble",  { total: "0", currency: "USD", nights: 0, breakdown: [], warnings: [] });
      state.accByRoomType.set("triple", { total: "0", currency: "USD", nights: 0, breakdown: [], warnings: [] });

      state.profiles.push({ id: "p-staff", userId: "staff-1", role: "admin" });
      state.session.current = { userId: "staff-1" };

      const res = await request(app).get("/api/tours/tour-4");

      expect(res.status).toBe(200);
      expect(res.body.publicPricing.accommodationFrom).toBe(150);  // 300/2
      expect(res.body.publicPricing.perPersonFrom).toBe(750);      // 600 + 150
    });
  });
});
