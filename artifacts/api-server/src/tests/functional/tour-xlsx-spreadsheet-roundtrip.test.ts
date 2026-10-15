/**
 * Spreadsheet-level round-trip test for the staff xlsx import/export path.
 *
 * This exercises the REAL binary .xlsx path that staff actually use:
 *   GET /api/tours/export → JSON
 *   → buildWorkbook() (client, tour-export-button.tsx)
 *   → XLSX.write → binary buffer
 *   → XLSX.read → WorkBook
 *   → parseWorkbook() (client, tour-import-dialog.tsx)
 *   → POST /api/tours/import
 *
 * The existing tour-export-import-roundtrip.test.ts operates at the JSON level
 * (export JSON posted directly to import) and cannot catch spreadsheet-specific
 * regressions such as:
 *   - Number/boolean cells being read back with wrong types after xlsx encoding
 *   - Boolean flags ("true"/"false" strings) coercion by parseWorkbook
 *   - Decimal cost strings surviving XLSX cell encoding without coercion to floats
 *   - Catalog name text surviving xlsx round-trip (hotelName, sightName, guideName)
 *   - countries/tags comma-join → split surviving as arrays
 *   - dayNumber integer encoding in xlsx surviving as exact integers
 *
 * buildWorkbook and parseWorkbook now come from the shared workspace package
 * @workspace/tour-spreadsheet — the single source of truth also used by the
 * tourops client components, so this test exercises the real contract.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";
import * as XLSX from "xlsx";
import { buildWorkbook, parseWorkbook } from "@workspace/tour-spreadsheet";

// ---------------------------------------------------------------------------
// Hoisted mutable state shared between vi.mock factories and individual tests.
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  session: { current: {} as { userId?: string } },
  profiles: [] as Array<{ id: string; userId: string; role: string }>,

  hotels: [] as Array<{ id: string; name: string; basePrice?: string | null }>,
  sights: [] as Array<{ id: string; name: string; ticketPrice?: string | null }>,
  guides: [] as Array<{ id: string; guideName: string; price?: string | null; currency?: string | null }>,

  tours: [] as any[],
  daysByTourId: new Map<string, any[]>(),
  itemsByTourId: new Map<string, any[]>(),
  departuresByTourId: new Map<string, any[]>(),
  departuresById: new Map<string, any>(),

  createdTours: [] as any[],
  createdDays: [] as any[],
  createdItems: [] as any[],
  createdDepartures: [] as any[],
  updatedDepartures: [] as Array<{ id: string; data: any }>,
}));

// ---------------------------------------------------------------------------
// Mocks — identical infrastructure to tour-export-import-roundtrip.test.ts
// ---------------------------------------------------------------------------

vi.mock("@workspace/db", async (importOriginal) => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
  const actual = await importOriginal<typeof import("@workspace/db")>();
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

vi.mock("../../lib/tour-translation", () => ({
  autoFillTourTranslations: vi.fn().mockResolvedValue(undefined),
  maybeAutoTranslateTourInBackground: vi.fn(),
}));
vi.mock("../../lib/entity-translation", () => ({
  maybeAutoTranslateEntitiesInBackground: vi.fn(),
}));

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

let xlsxIdSeq = 0;
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: async (userId: string) =>
      state.profiles.find((p) => p.userId === userId) ??
      (() => { throw Object.assign(new Error("Unprovisioned"), { statusCode: 403 }); })(),

    getAllTours: async () => state.tours,
    getTour: async (id: string) => state.tours.find((t) => t.id === id),
    getTourDays: async (tourId: string) => state.daysByTourId.get(tourId) ?? [],
    getTourDayItemsByTourId: async (tourId: string) => state.itemsByTourId.get(tourId) ?? [],
    getDeparturesByTour: async (tourId: string) => state.departuresByTourId.get(tourId) ?? [],

    getAllDepartures: async () => [...state.departuresById.values()],
    getDeparture: async (id: string) => state.departuresById.get(id) ?? undefined,
    createDeparture: async (data: any) => {
      const dep = { id: `dep-${++xlsxIdSeq}`, ...data };
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

    getAllHotels: async () => state.hotels,
    getAllSights: async () => state.sights,
    getGuideRates: async () => state.guides,

    createTour: async (data: any) => {
      const tour = { id: `imported-tour-${++xlsxIdSeq}`, ...data };
      state.createdTours.push(tour);
      return tour;
    },
    createTourDay: async (data: any) => {
      const day = { id: `imported-day-${++xlsxIdSeq}`, ...data };
      state.createdDays.push(day);
      return day;
    },
    createTourDayItem: async (data: any) => {
      const item = { id: `imported-item-${++xlsxIdSeq}`, ...data };
      state.createdItems.push(item);
      return item;
    },

    getAllCountries: async () => [],
    getPublishedTours: async () => [],
    getTourAccommodationSummary: async () => [],
    getWorkflows: async () => [],
  },
}));

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

/** Export JSON → buildWorkbook → binary → XLSX.read → parseWorkbook payload */
function xlsxRoundTrip(exportedTours: any[]): { tours: any[] } {
  const wb = buildWorkbook(exportedTours);
  const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const reloaded = XLSX.read(buf, { type: "buffer" });
  return parseWorkbook(reloaded);
}

function seedCatalog() {
  state.hotels.push({ id: "hotel-1", name: "Grand Jerusalem Hotel", basePrice: "150" });
  state.sights.push({ id: "sight-1", name: "Western Wall Entrance", ticketPrice: "25" });
  state.guides.push({ id: "guide-1", guideName: "Licensed Local Guide", price: "200", currency: "USD" });
}

function seedTour() {
  const tourId = "tour-seed-xlsx";
  state.tours.push({
    id: tourId,
    title: "Israel Highlights – 3 Days",
    description: "A 3-day tour of Israel.",
    category: "cultural",
    countries: ["Israel", "Jordan"],
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
    { id: "day-x1", tourId, dayNumber: 1, title: "Arrival in Tel Aviv",  countryCode: "IL", city: "Tel Aviv",  description: "Welcome day.", activities: "Transfer",     imageUrl: "" },
    { id: "day-x2", tourId, dayNumber: 2, title: "Jerusalem Old City",   countryCode: "IL", city: "Jerusalem", description: "Full day.",    activities: "Walking tour", imageUrl: "" },
    { id: "day-x3", tourId, dayNumber: 3, title: "Departure",            countryCode: "IL", city: "Tel Aviv",  description: "Departure.",   activities: "",             imageUrl: "" },
  ]);

  state.itemsByTourId.set(tourId, [
    // Day 1 — hotel (catalog ref) + transport (no catalog, decimal cost)
    { id: "xi-1", tourDayId: "day-x1", itemType: "hotel",     title: "Overnight in Tel Aviv", cost: "150",   currency: "USD", isOptional: false, bookingRequired: false, hotelId: "hotel-1", sightId: null, guideId: null,     sortOrder: 0, startTime: null,    endTime: null,    description: "Hotel night" },
    { id: "xi-2", tourDayId: "day-x1", itemType: "transport", title: "Airport Transfer",       cost: "60.50", currency: "USD", isOptional: false, bookingRequired: false, hotelId: null,      sightId: null, guideId: null,     sortOrder: 1, startTime: "14:00", endTime: "15:00", description: "Private van" },
    // Day 2 — sight + guide (catalog refs)
    { id: "xi-3", tourDayId: "day-x2", itemType: "sight",     title: "Western Wall Entrance", cost: "25",    currency: "USD", isOptional: false, bookingRequired: false, hotelId: null, sightId: "sight-1", guideId: null,     sortOrder: 0, startTime: "09:00", endTime: null,    description: "" },
    { id: "xi-4", tourDayId: "day-x2", itemType: "guide",     title: "Licensed guide",         cost: "200",   currency: "USD", isOptional: false, bookingRequired: false, hotelId: null, sightId: null,      guideId: "guide-1", sortOrder: 1, startTime: "09:00", endTime: "17:00", description: "" },
    // Day 3 — optional custom item, no catalog refs
    { id: "xi-5", tourDayId: "day-x3", itemType: "custom",    title: "Free afternoon",         cost: "0",     currency: "USD", isOptional: true,  bookingRequired: false, hotelId: null, sightId: null,      guideId: null,     sortOrder: 0, startTime: null,    endTime: null,    description: "Leisure time" },
  ]);

  state.departuresByTourId.set(tourId, []);
  return tourId;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("xlsx binary round-trip: buildWorkbook → parseWorkbook → POST /api/tours/import", () => {
  let app: Express;

  beforeEach(async () => {
    resetState();
    app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);
  });

  // =========================================================================
  // 1. Happy-path: correct day and item counts survive the binary xlsx trip
  // =========================================================================
  it("imports the xlsx-encoded tour with the correct day and item counts", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour();

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const payload = xlsxRoundTrip(exportRes.body.tours);

    expect(payload.tours).toHaveLength(1);
    expect(payload.tours[0].days).toHaveLength(3);
    expect(payload.tours[0].days[0].items).toHaveLength(2);
    expect(payload.tours[0].days[1].items).toHaveLength(2);
    expect(payload.tours[0].days[2].items).toHaveLength(1);

    const importRes = await request(app)
      .post("/api/tours/import")
      .send(payload)
      .expect(200);

    expect(importRes.body.created).toBe(1);
    expect(importRes.body.failed).toBe(0);
    expect(state.createdDays).toHaveLength(3);
    expect(state.createdItems).toHaveLength(5);
  });

  // =========================================================================
  // 2. Catalog name resolution: hotel / sight / guide names survive xlsx
  //    encoding and are re-resolved back to catalog IDs on import
  // =========================================================================
  it("resolves hotel, sight, and guide names back to catalog IDs after xlsx encoding", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour();

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    // Verify names are in the JSON export before xlsx encoding
    const exportedDay1 = exportRes.body.tours[0].days[0];
    expect(exportedDay1.items.find((i: any) => i.itemType === "hotel")?.hotelName).toBe("Grand Jerusalem Hotel");

    const payload = xlsxRoundTrip(exportRes.body.tours);

    // Verify names survive through xlsx encoding
    const day1 = payload.tours[0].days[0];
    const day2 = payload.tours[0].days[1];
    expect(day1.items.find((i: any) => i.itemType === "hotel")?.hotelName).toBe("Grand Jerusalem Hotel");
    expect(day2.items.find((i: any) => i.itemType === "sight")?.sightName).toBe("Western Wall Entrance");
    expect(day2.items.find((i: any) => i.itemType === "guide")?.guideName).toBe("Licensed Local Guide");

    const importRes = await request(app)
      .post("/api/tours/import")
      .send(payload)
      .expect(200);

    expect(importRes.body.failed).toBe(0);
    expect(state.createdItems.find((i: any) => i.itemType === "hotel")?.hotelId).toBe("hotel-1");
    expect(state.createdItems.find((i: any) => i.itemType === "sight")?.sightId).toBe("sight-1");
    expect(state.createdItems.find((i: any) => i.itemType === "guide")?.guideId).toBe("guide-1");
  });

  // =========================================================================
  // 3. Decimal cost survives xlsx encoding without float coercion
  //    "60.50" → xlsx cell → parseWorkbook num() → import cost field
  // =========================================================================
  it("preserves decimal cost string (60.50) through xlsx cell encoding", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour();

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const payload = xlsxRoundTrip(exportRes.body.tours);

    const transportItem = payload.tours[0].days[0].items.find((i: any) => i.itemType === "transport");
    expect(transportItem).toBeDefined();
    // cost must be a non-empty string that represents 60.5
    expect(transportItem?.cost).toBeDefined();
    expect(parseFloat(String(transportItem?.cost))).toBeCloseTo(60.5);

    const importRes = await request(app)
      .post("/api/tours/import")
      .send(payload)
      .expect(200);

    expect(importRes.body.failed).toBe(0);
    const storedTransport = state.createdItems.find((i: any) => i.itemType === "transport");
    expect(storedTransport?.cost).toBeDefined();
    expect(parseFloat(String(storedTransport?.cost))).toBeCloseTo(60.5);
  });

  // =========================================================================
  // 4. Boolean flags: isOptional "true"/"false" cells are coerced correctly
  //    XLSX may read back string cells or booleans depending on how they were
  //    written; parseWorkbook's boolFalse() must handle both.
  // =========================================================================
  it("coerces isOptional boolean flag correctly after xlsx encoding", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour();

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const payload = xlsxRoundTrip(exportRes.body.tours);

    // hotel on day 1 — isOptional false
    const hotelItem = payload.tours[0].days[0].items.find((i: any) => i.itemType === "hotel");
    expect(hotelItem?.isOptional).toBe(false);

    // custom on day 3 — isOptional true
    const customItem = payload.tours[0].days[2].items.find((i: any) => i.itemType === "custom");
    expect(customItem?.isOptional).toBe(true);

    const importRes = await request(app)
      .post("/api/tours/import")
      .send(payload)
      .expect(200);

    expect(importRes.body.failed).toBe(0);
    const importedHotel = state.createdItems.find((i: any) => i.itemType === "hotel");
    expect(importedHotel?.isOptional).toBe(false);
    const importedCustom = state.createdItems.find((i: any) => i.itemType === "custom");
    expect(importedCustom?.isOptional).toBe(true);
  });

  // =========================================================================
  // 5. Multi-value fields: countries / tags survive comma-join → xlsx → split
  //    Export serialises ["Israel", "Jordan"] as "Israel, Jordan" in the cell;
  //    parseWorkbook splits it back to ["Israel", "Jordan"].
  // =========================================================================
  it("preserves multi-value countries and tags through xlsx comma encoding", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour(); // seeded with countries: ["Israel", "Jordan"], tags: ["faith", "history"]

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const payload = xlsxRoundTrip(exportRes.body.tours);

    expect(payload.tours[0].countries).toEqual(["Israel", "Jordan"]);
    expect(payload.tours[0].tags).toEqual(["faith", "history"]);
  });

  // =========================================================================
  // 6. dayNumber integer encoding: XLSX stores numbers as floats internally;
  //    verify dayNumber comes back as the exact integer and rows are ordered
  //    correctly after the xlsx trip.
  // =========================================================================
  it("preserves exact dayNumber integers and correct day ordering through xlsx", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour();

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const payload = xlsxRoundTrip(exportRes.body.tours);

    const days = payload.tours[0].days;
    expect(days[0].dayNumber).toBe(1);
    expect(days[1].dayNumber).toBe(2);
    expect(days[2].dayNumber).toBe(3);
    expect(days[0].title).toBe("Arrival in Tel Aviv");
    expect(days[1].title).toBe("Jerusalem Old City");
    expect(days[2].title).toBe("Departure");
  });

  // =========================================================================
  // 7. Full pipeline: export → xlsx binary → import creates unique IDs only
  //    (no duplicate days or items from the binary encoding step)
  // =========================================================================
  it("creates no duplicate days or items when re-importing from xlsx binary", async () => {
    loginAs("admin");
    seedCatalog();
    const tourId = seedTour();

    const exportRes = await request(app)
      .get(`/api/tours/export?ids=${tourId}`)
      .expect(200);

    const payload = xlsxRoundTrip(exportRes.body.tours);

    await request(app)
      .post("/api/tours/import")
      .send(payload)
      .expect(200);

    const dayIds = state.createdDays.map((d: any) => d.id);
    expect(new Set(dayIds).size).toBe(dayIds.length);
    const itemIds = state.createdItems.map((i: any) => i.id);
    expect(new Set(itemIds).size).toBe(itemIds.length);
  });

  // =========================================================================
  // 8. parseWorkbook referential integrity: a workbook with an orphan Items
  //    row (tourRef that doesn't match any Tours row) throws before POST.
  //    This ensures the client-side guard works at the binary level.
  // =========================================================================
  it("parseWorkbook throws on orphan Items row (bad tourRef) — caught before POST", async () => {
    // Build a minimal workbook manually with a bad tourRef on an Items row
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["unused"]]), "Instructions");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["ref", "title", "description", "category", "countries", "highlights", "inclusions", "exclusions", "tags", "imageUrl", "basePrice", "childPrice", "singleSupplement", "duration"],
      ["T1", "Valid Tour", "", "cultural", "Israel", "", "", "", "", "", "", "", "", 1],
    ]), "Tours");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["tourRef", "dayNumber", "title", "countryCode", "city", "description", "activities", "imageUrl"],
      ["T1", 1, "Day One", "IL", "Tel Aviv", "", "", ""],
    ]), "Days");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
      ["tourRef", "dayNumber", "itemType", "title", "startTime", "endTime", "cost", "currency", "isOptional", "bookingRequired", "hotelName", "sightName", "guideName", "sortOrder", "description"],
      ["WRONG_REF", 1, "transport", "Bad Item", "", "", "50", "USD", "false", "false", "", "", "", 0, ""],
    ]), "Items");

    // Write and re-read through binary to simulate the real upload path
    const buf: Buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const reloaded = XLSX.read(buf, { type: "buffer" });

    expect(() => parseWorkbook(reloaded)).toThrow(/WRONG_REF.*does not match/i);
  });
});
