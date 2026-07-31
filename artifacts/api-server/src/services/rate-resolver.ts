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
import { and, desc, eq, inArray } from "drizzle-orm";
import {
  tours, tourDays, tourDayItems, sights, hotels as hotelsTable,
  hotelRates, guideRates, airfareRates,
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
  nightlyRates: Partial<Record<"double" | "single" | "third_person" | "child", string>>;
  source: string; // "hotel_rates:<id>" | "hotels.basePrice" | "unavailable"
}

export interface ResolveResult {
  components: {
    transportationShare: string;
    guideDriverShare: string;
    sightseeingShare: string;
    airfarePerPerson: string;
  };
  nights: number;
  hotels: ResolvedHotel[];
  warnings: string[];
  meta: Record<string, unknown>;
}

const D = (v: string | number | null | undefined) => new Decimal(v == null || v === "" ? 0 : v);
const money = (d: Decimal) => d.toFixed(2);

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
  // No currency conversion in this phase (locked exchange rates come later):
  // a rate/cost in a different currency than the quote must be skipped, not
  // summed as if it were the quote currency.
  const quoteCurrency = (input.currency ?? "USD").toUpperCase();
  const sameCurrency = (c: string | null | undefined) => (c ?? "USD").toUpperCase() === quoteCurrency;
  // Without a departure date, expired-but-still-active rate cards would be
  // treated as valid. Default validity checks to today.
  const onDate = input.departureDate ?? new Date().toISOString().slice(0, 10);
  if (!input.departureDate) meta.validityDate = onDate;

  const [tour] = await db.select().from(tours).where(eq(tours.id, input.tourId));
  if (!tour) throw Object.assign(new Error("Tour not found"), { statusCode: 404 });

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
    if (!sameCurrency(item.currency)) {
      warnings.push(`Transport item "${item.title}" is in ${item.currency}, not ${quoteCurrency}; skipped.`);
      continue;
    }
    transportTotal = transportTotal.plus(D(item.cost));
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
      if (!sameCurrency(item.currency)) {
        warnings.push(`Guide item "${item.title}" is in ${item.currency}, not ${quoteCurrency}; skipped.`);
        continue;
      }
      guideTotal = guideTotal.plus(own); guideSources.push(`item:${item.id}`); continue;
    }
    const rate = item.guideId ? rateById.get(item.guideId) : undefined;
    if (rate && rate.status === "active" && dateValid(rate.validFrom, rate.validTo, onDate)) {
      if (!sameCurrency(rate.currency)) {
        warnings.push(`Guide rate for "${item.title}" is in ${rate.currency}, not ${quoteCurrency}; skipped.`);
        continue;
      }
      guideTotal = guideTotal.plus(D(rate.price)); // rateUnit is per-day by convention; 1 unit per item day
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
    if (sight && sight.ticketRequired && !sight.isFree && !sameCurrency(sight.ticketCurrency)) {
      warnings.push(`Sight "${item.title}" tickets are in ${sight.ticketCurrency}, not ${quoteCurrency}; skipped.`);
      continue;
    }
    if (sight && sight.ticketRequired && !sight.isFree) {
      sightPerPerson = sightPerPerson
        .plus(D(sight.individualTicketCost))
        .plus(D(sight.groupTicketCost).div(pax));
      sightSources.push(`sights:${sight.id}`);
      if (D(sight.individualTicketCost).isZero() && D(sight.groupTicketCost).isZero())
        warnings.push(`Sight "${item.title}" requires tickets but has no ticket costs configured.`);
    } else if (!sight || !sight.isFree) {
      // Unlinked sight items: legacy semantics — item cost is a group cost.
      if (!D(item.cost).isZero() && !sameCurrency(item.currency)) {
        warnings.push(`Sight item "${item.title}" is in ${item.currency}, not ${quoteCurrency}; skipped.`);
        continue;
      }
      sightPerPerson = sightPerPerson.plus(D(item.cost).div(pax));
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
    // Match rate cards by name (rate cards store free-text hotel names).
    const candidates: any[] = await db.select().from(hotelRates)
      .where(and(eq(hotelRates.status, "active"), eq(hotelRates.hotelName, hotel.name)))
      .orderBy(desc(hotelRates.createdAt));
    const rate = candidates.find((r) =>
      dateValid(r.validFrom, r.validTo, onDate) &&
      r.pricePerRoomPerNight != null && sameCurrency(r.currency));
    if (rate) {
      resolvedHotels.push({
        hotelChoice: idx + 1, hotelId, hotelName: hotel.name, nights,
        nightlyRates: {},
        roomRate: D(rate.pricePerRoomPerNight),
        source: `hotel_rates:${rate.id}`,
      } as ResolvedHotel & { roomRate: Decimal });
    } else if (hotel.basePrice != null && sameCurrency(hotel.currency)) {
      warnings.push(`No active date-valid rate card for hotel "${hotel.name}"; using its base price.`);
      resolvedHotels.push({
        hotelChoice: idx + 1, hotelId, hotelName: hotel.name, nights,
        nightlyRates: {},
        roomRate: D(hotel.basePrice),
        source: "hotels.basePrice",
      } as ResolvedHotel & { roomRate: Decimal });
    } else {
      warnings.push(`Hotel "${hotel.name}" has no rate card and no base price; choice unavailable.`);
    }
  }
  if (!resolvedHotels.length) warnings.push("No priceable hotel choices found on this tour.");
  // The engine applies one global nights value; when hotels have different
  // night counts, scale the raw (unrounded) room rate so each hotel's total
  // over the global nights equals its true per-night rate × its own nights.
  // Rounding happens exactly once, here.
  const nights = Math.max(0, ...resolvedHotels.map((h) => h.nights), 0);
  const OCC_DIVISORS = { double: 2, single: 1, third_person: 3 } as const;
  for (const h of resolvedHotels as (ResolvedHotel & { roomRate: Decimal })[]) {
    const scale = nights > 0 && h.nights > 0 && h.nights !== nights
      ? new Decimal(h.nights).div(nights)
      : new Decimal(1);
    for (const [occ, div] of Object.entries(OCC_DIVISORS) as [keyof typeof OCC_DIVISORS, number][]) {
      h.nightlyRates[occ] = money(h.roomRate.div(div).mul(scale));
    }
    delete (h as any).roomRate;
  }
  meta.hotels = resolvedHotels.map((h) => ({ choice: h.hotelChoice, name: h.hotelName, nights: h.nights, source: h.source }));

  // ---- Airfare ----
  let airfarePerPerson = "0.00";
  if (input.origin && input.destination) {
    const fares: any[] = await db.select().from(airfareRates)
      .where(and(eq(airfareRates.isActive, true), eq(airfareRates.origin, input.origin), eq(airfareRates.destination, input.destination)))
      .orderBy(desc(airfareRates.createdAt));
    const dep = new Date(onDate);
    const fare = fares.find((f) =>
      sameCurrency(f.currency) &&
      (!dep || !f.validFrom || f.validFrom <= dep) && (!dep || !f.validTo || f.validTo >= dep));
    if (fare) {
      airfarePerPerson = money(D(fare.ratePerPerson));
      meta.airfare = { source: `airfare_rates:${fare.id}` };
    } else {
      warnings.push(`No active date-valid airfare rate for ${input.origin} → ${input.destination}; airfare is 0.`);
    }
  } else {
    warnings.push("No airfare origin/destination provided; airfare is 0.");
  }

  return {
    components: { transportationShare, guideDriverShare, sightseeingShare, airfarePerPerson },
    nights,
    hotels: resolvedHotels,
    warnings,
    meta,
  };
}
