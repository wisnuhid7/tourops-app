import { describe, it, expect } from "vitest";
import { computeQuote } from "../../services/pricing-engine";

/**
 * Locks in the staging test-seed pricing scenario:
 * Biblical Israel Highlights (TEST), 15 paying pax, 7 nights.
 *
 * Per-person base (double occupancy, hotel choice 1):
 *   hotel 700  — seeded $200/night double ROOM rate, resolver divides by 2
 *                occupants => $100/person/night x 7 nights
 *   airfare 800 + transport 300 + guide 200 + sights 130 (per-paying-person
 *   shares as the seed's rate-resolver derives them from the group costs)
 *   = 2130 base
 * x 1.20 margin x 4/3 free-passenger adjustment = 3408.00
 * (roundingRule unit_up leaves the already-whole number untouched)
 *
 * This is a math lock for the engine; the seed's own validation phase
 * additionally verifies the same $3,408 end-to-end through the real
 * resolver + database (see test-seed.ts EXPECTED_DOUBLE_CH1).
 */
describe("test-seed staging scenario", () => {
  it("double occupancy in hotel choice 1 sells at exactly $3,408", () => {
    const result = computeQuote({
      paxCount: 15,
      nights: 7,
      components: {
        transportationShare: "300", // 6000 group cost / 20 total pax... derived per-person share
        guideDriverShare: "200",
        sightseeingShare: "130",
        airfarePerPerson: "800",
      },
      hotels: [
        { hotelChoice: 1, nightlyRates: { double: "100" } },
      ],
      rule: {
        marginType: "percentage",
        marginValue: "20",
        freePassengerPaying: 3,
        freePassengerFree: 1,
        roundingRule: "unit_up",
      },
    } as any);

    const line = result.lineItems.find((l) => l.hotelChoice === 1 && l.occupancy === "double")!;
    expect(line.sellingPrice).toBe("3408.00");
  });
});
