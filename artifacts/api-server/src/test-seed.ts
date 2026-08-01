/**
 * Staging test-data system ("TOUROPS TEST ENVIRONMENT").
 *
 * Populates a complete, deterministic direct-client test scenario:
 * master data -> users (staff / suppliers / clients) -> supplier rate cards ->
 * hotels -> pricing rule -> 8-day Biblical Israel tour -> departure ->
 * 20-pax quote (computed through the real pricing engine) -> approval ->
 * booking -> supplier service requests -> payment schedule -> validation.
 *
 * Guarantees:
 * - BLOCKED in production (NODE_ENV / REPLIT_DEPLOYMENT guard).
 * - Idempotent: each run first removes all previously seeded test rows
 *   (identified by stable TEST- codes, test- slugs, @test.tourops.local
 *   emails and fixed user ids), then recreates them from scratch.
 * - All quote math flows through resolveTourComponents + computeQuote —
 *   nothing is hand-computed, so the validation step genuinely exercises
 *   the pricing engine (expected: $3,408 double @ Hotel Choice 1, 20 pax).
 */
import {
  db,
  countries, cities, airports, exchangeRates,
  userProfiles, hotels, tours, tourDays, tourDayItems, tourDepartures,
  transportRates, guideRates, sightsRates, airfareRates,
  groupSizeBands, pricingRules, pricingQuotes, pricingQuoteLineItems,
  bookings, bookingServiceRequests, bookingPaymentSchedules, seedRuns,
  travelers, travelerInvitations, bookingStatusHistory, bookingRooms,
  bookingChangeRequests, incidentReports, payments, messages,
} from "@workspace/db";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import Decimal from "decimal.js";
import { authStorage } from "./replit_integrations/auth/storage";
import { storage } from "./storage";
import { computeQuote, type HotelChoiceInput } from "./services/pricing-engine";
import { resolveTourComponents } from "./services/rate-resolver";

// ---------------------------------------------------------------------------
// Environment guard
// ---------------------------------------------------------------------------

/** Non-null reason string when test seeding must not run here. */
export function testSeedBlockedReason(): string | null {
  if (process.env.NODE_ENV === "production" || process.env.REPLIT_DEPLOYMENT)
    return "Test-data seeding is blocked in production environments.";
  return null;
}

/** True when this is a non-production environment (drives the UI banner). */
export function isTestEnvironment(): boolean {
  return testSeedBlockedReason() === null;
}

// ---------------------------------------------------------------------------
// Stable identifiers (everything the reset step needs to find again)
// ---------------------------------------------------------------------------

const TEST_EMAIL_DOMAIN = "@test.tourops.local";
const TOUR_SLUG = "test-biblical-israel";
const HOTEL_SLUGS = ["test-hotel-jerusalem-gate", "test-hotel-mount-zion", "test-hotel-king-david-view"];
const BOOKING_CODE = "TEST-BKG-001";
const RATE_NOTE_TAG = "TEST_SEED"; // stamped into rate-card notes / enteredBy

const SUPPLIER_USERS = [
  { id: "user-test-supplier-1", username: "testsupplierhotel1", company: "TEST Jerusalem Hotels Group", role: "supplier" },
  { id: "user-test-supplier-2", username: "testsupplierhotel2", company: "TEST Zion Hospitality", role: "supplier" },
  { id: "user-test-supplier-3", username: "testsupplierhotel3", company: "TEST Holy Land Stays", role: "supplier" },
  { id: "user-test-supplier-4", username: "testsuppliertransport1", company: "TEST Galilee Coaches", role: "supplier" },
  { id: "user-test-supplier-5", username: "testsupplierguides1", company: "TEST Israel Guides Co-op", role: "supplier" },
] as const;

// Dominican Republic "Faith & Leisure" client-lifecycle scenario
const DR_TOUR_SLUG = "test-dr-faith-leisure";
const DR_PRICE_PER_PERSON = 950;
const DR_DEPARTURES = [
  { code: "DR-FL-2026-001", start: "2026-10-20", end: "2026-10-24" },
  { code: "DR-FL-2026-002", start: "2026-11-10", end: "2026-11-14" },
  { code: "DR-FL-2026-003", start: "2026-12-15", end: "2026-12-19" },
] as const;

const CLIENT_USERS = [
  { id: "user-test-client-1", username: "michael.leader", firstName: "Michael", lastName: "Ben-David", accountType: "tour_leader" as const },
  { id: "user-test-client-2", username: "rachel.family", firstName: "Rachel", lastName: "Cohen", accountType: "family_organizer" as const },
];

const ALL_TEST_USER_IDS = [...SUPPLIER_USERS.map(u => u.id), ...CLIENT_USERS.map(u => u.id)];

// Deterministic pricing inputs. For 20 pax with the 20% margin + 1-free-per-3
// rule and unit_up rounding, Hotel Choice 1 double must price at exactly 3408:
// hotel 100/night x 7 + airfare 800 + transport 6000/20 + guide 4000/20 +
// sights 2600/20 = 2130 -> x1.2 = 2556 -> x4/3 = 3408.
const PAX = 20;
const EXPECTED_DOUBLE_CH1 = "3408";
const DEPARTURE_START = "2026-10-15";
const DEPARTURE_END = "2026-10-22";

export interface PhaseReport { phase: string; created: number; updated: number; skipped: number; notes?: string[] }
export interface ValidationCheck { name: string; passed: boolean; expected: string; actual: string }
export interface SeedReport {
  environmentLabel: string;
  phases: PhaseReport[];
  validation: ValidationCheck[];
  passed: boolean;
  accounts: { username: string; password: string; role: string; note?: string }[];
}

// ---------------------------------------------------------------------------
// Reset (delete previously seeded test rows, dependency order: children first)
// ---------------------------------------------------------------------------

export async function resetTestData(): Promise<Record<string, number>> {
  const blocked = testSeedBlockedReason();
  if (blocked) throw Object.assign(new Error(blocked), { statusCode: 403 });
  const deleted: Record<string, number> = {};
  const count = async (name: string, rows: unknown[]) => { deleted[name] = rows.length; };

  // Booking-scoped children (fixed test booking + any bookings on the DR test tour)
  const drTours = await db.select({ id: tours.id }).from(tours).where(eq(tours.slug, DR_TOUR_SLUG));
  const drTourIds = drTours.map(t => t.id);
  const bkgs = await db.select({ id: bookings.id }).from(bookings).where(
    drTourIds.length
      ? sql`${bookings.bookingCode} = ${BOOKING_CODE} OR ${bookings.tourId} IN (${sql.join(drTourIds.map(id => sql`${id}`), sql`, `)})`
      : eq(bookings.bookingCode, BOOKING_CODE),
  );
  const bkgIds = bkgs.map(b => b.id);
  if (bkgIds.length) {
    const trav = await db.select({ id: travelers.id }).from(travelers).where(inArray(travelers.bookingId, bkgIds));
    const travIds = trav.map(t => t.id);
    if (travIds.length) await db.delete(travelerInvitations).where(inArray(travelerInvitations.travelerId, travIds));
    await count("travelers", trav);
    await db.delete(travelers).where(inArray(travelers.bookingId, bkgIds));
    await db.delete(bookingStatusHistory).where(inArray(bookingStatusHistory.bookingId, bkgIds));
    await db.delete(bookingRooms).where(inArray(bookingRooms.bookingId, bkgIds));
    await db.delete(bookingChangeRequests).where(inArray(bookingChangeRequests.bookingId, bkgIds));
    await db.delete(incidentReports).where(inArray(incidentReports.bookingId, bkgIds));
    await db.delete(payments).where(inArray(payments.bookingId, bkgIds));
    await db.delete(messages).where(inArray(messages.bookingId, bkgIds));
    await count("service_requests", await db.delete(bookingServiceRequests).where(inArray(bookingServiceRequests.bookingId, bkgIds)).returning({ id: bookingServiceRequests.id }));
    await count("payment_schedules", await db.delete(bookingPaymentSchedules).where(inArray(bookingPaymentSchedules.bookingId, bkgIds)).returning({ id: bookingPaymentSchedules.id }));
    await count("bookings", await db.delete(bookings).where(inArray(bookings.id, bkgIds)).returning({ id: bookings.id }));
  }

  // Tour-scoped: quotes, line items, rules, departures, days/items
  const testTours = await db.select({ id: tours.id }).from(tours).where(inArray(tours.slug, [TOUR_SLUG, DR_TOUR_SLUG]));
  const tourIds = testTours.map(t => t.id);
  if (tourIds.length) {
    const quotes = await db.select({ id: pricingQuotes.id }).from(pricingQuotes).where(inArray(pricingQuotes.tourId, tourIds));
    const quoteIds = quotes.map(q => q.id);
    if (quoteIds.length) {
      await db.delete(pricingQuoteLineItems).where(inArray(pricingQuoteLineItems.quoteId, quoteIds));
      await count("quotes", await db.delete(pricingQuotes).where(inArray(pricingQuotes.id, quoteIds)).returning({ id: pricingQuotes.id }));
    }
    await db.delete(pricingRules).where(inArray(pricingRules.tourId, tourIds));
    await db.delete(tourDepartures).where(inArray(tourDepartures.tourId, tourIds));
    const days = await db.select({ id: tourDays.id }).from(tourDays).where(inArray(tourDays.tourId, tourIds));
    const dayIds = days.map(d => d.id);
    if (dayIds.length) await db.delete(tourDayItems).where(inArray(tourDayItems.tourDayId, dayIds));
    await db.delete(tourDays).where(inArray(tourDays.tourId, tourIds));
    await count("tours", await db.delete(tours).where(inArray(tours.id, tourIds)).returning({ id: tours.id }));
  }

  // Catalog rows tagged by TEST codes / notes
  await count("hotels", await db.delete(hotels).where(inArray(hotels.slug, HOTEL_SLUGS)).returning({ id: hotels.id }));
  // Rate cards are owned by the fixed test supplier accounts — deleting by
  // createdBy (not code prefixes) guarantees we can only remove rows this
  // seeder created, even if a real staging row happens to use a TEST- code.
  await count("transport_rates", await db.delete(transportRates).where(inArray(transportRates.createdBy, ALL_TEST_USER_IDS)).returning({ id: transportRates.id }));
  await count("guide_rates", await db.delete(guideRates).where(inArray(guideRates.createdBy, ALL_TEST_USER_IDS)).returning({ id: guideRates.id }));
  await count("sights_rates", await db.delete(sightsRates).where(inArray(sightsRates.createdBy, ALL_TEST_USER_IDS)).returning({ id: sightsRates.id }));
  // airfare_rates has no createdBy column; match the exact seeded airline name.
  await count("airfare_rates", await db.delete(airfareRates).where(eq(airfareRates.airline, "TEST El Al")).returning({ id: airfareRates.id }));
  await count("exchange_rates", await db.delete(exchangeRates).where(eq(exchangeRates.enteredBy, RATE_NOTE_TAG)).returning({ id: exchangeRates.id }));

  // Test users (profiles + auth rows). Never touches non-test accounts.
  await count("profiles", await db.delete(userProfiles).where(inArray(userProfiles.userId, ALL_TEST_USER_IDS)).returning({ id: userProfiles.id }));
  await db.execute(sql`DELETE FROM users WHERE id IN (${sql.join(ALL_TEST_USER_IDS.map((id) => sql`${id}`), sql`, `)})`);

  return deleted;
}

// ---------------------------------------------------------------------------
// Seed phases
// ---------------------------------------------------------------------------

async function phaseMasterData(): Promise<PhaseReport> {
  const r: PhaseReport = { phase: "master_data", created: 0, updated: 0, skipped: 0, notes: [] };
  // Country (reused if it already exists — real master data, not test-tagged)
  let [israel] = await db.select().from(countries).where(eq(countries.code, "IL"));
  if (!israel) {
    [israel] = await db.insert(countries).values({ code: "IL", iso3: "ISR", name: "Israel", capitalCity: "Jerusalem", continent: "Asia", currencyCode: "ILS", isActive: true }).returning();
    r.created++;
  } else r.skipped++;
  const cityNames = ["Jerusalem", "Tel Aviv", "Tiberias"];
  const cityIds: Record<string, string> = {};
  for (const name of cityNames) {
    const existing = await db.select().from(cities).where(and(eq(cities.name, name), eq(cities.countryId, israel.id)));
    if (existing.length) { cityIds[name] = existing[0].id; r.skipped++; continue; }
    const [c] = await db.insert(cities).values({ name, countryId: israel.id, isTourismCity: true, isActive: true }).returning();
    cityIds[name] = c.id; r.created++;
  }
  // TLV airport
  const [tlv] = await db.select().from(airports).where(eq(airports.code, "TLV"));
  if (!tlv) { await db.insert(airports).values({ code: "TLV", name: "Ben Gurion International", cityId: cityIds["Tel Aviv"] }); r.created++; } else r.skipped++;
  // Exchange rates (test-tagged via enteredBy)
  for (const [src, rate] of [["EUR", "1.08"], ["ILS", "0.27"]] as const) {
    await db.insert(exchangeRates).values({ sourceCurrency: src, targetCurrency: "USD", rate, isActive: true, enteredBy: RATE_NOTE_TAG });
    r.created++;
  }
  (phaseMasterData as any).cityIds = cityIds;
  return r;
}

async function upsertTestUser(opts: { id: string; username: string; firstName?: string; lastName?: string; role: string; accountType?: string | null; companyName?: string | null; passwordHash: string }) {
  const user = await authStorage.upsertUser({
    id: opts.id, username: opts.username, passwordHash: opts.passwordHash,
    email: `${opts.username}${TEST_EMAIL_DOMAIN}`,
    firstName: opts.firstName ?? null, lastName: opts.lastName ?? null,
  } as any);
  await db.insert(userProfiles).values({
    userId: user.id, role: opts.role as any,
    accountType: (opts.accountType ?? null) as any,
    companyName: opts.companyName ?? null,
  });
  return user;
}

async function phaseUsers(): Promise<PhaseReport> {
  const r: PhaseReport = { phase: "users", created: 0, updated: 0, skipped: 0, notes: [] };
  const passwordHash = await bcrypt.hash("password123", 10);
  for (const s of SUPPLIER_USERS) {
    await upsertTestUser({ id: s.id, username: s.username, role: s.role, companyName: s.company, passwordHash });
    r.created++;
  }
  for (const c of CLIENT_USERS) {
    await upsertTestUser({ id: c.id, username: c.username, firstName: c.firstName, lastName: c.lastName, role: "customer", accountType: c.accountType, passwordHash });
    r.created++;
  }
  r.notes!.push("Internal staff demo accounts (superadmin1, operationsmanager1, ...) are managed by the existing startup seed and were not modified.");
  return r;
}

async function phaseCatalog(cityIds: Record<string, string>): Promise<{ report: PhaseReport; hotelIds: string[] }> {
  const r: PhaseReport = { phase: "supplier_catalog", created: 0, updated: 0, skipped: 0 };
  const jerusalem = cityIds["Jerusalem"];
  // Hotels: choice 1 double rate $200/night is the anchor of the expected calc.
  const hotelSpecs = [
    { slug: HOTEL_SLUGS[0], name: "TEST Jerusalem Gate Hotel", owner: SUPPLIER_USERS[0].id, m: "190", d: "200", t: "270", stars: 4 },
    { slug: HOTEL_SLUGS[1], name: "TEST Mount Zion Hotel", owner: SUPPLIER_USERS[1].id, m: "240", d: "260", t: "330", stars: 4 },
    { slug: HOTEL_SLUGS[2], name: "TEST King David View Hotel", owner: SUPPLIER_USERS[2].id, m: "300", d: "330", t: "420", stars: 5 },
  ];
  const hotelIds: string[] = [];
  for (const h of hotelSpecs) {
    const [row] = await db.insert(hotels).values({
      name: h.name, slug: h.slug, cityId: jerusalem, status: "published", isActive: true,
      createdBy: h.owner, starRating: h.stars, currency: "USD",
      roomRateMatrimonial: h.m, roomRateDouble: h.d, roomRateTriple: h.t,
      description: "Seeded by the TOUROPS TEST ENVIRONMENT test-data system.",
    }).returning();
    hotelIds.push(row.id); r.created++;
  }
  // Rate cards (catalog completeness; owned by supplier accounts, active)
  await db.insert(transportRates).values({ countryCode: "IL", cityBase: "Jerusalem", vendorName: "TEST Galilee Coaches", vendorCode: "TEST-TRN-1", vehicleType: "50-seat coach", seatCapacity: 50, rateMode: "per_day", currency: "USD", basePrice: "750", status: "active", createdBy: SUPPLIER_USERS[3].id, notes: RATE_NOTE_TAG });
  await db.insert(guideRates).values({ countryCode: "IL", cityBase: "Jerusalem", guideName: "TEST Avi Guide", guideCode: "TEST-GDE-1", language: "English", rateUnit: "per_day", currency: "USD", price: "500", status: "active", createdBy: SUPPLIER_USERS[4].id, notes: RATE_NOTE_TAG });
  await db.insert(sightsRates).values([
    { countryCode: "IL", city: "Jerusalem", attractionName: "TEST City of David", attractionCode: "TEST-SGT-1", ticketType: "adult", currency: "USD", pricePerPerson: "35", status: "active", createdBy: SUPPLIER_USERS[4].id, notes: RATE_NOTE_TAG },
    { countryCode: "IL", city: "Tiberias", attractionName: "TEST Sea of Galilee Boat", attractionCode: "TEST-SGT-2", ticketType: "adult", currency: "USD", pricePerPerson: "25", status: "active", createdBy: SUPPLIER_USERS[4].id, notes: RATE_NOTE_TAG },
  ]);
  r.created += 4;
  // Airfare: JFK->TLV is used by the seeded quote (adult 800 / child 600 / infant 100)
  await db.insert(airfareRates).values([
    { origin: "JFK", destination: "TLV", airline: "TEST El Al", ratePerPerson: "800", childRate: "600", infantRate: "100", currency: "USD", isActive: true },
    { origin: "MIA", destination: "TLV", airline: "TEST El Al", ratePerPerson: "850", childRate: "640", infantRate: "110", currency: "USD", isActive: true },
  ]);
  r.created += 2;
  return { report: r, hotelIds };
}

async function phaseTour(hotelIds: string[]): Promise<{ report: PhaseReport; tourId: string; departureId: string; ruleId: string }> {
  const r: PhaseReport = { phase: "tour_and_pricing_rule", created: 0, updated: 0, skipped: 0 };
  const [tour] = await db.insert(tours).values({
    title: "Biblical Israel Highlights (TEST)", slug: TOUR_SLUG,
    description: "8-day direct-client test itinerary seeded by the TOUROPS TEST ENVIRONMENT.",
    duration: 8, basePrice: "0", markupAmount: "0", totalPrice: "0",
    countries: ["Israel"], category: "religious", isPublished: true,
  }).returning();
  r.created++;
  const dayTitles = [
    "Arrival in Tel Aviv", "Jerusalem Old City", "City of David & Mount of Olives",
    "Bethlehem & Dead Sea", "Masada & Ein Gedi", "Galilee & Tiberias",
    "Nazareth & Capernaum", "Departure",
  ];
  const dayIds: string[] = [];
  for (let i = 0; i < 8; i++) {
    const [d] = await db.insert(tourDays).values({ tourId: tour.id, dayNumber: i + 1, title: `Day ${i + 1}: ${dayTitles[i]}`, countryCode: "IL" }).returning();
    dayIds.push(d.id); r.created++;
  }
  // Group-cost items: transport 6000, guide 4000, sights 2600 (group totals).
  await db.insert(tourDayItems).values([
    { tourDayId: dayIds[0], itemType: "transport", title: "Coach transport, full tour (group)", cost: "6000", currency: "USD", sortOrder: 1 },
    { tourDayId: dayIds[0], itemType: "guide", title: "Licensed guide, full tour (group)", cost: "4000", currency: "USD", sortOrder: 2 },
    { tourDayId: dayIds[1], itemType: "sight", title: "Entrance fees package (group)", cost: "2600", currency: "USD", sortOrder: 1 },
  ]);
  r.created += 3;
  // 7 hotel nights per hotel choice (3 alternative hotels for the same stay).
  const hotelItems: any[] = [];
  for (const [choice, hotelId] of hotelIds.entries()) {
    for (let night = 0; night < 7; night++) {
      hotelItems.push({ tourDayId: dayIds[night], itemType: "hotel", hotelId, title: `Hotel night ${night + 1} (choice ${choice + 1})`, cost: "0", currency: "USD", sortOrder: 10 + choice });
    }
  }
  await db.insert(tourDayItems).values(hotelItems);
  r.created += hotelItems.length;
  const [dep] = await db.insert(tourDepartures).values({
    tourId: tour.id, startDate: DEPARTURE_START, endDate: DEPARTURE_END,
    capacityTotal: 40, status: "open", publicJoinEnabled: false,
  }).returning();
  r.created++;
  // Tour-specific rule so global pricing behavior is untouched:
  // 20% margin, 1 free per 3 paying, round UP to the dollar.
  const [rule] = await db.insert(pricingRules).values({
    name: "TEST rule: 20% margin, 1 free per 3, round up to dollar",
    tourId: tour.id, marginType: "percentage", marginValue: "20",
    freePassengerPaying: 3, freePassengerFree: 1, roundingRule: "unit_up",
    currency: "USD", isActive: true,
  }).returning();
  r.created++;
  return { report: r, tourId: tour.id, departureId: dep.id, ruleId: rule.id };
}

async function phaseDrScenario(): Promise<PhaseReport> {
  const r: PhaseReport = { phase: "dr_faith_leisure_tour", created: 0, updated: 0, skipped: 0, notes: [] };
  // Country (reused if present — real master data)
  let [dr] = await db.select().from(countries).where(eq(countries.code, "DO"));
  if (!dr) {
    [dr] = await db.insert(countries).values({ code: "DO", iso3: "DOM", name: "Dominican Republic", capitalCity: "Santo Domingo", continent: "North America", currencyCode: "DOP", isActive: true }).returning();
    r.created++;
  } else r.skipped++;
  const [tour] = await db.insert(tours).values({
    title: "Dominican Republic Faith & Leisure Tour (TEST)", slug: DR_TOUR_SLUG,
    description: "5-day faith & leisure client-lifecycle test tour seeded by the TOUROPS TEST ENVIRONMENT. $950 per person.",
    duration: 5, basePrice: String(DR_PRICE_PER_PERSON), markupAmount: "0", totalPrice: String(DR_PRICE_PER_PERSON),
    countries: ["Dominican Republic"], category: "religious", isPublished: true,
  }).returning();
  r.created++;
  const drDays = [
    "Arrival in Santo Domingo & Colonial Zone", "Basílica de Higüey & Catholic Heritage",
    "Punta Cana Beach & Leisure Day", "Los Haitises National Park & Samaná",
    "Farewell Mass & Departure",
  ];
  for (let i = 0; i < drDays.length; i++) {
    await db.insert(tourDays).values({ tourId: tour.id, dayNumber: i + 1, title: `Day ${i + 1}: ${drDays[i]}`, countryCode: "DO" });
    r.created++;
  }
  for (const dep of DR_DEPARTURES) {
    await db.insert(tourDepartures).values({
      tourId: tour.id, startDate: dep.start, endDate: dep.end,
      capacityTotal: 35, status: "open", publicJoinEnabled: false,
      pricePerPerson: DR_PRICE_PER_PERSON, notes: dep.code,
    });
    r.created++;
  }
  r.notes!.push(`Departures: ${DR_DEPARTURES.map(d => `${d.code} (${d.start})`).join(", ")}. Bookings are created via the live client flow, not seeded.`);
  return r;
}

async function phaseQuote(tourId: string, departureId: string, ruleId: string): Promise<{ report: PhaseReport; quoteId: string; sellingDoubleCh1: string | null }> {
  const r: PhaseReport = { phase: "quote_and_approval", created: 0, updated: 0, skipped: 0, notes: [] };
  const resolved = await resolveTourComponents(db, {
    tourId, paxCount: PAX, departureDate: DEPARTURE_START, origin: "JFK", destination: "TLV", currency: "USD",
  });
  if (resolved.warnings.length) r.notes!.push(...resolved.warnings.map(w => `resolver: ${w}`));
  const [rule] = await db.select().from(pricingRules).where(eq(pricingRules.id, ruleId));
  const result = computeQuote({
    paxCount: PAX, nights: resolved.nights,
    components: resolved.components,
    hotels: resolved.hotels as HotelChoiceInput[],
    rule: { marginType: rule.marginType, marginValue: rule.marginValue, freePassengerPaying: rule.freePassengerPaying, freePassengerFree: rule.freePassengerFree, roundingRule: rule.roundingRule ?? "cent" },
  });
  const bands = await db.select().from(groupSizeBands).where(eq(groupSizeBands.isActive, true));
  const band = bands.find(b => PAX >= b.minPax && PAX <= b.maxPax) ?? null;
  const quote = await db.transaction(async (tx) => {
    const [q] = await tx.insert(pricingQuotes).values({
      tourId, departureId, pricingRuleId: rule.id, groupSizeBandId: band?.id ?? null,
      paxCount: PAX, nights: resolved.nights, assistanceType: result.assistanceType, currency: "USD",
      transportationShare: resolved.components.transportationShare,
      guideDriverShare: resolved.components.guideDriverShare,
      sightseeingShare: resolved.components.sightseeingShare,
      airfarePerPerson: resolved.components.airfarePerPerson,
      baseCostPerPerson: result.baseCostPerPerson, totalGroupCost: result.totalGroupCost,
      freeAdjustmentFactor: result.freeAdjustmentFactor,
      marginType: rule.marginType, marginValue: rule.marginValue,
      notes: "TEST-QUOTE-001 — seeded by the test-data system",
      calculationMeta: { ...resolved.meta, seededBy: RATE_NOTE_TAG },
      customerId: CLIENT_USERS[0].id, // Michael, the tour leader
      status: "sent", approvedBy: "user-super_admin-1", approvedAt: new Date(),
      createdBy: "user-operations_manager-1",
    }).returning();
    if (result.lineItems.length)
      await tx.insert(pricingQuoteLineItems).values(result.lineItems.map(li => ({ ...li, quoteId: q.id })));
    return q;
  });
  r.created += 1 + result.lineItems.length;
  await storage.createAuditLog({
    entityType: "pricing_quote", entityId: quote.id, action: "created",
    changedBy: "user-operations_manager-1",
    newValue: JSON.stringify({ seededBy: RATE_NOTE_TAG, tourId, paxCount: PAX }),
  }).catch(() => {});
  const doubleCh1 = result.lineItems.find(li => li.hotelChoice === 1 && li.occupancy === "double");
  return { report: r, quoteId: quote.id, sellingDoubleCh1: doubleCh1 ? new Decimal(doubleCh1.sellingPrice).toFixed(0) : null };
}

async function phaseBooking(tourId: string, departureId: string, sellingDouble: string | null): Promise<{ report: PhaseReport; bookingId: string; totalPrice: number }> {
  const r: PhaseReport = { phase: "booking_and_fulfillment", created: 0, updated: 0, skipped: 0 };
  // 20 pax, 15 paying (1 free per 3 paying) at the double selling price.
  const perPerson = new Decimal(sellingDouble ?? "0");
  const totalPrice = perPerson.mul(15).toDecimalPlaces(0).toNumber();
  const [booking] = await db.insert(bookings).values({
    bookingCode: BOOKING_CODE, tourId, departureId,
    customerId: CLIENT_USERS[0].id, leaderUserId: CLIENT_USERS[0].id,
    bookingType: "leader_group", groupName: "TEST Beth Shalom Congregation",
    partySizeExpected: PAX, status: "confirmed", fulfillmentStatus: "in_progress",
    totalPrice, currency: "USD", roomType: "doble",
    notes: "Seeded by the TOUROPS TEST ENVIRONMENT test-data system.",
  }).returning();
  r.created++;
  // Supplier service requests: hotel / transport / guide
  const serviceDate = new Date(`${DEPARTURE_START}T12:00:00Z`);
  await db.insert(bookingServiceRequests).values([
    { bookingId: booking.id, serviceType: "hotel", supplierUserId: SUPPLIER_USERS[0].id, serviceDate, location: "Jerusalem", quantity: 10, paxCount: PAX, agreedRate: "200", currency: "USD", status: "confirmed", notesForSupplier: "10 double rooms x 7 nights, group TEST-BKG-001", supplierResponse: "Confirmed, rooms blocked.", respondedAt: new Date(), createdBy: "user-operations_manager-1" },
    { bookingId: booking.id, serviceType: "transport", supplierUserId: SUPPLIER_USERS[3].id, serviceDate, location: "Tel Aviv (TLV pickup)", quantity: 1, paxCount: PAX, agreedRate: "6000", currency: "USD", status: "sent", notesForSupplier: "50-seat coach, full 8-day program", createdBy: "user-operations_manager-1" },
    { bookingId: booking.id, serviceType: "guide", supplierUserId: SUPPLIER_USERS[4].id, serviceDate, location: "Israel, full tour", quantity: 8, paxCount: PAX, agreedRate: "500", currency: "USD", status: "confirmed", notesForSupplier: "English-speaking licensed guide, 8 days", supplierResponse: "Guide assigned: TEST Avi.", respondedAt: new Date(), createdBy: "user-operations_manager-1" },
  ]);
  r.created += 3;
  // Payment schedule 20/30/30/20 of the booking total, due before departure.
  const pct = [["Deposit", 20, "2026-08-15"], ["Second Payment", 30, "2026-09-01"], ["Third Payment", 30, "2026-09-20"], ["Final Payment", 20, "2026-10-05"]] as const;
  let installment = 1;
  for (const [label, p, due] of pct) {
    const amount = new Decimal(totalPrice).mul(p).div(100).toFixed(2);
    await db.insert(bookingPaymentSchedules).values({
      bookingId: booking.id, installmentNumber: installment, label, percentage: String(p),
      amount, currency: "USD", dueDate: new Date(`${due}T00:00:00Z`),
      status: installment === 1 ? "paid" : "pending", paidAmount: installment === 1 ? amount : "0",
    });
    installment++; r.created++;
  }
  return { report: r, bookingId: booking.id, totalPrice };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

async function validate(quoteSellingDouble: string | null): Promise<ValidationCheck[]> {
  const checks: ValidationCheck[] = [];
  const check = (name: string, expected: string, actual: string) =>
    checks.push({ name, expected, actual, passed: expected === actual });
  const countRows = async (name: string, expectedMin: number, actual: number) =>
    checks.push({ name, expected: `>= ${expectedMin}`, actual: String(actual), passed: actual >= expectedMin });

  check("Hotel Choice 1 double selling price ($/paying passenger)", EXPECTED_DOUBLE_CH1, quoteSellingDouble ?? "missing");
  countRows("test hotels", 3, (await db.select({ id: hotels.id }).from(hotels).where(inArray(hotels.slug, HOTEL_SLUGS))).length);
  countRows("test supplier + client accounts", 7, (await db.select({ id: userProfiles.id }).from(userProfiles).where(inArray(userProfiles.userId, ALL_TEST_USER_IDS))).length);
  countRows("airfare rates (TEST)", 2, (await db.select({ id: airfareRates.id }).from(airfareRates).where(like(airfareRates.airline, "TEST %"))).length);
  countRows("exchange rates (TEST)", 2, (await db.select({ id: exchangeRates.id }).from(exchangeRates).where(eq(exchangeRates.enteredBy, RATE_NOTE_TAG))).length);
  const testTour = await db.select({ id: tours.id }).from(tours).where(eq(tours.slug, TOUR_SLUG));
  countRows("test tour", 1, testTour.length);
  const drTour = await db.select({ id: tours.id }).from(tours).where(eq(tours.slug, DR_TOUR_SLUG));
  countRows("DR test tour", 1, drTour.length);
  if (drTour.length) {
    countRows("DR departures", 3, (await db.select({ id: tourDepartures.id }).from(tourDepartures).where(eq(tourDepartures.tourId, drTour[0].id))).length);
    countRows("DR tour days", 5, (await db.select({ id: tourDays.id }).from(tourDays).where(eq(tourDays.tourId, drTour[0].id))).length);
  }
  if (testTour.length) {
    countRows("tour days", 8, (await db.select({ id: tourDays.id }).from(tourDays).where(eq(tourDays.tourId, testTour[0].id))).length);
    countRows("quotes on test tour", 1, (await db.select({ id: pricingQuotes.id }).from(pricingQuotes).where(eq(pricingQuotes.tourId, testTour[0].id))).length);
  }
  const bkg = await db.select().from(bookings).where(eq(bookings.bookingCode, BOOKING_CODE));
  countRows("test booking", 1, bkg.length);
  if (bkg.length) {
    countRows("service requests", 3, (await db.select({ id: bookingServiceRequests.id }).from(bookingServiceRequests).where(eq(bookingServiceRequests.bookingId, bkg[0].id))).length);
    const sched = await db.select().from(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.bookingId, bkg[0].id));
    countRows("payment installments", 4, sched.length);
    const sum = sched.reduce((a, s) => a.plus(s.amount), new Decimal(0));
    check("payment schedule sums to booking total", new Decimal(bkg[0].totalPrice ?? 0).toFixed(2), sum.toFixed(2));
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runTestSeed(startedBy: string | null): Promise<SeedReport> {
  const blocked = testSeedBlockedReason();
  if (blocked) throw Object.assign(new Error(blocked), { statusCode: 403 });

  const [run] = await db.insert(seedRuns).values({ action: "full_seed", status: "running", startedBy }).returning();
  try {
    await resetTestData();
    const phases: PhaseReport[] = [];
    const m = await phaseMasterData(); phases.push(m);
    phases.push(await phaseUsers());
    const cityIds = (phaseMasterData as any).cityIds as Record<string, string>;
    const cat = await phaseCatalog(cityIds); phases.push(cat.report);
    const t = await phaseTour(cat.hotelIds); phases.push(t.report);
    phases.push(await phaseDrScenario());
    const q = await phaseQuote(t.tourId, t.departureId, t.ruleId); phases.push(q.report);
    const b = await phaseBooking(t.tourId, t.departureId, q.sellingDoubleCh1); phases.push(b.report);
    const validation = await validate(q.sellingDoubleCh1);
    const report: SeedReport = {
      environmentLabel: "TOUROPS TEST ENVIRONMENT",
      phases, validation,
      passed: validation.every(v => v.passed),
      accounts: [
        ...SUPPLIER_USERS.map(s => ({ username: s.username, password: "password123", role: s.role, note: s.company })),
        ...CLIENT_USERS.map(c => ({ username: c.username, password: "password123", role: `customer (${c.accountType})` })),
      ],
    };
    await db.update(seedRuns).set({ status: report.passed ? "completed" : "failed", report, finishedAt: new Date(), error: report.passed ? null : "One or more validation checks failed" }).where(eq(seedRuns.id, run.id));
    return report;
  } catch (e: any) {
    await db.update(seedRuns).set({ status: "failed", error: e?.message ?? String(e), finishedAt: new Date() }).where(eq(seedRuns.id, run.id));
    throw e;
  }
}

export async function runValidationOnly(): Promise<ValidationCheck[]> {
  const blocked = testSeedBlockedReason();
  if (blocked) throw Object.assign(new Error(blocked), { statusCode: 403 });
  const testTour = await db.select({ id: tours.id }).from(tours).where(eq(tours.slug, TOUR_SLUG));
  let selling: string | null = null;
  if (testTour.length) {
    const [quote] = await db.select().from(pricingQuotes).where(eq(pricingQuotes.tourId, testTour[0].id));
    if (quote) {
      const items = await db.select().from(pricingQuoteLineItems).where(eq(pricingQuoteLineItems.quoteId, quote.id));
      const li = items.find(i => i.hotelChoice === 1 && i.occupancy === "double");
      if (li) selling = new Decimal(li.sellingPrice).toFixed(0);
    }
  }
  return validate(selling);
}

export async function latestSeedRun() {
  const [run] = await db.select().from(seedRuns).orderBy(sql`${seedRuns.startedAt} DESC`).limit(1);
  return run ?? null;
}
