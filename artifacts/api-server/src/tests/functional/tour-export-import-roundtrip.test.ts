/**
 * Round-trip tests for GET /api/tours/export → POST /api/tours/import.
 *
 * Covers:
 * 1–5. Days/items: structural fidelity, catalog-ID resolution, decimal costs,
 *      JS-number cost coercion, blank catalog references.
 * 6.   Departure round-trip: departures (startDate, endDate, capacity,
 *      allowPublicJoin, pricePerPerson) survive export → import with no
 *      duplicates, correct field mapping.
 * 7.   endDate < startDate is rejected by the import path.
 * 8.   endDate < startDate is rejected by POST /api/departures (create).
 * 9.   endDate < startDate is rejected by PATCH /api/departures/:id (update),
 *      including partial-update cases where only one date field changes.
 * 10.  Unknown hotel name is rejected with a useful error.
 * 11–12. Role guards on export and import.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// Hoisted mutable state shared between vi.mock factories and individual tests.
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  session: { current: {} as { userId?: string } },
  profiles: [] as Array<{ id: string; userId: string; role: string }>,

  // Catalog
  hotels: [] as Array<{ id: string; name: string; basePrice?: string | null }>,
  sights: [] as Array<{ id: string; name: string; ticketPrice?: string | null }>,
  guides: [] as Array<{ id: string; guideName: string; price?: string | null; currency?: string | null }>,

  // Tour data
  tours: [] as any[],
  daysByTourId: new Map<string, any[]>(),
  itemsByTourId: new Map<string, any[]>(),
  departuresByTourId: new Map<string, any[]>(),
  departuresById: new Map<string, any>(),

  // Captures what the importer / departure routes create/update
  createdTours: [] as any[],
  createdDays: [] as any[],
  createdItems: [] as any[],
  createdDepartures: [] as any[],
  updatedDepartures: [] as Array<{ id: string; data: any }>,
}));

// ---------------------------------------------------------------------------
// Mock: @workspace/db — keep real Zod schemas (insertTourDayItemSchema etc.)
// but replace `db` with a fake that never opens a Postgres connection.
//
// Why importOriginal + dummy DATABASE_URL:
//   lib/db/src/index.ts throws at module-eval time if DATABASE_URL is absent.
//   Setting a dummy URL lets the module evaluate (pg.Pool stores the string
//   without connecting; drizzle() wraps it without connecting), then we
//   override `db` with the fake chain so no real queries ever run.
//   The Zod insert-schemas (insertTourSchema, insertTourDayItemSchema, …) are
//   pure drizzle-zod objects that don't touch the network — keeping them real
//   means the import route's .safeParse() / .omit() calls work correctly.
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async (importOriginal) => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
  const actual = await importOriginal<typeof import("@workspace/db")>();

  // Fake db: chainable stub that always resolves to [] without hitting Postgres.
  const chain: any = {
    from: () => chain,
    where: () => chain,
    leftJoin: () => chain,
    limit: () => chain,
    orderBy: () => chain,
    values: () => chain,
    set: () => chain,
    onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain,
    returning: () => Promise.resolve([]),
    then: (resolve: (rows: any[]) => void) => resolve([]),
  };
  const fakeDb: any = {
    select: () => chain,
    insert: () => chain,
    update: () => chain,
    delete: () => chain,
  };

  return { ...actual, db: fakeDb };
});

// ---------------------------------------------------------------------------
// Mock: auth — inject session without a real pg-backed session store.
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
// Mock: workers — avoid Redis/BullMQ connections.
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
// Mock: email / emailQueue
// ---------------------------------------------------------------------------
vi.mock("../../lib/email", () => ({
  sendNewBookingNotification: vi.fn(),
  sendBookingConfirmedNotification: vi.fn(),
  sendAssignmentNotification: vi.fn(),
  sendDocumentStatusNotification: vi.fn(),
  sendPaymentStatusNotification: vi.fn(),
  sendEmail: vi.fn(),
  initEmailSystem: vi.fn(),
}));
vi.mock("../../lib/emailQueue", () => ({
  getQueueStats: vi.fn().mockResolvedValue({}),
  addEmailJob: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: tour-translation / entity-translation
// ---------------------------------------------------------------------------
vi.mock("../../lib/tour-translation", () => ({
  autoFillTourTranslations: vi.fn().mockResolvedValue(undefined),
  maybeAutoTranslateTourInBackground: vi.fn(),
}));
vi.mock("../../lib/entity-translation", () => ({
  maybeAutoTranslateEntitiesInBackground: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: other services that open external connections at import time
// ---------------------------------------------------------------------------
vi.mock("../../lib/pricing", () => ({
  pricingService: { calculateTourPrice: vi.fn().mockResolvedValue({ totalPrice: 0, currency: "USD" }) },
}));
vi.mock("../../lib/pdf", () => ({ pdfService: {} }));
vi.mock("../../lib/scrapers", () => ({ scraperService: {} }));
vi.mock("../../lib/airline", () => ({ airlineService: {} }));
vi.mock("../../lib/hotel", () => ({ hotelService: {} }));
vi.mock("../../lib/ai", () => ({ aiService: {} }));
vi.mock("../../lib/images", () => ({ imageService: {} }));
vi.mock("../../lib/messaging", () => ({ sendWhatsApp: vi.fn(), sendSMS: vi.fn(), MESSAGE_TEMPLATES: {} }));
vi.mock("../../lib/scraperSafety", () => ({ scraperSafety: { isAllowed: vi.fn().mockResolvedValue(true) } }));
vi.mock("../../services/rate-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/rate-resolver")>();
  return {
    ...actual,
    accommodationForTour: vi.fn().mockResolvedValue({ total: "0", currency: "USD", nights: 0, breakdown: [], warnings: [] }),
    tourOffersRoomTypes: vi.fn().mockResolvedValue(false),
    resolveTourComponents: vi.fn().mockResolvedValue([]),
  };
});

// ---------------------------------------------------------------------------
// Mock: storage — fully controlled via `state`.
// ---------------------------------------------------------------------------
let importIdSeq = 0;
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: async (userId: string) =>
      state.profiles.find((p) => p.userId === userId) ??
      (() => { throw Object.assign(new Error("Unprovisioned"), { statusCode: 403 }); })(),

    // Tour catalog reads
    getAllTours: async () => state.tours,
    getTour: async (id: string) => state.tours.find((t) => t.id === id),
    getTourDays: async (tourId: string) => state.daysByTourId.get(tourId) ?? [],
    getTourDayItemsByTourId: async (tourId: string) => state.itemsByTourId.get(tourId) ?? [],
    getDeparturesByTour: async (tourId: string) => state.departuresByTourId.get(tourId) ?? [],

    // Departure CRUD (used by POST/PATCH/DELETE /api/departures)
    getAllDepartures: async () => [...state.departuresById.values()],
    getDeparture: async (id: string) => state.departuresById.get(id) ?? undefined,
    createDeparture: async (data: any) => {
      const dep = { id: `dep-${++importIdSeq}`, ...data };
      state.createdDepartures.push(dep);
      state.departuresById.set(dep.id, dep);
      return dep;
    },
    updateDeparture: async (id: string, data: any) => {
      state.updatedDepartures.push({ id, data });
      const existing = state.departuresById.get(id) ?? {};
      const updated = { ...existing, ...data };
      state.departuresById.set(id, updated);
      return updated;
    },
    deleteDeparture: async (id: string) => { state.departuresById.delete(id); },
    getBookingsByDeparture: async () => [],

    // Catalog lookups
    getAllHotels: async () => state.hotels,
    getAllSights: async () => state.sights,
    getGuideRates: async () => state.guides,

    // Import creates
    createTour: async (data: any) => {
      const tour = { id: `imported-tour-${++importIdSeq}`, ...data };
      state.createdTours.push(tour);
      return tour;
    },
    createTourDay: async (data: any) => {
      const day = { id: `imported-day-${++importIdSeq}`, ...data };
      state.createdDays.push(day);
      return day;
    },
    createTourDayItem: async (data: any) => {
      const item = { id: `imported-item-${++importIdSeq}`, ...data };
      state.createdItems.push(item);
      return item;
    },

    // Misc stubs required by other routes registered via registerRoutes
    getAllCountries: async () => [],
    getPublishedTours: async () => [],
    getTourAccommodationSummary: async () => [],
    getWorkflows: async () => [],
  },
}));

// Import routes AFTER all mocks are registered.
import { registerRoutes } from "../../routes/routes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetState() {
  state.session.current = {};
  state.profiles.length = 0;
  state.hotels.length = 0;
  state.sights.length = 0;
  state.guides.length = 0;
  state.tours.length = 0;
  state.daysByTourId.clear();
  state.itemsByTourId.clear();
  state.departuresByTourId.clear();
  state.departuresById.clear();
  state.createdTours.length = 0;
  state.createdDays.length = 0;
  state.createdItems.length = 0;
  state.createdDepartures.length = 0;
  state.updatedDepartures.length = 0;
}

function loginAs(role: string, userId = "staff-1") {
  state.profiles.push({ id: `profile-${userId}`, userId, role });
  state.session.current = { userId };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GET /api/tours/export → POST /api/tours/import round-trip", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);
  });

  // =========================================================================
  // Seed helpers — build a realistic tour in state
  // =========================================================================

  function seedCatalog() {
    state.hotels.push({ id: "hotel-1", name: "Grand Jerusalem Hotel", basePrice: "150" });
    state.sights.push({ id: "sight-1", name: "Western Wall Entrance", ticketPrice: "25" });
    state.guides.push({ id: "guide-1", guideName: "Licensed Local Guide", price: "200", currency: "USD" });
  }

  function seedTour(withDepartures = false) {
    const tourId = "tour-seed-1";
    state.tours.push({
      id: tourId,
      title: "Israel Highlights – 3 Days",
      description: "A 3-day tour of Israel.",
      category: "cultural",
      countries: ["Israel"],
      tags: ["faith", "history"],
      highlights: "Jerusalem, Dead Sea",
      inclusions: "Hotels; Guide",
      exclusions: "Flights",
      imageUrl: "",
      basePrice: "0",
      childPrice: null,
      singleSupplement: null,
      duration: 3,
      isPublished: false,
    });

    state.daysByTourId.set(tourId, [
      { id: "day-1", tourId, dayNumber: 1, title: "Arrival in Tel Aviv", countryCode: "IL", city: "Tel Aviv", description: "Welcome day.", activities: "Transfer", imageUrl: "" },
      { id: "day-2", tourId, dayNumber: 2, title: "Jerusalem Old City", countryCode: "IL", city: "Jerusalem", description: "Full day.", activities: "Walking tour", imageUrl: "" },
      { id: "day-3", tourId, dayNumber: 3, title: "Departure", countryCode: "IL", city: "Tel Aviv", description: "Departure day.", activities: "", imageUrl: "" },
    ]);

    state.itemsByTourId.set(tourId, [
      // Day 1 — hotel (resolved by ID), transport (no catalog refs → blank names in export)
      { id: "item-1", tourDayId: "day-1", itemType: "hotel",     title: "Overnight in Tel Aviv", cost: "150",   currency: "USD", isOptional: false, bookingRequired: false, hotelId: "hotel-1", sightId: null, guideId: null, sortOrder: 0, startTime: null, endTime: null, description: "Hotel night" },
      { id: "item-2", tourDayId: "day-1", itemType: "transport", title: "Airport Transfer",       cost: "60.50", currency: "USD", isOptional: false, bookingRequired: false, hotelId: null,      sightId: null, guideId: null, sortOrder: 1, startTime: "14:00", endTime: "15:00", description: "Private van" },
      // Day 2 — sight + guide resolved by ID
      { id: "item-3", tourDayId: "day-2", itemType: "sight",  title: "Western Wall Entrance", cost: "25",  currency: "USD", isOptional: false, bookingRequired: false, hotelId: null, sightId: "sight-1", guideId: null,     sortOrder: 0, startTime: "09:00", endTime: null,    description: "" },
      { id: "item-4", tourDayId: "day-2", itemType: "guide",  title: "Licensed guide",        cost: "200", currency: "USD", isOptional: false, bookingRequired: false, hotelId: null, sightId: null,      guideId: "guide-1", sortOrder: 1, startTime: "09:00", endTime: "17:00", description: "" },
      // Day 3 — custom with no catalog references
      { id: "item-5", tourDayId: "day-3", itemType: "custom", title: "Free afternoon", cost: "0", currency: "USD", isOptional: true, bookingRequired: false, hotelId: null, sightId: null, guideId: null, sortOrder: 0, startTime: null, endTime: null, description: "Leisure time" },
    ]);

    if (withDepartures) {
      state.departuresByTourId.set(tourId, [
        { id: "dep-seed-1", tourId, startDate: "2025-06-01", endDate: "2025-06-08", capacityTotal: 18, publicJoinEnabled: true,  pricePerPerson: 1200, bookingCutoffDate: "2025-05-25", notes: "Summer departure" },
        { id: "dep-seed-2", tourId, startDate: "2025-09-01", endDate: "2025-09-08", capacityTotal: 20, publicJoinEnabled: false, pricePerPerson: null, bookingCutoffDate: null,         notes: null },
      ]);
    } else {
      state.departuresByTourId.set(tourId, []);
    }

    return tourId;
  }

  // =========================================================================
  // 1. Happy-path round-trip (days + items)
  // =========================================================================
  it("re-imports an exported tour with the same day and item counts, no duplicates", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour();

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    expect(exportRes.body.tours).toHaveLength(1);
    const exported = exportRes.body.tours[0];
    expect(exported.days).toHaveLength(3);
    expect(exported.days[0].items).toHaveLength(2);
    expect(exported.days[1].items).toHaveLength(2);
    expect(exported.days[2].items).toHaveLength(1);

    const hotelItem = exported.days[0].items.find((it: any) => it.itemType === "hotel");
    expect(hotelItem?.hotelName).toBe("Grand Jerusalem Hotel");
    const sightItem = exported.days[1].items.find((it: any) => it.itemType === "sight");
    expect(sightItem?.sightName).toBe("Western Wall Entrance");
    const guideItem = exported.days[1].items.find((it: any) => it.itemType === "guide");
    expect(guideItem?.guideName).toBe("Licensed Local Guide");

    const transportItem = exported.days[0].items.find((it: any) => it.itemType === "transport");
    expect(transportItem?.hotelName).toBe("");
    expect(transportItem?.sightName).toBe("");

    const importRes = await request(app)
      .post("/api/tours/import")
      .send({ tours: exportRes.body.tours })
      .expect(200);

    expect(importRes.body.created).toBe(1);
    expect(importRes.body.failed).toBe(0);

    expect(state.createdTours).toHaveLength(1);
    expect(state.createdDays).toHaveLength(3);
    expect(state.createdItems).toHaveLength(5);

    const dayIds = state.createdDays.map((d: any) => d.id);
    expect(new Set(dayIds).size).toBe(dayIds.length);
    const itemIds = state.createdItems.map((i: any) => i.id);
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  // =========================================================================
  // 2. Hotel / sight / guide IDs resolve correctly on re-import
  // =========================================================================
  it("resolves hotel and sight names back to catalog IDs on import", async () => {
    loginAs("admin");
    seedCatalog();
    seedTour();

    const exportRes = await request(app).get("/api/tours/export").expect(200);
    await request(app)
      .post("/api/tours/import")
      .send({ tours: exportRes.body.tours })
      .expect(200);

    const hotelItem = state.createdItems.find((i: any) => i.itemType === "hotel");
    expect(hotelItem?.hotelId).toBe("hotel-1");

    const sightItem = state.createdItems.find((i: any) => i.itemType === "sight");
    expect(sightItem?.sightId).toBe("sight-1");

    const guideItem = state.createdItems.find((i: any) => i.itemType === "guide");
    expect(guideItem?.guideId).toBe("guide-1");
  });

  // =========================================================================
  // 3. Decimal string costs survive the round-trip
  // =========================================================================
  it("imports a decimal-cost item (e.g. 60.50) without a cost-format error", async () => {
    loginAs("admin");
    seedCatalog();
    seedTour();

    const exportRes = await request(app).get("/api/tours/export").expect(200);
    const importRes = await request(app)
      .post("/api/tours/import")
      .send({ tours: exportRes.body.tours })
      .expect(200);

    expect(importRes.body.failed).toBe(0);
    const transportItem = state.createdItems.find((i: any) => i.itemType === "transport");
    expect(transportItem?.cost).toBeDefined();
    expect(String(transportItem?.cost)).toMatch(/^60\.?5?0?$/);
  });

  // =========================================================================
  // 4. JS-number costs are coerced safely (float risk)
  // =========================================================================
  it("handles cost stored as a JS number (not a string) without dropping the item", async () => {
    loginAs("admin");
    seedCatalog();

    const tourId = "tour-float-cost";
    state.tours.push({
      id: tourId, title: "Float Cost Tour", category: "cultural",
      countries: ["Jordan"], tags: [], highlights: "", inclusions: "", exclusions: "",
      imageUrl: "", basePrice: "0", duration: 1, isPublished: false,
    });
    state.daysByTourId.set(tourId, [
      { id: "day-f1", tourId, dayNumber: 1, title: "Day One", countryCode: "JO", city: "Amman", description: "", activities: "", imageUrl: "" },
    ]);
    state.itemsByTourId.set(tourId, [
      { id: "item-f1", tourDayId: "day-f1", itemType: "transport", title: "Transfer", cost: 75, currency: "USD", isOptional: false, bookingRequired: false, hotelId: null, sightId: null, guideId: null, sortOrder: 0, startTime: null, endTime: null, description: "" },
    ]);
    state.departuresByTourId.set(tourId, []);

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const importRes = await request(app)
      .post("/api/tours/import")
      .send({ tours: exportRes.body.tours })
      .expect(200);

    expect(importRes.body.failed).toBe(0);
    const transferItem = state.createdItems.find((i: any) => i.title === "Transfer");
    expect(transferItem).toBeDefined();
    expect(transferItem?.cost).toBe("75");
  });

  // =========================================================================
  // 5. Blank catalog references import without errors
  // =========================================================================
  it("imports an item with no hotel or sight reference without a catalog-lookup error", async () => {
    loginAs("admin");
    seedCatalog();
    seedTour();

    const exportRes = await request(app).get("/api/tours/export").expect(200);
    const importRes = await request(app)
      .post("/api/tours/import")
      .send({ tours: exportRes.body.tours })
      .expect(200);

    expect(importRes.body.failed).toBe(0);
    const customItem = state.createdItems.find((i: any) => i.itemType === "custom");
    expect(customItem).toBeDefined();
    expect(customItem?.hotelId).toBeUndefined();
    expect(customItem?.sightId).toBeUndefined();
  });

  // =========================================================================
  // 6. Departures round-trip
  // =========================================================================
  it("exports and re-imports departures with all fields intact, no duplicates", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour(/* withDepartures= */ true);

    // --- Export ---
    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const exported = exportRes.body.tours[0];

    // Export must include both departures sorted by startDate
    expect(exported.departures).toHaveLength(2);
    const d1 = exported.departures.find((d: any) => d.startDate === "2025-06-01");
    expect(d1).toBeDefined();
    expect(d1.endDate).toBe("2025-06-08");
    expect(d1.capacity).toBe(18);
    expect(d1.allowPublicJoin).toBe(true);
    expect(d1.pricePerPerson).toBe(1200);

    const d2 = exported.departures.find((d: any) => d.startDate === "2025-09-01");
    expect(d2).toBeDefined();
    expect(d2.capacity).toBe(20);
    expect(d2.allowPublicJoin).toBe(false);
    // pricePerPerson was null — must be omitted/undefined so import doesn't set it
    expect(d2.pricePerPerson == null).toBe(true);

    // --- Import ---
    const importRes = await request(app)
      .post("/api/tours/import")
      .send({ tours: exportRes.body.tours })
      .expect(200);

    expect(importRes.body.created).toBe(1);
    expect(importRes.body.failed).toBe(0);
    expect(importRes.body.results[0].departures).toBe(2);

    // Both departures created, no duplicates
    expect(state.createdDepartures).toHaveLength(2);
    const depIds = state.createdDepartures.map((d: any) => d.id);
    expect(new Set(depIds).size).toBe(2);

    // Field fidelity
    const imp1 = state.createdDepartures.find((d: any) => d.startDate === "2025-06-01");
    expect(imp1?.endDate).toBe("2025-06-08");
    expect(imp1?.capacityTotal).toBe(18);
    expect(imp1?.publicJoinEnabled).toBe(true);
    expect(imp1?.pricePerPerson).toBe(1200);

    const imp2 = state.createdDepartures.find((d: any) => d.startDate === "2025-09-01");
    expect(imp2?.capacityTotal).toBe(20);
    expect(imp2?.publicJoinEnabled).toBe(false);
  });

  // =========================================================================
  // 7. endDate < startDate is rejected by the import path
  // =========================================================================
  it("rejects import when a departure has endDate earlier than startDate", async () => {
    loginAs("admin");

    const payload = {
      tours: [{
        ref: "T1",
        title: "Bad Dates Tour",
        category: "cultural",
        countries: ["IL"],
        tags: [],
        basePrice: "0",
        duration: 1,
        days: [{ dayNumber: 1, title: "Day 1", items: [] }],
        departures: [{ startDate: "2025-06-10", endDate: "2025-06-05" }],
      }],
    };

    const importRes = await request(app)
      .post("/api/tours/import")
      .send(payload)
      .expect(200);

    expect(importRes.body.created).toBe(0);
    expect(importRes.body.failed).toBe(1);
    expect(importRes.body.results[0].error).toMatch(/endDate.*earlier than startDate|startDate.*endDate/i);
    // No tour or departure should have been persisted
    expect(state.createdTours).toHaveLength(0);
    expect(state.createdDepartures).toHaveLength(0);
  });

  // =========================================================================
  // 8. POST /api/departures rejects endDate < startDate
  // =========================================================================
  it("POST /api/departures returns 400 when endDate is earlier than startDate", async () => {
    loginAs("admin");

    const res = await request(app)
      .post("/api/departures")
      .send({
        tourId: "any-tour",
        startDate: "2025-08-15",
        endDate: "2025-08-10",        // before startDate
        capacityTotal: 20,
      })
      .expect(400);

    expect(res.body.message).toMatch(/endDate.*earlier than startDate|startDate.*endDate/i);
    expect(state.createdDepartures).toHaveLength(0);
  });

  it("POST /api/departures accepts endDate equal to startDate (same-day departure)", async () => {
    loginAs("admin");

    const res = await request(app)
      .post("/api/departures")
      .send({
        tourId: "any-tour",
        startDate: "2025-08-15",
        endDate: "2025-08-15",        // same day — valid
        capacityTotal: 10,
      })
      .expect(200);

    expect(res.body.startDate).toBe("2025-08-15");
    expect(state.createdDepartures).toHaveLength(1);
  });

  // =========================================================================
  // 9. PATCH /api/departures/:id rejects endDate < startDate
  // =========================================================================
  it("PATCH /api/departures/:id returns 400 when new endDate is earlier than existing startDate", async () => {
    loginAs("admin");
    // Seed an existing departure in the departures-by-id map
    const depId = "dep-existing-1";
    state.departuresById.set(depId, {
      id: depId, tourId: "t1", startDate: "2025-10-01", endDate: "2025-10-08",
      capacityTotal: 20, publicJoinEnabled: true,
    });

    const res = await request(app)
      .patch(`/api/departures/${depId}`)
      .send({ endDate: "2025-09-28" })  // earlier than existing startDate 2025-10-01
      .expect(400);

    expect(res.body.message).toMatch(/endDate.*earlier than startDate|startDate.*endDate/i);
    expect(state.updatedDepartures).toHaveLength(0);
  });

  it("PATCH /api/departures/:id returns 400 when new startDate is later than existing endDate", async () => {
    loginAs("admin");
    const depId = "dep-existing-2";
    state.departuresById.set(depId, {
      id: depId, tourId: "t1", startDate: "2025-10-01", endDate: "2025-10-08",
      capacityTotal: 20, publicJoinEnabled: true,
    });

    const res = await request(app)
      .patch(`/api/departures/${depId}`)
      .send({ startDate: "2025-10-15" })  // later than existing endDate 2025-10-08
      .expect(400);

    expect(res.body.message).toMatch(/endDate.*earlier than startDate|startDate.*endDate/i);
    expect(state.updatedDepartures).toHaveLength(0);
  });

  it("PATCH /api/departures/:id accepts a valid date range update", async () => {
    loginAs("admin");
    const depId = "dep-existing-3";
    state.departuresById.set(depId, {
      id: depId, tourId: "t1", startDate: "2025-10-01", endDate: "2025-10-08",
      capacityTotal: 20, publicJoinEnabled: true,
    });

    const res = await request(app)
      .patch(`/api/departures/${depId}`)
      .send({ startDate: "2025-10-05", endDate: "2025-10-12" })  // both move forward — valid
      .expect(200);

    expect(res.body.startDate).toBe("2025-10-05");
    expect(state.updatedDepartures).toHaveLength(1);
  });

  // =========================================================================
  // 10. Unknown hotel name is rejected with a useful error
  // =========================================================================
  it("rejects import when a hotelName does not exist in the catalog", async () => {
    loginAs("admin");

    const payload = {
      tours: [{
        ref: "T1",
        title: "Bad Hotel Tour",
        category: "cultural",
        countries: ["IL"],
        tags: [],
        basePrice: "0",
        duration: 1,
        days: [{
          dayNumber: 1,
          title: "Day 1",
          items: [{
            itemType: "hotel",
            title: "Unknown Hotel",
            cost: "100",
            currency: "USD",
            isOptional: false,
            bookingRequired: false,
            hotelName: "Does Not Exist Hotel",
          }],
        }],
      }],
    };

    const importRes = await request(app)
      .post("/api/tours/import")
      .send(payload)
      .expect(200);

    expect(importRes.body.created).toBe(0);
    expect(importRes.body.failed).toBe(1);
    expect(importRes.body.results[0].error).toMatch(/hotel.*not found/i);
    expect(state.createdTours).toHaveLength(0);
  });

  // =========================================================================
  // 11–12. Role guards
  // =========================================================================
  it("returns 403 for a non-tour-builder role on export", async () => {
    loginAs("customer", "cust-1");
    state.tours.push({ id: "t1", title: "Any Tour", isPublished: true, countries: [], tags: [], duration: 1, basePrice: "0" });
    state.daysByTourId.set("t1", []);
    state.itemsByTourId.set("t1", []);
    state.departuresByTourId.set("t1", []);

    const res = await request(app).get("/api/tours/export");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a non-tour-builder role on import", async () => {
    loginAs("customer", "cust-1");
    const res = await request(app)
      .post("/api/tours/import")
      .send({ tours: [{ title: "Smuggled Tour", days: [] }] });
    expect(res.status).toBe(403);
  });
});
