import { describe, it, expect } from "vitest";
import {
  calculateBookingPrice,
  resolvePerPersonPrice,
  isUsableDeparturePrice,
  roomsNeededFor,
  ROOM_TYPE_OCCUPANCY,
} from "../../services/booking-pricing";

describe("isUsableDeparturePrice", () => {
  it("accepts finite positive numbers and numeric strings", () => {
    expect(isUsableDeparturePrice(120)).toBe(true);
    expect(isUsableDeparturePrice("120.50")).toBe(true);
  });

  it("rejects null/undefined/empty", () => {
    expect(isUsableDeparturePrice(null)).toBe(false);
    expect(isUsableDeparturePrice(undefined)).toBe(false);
    expect(isUsableDeparturePrice("")).toBe(false);
  });

  it("rejects zero and negatives", () => {
    expect(isUsableDeparturePrice(0)).toBe(false);
    expect(isUsableDeparturePrice("0")).toBe(false);
    expect(isUsableDeparturePrice("-5")).toBe(false);
  });

  it("rejects non-finite values so callers fall back instead of resolving to 0", () => {
    expect(isUsableDeparturePrice("Infinity")).toBe(false);
    expect(isUsableDeparturePrice(Infinity)).toBe(false);
    expect(isUsableDeparturePrice("NaN")).toBe(false);
    expect(isUsableDeparturePrice("abc")).toBe(false);
  });
});

describe("resolvePerPersonPrice precedence", () => {
  it("prefers a positive departure price above everything else", () => {
    expect(
      resolvePerPersonPrice({ departurePrice: "120", publicPerPersonBase: 200, tourBasePrice: 300 }),
    ).toBe(120);
  });

  it("falls back to the public per-person base when departure is missing/invalid", () => {
    expect(resolvePerPersonPrice({ publicPerPersonBase: 200, tourBasePrice: 300 })).toBe(200);
    expect(resolvePerPersonPrice({ departurePrice: "0", publicPerPersonBase: 200 })).toBe(200);
    expect(resolvePerPersonPrice({ departurePrice: "abc", publicPerPersonBase: 200 })).toBe(200);
  });

  it("falls back to the tour base price last", () => {
    expect(resolvePerPersonPrice({ tourBasePrice: "300" })).toBe(300);
    expect(resolvePerPersonPrice({ publicPerPersonBase: 0, tourBasePrice: 300 })).toBe(300);
    expect(resolvePerPersonPrice({ publicPerPersonBase: -5, tourBasePrice: 300 })).toBe(300);
  });

  it("returns 0 when nothing valid is available", () => {
    expect(resolvePerPersonPrice({})).toBe(0);
    expect(resolvePerPersonPrice({ tourBasePrice: null })).toBe(0);
    expect(resolvePerPersonPrice({ tourBasePrice: "not-a-number" })).toBe(0);
  });
});

describe("roomsNeededFor", () => {
  it("uses the per-room occupancy for the room type", () => {
    expect(ROOM_TYPE_OCCUPANCY.matrimonial).toBe(2);
    expect(ROOM_TYPE_OCCUPANCY.doble).toBe(2);
    expect(ROOM_TYPE_OCCUPANCY.triple).toBe(3);
  });

  it("rounds the party up to whole rooms (minimum one)", () => {
    expect(roomsNeededFor(1, "doble")).toBe(1);
    expect(roomsNeededFor(2, "doble")).toBe(1);
    expect(roomsNeededFor(3, "doble")).toBe(2);
    expect(roomsNeededFor(6, "doble")).toBe(3);
    expect(roomsNeededFor(7, "doble")).toBe(4);
    expect(roomsNeededFor(3, "triple")).toBe(1);
    expect(roomsNeededFor(4, "triple")).toBe(2);
  });
});

describe("calculateBookingPrice", () => {
  it("with no room type, totals the per-person subtotal rounded to a whole unit", () => {
    const math = calculateBookingPrice({ perPersonPrice: 100, partySize: 3, bookingCurrency: "USD" });
    expect(math.perPersonSubtotal).toBe(300);
    expect(math.roomsNeeded).toBe(0);
    expect(math.accommodationCost.toNumber()).toBe(0);
    expect(math.currencyMismatch).toBe(false);
    expect(math.grandTotal.toNumber()).toBe(300);
  });

  it("adds accommodation for the rooms the party needs (matching currency)", () => {
    const math = calculateBookingPrice({
      perPersonPrice: 100,
      partySize: 7, // doble -> ceil(7/2) = 4 rooms
      bookingCurrency: "USD",
      roomType: "doble",
      accommodation: { total: "25.10", currency: "USD" },
    });
    expect(math.roomsNeeded).toBe(4);
    // Exact two decimals — never rounded to whole units.
    expect(math.accommodationCost.toFixed(2)).toBe("100.40");
    expect(math.grandTotal.toNumber()).toBe(800); // round(700 + 100.4)
  });

  it("regression: does NOT round accommodation to whole units before summing", () => {
    const math = calculateBookingPrice({
      perPersonPrice: 100.1,
      partySize: 4,
      bookingCurrency: "USD",
      roomType: "triple", // ceil(4/3) = 2 rooms
      accommodation: { total: "50.20", currency: "USD" },
    });
    expect(math.accommodationCost.toFixed(2)).toBe("100.40");
    // Shared path: round(400.4 + 100.4) = 501.
    expect(math.grandTotal.toNumber()).toBe(501);
    // The old preview rounded accommodation to 100 first: round(400.4 + 100) = 500.
    expect(math.grandTotal.toNumber()).not.toBe(500);
  });

  it("flags a currency mismatch and excludes the accommodation", () => {
    const math = calculateBookingPrice({
      perPersonPrice: 100,
      partySize: 2,
      bookingCurrency: "USD",
      roomType: "doble",
      accommodation: { total: "25.10", currency: "EUR" },
    });
    expect(math.currencyMismatch).toBe(true);
    expect(math.roomsNeeded).toBe(0);
    expect(math.accommodationCost.toNumber()).toBe(0);
    expect(math.grandTotal.toNumber()).toBe(200);
  });

  it("ignores zero accommodation and unknown room types", () => {
    const zero = calculateBookingPrice({
      perPersonPrice: 100,
      partySize: 2,
      bookingCurrency: "USD",
      roomType: "doble",
      accommodation: { total: "0.00", currency: "USD" },
    });
    expect(zero.roomsNeeded).toBe(0);
    expect(zero.accommodationCost.toNumber()).toBe(0);
    expect(zero.grandTotal.toNumber()).toBe(200);

    const unknown = calculateBookingPrice({
      perPersonPrice: 100,
      partySize: 2,
      bookingCurrency: "USD",
      // deliberately not a BookingRoomType value
      roomType: "suite" as never,
      accommodation: { total: "25.10", currency: "USD" },
    });
    expect(unknown.roomsNeeded).toBe(0);
    expect(unknown.grandTotal.toNumber()).toBe(200);
  });

  it("rounds the final total half-up to a whole currency unit", () => {
    const math = calculateBookingPrice({ perPersonPrice: 100.5, partySize: 1, bookingCurrency: "usd" });
    expect(math.grandTotal.toNumber()).toBe(101); // 100.5 -> 101
  });
});
