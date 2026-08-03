/**
 * TourPricingEngine — centralized group-tour pricing (Phase 1, 2 & 3).
 *
 * All money math uses decimal.js (never JS floats). Numeric inputs/outputs
 * are decimal strings, matching the PostgreSQL `numeric` columns.
 *
 * Calculation order per person, per hotel choice, per occupancy:
 *   Step 1: Base Cost = transportation share + guide/driver share
 *                     + sightseeing share + (hotel nightly rate × nights)
 *                     + airfare
 *   [before_margin adjustment rules applied here]
 *   Step 2: Add company profit margin (fixed amount or percentage)
 *   [after_margin adjustment rules applied here]
 *   Step 3: Apply free-passenger adjustment (1 free per 3 paying → ×4/3)
 *   [after_free_policy adjustment rules applied here]
 */
import Decimal from "decimal.js";

// Money math: enough precision for intermediate factors like 4/3.
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type AssistanceType = "driver_chaperone" | "professional_guide";
export type MarginType = "fixed" | "percentage";
export type OccupancyType = "double" | "single" | "third_person" | "child" | "matrimonial" | "infant";

export type AdjustmentStage = "before_margin" | "after_margin" | "after_free_policy";
export type RoundingRule = "cent" | "unit_nearest" | "unit_up" | "five_up" | "ten_up";

export const OCCUPANCY_TYPES: OccupancyType[] = ["matrimonial", "double", "single", "third_person", "child", "infant"];

/** Customer-price rounding. Internal breakdown figures always stay at 2dp. */
export function applyRounding(price: Decimal, rule: RoundingRule | undefined): Decimal {
  switch (rule) {
    case "unit_nearest": return price.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
    case "unit_up": return price.toDecimalPlaces(0, Decimal.ROUND_CEIL);
    case "five_up": return price.div(5).toDecimalPlaces(0, Decimal.ROUND_CEIL).mul(5);
    case "ten_up": return price.div(10).toDecimalPlaces(0, Decimal.ROUND_CEIL).mul(10);
    case "cent":
    default: return price.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  }
}

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
  /** Customer-price rounding policy. Defaults to "cent" (legacy 2dp). */
  roundingRule?: RoundingRule;
}

/**
 * A single pricing adjustment rule (tax, fee, surcharge, or discount).
 * Rules are applied in applicationOrder sequence within each stage.
 * Discounts subtract from the running total; all other types add to it.
 */
export interface AdjustmentRuleLike {
  id: string;
  name: string;
  type: string; // "tax" | "service_fee" | "booking_fee" | "surcharge" | "discount"
  amountType: "fixed" | "percentage";
  amount: string;                // non-negative decimal string
  appliesToStage: AdjustmentStage;
  applicationOrder: number;
}
export interface CostComponents {
  transportationShare: string; // per-person share of group transportation cost
  guideDriverShare: string;    // per-person share of guide/driver cost
  sightseeingShare: string;    // per-person share of sightseeing/entrance costs
  airfarePerPerson: string;
  /**
   * Occupancy-specific airfare (e.g. child/infant fares). Falls back to
   * airfarePerPerson for occupancies not listed.
   */
  airfareByOccupancy?: Partial<Record<OccupancyType, string>>;
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
  /** Active adjustment rules, sorted externally or internally by applicationOrder. */
  adjustmentRules?: AdjustmentRuleLike[];
}

export interface LineItemResult {
  hotelChoice: number;

  hotelId: string | null;

  hotelName: string | null;

  occupancy: OccupancyType;

  hotelNightlyRate: string;

  hotelCostTotal: string;

  marginAmount: string;        // step 2 delta

  freeAdjustmentAmount: string;// step 3 delta

  sellingPrice: string;        // final, after the configured rounding rule

  sellingPriceExact: string;   // pre-rounding-rule value (2 dp), for audit

  baseCost: string;            // step 1 (after before_margin adjustments)

  adjustmentItems: AdjustmentItem[]; // per-rule breakdown
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

/**
 * Apply a set of adjustment rules at a specific stage to a running total.
 * Returns the updated total and the list of AdjustmentItems (deltas).
 */
function applyAdjustmentsAtStage(
  running: Decimal,
  rules: AdjustmentRuleLike[],
  stage: AdjustmentStage,
): { result: Decimal; items: AdjustmentItem[] } {
  const stageRules = rules
    .filter((r) => r.appliesToStage === stage)
    // Primary: applicationOrder; secondary: id (lexicographic) for a total,
    // deterministic ordering when two rules share the same order value.
    .sort((a, b) =>
      a.applicationOrder !== b.applicationOrder
        ? a.applicationOrder - b.applicationOrder
        : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );

  const items: AdjustmentItem[] = [];
  let result = running;

  for (const rule of stageRules) {
    const amount = dec(rule.amount, `adjustmentRule[${rule.name}].amount`);
    let delta: Decimal;
    if (rule.amountType === "percentage") {
      // Percentage is applied to the running total at this stage.
      delta = result.mul(amount.div(100));
    } else {
      // Fixed: flat per-person amount.
      delta = amount;
    }
    // Discounts subtract; all other types add.
    const isDiscount = rule.type === "discount";
    const appliedAmount = isDiscount ? delta.negated() : delta;
    result = result.plus(appliedAmount);
    items.push({
      ruleId: rule.id,
      name: rule.name,
      type: rule.type,
      appliedAmount: appliedAmount.toFixed(2),
    });
  }

  return { result, items };
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

  const adjRules = input.adjustmentRules ?? [];

  const c = input.components;
  // Land base excludes airfare so per-occupancy airfare overrides (child/infant)
  // can be substituted without changing the land component sum.
  const landBase = dec(c.transportationShare, "transportationShare")
    .plus(dec(c.guideDriverShare, "guideDriverShare"))
    .plus(dec(c.sightseeingShare, "sightseeingShare"));
  const defaultAirfare = dec(c.airfarePerPerson, "airfarePerPerson");
  const airfareFor = (occupancy: OccupancyType): Decimal => {
    const specific = c.airfareByOccupancy?.[occupancy];
    return specific === undefined || specific === null
      ? defaultAirfare
      : dec(specific, `airfareByOccupancy.${occupancy}`);
  };
  // componentBase uses the default airfare for baseCostPerPerson display.
  const componentBase = landBase.plus(defaultAirfare);

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

      // Step 1 — base cost (airfare may differ per occupancy: child/infant fares)
      const rawBaseCost = landBase.plus(airfareFor(occupancy)).plus(hotelCostTotal);

      // [before_margin adjustments]
      const beforeMargin = applyAdjustmentsAtStage(rawBaseCost, adjRules, "before_margin");
      const afterBeforeMargin = beforeMargin.result;

      // Step 2 — company profit margin
      const withMargin = applyMargin(afterBeforeMargin, input.rule);
      const marginAmount = withMargin.minus(afterBeforeMargin);

      // [after_margin adjustments]
      const afterMarginAdj = applyAdjustmentsAtStage(withMargin, adjRules, "after_margin");
      const afterAfterMargin = afterMarginAdj.result;

      // Step 3 — free-passenger adjustment. Use the exact ratio
      // ((paying+free)/paying) rather than the pre-divided factor so
      // repeating decimals can't flip half-cent rounding boundaries.
      const withFree = afterAfterMargin
        .mul(input.rule.freePassengerPaying + input.rule.freePassengerFree)
        .div(input.rule.freePassengerPaying);
      const freeAdjustmentAmount = withFree.minus(afterAfterMargin);

      // [after_free_policy adjustments]
      const afterFreeAdj = applyAdjustmentsAtStage(withFree, adjRules, "after_free_policy");
      const finalPrice = afterFreeAdj.result;

      // Step 4 — configurable customer-price rounding (selling price only)
      const rounded = applyRounding(finalPrice, input.rule.roundingRule);

      // Merge all adjustment items across all three stages.
      const allAdjustmentItems: AdjustmentItem[] = [
        ...beforeMargin.items,
        ...afterMarginAdj.items,
        ...afterFreeAdj.items,
      ];

      lineItems.push({
        hotelChoice: hotel.hotelChoice,
        hotelId: hotel.hotelId ?? null,
        hotelName: hotel.hotelName ?? null,
        occupancy,
        hotelNightlyRate: nightlyRate.toFixed(2),
        hotelCostTotal: hotelCostTotal.toFixed(2),
        baseCost: rawBaseCost.toFixed(2),
        marginAmount: marginAmount.toFixed(2),
        freeAdjustmentAmount: freeAdjustmentAmount.toFixed(2),
        adjustmentItems: allAdjustmentItems,
        sellingPrice: rounded.toFixed(2),
        sellingPriceExact: finalPrice.toFixed(2),
      });

      if (referenceGroupCost === null && occupancy === "double") {
        referenceGroupCost = rawBaseCost.mul(input.paxCount);
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

/** Per-rule monetary delta recorded in the line-item breakdown. */
export interface AdjustmentItem {
  ruleId: string;
  name: string;
  type: string;
  appliedAmount: string; // per-person, negative for discounts
}
