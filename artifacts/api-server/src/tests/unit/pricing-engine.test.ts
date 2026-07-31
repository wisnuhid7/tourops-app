import { describe, it, expect } from "vitest";
import {
  computeQuote,
  assistanceTypeForPax,
  freeAdjustmentFactor,
  applyMargin,
  PricingInputError,
} from "../../services/pricing-engine";
import Decimal from "decimal.js";

const baseRule = {
  marginType: "percentage" as const,
  marginValue: "20",
  freePassengerPaying: 3,
  freePassengerFree: 1,
};

const components = {
  transportationShare: "50",
  guideDriverShare: "30",
  sightseeingShare: "20",
  airfarePerPerson: "300",
};

describe("assistance rules", () => {
  it("assigns driver-chaperone for 1-15 pax", () => {
    expect(assistanceTypeForPax(1)).toBe("driver_chaperone");
    expect(assistanceTypeForPax(15)).toBe("driver_chaperone");
  });
  it("assigns professional guide for 16+ pax", () => {
    expect(assistanceTypeForPax(16)).toBe("professional_guide");
    expect(assistanceTypeForPax(55)).toBe("professional_guide");
  });
});

describe("free-passenger adjustment", () => {
  it("1 free per 3 paying = 4/3", () => {
    expect(freeAdjustmentFactor(baseRule).toFixed(6)).toBe("1.333333");
  });
  it("0 free = factor 1", () => {
    expect(freeAdjustmentFactor({ ...baseRule, freePassengerFree: 0 }).toNumber()).toBe(1);
  });
  it("rejects paying < 1", () => {
    expect(() => freeAdjustmentFactor({ ...baseRule, freePassengerPaying: 0 })).toThrow(PricingInputError);
  });
});

describe("margin", () => {
  it("percentage: base * 1.20", () => {
    expect(applyMargin(new Decimal(100), baseRule).toFixed(2)).toBe("120.00");
  });
  it("fixed: base + amount", () => {
    expect(applyMargin(new Decimal(100), { ...baseRule, marginType: "fixed", marginValue: "35.50" }).toFixed(2)).toBe("135.50");
  });
});

describe("computeQuote — 3-step order", () => {
  it("computes exact decimal result: (400 + 7*100) * 1.2 * 4/3", () => {
    const result = computeQuote({
      paxCount: 10,
      nights: 7,
      components,
      hotels: [{ hotelChoice: 1, hotelName: "Hotel A", nightlyRates: { double: "100" } }],
      rule: baseRule,
    });
    const li = result.lineItems[0];
    // Step 1: 50+30+20+300 + 700 = 1100
    expect(li.baseCost).toBe("1100.00");
    // Step 2: 1100 * 0.2 = 220
    expect(li.marginAmount).toBe("220.00");
    // Step 3: 1320 * 4/3 = 1760 (exact — no float drift)
    expect(li.sellingPrice).toBe("1760.00");
    expect(li.freeAdjustmentAmount).toBe("440.00");
    expect(result.assistanceType).toBe("driver_chaperone");
    expect(result.baseCostPerPerson).toBe("400.00");
    expect(result.totalGroupCost).toBe("11000.00");
    expect(result.freeAdjustmentFactor).toBe("1.333333");
  });

  it("avoids floating point drift (0.1 + 0.2 class inputs)", () => {
    const result = computeQuote({
      paxCount: 4,
      nights: 1,
      components: { transportationShare: "0.10", guideDriverShare: "0.20", sightseeingShare: "0", airfarePerPerson: "0" },
      hotels: [{ hotelChoice: 1, nightlyRates: { double: "0" } }],
      rule: { ...baseRule, marginValue: "0", freePassengerFree: 0 },
    });
    expect(result.lineItems[0].sellingPrice).toBe("0.30"); // not 0.30000000000000004
  });

  it("produces rows for up to 3 hotels x 4 occupancies", () => {
    const rates = { double: "100", single: "180", third_person: "80", child: "50" };
    const result = computeQuote({
      paxCount: 20,
      nights: 5,
      components,
      hotels: [1, 2, 3].map((n) => ({ hotelChoice: n, hotelName: `H${n}`, nightlyRates: rates })),
      rule: baseRule,
    });
    expect(result.lineItems).toHaveLength(12);
    expect(result.assistanceType).toBe("professional_guide");
    // single occupancy costs more than double
    const h1 = result.lineItems.filter((l) => l.hotelChoice === 1);
    const dbl = h1.find((l) => l.occupancy === "double")!;
    const sgl = h1.find((l) => l.occupancy === "single")!;
    expect(parseFloat(sgl.sellingPrice)).toBeGreaterThan(parseFloat(dbl.sellingPrice));
  });

  it("rejects invalid inputs", () => {
    const ok = {
      paxCount: 10, nights: 2, components,
      hotels: [{ hotelChoice: 1, nightlyRates: { double: "100" } }],
      rule: baseRule,
    };
    expect(() => computeQuote({ ...ok, paxCount: 0 })).toThrow(PricingInputError);
    expect(() => computeQuote({ ...ok, hotels: [] })).toThrow(PricingInputError);
    expect(() => computeQuote({ ...ok, hotels: [{ hotelChoice: 4, nightlyRates: { double: "1" } }] })).toThrow(PricingInputError);
    expect(() => computeQuote({
      ...ok,
      hotels: [{ hotelChoice: 1, nightlyRates: { double: "1" } }, { hotelChoice: 1, nightlyRates: { double: "2" } }],
    })).toThrow(PricingInputError);
    expect(() => computeQuote({
      ...ok,
      components: { ...components, transportationShare: "12abc" },
    })).toThrow(PricingInputError);
  });
});
