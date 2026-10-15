/**
 * Rate-driven costing (pricing spec, Phase "rate-driven costing").
 *
 * Resolves a tour's day items (transport / guide / sight / hotel references)
 * against the supplier rate-card tables and produces the inputs the pricing
 * engine (`computeQuote`) needs, plus warnings for anything it could not
 * price. Money stays as decimal strings end to end.
 *
 * Resolution rules (MVP, mirrors the legacy sum-of-item-costs semantics
 * while preferring structured rate data when it exists):
 * - transport: sum of non-optional `transport` item costs (group cost) ÷ pax.
 * - guide: sum of non-optional `guide` item costs; items with a `guideId`
 *   and zero cost fall back to the linked guide_rates.price (per day).
 * - sights: per sight item — structured ticket costs from `sights`
 *   (individual per person + group ÷ pax) when linked, else item cost ÷ pax.
 * - hotels: up to 3 distinct hotels in day order; nightly room rate from an
 *   active, date-valid `hotel_rates` row matched by hotel name (falls back
 *   to hotels.basePrice). Occupancy derivation from a per-room rate:
 *   double = rate/2, single = rate, third_person = rate/3.
 * - airfare: newest active date-valid `airfare_rates` row for origin →
 *   destination when both are provided.
 */
import Decimal from "decimal.js";
import { and, desc, eq, inArray, isNull, lte, gte, or } from "drizzle-orm";
import {
  tours, tourDays, tourDayItems, sights, hotels as hotelsTable,
  hotelRates, guideRates, airfareRates, exchangeRates, pricingSeasons,
  countries as countriesTable,
} from "@workspace/db";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

type Db = any; // drizzle instance (matches routes.ts usage)

export interface ResolveInput {
  tourId: string;
  paxCount: number;
  departureDate?: string; // ISO date for rate validity checks
  origin?: string;        // airfare origin (city or code)
  destination?: string;   // airfare destination
  currency?: string;      // quote currency (default USD); rates in other currencies are skipped
}

export interface ResolvedHotel {
  hotelChoice: number;
  hotelId?: string;
  hotelName?: string;
  nights: number;
  nightlyRates: Partial<Record<"matrimonial" | "double" | "single" | "third_person" | "child" | "infant", string>>;
  source: string; // "hotel_rates:<id>" | "hotels.basePrice" | "unavailable"
}

export interface ResolveResult {
  components: {
    transportationShare: string;
    guideDriverShare: string;
    sightseeingShare: string;
    airfarePerPerson: string;
    /** Occupancy-specific airfare (child/infant fares) when on file. */
    airfareByOccupancy?: Partial<Record<"child" | "infant", string>>;
  };
  nights: number;
  hotels: ResolvedHotel[];
  warnings: string[];
  meta: Record<string, unknown>;
}

const D = (v: string | number | null | undefined) => new Decimal(v == null || v === "" ? 0 : v);
const money = (d: Decimal) => d.toFixed(2);

type SeasonWindow = { startDate: string; endDate: string } | null;

const toDateStr = (v: any): string | null => {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};

/**
 * Re-rank rate-card rows so season-specific cards sort ahead of year-round
 * defaults when a season is matched. A rate is "season-specific" when its
 * validity window is fully contained within the matched season's window
 * (validFrom >= season.startDate AND validTo <= season.endDate). Only cards
 * with BOTH bounds set qualify — null-bounded (year-round) cards are general
 * defaults and sort last. Within each tier, the original order is preserved.
 * The caller's dateValid() check gates which card is actually used; this only
 * adjusts preference order among already-loaded candidates.
 *
 * Exported for unit tests.
 */
export function sortBySeasonWindow<T extends { validFrom?: any; validTo?: any }>(
  rows: T[],
  season: SeasonWindow,
): T[] {
  if (!season) return rows;
  const { startDate: ss, endDate: se } = season;
  const specific: T[] = [];
  const general: T[] = [];
  for (const r of rows) {
    const rf = toDateStr(r.validFrom);
    const rt = toDateStr(r.validTo);
    const isSpecific = rf !== null && rt !== null && rf >= ss && rt <= se;
    (isSpecific ? specific : general).push(r);
  }
  return [...specific, ...general];
}

/** Text rate-card dates are free-form; compare only when both parse. */
function dateValid(validFrom: string | null, validTo: string | null, onDate?: string): boolean {
  if (!onDate) return true;
  const on = Date.parse(onDate);
  if (Number.isNaN(on)) return true;
  if (validFrom) { const f = Date.parse(validFrom); if (!Number.isNaN(f) && on < f) return false; }
  if (validTo) { const t = Date.parse(validTo); if (!Number.isNaN(t) && on > t) return false; }
  return true;
}

/** Derive per-person nightly occupancy rates from a per-room nightly rate. */
export function occupanciesFromRoomRate(roomRate: string): ResolvedHotel["nightlyRates"] {
  const r = D(roomRate);
  return {
    double: money(r.div(2)),
    single: money(r),
    third_person: money(r.div(3)),
  };
}

export async function resolveTourComponents(db: Db, input: ResolveInput): Promise<ResolveResult> {
  const warnings: string[] = [];
  const meta: Record<string, unknown> = { resolvedAt: new Date().toISOString(), input };
  const pax = new Decimal(input.paxCount);
  const quoteCurrency = (input.currency ?? "USD").toUpperCase();
  const sameCurrency = (c: string | null | undefined) => (c ?? "USD").toUpperCase() === quoteCurrency;
  // Without a departure date, expired-but-still-active rate cards would be
  // treated as valid. Default validity checks to today.
  const onDate = input.departureDate ?? new Date().toISOString().slice(0, 10);
  if (!input.departureDate) meta.validityDate = onDate;

  // ---- Currency conversion (manual exchange_rates table) ----
  // Costs in another currency convert into the quote currency using the
  // newest active, date-valid rate; without a rate they are skipped with a
  // warning (never summed cross-currency). Every conversion used is frozen
  // into meta.fx so approved quotes never silently re-convert.
  const fxRows: any[] = await db.select().from(exchangeRates)
    .where(eq(exchangeRates.isActive, true))
    .orderBy(desc(exchangeRates.createdAt));
  const dep = new Date(onDate);
  const fxValid = (r: any) => (!r.validFrom || r.validFrom <= dep) && (!r.validTo || r.validTo >= dep);
  const fxRate = (from: string): { rate: Decimal; id: string; inverse: boolean } | null => {
    const direct = fxRows.find((r) => fxValid(r) && r.sourceCurrency === from && r.targetCurrency === quoteCurrency);
    if (direct) return { rate: D(direct.rate), id: direct.id, inverse: false };
    const inverse = fxRows.find((r) => fxValid(r) && r.sourceCurrency === quoteCurrency && r.targetCurrency === from && !D(r.rate).isZero());
    if (inverse) return { rate: new Decimal(1).div(D(inverse.rate)), id: inverse.id, inverse: true };
    return null;
  };
  const fxUsed: Record<string, { rate: string; exchangeRateId: string; inverse: boolean }> = {};
  /**
   * Convert an amount to the quote currency. Returns null (caller skips +
   * warns) when the currency differs and no exchange rate is on file.
   */
  const toQuote = (amount: Decimal, currency: string | null | undefined): Decimal | null => {
    const from = (currency ?? "USD").toUpperCase();
    if (from === quoteCurrency) return amount;
    const fx = fxRate(from);
    if (!fx) return null;
    fxUsed[from] = { rate: fx.rate.toFixed(8), exchangeRateId: fx.id, inverse: fx.inverse };
    return amount.mul(fx.rate);
  };
  const fxAvailable = (currency: string | null | undefined) =>
    sameCurrency(currency) || fxRate((currency ?? "USD").toUpperCase()) !== null;

  // Load the tour first so its countries array can scope season resolution.
  const [tour] = await db.select().from(tours).where(eq(tours.id, input.tourId));
  if (!tour) throw Object.assign(new Error("Tour not found"), { statusCode: 404 });

  // ---- Season resolution ----
  // Candidates: active seasons whose date window contains the departure date,
  // filtered to (a) global seasons (destinationId IS NULL) or (b) seasons
  // whose destinationId matches one of the tour's countries. This prevents a
  // high-priority season for Jordan from winning on an Israel-only tour.
  // Among candidates, the highest priority number wins; ties broken by newest
  // createdAt. Records the matched season in meta.season.
  let matchedSeason: { id: string; name: string; priority: number; startDate: string; endDate: string } | null = null;
  {
    // tours.countries stores country names (e.g. "Israel"), not UUIDs.
    // Resolve them to countries.id before filtering seasons, so destination_id
    // comparisons are against the same type that the CRUD API stores.
    const tourCountryNames: string[] = Array.isArray(tour.countries) ? tour.countries.filter(Boolean) : [];
    let tourCountryIds: string[] = [];
    if (tourCountryNames.length > 0) {
      const countryRows: any[] = await db.select({ id: countriesTable.id })
        .from(countriesTable)
        .where(inArray(countriesTable.name, tourCountryNames));
      tourCountryIds = countryRows.map((r: any) => r.id);
    }
    const destinationFilter = tourCountryIds.length > 0
      ? or(isNull(pricingSeasons.destinationId), inArray(pricingSeasons.destinationId, tourCountryIds))
      : isNull(pricingSeasons.destinationId); // tour has no resolved country IDs → only global seasons apply
    const allSeasons: any[] = await db.select().from(pricingSeasons)
      .where(and(
        eq(pricingSeasons.isActive, true),
        lte(pricingSeasons.startDate, onDate),
        gte(pricingSeasons.endDate, onDate),
        destinationFilter,
      ))
      .orderBy(desc(pricingSeasons.priority));
    if (allSeasons.length > 0) {
      const s = allSeasons[0];
      matchedSeason = { id: s.id, name: s.name, priority: s.priority, startDate: s.startDate, endDate: s.endDate };
      meta.season = { id: s.id, name: s.name, priority: s.priority, startDate: s.startDate, endDate: s.endDate };
    } else {
      warnings.push(`No pricing season matches the departure date ${onDate}; using base rates.`);
      meta.season = null;
    }
  }

  const seasonSort = <T extends { validFrom?: any; validTo?: any }>(rows: T[]) =>
    sortBySeasonWindow(rows, matchedSeason);

  const days = await db.select().from(tourDays).where(eq(tourDays.tourId, input.tourId));
  const dayIds = days.map((d: any) => d.id);
  const items: any[] = dayIds.length
    ? await db.select().from(tourDayItems).where(inArray(tourDayItems.tourDayId, dayIds))
    : [];
  const included = items.filter((i) => !i.isOptional);
  const dayNumberById = new Map<string, number>(days.map((d: any) => [d.id, d.dayNumber]));
  const orderOf = (i: any) => (dayNumberById.get(i.tourDayId) ?? 0) * 1000 + (i.sortOrder ?? 0);

  // ---- Transportation ----
  const transportItems = included.filter((i) => i.itemType === "transport");
  let transportTotal = new Decimal(0);
  for (const item of transportItems) {
    if (D(item.cost).isZero()) continue;
    const converted = toQuote(D(item.cost), item.currency);
    if (converted === null) {
      warnings.push(`Transport item "${item.title}" is in ${item.currency}, not ${quoteCurrency}, and no exchange rate is on file; skipped.`);
      continue;
    }
    transportTotal = transportTotal.plus(converted);
  }
  if (!transportItems.length) warnings.push("No transport items on this tour; transportation share is 0.");
  const transportationShare = money(transportTotal.div(pax));
  meta.transport = { items: transportItems.length, groupTotal: money(transportTotal) };

  // ---- Guide / driver ----
  const guideItems = included.filter((i) => i.itemType === "guide");
  let guideTotal = new Decimal(0);
  const guideSources: string[] = [];
  const guideRateIds = guideItems.filter((i) => i.guideId && D(i.cost).isZero()).map((i) => i.guideId);
  const linkedRates: any[] = guideRateIds.length
    ? await db.select().from(guideRates).where(inArray(guideRates.id, guideRateIds))
    : [];
  const rateById = new Map(linkedRates.map((r) => [r.id, r]));
  for (const item of guideItems) {
    const own = D(item.cost);
    if (!own.isZero()) {
      const converted = toQuote(own, item.currency);
      if (converted === null) {
        warnings.push(`Guide item "${item.title}" is in ${item.currency}, not ${quoteCurrency}, and no exchange rate is on file; skipped.`);
        continue;
      }
      guideTotal = guideTotal.plus(converted); guideSources.push(`item:${item.id}`); continue;
    }
    const rate = item.guideId ? rateById.get(item.guideId) : undefined;
    if (rate && rate.status === "active" && dateValid(rate.validFrom, rate.validTo, onDate)) {
      const converted = toQuote(D(rate.price), rate.currency);
      if (converted === null) {
        warnings.push(`Guide rate for "${item.title}" is in ${rate.currency}, not ${quoteCurrency}, and no exchange rate is on file; skipped.`);
        continue;
      }
      guideTotal = guideTotal.plus(converted); // rateUnit is per-day by convention; 1 unit per item day
      guideSources.push(`guide_rates:${rate.id}`);
    } else {
      warnings.push(`Guide item "${item.title}" has no cost and no active date-valid guide rate.`);
    }
  }
  if (!guideItems.length) warnings.push("No guide items on this tour; guide/driver share is 0.");
  const guideDriverShare = money(guideTotal.div(pax));
  meta.guide = { items: guideItems.length, groupTotal: money(guideTotal), sources: guideSources };

  // ---- Sightseeing ----
  const sightItems = included.filter((i) => i.itemType === "sight");
  const sightIds = sightItems.filter((i) => i.sightId).map((i) => i.sightId);
  const sightRows: any[] = sightIds.length
    ? await db.select().from(sights).where(inArray(sights.id, sightIds))
    : [];
  const sightById = new Map(sightRows.map((s) => [s.id, s]));
  let sightPerPerson = new Decimal(0);
  const sightSources: string[] = [];
  for (const item of sightItems) {
    const sight = item.sightId ? sightById.get(item.sightId) : undefined;
    if (sight && sight.ticketRequired && !sight.isFree && !fxAvailable(sight.ticketCurrency)) {
      warnings.push(`Sight "${item.title}" tickets are in ${sight.ticketCurrency}, not ${quoteCurrency}, and no exchange rate is on file; skipped.`);
      continue;
    }
    if (sight && sight.ticketRequired && !sight.isFree) {
      const perPerson = toQuote(
        D(sight.individualTicketCost).plus(D(sight.groupTicketCost).div(pax)),
        sight.ticketCurrency,
      )!;
      sightPerPerson = sightPerPerson.plus(perPerson);
      sightSources.push(`sights:${sight.id}`);
      if (D(sight.individualTicketCost).isZero() && D(sight.groupTicketCost).isZero())
        warnings.push(`Sight "${item.title}" requires tickets but has no ticket costs configured.`);
    } else if (!sight || !sight.isFree) {
      // Unlinked sight items: legacy semantics — item cost is a group cost.
      const converted = D(item.cost).isZero() ? new Decimal(0) : toQuote(D(item.cost), item.currency);
      if (converted === null) {
        warnings.push(`Sight item "${item.title}" is in ${item.currency}, not ${quoteCurrency}, and no exchange rate is on file; skipped.`);
        continue;
      }
      sightPerPerson = sightPerPerson.plus(converted.div(pax));
      if (!sight) sightSources.push(`item:${item.id}`);
    }
  }
  const sightseeingShare = money(sightPerPerson);
  meta.sightseeing = { items: sightItems.length, sources: sightSources };

  // ---- Hotels (up to 3 distinct, in itinerary order) ----
  const hotelItems = included
    .filter((i) => i.itemType === "hotel" && i.hotelId)
    .sort((a, b) => orderOf(a) - orderOf(b));
  const nightsByHotel = new Map<string, number>();
  const hotelOrder: string[] = [];
  for (const item of hotelItems) {
    if (!nightsByHotel.has(item.hotelId)) hotelOrder.push(item.hotelId);
    nightsByHotel.set(item.hotelId, (nightsByHotel.get(item.hotelId) ?? 0) + 1);
  }
  if (hotelOrder.length > 3) {
    warnings.push(`Tour references ${hotelOrder.length} hotels; only the first 3 are priced as choices.`);
    hotelOrder.length = 3;
  }
  const hotelRows: any[] = hotelOrder.length
    ? await db.select().from(hotelsTable).where(inArray(hotelsTable.id, hotelOrder))
    : [];
  const hotelById = new Map(hotelRows.map((h) => [h.id, h]));
  const resolvedHotels: ResolvedHotel[] = [];
  for (let idx = 0; idx < hotelOrder.length; idx++) {
    const hotelId = hotelOrder[idx];
    const hotel = hotelById.get(hotelId);
    const nights = nightsByHotel.get(hotelId) ?? 0;
    if (!hotel) {
      warnings.push(`Hotel item references missing hotel ${hotelId}; skipped.`);
      continue;
    }
    // Preference order for room pricing:
    // 1. Direct per-night room rates registered on the hotel itself
    //    (Matrimonial / Doble / Triple — kept in sync between the admin and
    //    hotel-manager portals since both edit the same hotels row).
    // 2. An active, date-valid hotel_rates card matched by hotel name.
    // 3. The legacy hotels.basePrice.
    const hasDirect = [hotel.roomRateMatrimonial, hotel.roomRateDouble, hotel.roomRateTriple]
      .some((r: any) => r != null && !D(r).isZero());
    if (hasDirect && !fxAvailable(hotel.currency)) {
      warnings.push(`Hotel "${hotel.name}" room rates are in ${hotel.currency}, not ${quoteCurrency}, and no exchange rate is on file; choice unavailable.`);
      continue;
    }
    if (hasDirect) {
      // Per-person raw rates: matrimonial & doble sleep 2, triple sleeps 3.
      // Zero/absent rates mean "room type not offered" — omit, never price 0.
      const pos = (v: any) => v != null && D(v).greaterThan(0);
      const cv = (v: any) => toQuote(D(v), hotel.currency)!;
      const raw: Record<string, Decimal> = {};
      if (pos(hotel.roomRateMatrimonial)) raw.matrimonial = cv(hotel.roomRateMatrimonial).div(2);
      if (pos(hotel.roomRateDouble)) {
        raw.double = cv(hotel.roomRateDouble).div(2);
        raw.single = cv(hotel.roomRateDouble); // sole occupant pays the room
      }
      if (pos(hotel.roomRateTriple)) raw.third_person = cv(hotel.roomRateTriple).div(3);
      resolvedHotels.push({
        hotelChoice: idx + 1, hotelId, hotelName: hotel.name, nights,
        nightlyRates: {}, rawRates: raw,
        source: "hotels.roomRates",
      } as ResolvedHotel & { rawRates: Record<string, Decimal> });
      continue;
    }
    // Match rate cards by name (rate cards store free-text hotel names).
    // Season-aware: season-aligned rate cards (validFrom/validTo overlapping
    // the matched season window) are sorted ahead of year-round defaults so
    // the highest-season-priority rate wins when multiple cards are valid.
    const candidatesRaw: any[] = await db.select().from(hotelRates)
      .where(and(eq(hotelRates.status, "active"), eq(hotelRates.hotelName, hotel.name)))
      .orderBy(desc(hotelRates.createdAt));
    const candidates = seasonSort(candidatesRaw);
    const rate = candidates.find((r) =>
      dateValid(r.validFrom, r.validTo, onDate) &&
      r.pricePerRoomPerNight != null && fxAvailable(r.currency));
    const roomRate = rate ? toQuote(D(rate.pricePerRoomPerNight), rate.currency)
      : (hotel.basePrice != null && fxAvailable(hotel.currency)) ? toQuote(D(hotel.basePrice), hotel.currency)
      : null;
    if (roomRate) {
      if (!rate) warnings.push(`No room rates or rate card for hotel "${hotel.name}"; using its base price.`);
      resolvedHotels.push({
        hotelChoice: idx + 1, hotelId, hotelName: hotel.name, nights,
        nightlyRates: {},
        rawRates: { double: roomRate.div(2), single: roomRate, third_person: roomRate.div(3) },
        source: rate ? `hotel_rates:${rate.id}` : "hotels.basePrice",
      } as ResolvedHotel & { rawRates: Record<string, Decimal> });
    } else {
      warnings.push(`Hotel "${hotel.name}" has no room rates, rate card, or base price; choice unavailable.`);
    }
  }
  if (!resolvedHotels.length) warnings.push("No priceable hotel choices found on this tour.");
  // The engine applies one global nights value; when hotels have different
  // night counts, scale the raw (unrounded) room rate so each hotel's total
  // over the global nights equals its true per-night rate × its own nights.
  // Rounding happens exactly once, here.
  const nights = Math.max(0, ...resolvedHotels.map((h) => h.nights), 0);
  for (const h of resolvedHotels as (ResolvedHotel & { rawRates: Record<string, Decimal> })[]) {
    const scale = nights > 0 && h.nights > 0 && h.nights !== nights
      ? new Decimal(h.nights).div(nights)
      : new Decimal(1);
    for (const [occ, raw] of Object.entries(h.rawRates)) {
      h.nightlyRates[occ as keyof ResolvedHotel["nightlyRates"]] = money(raw.mul(scale));
    }
    delete (h as any).rawRates;
  }
  meta.hotels = resolvedHotels.map((h) => ({ choice: h.hotelChoice, name: h.hotelName, nights: h.nights, source: h.source }));

  // ---- Airfare ----
  let airfarePerPerson = "0.00";
  const airfareByOccupancy: Partial<Record<"child" | "infant", string>> = {};
  if (input.origin && input.destination) {
    // Season-aware: prefer airfare rate cards whose validFrom/validTo window
    // overlaps the matched season before falling back to year-round defaults.
    const faresRaw: any[] = await db.select().from(airfareRates)
      .where(and(eq(airfareRates.isActive, true), eq(airfareRates.origin, input.origin), eq(airfareRates.destination, input.destination)))
      .orderBy(desc(airfareRates.createdAt));
    const fares = seasonSort(faresRaw);
    const fare = fares.find((f) =>
      fxAvailable(f.currency) &&
      (!dep || !f.validFrom || f.validFrom <= dep) && (!dep || !f.validTo || f.validTo >= dep));
    if (fare) {
      airfarePerPerson = money(toQuote(D(fare.ratePerPerson), fare.currency)!);
      // Child/infant fares apply only when explicitly on file — never invented.
      if (fare.childRate != null) airfareByOccupancy.child = money(toQuote(D(fare.childRate), fare.currency)!);
      if (fare.infantRate != null) airfareByOccupancy.infant = money(toQuote(D(fare.infantRate), fare.currency)!);
      meta.airfare = { source: `airfare_rates:${fare.id}`, childRate: airfareByOccupancy.child ?? null, infantRate: airfareByOccupancy.infant ?? null };
    } else {
      warnings.push(`No active date-valid airfare rate for ${input.origin} → ${input.destination}; airfare is 0.`);
    }
  } else {
    warnings.push("No airfare origin/destination provided; airfare is 0.");
  }

  // Children/infants share the parents' room: when a child/infant airfare is
  // on file, emit those occupancies with zero hotel cost so the engine prices
  // them (components + their own airfare). Without a fare on file, omit —
  // never invent a child/infant price.
  for (const h of resolvedHotels) {
    if (airfareByOccupancy.child !== undefined) h.nightlyRates.child ??= "0.00";
    if (airfareByOccupancy.infant !== undefined) h.nightlyRates.infant ??= "0.00";
  }

  if (Object.keys(fxUsed).length) meta.fx = { quoteCurrency, ratesUsed: fxUsed };

  return {
    components: {
      transportationShare, guideDriverShare, sightseeingShare, airfarePerPerson,
      ...(Object.keys(airfareByOccupancy).length ? { airfareByOccupancy } : {}),
    },
    nights,
    hotels: resolvedHotels,
    warnings,
    meta,
  };
}

// ---------------------------------------------------------------------------
// Booking accommodation: total cost of one room of the selected type across
// the whole tour = Σ over the tour's hotels of (that hotel's nightly rate for
// the selected room type × the nights spent at that hotel).
// ---------------------------------------------------------------------------
// Canonical definition lives in services/booking-pricing.ts so the pricing math
// stays free of DB/rate-card imports; imported locally and re-exported here.
import { BOOKING_ROOM_TYPES, type BookingRoomType } from "./booking-pricing";
export { BOOKING_ROOM_TYPES, type BookingRoomType };

const ROOM_TYPE_COLUMN: Record<BookingRoomType, "roomRateMatrimonial" | "roomRateDouble" | "roomRateTriple"> = {
  matrimonial: "roomRateMatrimonial",
  doble: "roomRateDouble",
  triple: "roomRateTriple",
};

export interface AccommodationResult {
  total: string;          // one room of the selected type, whole tour
  nights: number;         // total hotel nights on the tour
  currency: string;
  breakdown: { hotelName: string; nights: number; ratePerNight: string }[];
  warnings: string[];
}

export async function accommodationForTour(db: Db, tourId: string, roomType: BookingRoomType): Promise<AccommodationResult> {
  const warnings: string[] = [];
  const days = await db.select().from(tourDays).where(eq(tourDays.tourId, tourId));
  const dayIds = days.map((d: any) => d.id);
  const items: any[] = dayIds.length
    ? await db.select().from(tourDayItems).where(inArray(tourDayItems.tourDayId, dayIds))
    : [];
  const hotelItems = items.filter((i: any) => i.itemType === "hotel" && i.hotelId);
  const nightsByHotel = new Map<string, number>();
  const order: string[] = [];
  for (const it of hotelItems) {
    if (!nightsByHotel.has(it.hotelId!)) order.push(it.hotelId!);
    nightsByHotel.set(it.hotelId!, (nightsByHotel.get(it.hotelId!) ?? 0) + 1);
  }
  const rows = order.length ? await db.select().from(hotelsTable).where(inArray(hotelsTable.id, order)) : [];
  const byId = new Map(rows.map((h: any) => [h.id, h]));
  let total = new Decimal(0);
  let nights = 0;
  let currency: string | null = null;
  const col = ROOM_TYPE_COLUMN[roomType];
  const breakdown: AccommodationResult["breakdown"] = [];
  for (const hid of order) {
    const hotel: any = byId.get(hid);
    const n = nightsByHotel.get(hid) ?? 0;
    if (!hotel) { warnings.push(`Hotel ${hid} missing; skipped.`); continue; }
    const rate = hotel[col];
    if (rate == null || new Decimal(rate).lessThanOrEqualTo(0)) {
      warnings.push(`Hotel "${hotel.name}" does not offer the ${roomType} room type.`);
      continue;
    }
    // Never sum across currencies — the first priced hotel fixes the currency;
    // mismatched hotels are skipped with a warning (no FX conversion yet).
    const hc = (hotel.currency || "USD").toUpperCase();
    if (currency == null) currency = hc;
    else if (hc !== currency) {
      warnings.push(`Hotel "${hotel.name}" is priced in ${hc}, not ${currency}; skipped (no currency conversion).`);
      continue;
    }
    total = total.plus(new Decimal(rate).mul(n));
    nights += n;
    breakdown.push({ hotelName: hotel.name, nights: n, ratePerNight: money(new Decimal(rate)) });
  }
  if (!breakdown.length) warnings.push(`No hotel on this tour offers the ${roomType} room type; accommodation cost is 0.`);
  return { total: money(total), nights, currency: currency ?? "USD", breakdown, warnings };
}

// True when at least one hotel on the tour has any positive direct room rate —
// i.e. the tour supports room-type selection at booking time.
export async function tourOffersRoomTypes(db: Db, tourId: string): Promise<boolean> {
  const days = await db.select().from(tourDays).where(eq(tourDays.tourId, tourId));
  const dayIds = days.map((d: any) => d.id);
  if (!dayIds.length) return false;
  const items: any[] = await db.select().from(tourDayItems).where(inArray(tourDayItems.tourDayId, dayIds));
  const hotelIds = [...new Set(items.filter((i: any) => i.itemType === "hotel" && i.hotelId).map((i: any) => i.hotelId))];
  if (!hotelIds.length) return false;
  const rows: any[] = await db.select().from(hotelsTable).where(inArray(hotelsTable.id, hotelIds));
  return rows.some((h) => [h.roomRateMatrimonial, h.roomRateDouble, h.roomRateTriple]
    .some((r) => r != null && new Decimal(r).greaterThan(0)));
}
