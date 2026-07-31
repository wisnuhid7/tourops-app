/**
 * TourPricingEngine — centralized group-tour pricing (Phase 1 & 2).
 *
 * All money math uses decimal.js (never JS floats). Numeric inputs/outputs
 * are decimal strings, matching the PostgreSQL `numeric` columns.
 *
 * Calculation order per person, per hotel choice, per occupancy:
 *   Step 1: Base Cost = transportation share + guide/driver share
 *                     + sightseeing share + (hotel nightly rate × nights)
 *                     + airfare
 *   Step 2: Add company profit margin (fixed amount or percentage)
 *   Step 3: Apply free-passenger adjustment (1 free per 3 paying → ×4/3)
 */
import Decimal from "decimal.js";

// Money math: enough precision for intermediate factors like 4/3.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type AssistanceType = "driver_chaperone" | "professional_guide";
export type MarginType = "fixed" | "percentage";
export type OccupancyType = "double" | "single" | "third_person" | "child" | "matrimonial";

export const OCCUPANCY_TYPES: OccupancyType[] = ["matrimonial", "double", "single", "third_person", "child"];

/** Professional tour guide from this passenger count upward; below → driver-chaperone. */
export const GUIDE_THRESHOLD = 16;

export const DEFAULT_GROUP_BANDS: Array<{ label: string; minPax: number; maxPax: number }> = [
  { label: "2-5", minPax: 2, maxPax: 5 },
  { label: "6-9", minPax: 6, maxPax: 9 },
  { label: "10-15", minPax: 10, maxPax: 15 },
  { label: "16-25", minPax: 16, maxPax: 25 },
  { label: "26-40", minPax: 26, maxPax: 40 },
  { label: "41-55", minPax: 41, maxPax: 55 },
];

export function assistanceTypeForPax(paxCount: number): AssistanceType {
  return paxCount >= GUIDE_THRESHOLD ? "professional_guide" : "driver_chaperone";
}

export interface PricingRuleLike {
  marginType: MarginType;
  marginValue: string;          // percentage ("20" = +20%) or fixed amount
  freePassengerPaying: number;  // e.g. 3
  freePassengerFree: number;    // e.g. 1
}

export interface CostComponents {
  transportationShare: string; // per-person share of group transportation cost
  guideDriverShare: string;    // per-person share of guide/driver cost
  sightseeingShare: string;    // per-person share of sightseeing/entrance costs
  airfarePerPerson: string;
}

export interface HotelChoiceInput {
  hotelChoice: number; // 1..3
  hotelId?: string | null;
  hotelName?: string | null;
  /** Per-person nightly rate for each occupancy type. Missing occupancies are skipped. */
  nightlyRates: Partial<Record<OccupancyType, string>>;
}

export interface QuoteComputationInput {
  paxCount: number;
  nights: number;
  components: CostComponents;
  hotels: HotelChoiceInput[];
  rule: PricingRuleLike;
}

export interface LineItemResult {
  hotelChoice: number;
  hotelId: string | null;
  hotelName: string | null;
  occupancy: OccupancyType;
  hotelNightlyRate: string;
  hotelCostTotal: string;
  baseCost: string;            // step 1
  marginAmount: string;        // step 2 delta
  freeAdjustmentAmount: string;// step 3 delta
  sellingPrice: string;        // final (2 dp)
}

export interface QuoteComputationResult {
  assistanceType: AssistanceType;
  baseCostPerPerson: string;      // step-1 base excluding hotel (component sum)
  freeAdjustmentFactor: string;   // e.g. "1.333333"
  totalGroupCost: string;         // reference: (base + choice-1 double hotel) × pax
  lineItems: LineItemResult[];
}

const DECIMAL_RE = /^\d+(\.\d+)?$/;

function dec(value: string | number, field: string): Decimal {
  const s = String(value);
  if (!DECIMAL_RE.test(s)) throw new PricingInputError(`${field} must be a non-negative decimal number`);
  return new Decimal(s);
}

export class PricingInputError extends Error {}

export function freeAdjustmentFactor(rule: PricingRuleLike): Decimal {
  if (rule.freePassengerPaying < 1) throw new PricingInputError("freePassengerPaying must be at least 1");
  if (rule.freePassengerFree < 0) throw new PricingInputError("freePassengerFree must be non-negative");
  // 1 free per 3 paying → revenue from 3 must cover 4 → ×(3+1)/3 = 4/3
  return new Decimal(rule.freePassengerPaying + rule.freePassengerFree).div(rule.freePassengerPaying);
}

export function applyMargin(base: Decimal, rule: PricingRuleLike): Decimal {
  const value = dec(rule.marginValue, "marginValue");
  if (rule.marginType === "fixed") return base.plus(value);
  return base.mul(new Decimal(1).plus(value.div(100)));
}

export function computeQuote(input: QuoteComputationInput): QuoteComputationResult {
  if (!Number.isInteger(input.paxCount) || input.paxCount < 1)
    throw new PricingInputError("paxCount must be a positive integer");
  if (!Number.isInteger(input.nights) || input.nights < 0)
    throw new PricingInputError("nights must be a non-negative integer");
  if (input.hotels.length < 1 || input.hotels.length > 3)
    throw new PricingInputError("Between 1 and 3 hotel choices are required");
  const choices = new Set(input.hotels.map((h) => h.hotelChoice));
  if (choices.size !== input.hotels.length)
    throw new PricingInputError("Duplicate hotelChoice values");
  for (const h of input.hotels) {
    if (!Number.isInteger(h.hotelChoice) || h.hotelChoice < 1 || h.hotelChoice > 3)
      throw new PricingInputError("hotelChoice must be between 1 and 3");
    if (Object.keys(h.nightlyRates).length === 0)
      throw new PricingInputError(`Hotel choice ${h.hotelChoice} has no nightly rates`);
  }

  const c = input.components;
  const componentBase = dec(c.transportationShare, "transportationShare")
    .plus(dec(c.guideDriverShare, "guideDriverShare"))
    .plus(dec(c.sightseeingShare, "sightseeingShare"))
    .plus(dec(c.airfarePerPerson, "airfarePerPerson"));

  const factor = freeAdjustmentFactor(input.rule);
  const lineItems: LineItemResult[] = [];
  let referenceGroupCost: Decimal | null = null;

  const sorted = [...input.hotels].sort((a, b) => a.hotelChoice - b.hotelChoice);
  for (const hotel of sorted) {
    for (const occupancy of OCCUPANCY_TYPES) {
      const nightly = hotel.nightlyRates[occupancy];
      if (nightly === undefined || nightly === null) continue;
      const nightlyRate = dec(nightly, `nightlyRates.${occupancy}`);
      const hotelCostTotal = nightlyRate.mul(input.nights);

      // Step 1 — base cost
      const baseCost = componentBase.plus(hotelCostTotal);
      // Step 2 — company profit margin
      const withMargin = applyMargin(baseCost, input.rule);
      const marginAmount = withMargin.minus(baseCost);
      // Step 3 — free-passenger adjustment. Use the exact ratio
      // ((paying+free)/paying) rather than the pre-divided factor so
      // repeating decimals can't flip half-cent rounding boundaries.
      const finalPrice = withMargin
        .mul(input.rule.freePassengerPaying + input.rule.freePassengerFree)
        .div(input.rule.freePassengerPaying);
      const freeAdjustmentAmount = finalPrice.minus(withMargin);

      lineItems.push({
        hotelChoice: hotel.hotelChoice,
        hotelId: hotel.hotelId ?? null,
        hotelName: hotel.hotelName ?? null,
        occupancy,
        hotelNightlyRate: nightlyRate.toFixed(2),
        hotelCostTotal: hotelCostTotal.toFixed(2),
        baseCost: baseCost.toFixed(2),
        marginAmount: marginAmount.toFixed(2),
        freeAdjustmentAmount: freeAdjustmentAmount.toFixed(2),
        sellingPrice: finalPrice.toFixed(2),
      });

      if (referenceGroupCost === null && occupancy === "double") {
        referenceGroupCost = baseCost.mul(input.paxCount);
      }
    }
  }
  if (lineItems.length === 0) throw new PricingInputError("No priceable hotel/occupancy combinations");

  // Fallback reference if no double-occupancy rate was provided.
  if (referenceGroupCost === null) {
    referenceGroupCost = new Decimal(lineItems[0].baseCost).mul(input.paxCount);
  }

  return {
    assistanceType: assistanceTypeForPax(input.paxCount),
    baseCostPerPerson: componentBase.toFixed(2),
    freeAdjustmentFactor: factor.toFixed(6),
    totalGroupCost: referenceGroupCost.toFixed(2),
    lineItems,
  };
}
