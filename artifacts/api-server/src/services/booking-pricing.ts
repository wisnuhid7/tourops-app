/**
 * Booking/preview price math — the single shared implementation.
 *
 * Both `GET /api/tours/:tourId/price-preview` and `POST /api/bookings` must
 * produce the same total: the preview must equal the persisted booking total.
 * This module owns the pure arithmetic ONLY — no database, Express, storage or
 * request objects. Handlers keep their own DB fetches, caching, auth and HTTP
 * status mapping.
 *
 * Money math uses decimal.js (precision 28, ROUND_HALF_UP). The legacy
 * per-person subtotal product (`perPersonPrice * partySize`) is intentionally
 * kept as a JS float so existing response numbers are unchanged; only the
 * accommodation cost and the final grand total are Decimal-derived.
 */
import Decimal from "decimal.js";

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

/**
 * Room types a booking can select. Canonical definition lives here (a leaf
 * module with no DB/rate-card imports) and is re-exported by
 * `services/rate-resolver.ts` so existing importers keep working.
 */
export type BookingRoomType = "matrimonial" | "doble" | "triple";
export const BOOKING_ROOM_TYPES: BookingRoomType[] = ["matrimonial", "doble", "triple"];

/** Rooms required to host one occupancy share of the party. */
export const ROOM_TYPE_OCCUPANCY: Record<BookingRoomType, number> = {
  matrimonial: 2,
  doble: 2,
  triple: 3,
};

export interface PerPersonPriceInput {
  /** A departure's `pricePerPerson`, already fetched (optional). */
  departurePrice?: string | number | null;
  /** `publicTourPricing(tourId).perPersonBase`, if available. */
  publicPerPersonBase?: number | null;
  /** Tour header `basePrice` fallback. */
  tourBasePrice?: string | number | null;
}

/**
 * A departure price is only usable when it is a finite, positive number.
 * Callers use this to decide whether to fall back to public/tour pricing, so a
 * non-finite value ("Infinity", "NaN", "") must fall through rather than
 * short-circuit the fallback fetch and resolve to 0.
 */
export function isUsableDeparturePrice(value: string | number | null | undefined): boolean {
  if (value == null) return false;
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/**
 * Per-person price precedence, identical on both the preview and booking sides:
 *   1. a positive departure price
 *   2. a positive computed public per-person base
 *   3. the tour header base price
 * Invalid/missing values fall through; the final fallback is 0.
 */
export function resolvePerPersonPrice(input: PerPersonPriceInput): number {
  if (isUsableDeparturePrice(input.departurePrice)) return Number(input.departurePrice);

  const publicBase = input.publicPerPersonBase;
  if (publicBase != null && Number.isFinite(publicBase) && publicBase > 0) return publicBase;

  // Preserve legacy shape: non-finite base -> 0, otherwise the raw value.
  const base = Number(input.tourBasePrice);
  return Number.isFinite(base) ? base : 0;
}

export interface AccommodationInput {
  /** One room of the selected type across the whole tour (already fetched). */
  total: string | number;
  currency: string;
}

export interface BookingPriceMathInput {
  perPersonPrice: number;
  partySize: number;
  /** Currency the booking is denominated in. */
  bookingCurrency: string;
  roomType?: BookingRoomType | null;
  /** Selected room type's accommodation, or null when no room type is chosen. */
  accommodation?: AccommodationInput | null;
}

export interface BookingPriceMathResult {
  /** Legacy numeric product (JS float), preserved for response compatibility. */
  perPersonSubtotal: number;
  roomsNeeded: number;
  /** Exact two-decimal accommodation cost — never rounded to whole units. */
  accommodationCost: Decimal;
  currencyMismatch: boolean;
  /** Final whole-currency-unit total (ROUND_HALF_UP). */
  grandTotal: Decimal;
}

/** Whole rooms needed for a party at the given room type (minimum one). */
export function roomsNeededFor(partySize: number, roomType: BookingRoomType): number {
  return Math.max(1, Math.ceil(partySize / ROOM_TYPE_OCCUPANCY[roomType]));
}

/**
 * Shared booking/preview math. Accommodation is summed at exactly two decimals
 * (no intermediate whole-unit rounding); the grand total is rounded once, at the
 * end, to a whole currency unit with ROUND_HALF_UP.
 */
export function calculateBookingPrice(input: BookingPriceMathInput): BookingPriceMathResult {
  const perPersonSubtotal = input.perPersonPrice * input.partySize;
  const bookingCurrency = input.bookingCurrency.toUpperCase();

  let roomsNeeded = 0;
  let accommodationCost = new Decimal(0);
  let currencyMismatch = false;

  const roomType = input.roomType ?? null;
  const validRoomType = roomType !== null && BOOKING_ROOM_TYPES.includes(roomType);
  if (validRoomType && input.accommodation) {
    const accTotal = new Decimal(input.accommodation.total);
    if (accTotal.greaterThan(0)) {
      if (input.accommodation.currency.toUpperCase() !== bookingCurrency) {
        // No FX conversion: exclude the mismatched accommodation and flag it.
        currencyMismatch = true;
      } else {
        roomsNeeded = roomsNeededFor(input.partySize, roomType);
        accommodationCost = accTotal.mul(roomsNeeded).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      }
    }
  }

  const grandTotal = new Decimal(perPersonSubtotal)
    .plus(accommodationCost)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

  return { perPersonSubtotal, roomsNeeded, accommodationCost, currencyMismatch, grandTotal };
}
