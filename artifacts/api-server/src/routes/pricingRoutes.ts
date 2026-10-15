import type { Express, Request, Response } from "express";
import path from "path";
import { eq, and, sql, isNull, desc } from "drizzle-orm";
import { z } from "zod/v4";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { isUniqueViolation } from "./shared";
import { ADMIN_ROLES, requireRole } from "../middleware/auth";
import {
  db,
  countries,
  tours,
  tourDepartures,
  groupSizeBands,
  pricingRules,
  airfareRates,
  pricingQuotes,
  pricingAdjustmentRules,
  pricingSeasons,
  exchangeRates,
  insertGroupSizeBandSchema,
  insertPricingRuleSchema,
  insertAirfareRateSchema,
  insertPricingAdjustmentRuleSchema,
  insertPricingSeasonSchema,
  patchPricingSeasonSchema,
  insertExchangeRateSchema,
  insertPricingQuoteOverrideSchema,
} from "@workspace/db";
import { computeQuote, PricingInputError, type HotelChoiceInput } from "../services/pricing-engine";
import { resolveTourComponents } from "../services/rate-resolver";
import {
  normalizeQuoteStatus,
  computeQuoteTransition,
  buildTransitionTimingPatch,
  buildCustomerQuoteView,
  VIEWED_TRANSITION_FROM,
  OVERRIDABLE_QUOTE_STATUSES,
  CUSTOMER_VISIBLE_QUOTE_STATUSES,
} from "../services/quote-lifecycle";
import {
  persistComputedQuote,
  findPricingQuote,
  findPricingQuoteByShareToken,
  listPricingQuotes,
  listQuoteLineItems,
  listQuoteOverrides,
  listQuoteSnapshots,
  findInternalPricingQuote,
  applyQuoteUpdate,
  applyPriceOverride,
  markQuoteViewed,
} from "../services/quote-workflow";

// Pricing-engine endpoints (group-size bands, rules, airfare rates,
// adjustment rules, seasons, exchange rates) plus the pricing-quote
// lifecycle (compute/persist, approve/override, snapshots, customer view).
// Extracted verbatim from routes.ts — behaviour and registration order
// unchanged (registered at the same point in the stack).
export function registerPricingRoutes(app: Express): void {
  // ==== Pricing Engine (Phase 1 & 2) ====
  // Internal pricing data (costs, margins, adjustment factors) is restricted
  // to admin/super_admin/operations_manager. Customers only ever receive the
  // final selling prices per hotel choice & occupancy.
  const PRICING_INTERNAL_ROLES = [...ADMIN_ROLES, "operations_manager"];

  // Integrity guard: active group size bands must not overlap.
  async function findBandOverlap(minPax: number, maxPax: number, excludeId?: string) {
    const bands = await db.select().from(groupSizeBands).where(eq(groupSizeBands.isActive, true));
    return bands.find((b) => b.id !== excludeId && minPax <= b.maxPax && maxPax >= b.minPax) ?? null;
  }
  // Integrity guard: keep exactly one active global pricing rule — activating
  // a new one deactivates the others inside the same transaction.
  async function deactivateOtherGlobalRules(tx: any, keepId: string) {
    await tx.update(pricingRules).set({ isActive: false, updatedAt: new Date() })
      .where(and(isNull(pricingRules.tourId), eq(pricingRules.isActive, true), sql`${pricingRules.id} != ${keepId}`));
  }

  // ---- Group size bands ----
  app.get("/api/pricing/group-size-bands", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const bands = await db.select().from(groupSizeBands).orderBy(groupSizeBands.sortOrder);
      res.json(bands);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/group-size-bands", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertGroupSizeBandSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (parsed.data.isActive !== false) {
        const overlap = await findBandOverlap(parsed.data.minPax, parsed.data.maxPax);
        if (overlap) return res.status(409).json({ message: `Band overlaps existing active band ${overlap.label}` });
      }
      const [band] = await db.insert(groupSizeBands).values(parsed.data).returning();
      res.json(band);
    } catch (e: any) {
      if (isUniqueViolation(e)) return res.status(409).json({ message: "A band with this label already exists" });
      routeError(res, e);
    }
  });
  app.patch("/api/pricing/group-size-bands/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertGroupSizeBandSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [existing] = await db.select().from(groupSizeBands)
        .where(eq(groupSizeBands.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Band not found" });
      const merged = { ...existing, ...parsed.data };
      if (merged.maxPax < merged.minPax)
        return res.status(400).json({ message: "maxPax must be >= minPax" });
      if (merged.isActive) {
        const overlap = await findBandOverlap(merged.minPax, merged.maxPax, existing.id);
        if (overlap) return res.status(409).json({ message: `Band overlaps existing active band ${overlap.label}` });
      }
      const [band] = await db.update(groupSizeBands).set(parsed.data)
        .where(eq(groupSizeBands.id, req.params.id as string)).returning();
      if (!band) return res.status(404).json({ message: "Band not found" });
      res.json(band);
    } catch (e: any) {
      if (isUniqueViolation(e)) return res.status(409).json({ message: "A band with this label already exists" });
      routeError(res, e);
    }
  });
  app.delete("/api/pricing/group-size-bands/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [{ count: refs }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(pricingQuotes).where(eq(pricingQuotes.groupSizeBandId, req.params.id as string));
      if (refs > 0) return res.status(409).json({ message: `Cannot delete: ${refs} quote(s) reference this band. Deactivate it instead.` });
      const [band] = await db.delete(groupSizeBands)
        .where(eq(groupSizeBands.id, req.params.id as string)).returning();
      if (!band) return res.status(404).json({ message: "Band not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Pricing rules ----
  app.get("/api/pricing/rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rules = await db.select().from(pricingRules).orderBy(desc(pricingRules.createdAt));
      res.json(rules);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertPricingRuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const rule = await db.transaction(async (tx) => {
        const [r] = await tx.insert(pricingRules).values(parsed.data).returning();
        if (!r.tourId && r.isActive) await deactivateOtherGlobalRules(tx, r.id);
        return r;
      });
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/pricing/rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertPricingRuleSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const rule = await db.transaction(async (tx) => {
        const [r] = await tx.update(pricingRules).set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(pricingRules.id, req.params.id as string)).returning();
        if (r && !r.tourId && r.isActive) await deactivateOtherGlobalRules(tx, r.id);
        return r;
      });
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/pricing/rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [{ count: refs }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(pricingQuotes).where(eq(pricingQuotes.pricingRuleId, req.params.id as string));
      if (refs > 0) return res.status(409).json({ message: `Cannot delete: ${refs} quote(s) reference this rule. Deactivate it instead.` });
      const [rule] = await db.delete(pricingRules)
        .where(eq(pricingRules.id, req.params.id as string)).returning();
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Airfare rates ----
  app.get("/api/pricing/airfare-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rates = await db.select().from(airfareRates).orderBy(airfareRates.origin, airfareRates.destination);
      res.json(rates);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/airfare-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertAirfareRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rate] = await db.insert(airfareRates).values(parsed.data).returning();
      res.json(rate);
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/pricing/airfare-rates/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [existing] = await db.select().from(airfareRates)
        .where(eq(airfareRates.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Airfare rate not found" });
      // Validate the merged state so a partial patch can't produce an
      // invalid interval (e.g. validFrom moved past an existing validTo).
      const { id: _id, createdAt: _ca, ...existingRest } = existing;
      const parsed = insertAirfareRateSchema.safeParse({ ...existingRest, ...req.body });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rate] = await db.update(airfareRates).set(parsed.data)
        .where(eq(airfareRates.id, req.params.id as string)).returning();
      if (!rate) return res.status(404).json({ message: "Airfare rate not found" });
      res.json(rate);
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/pricing/airfare-rates/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [rate] = await db.delete(airfareRates)
        .where(eq(airfareRates.id, req.params.id as string)).returning();
      if (!rate) return res.status(404).json({ message: "Airfare rate not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // Bulk import airfare rates from the Excel template (client parses xlsx →
  // JSON, same pattern as /api/tours/import). All-or-nothing: every row is
  // validated first; any bad row rejects the whole file so a typo can't
  // silently skip a season.
  app.post("/api/pricing/airfare-rates/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const rows = req.body?.rates;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No airfare rows to import" });
      if (rows.length > 500) return res.status(400).json({ message: "Maximum 500 airfare rates per import" });
      const errors: string[] = [];
      const parsedRows: any[] = [];
      rows.forEach((raw: any, i: number) => {
        const label = `Row ${i + 2} (${raw?.origin || "?"} → ${raw?.destination || "?"})`;
        const parsed = insertAirfareRateSchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          errors.push(`${label}: ${first ? `${first.path.join(".")} — ${first.message}` : "invalid data"}`);
          return;
        }
        parsedRows.push({ ...parsed.data, isActive: true });
      });
      // Duplicate route+season rows make fare selection nondeterministic —
      // reject them both within the file and against existing active rates.
      const seasonKey = (r: { origin: string; destination: string; airline?: string | null; validFrom?: Date | string | null; validTo?: Date | string | null }) => {
        const d = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
        return `${r.origin.trim().toLowerCase()}|${r.destination.trim().toLowerCase()}|${(r.airline ?? "").trim().toLowerCase()}|${d(r.validFrom)}|${d(r.validTo)}`;
      };
      if (parsedRows.length) {
        const seen = new Map<string, number>();
        parsedRows.forEach((r, i) => {
          const key = seasonKey(r);
          if (seen.has(key)) errors.push(`Row ${i + 2} (${r.origin} → ${r.destination}): duplicate of row ${seen.get(key)! + 2} — same route, airline, and season`);
          else seen.set(key, i);
        });
        const existing = await db.select().from(airfareRates).where(eq(airfareRates.isActive, true));
        const existingKeys = new Set(existing.map(seasonKey));
        parsedRows.forEach((r, i) => {
          if (existingKeys.has(seasonKey(r))) errors.push(`Row ${i + 2} (${r.origin} → ${r.destination}): an active rate for this route, airline, and season already exists — edit it instead`);
        });
      }
      if (errors.length) {
        return res.status(400).json({ message: errors.slice(0, 10).join(" • ") + (errors.length > 10 ? ` • …and ${errors.length - 10} more` : "") });
      }
      const created = await db.insert(airfareRates).values(parsedRows).returning();
      res.json({ created: created.length });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Pricing adjustment rules (taxes, fees, discounts) ----
  app.get("/api/pricing/adjustment-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rows = await db.select().from(pricingAdjustmentRules)
        .orderBy(pricingAdjustmentRules.applicationOrder, pricingAdjustmentRules.createdAt);
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/pricing/adjustment-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertPricingAdjustmentRuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rule] = await db.insert(pricingAdjustmentRules).values(parsed.data).returning();
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/pricing/adjustment-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const patchSchema = insertPricingAdjustmentRuleSchema.partial();
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rule] = await db.update(pricingAdjustmentRules)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(pricingAdjustmentRules.id, req.params.id as string)).returning();
      if (!rule) return res.status(404).json({ message: "Adjustment rule not found" });
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/pricing/adjustment-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [rule] = await db.delete(pricingAdjustmentRules)
        .where(eq(pricingAdjustmentRules.id, req.params.id as string)).returning();
      if (!rule) return res.status(404).json({ message: "Adjustment rule not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Pricing seasons (date-range based season definitions) ----
  app.get("/api/pricing/seasons", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rows = await db.select().from(pricingSeasons)
        .orderBy(desc(pricingSeasons.priority), pricingSeasons.startDate);
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/seasons", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertPricingSeasonSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      // Validate destination exists when provided.
      if (parsed.data.destinationId) {
        const [dest] = await db.select({ id: countries.id }).from(countries)
          .where(eq(countries.id, parsed.data.destinationId));
        if (!dest) return res.status(400).json({ message: "destinationId does not reference a known country" });
      }
      const [season] = await db.insert(pricingSeasons).values(parsed.data).returning();
      res.json(season);
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/pricing/seasons/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      // Validate the patch body fields in isolation first.
      const parsed = patchPricingSeasonSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      // Load existing season so we can validate the merged date range —
      // a one-bound update (only startDate or only endDate) must not invert
      // the range relative to the persisted counterpart.
      const [existing] = await db.select().from(pricingSeasons)
        .where(eq(pricingSeasons.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Season not found" });
      const mergedStart = parsed.data.startDate ?? existing.startDate;
      const mergedEnd   = parsed.data.endDate   ?? existing.endDate;
      if (mergedStart > mergedEnd)
        return res.status(400).json({ message: "endDate must be on or after startDate after applying this update" });
      // Validate destination exists when provided.
      if (parsed.data.destinationId) {
        const [dest] = await db.select({ id: countries.id }).from(countries)
          .where(eq(countries.id, parsed.data.destinationId));
        if (!dest) return res.status(400).json({ message: "destinationId does not reference a known country" });
      }
      const [season] = await db.update(pricingSeasons)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(pricingSeasons.id, req.params.id as string)).returning();
      res.json(season);
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/pricing/seasons/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [season] = await db.delete(pricingSeasons)
        .where(eq(pricingSeasons.id, req.params.id as string)).returning();
      if (!season) return res.status(404).json({ message: "Season not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Quotes: compute + persist ----
  const quoteRequestSchema = z.object({
    tourId: z.string().min(1),
    departureId: z.string().optional(),
    pricingRuleId: z.string().optional(),   // default: active global rule
    airfareRateId: z.string().optional(),   // alternative to components.airfarePerPerson
    paxCount: z.number().int().min(1).max(200),
    nights: z.number().int().min(0).max(120),
    currency: z.string().optional(),
    notes: z.string().optional(),
    components: z.object({
      transportationShare: z.string(),
      guideDriverShare: z.string(),
      sightseeingShare: z.string(),
      airfarePerPerson: z.string().optional(),
      // Occupancy-specific fares (child/infant); fall back to airfarePerPerson.
      airfareByOccupancy: z.partialRecord(z.enum(["child", "infant"]), z.string()).optional(),
    }),
    hotels: z.array(z.object({
      hotelChoice: z.number().int().min(1).max(3),
      hotelId: z.string().optional(),
      hotelName: z.string().optional(),
      // partialRecord: enum-keyed z.record in zod v4 makes every key required
      nightlyRates: z.partialRecord(z.enum(["matrimonial", "double", "single", "third_person", "child", "infant"]), z.string()),
    })).min(1).max(3),
  });

  type QuoteRequest = z.infer<typeof quoteRequestSchema>;
  class QuoteError extends Error { constructor(public statusCode: number, message: string) { super(message); } }

  // Shared by the manual quote endpoint and the rate-driven from-tour
  // endpoint. Resolves rule/airfare/band, computes and persists the quote.
  async function createPricingQuote(body: QuoteRequest, userId: string | null, calculationMeta?: unknown) {
      const [tour] = await db.select().from(tours).where(eq(tours.id, body.tourId));
      if (!tour) throw new QuoteError(404, "Tour not found");

      // Resolve pricing rule. Explicit id must be active and applicable to
      // this tour (its own rule or a global one). Otherwise precedence is:
      // newest active tour-specific rule, then newest active global rule.
      let rule;
      if (body.pricingRuleId) {
        [rule] = await db.select().from(pricingRules).where(eq(pricingRules.id, body.pricingRuleId));
        if (!rule) throw new QuoteError(404, "Pricing rule not found");
        if (!rule.isActive) throw new QuoteError(400, "Pricing rule is inactive");
        if (rule.tourId && rule.tourId !== body.tourId)
          throw new QuoteError(400, "Pricing rule belongs to a different tour");
      } else {
        [rule] = await db.select().from(pricingRules)
          .where(and(eq(pricingRules.tourId, body.tourId), eq(pricingRules.isActive, true)))
          .orderBy(desc(pricingRules.createdAt)).limit(1);
        if (!rule) {
          [rule] = await db.select().from(pricingRules)
            .where(and(isNull(pricingRules.tourId), eq(pricingRules.isActive, true)))
            .orderBy(desc(pricingRules.createdAt)).limit(1);
        }
        if (!rule) throw new QuoteError(400, "No active pricing rule configured");
      }

      // Resolve airfare: explicit per-person value wins, else an active,
      // date-valid airfare rate record, else 0.
      let airfarePerPerson = body.components.airfarePerPerson;
      if (airfarePerPerson === undefined && body.airfareRateId) {
        const [rate] = await db.select().from(airfareRates).where(eq(airfareRates.id, body.airfareRateId));
        if (!rate) throw new QuoteError(404, "Airfare rate not found");
        if (!rate.isActive) throw new QuoteError(400, "Airfare rate is inactive");
        const now = new Date();
        if ((rate.validFrom && now < rate.validFrom) || (rate.validTo && now > rate.validTo))
          throw new QuoteError(400, "Airfare rate is outside its validity period");
        airfarePerPerson = rate.ratePerPerson;
      }
      airfarePerPerson = airfarePerPerson ?? "0";

      // Resolve group size band (informational; assistance rule is pax-based).
      const bands = await db.select().from(groupSizeBands)
        .where(eq(groupSizeBands.isActive, true)).orderBy(groupSizeBands.sortOrder);
      const band = bands.find((b) => body.paxCount >= b.minPax && body.paxCount <= b.maxPax) ?? null;

      // Load active adjustment rules (taxes, fees, discounts) for this quote.
      // Order by applicationOrder then id so ties are broken deterministically.
      const activeAdjRules = await db.select().from(pricingAdjustmentRules)
        .where(eq(pricingAdjustmentRules.isActive, true))
        .orderBy(pricingAdjustmentRules.applicationOrder, pricingAdjustmentRules.id);

      // Snapshot every input used in computeQuote at creation time.
      // This is the only moment the exact rule values and adjustment rules are
      // known; by approval time they may have changed. Stored under
      // _computeInputs inside calculationMeta so the approval transaction can
      // read them without re-querying mutable tables.
      const computeInputsSnapshot = {
        paxCount: body.paxCount,
        nights: body.nights,
        currency: body.currency ?? rule.currency,
        components: {
          transportationShare: body.components.transportationShare,
          guideDriverShare: body.components.guideDriverShare,
          sightseeingShare: body.components.sightseeingShare,
          airfarePerPerson,
          airfareByOccupancy: body.components.airfareByOccupancy ?? null,
        },
        hotels: (body.hotels as HotelChoiceInput[]).map((h) => ({
          hotelChoice: h.hotelChoice,
          hotelId: (h as any).hotelId ?? null,
          hotelName: (h as any).hotelName ?? null,
          nightlyRates: h.nightlyRates,
        })),
        rule: {
          id: rule.id,
          name: rule.name,
          marginType: rule.marginType,
          marginValue: rule.marginValue,
          freePassengerPaying: rule.freePassengerPaying,
          freePassengerFree: rule.freePassengerFree,
          roundingRule: rule.roundingRule ?? "cent",
          currency: rule.currency,
        },
        adjustmentRules: activeAdjRules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          amountType: r.amountType,
          amount: r.amount,
          appliesToStage: r.appliesToStage,
          applicationOrder: r.applicationOrder,
        })),
      };
      // Merge _computeInputs with any caller-supplied calculationMeta (e.g.
      // rate-resolver sources and warnings from the from-tour endpoint).
      const mergedMeta: Record<string, unknown> = {
        ...(calculationMeta && typeof calculationMeta === "object" ? calculationMeta as Record<string, unknown> : {}),
        _computeInputs: computeInputsSnapshot,
      };

      const result = computeQuote({
        paxCount: body.paxCount,
        nights: body.nights,
        components: {
          transportationShare: body.components.transportationShare,
          guideDriverShare: body.components.guideDriverShare,
          sightseeingShare: body.components.sightseeingShare,
          airfarePerPerson,
          airfareByOccupancy: body.components.airfareByOccupancy,
        },
        hotels: body.hotels as HotelChoiceInput[],
        rule: {
          marginType: rule.marginType,
          marginValue: rule.marginValue,
          freePassengerPaying: rule.freePassengerPaying,
          freePassengerFree: rule.freePassengerFree,
          roundingRule: rule.roundingRule ?? "cent",
        },
        adjustmentRules: activeAdjRules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          amountType: r.amountType as "fixed" | "percentage",
          amount: r.amount,
          appliesToStage: r.appliesToStage as "before_margin" | "after_margin" | "after_free_policy",
          applicationOrder: r.applicationOrder,
        })),
      });

      const quote = await persistComputedQuote(db, storage, {
        quote: {
          tourId: body.tourId,
          departureId: body.departureId ?? null,
          pricingRuleId: rule.id,
          groupSizeBandId: band?.id ?? null,
          paxCount: body.paxCount,
          nights: body.nights,
          assistanceType: result.assistanceType,
          currency: body.currency ?? rule.currency,
          transportationShare: body.components.transportationShare,
          guideDriverShare: body.components.guideDriverShare,
          sightseeingShare: body.components.sightseeingShare,
          airfarePerPerson,
          baseCostPerPerson: result.baseCostPerPerson,
          totalGroupCost: result.totalGroupCost,
          freeAdjustmentFactor: result.freeAdjustmentFactor,
          marginType: rule.marginType,
          marginValue: rule.marginValue,
          notes: body.notes ?? null,
          calculationMeta: mergedMeta,
          createdBy: userId,
        },
        lineItems: result.lineItems,
        // Permanent trail: every quote computation is audit-logged (entityId is
        // filled from the inserted quote).
        audit: {
          entityType: "pricing_quote", action: "created",
          changedBy: userId ?? undefined,
          newValue: JSON.stringify({ tourId: body.tourId, paxCount: body.paxCount, currency: body.currency ?? rule.currency, ruleId: rule.id, roundingRule: rule.roundingRule ?? "cent" }),
        },
      });

      return { ...quote, groupSizeBand: band?.label ?? null, lineItems: result.lineItems };
  }

  const quoteErrorResponse = (res: Response, e: any) => {
    if (e instanceof QuoteError) return res.status(e.statusCode).json({ message: e.message });
    if (e instanceof PricingInputError) return res.status(400).json({ message: e.message });
    return routeError(res, e);
  };

  app.post("/api/pricing/quotes", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const parsed = quoteRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await createPricingQuote(parsed.data, (req.session as any).userId ?? null));
    } catch (e: any) { quoteErrorResponse(res, e); }
  });

  // ---- Rate-driven costing ----
  const resolveRequestSchema = z.object({
    tourId: z.string().min(1),
    paxCount: z.number().int().min(1).max(200),
    departureDate: z.string().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    currency: z.string().optional(), // rates in other currencies are skipped (no conversion yet)
  });

  // Preview: resolve component costs + hotel choices from supplier rate
  // cards without persisting anything. Staff can adjust before quoting.
  app.post("/api/pricing/resolve", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const parsed = resolveRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await resolveTourComponents(db, parsed.data));
    } catch (e: any) { quoteErrorResponse(res, e); }
  });

  // One-shot: resolve from rate cards and persist the quote, recording the
  // rate sources + warnings in calculationMeta.
  const fromTourRequestSchema = resolveRequestSchema.extend({
    departureId: z.string().optional(),
    pricingRuleId: z.string().optional(),
    currency: z.string().optional(),
    notes: z.string().optional(),
  });
  app.post("/api/pricing/quotes/from-tour", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const parsed = fromTourRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const body = parsed.data;
      // A departure must belong to the tour; its start date drives rate
      // validity when no explicit departureDate is supplied.
      let departureDate = body.departureDate;
      if (body.departureId) {
        const [dep] = await db.select().from(tourDepartures).where(eq(tourDepartures.id, body.departureId));
        if (!dep) return res.status(404).json({ message: "Departure not found" });
        if (dep.tourId !== body.tourId)
          return res.status(400).json({ message: "Departure belongs to a different tour" });
        departureDate = departureDate ?? dep.startDate;
      }
      const resolved = await resolveTourComponents(db, { ...body, departureDate });
      if (resolved.hotels.length === 0)
        return res.status(422).json({ message: "No priceable hotel choices found on this tour", warnings: resolved.warnings });
      const quote = await createPricingQuote({
        tourId: body.tourId,
        departureId: body.departureId,
        pricingRuleId: body.pricingRuleId,
        paxCount: body.paxCount,
        nights: resolved.nights,
        currency: body.currency,
        notes: body.notes,
        components: resolved.components,
        hotels: resolved.hotels.map((h) => ({
          hotelChoice: h.hotelChoice, hotelId: h.hotelId, hotelName: h.hotelName,
          nightlyRates: h.nightlyRates,
        })),
      }, (req.session as any).userId ?? null, { ...resolved.meta, warnings: resolved.warnings });
      res.json({ ...quote, warnings: resolved.warnings });
    } catch (e: any) { quoteErrorResponse(res, e); }
  });

  app.get("/api/pricing/quotes", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const tourId = typeof req.query.tourId === "string" ? req.query.tourId : undefined;
      res.json(await listPricingQuotes(db, tourId));
    } catch (e: any) { routeError(res, e); }
  });

  // Internal breakdown view: full cost/margin/adjustment detail.
  app.get("/api/pricing/quotes/:id/internal", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const result = await findInternalPricingQuote(db, req.params.id as string);
      if (!result) return res.status(404).json({ message: "Quote not found" });
      res.json({ ...result.quote, groupSizeBand: result.groupSizeBand, lineItems: result.lineItems });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Quote approval workflow ----
  // Status sets, the transition map, "final"→"approved" normalisation and the
  // approval-snapshot builder live in services/quote-lifecycle.ts (imported
  // above) so they can be unit-tested without a database.

  // Update quote status / customer assignment / notes (internal only).
  app.patch("/api/pricing/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const patchSchema = z.object({
        status: z.enum([
          "draft", "final", "archived", "pending_approval", "approved",
          "rejected", "sent", "viewed", "accepted", "expired", "cancelled",
        ]).optional(),
        customerId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }).strict();
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [existing] = await db.select().from(pricingQuotes)
        .where(eq(pricingQuotes.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Quote not found" });

      const userId = (req.session as any).userId as string;
      const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
      const from = normalizeQuoteStatus(existing.status);
      const to = parsed.data.status ? normalizeQuoteStatus(parsed.data.status) : undefined;
      // Pure decision logic lives in services/quote-lifecycle.ts; the role gate
      // and the DB writes below stay here.
      const transition = computeQuoteTransition({ from, to, userId, createdBy: existing.createdBy });
      if (!transition.ok)
        return res.status(transition.statusCode).json({ message: transition.message });
      const isTransition = transition.isTransition;
      if (transition.requiresAdmin) {
        // Only admins approve/reject; the requester may not approve their own quote.
        if (!await requireRole(req, res, ADMIN_ROLES)) return;
        if (transition.creatorConflict)
          return res.status(403).json({ message: "Quotes must be approved by someone other than their creator" });
      }
      // Sample the clock only after the role gate, matching the original handler
      // (approval timestamps and the expiry guard must not predate authorization).
      // A no-op status update (isTransition false) yields an empty patch: it must
      // not re-stamp approval or trip the expiry guard.
      const timing = buildTransitionTimingPatch({
        isTransition,
        to,
        userId,
        validUntil: existing.validUntil,
        now: new Date(),
      });
      if (!timing.ok)
        return res.status(timing.statusCode).json({ message: timing.message });
      Object.assign(update, transition.patch, timing.patch);
      // Perform the status update and, when approving, the immutable pricing
      // snapshot in a single atomic transaction (see
      // services/quote-workflow.ts). A snapshot failure rolls back the approval
      // so a quote can never exist in "approved" state without a complete audit
      // record.
      const result = await applyQuoteUpdate(db, storage, {
        quoteId: req.params.id as string,
        expectedStatus: existing.status,
        patch: update,
        isTransition,
        targetStatus: to,
        actorId: userId,
      });

      if (!result.ok)
        return res.status(409).json({ message: "Quote was updated concurrently; reload and retry" });
      res.json(result.quote);
    } catch (e: any) { routeError(res, e); }
  });

  // Manual selling-price override on a line item. Admins only; reason is
  // mandatory; the original price and the override are kept permanently.
  app.post("/api/pricing/quotes/:id/override", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const bodySchema = z.object({
        lineItemId: z.string().min(1),
        overrideValue: z.string(),
        reason: z.string(),
      }).strict();
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const check = insertPricingQuoteOverrideSchema.safeParse({
        quoteId: req.params.id, ...parsed.data,
      });
      if (!check.success) return res.status(400).json({ message: check.error.issues.map((i) => i.message).join("; ") });
      const userId = (req.session as any).userId as string;
      // Preflight read, status check, line-item preflight and the locked
      // transaction live in services/quote-workflow.ts; the statuses that permit
      // overriding are supplied by the route.
      const result = await applyPriceOverride(db, storage, {
        quoteId: req.params.id as string,
        lineItemId: parsed.data.lineItemId,
        overrideValue: parsed.data.overrideValue,
        reason: parsed.data.reason,
        actorId: userId,
        overridableStatuses: OVERRIDABLE_QUOTE_STATUSES,
      });
      if (!result.ok) {
        if (result.reason === "quote_not_found")
          return res.status(404).json({ message: "Quote not found" });
        if (result.reason === "line_item_not_found")
          return res.status(404).json({ message: "Line item not found on this quote" });
        return res.status(409).json({ message: `Cannot override prices on a ${result.status ?? "unknown"} quote; move it back to draft first` });
      }
      res.json(result.override);
    } catch (e: any) { routeError(res, e); }
  });

  // Override history for a quote (internal only).
  app.get("/api/pricing/quotes/:id/overrides", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      res.json(await listQuoteOverrides(db, req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  // Immutable pricing snapshots for a quote (internal only). Returns all
  // versions in ascending order; version 1 = first approval.
  app.get("/api/pricing/quotes/:id/snapshots", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const quote = await findPricingQuote(db, req.params.id as string);
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      res.json(await listQuoteSnapshots(db, req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Exchange rates (manual currency conversion table) ----
  app.get("/api/pricing/exchange-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rows = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.createdAt));
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/exchange-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertExchangeRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map((i) => i.message).join("; ") });
      const userId = (req.session as any).userId as string;
      const [row] = await db.insert(exchangeRates)
        .values({ ...parsed.data, enteredBy: userId }).returning();
      await storage.createAuditLog({
        entityType: "exchange_rate", entityId: row.id, action: "created",
        changedBy: userId, newValue: JSON.stringify({ pair: `${row.sourceCurrency}/${row.targetCurrency}`, rate: row.rate }),
      }).catch(() => {});
      res.status(201).json(row);
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/pricing/exchange-rates/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertExchangeRateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map((i) => i.message).join("; ") });
      const [existing] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Exchange rate not found" });
      const [row] = await db.update(exchangeRates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(exchangeRates.id, req.params.id as string)).returning();
      const userId = (req.session as any).userId as string;
      await storage.createAuditLog({
        entityType: "exchange_rate", entityId: row.id, action: "updated",
        changedBy: userId,
        previousValue: JSON.stringify({ rate: existing.rate, isActive: existing.isActive }),
        newValue: JSON.stringify({ rate: row.rate, isActive: row.isActive }),
      }).catch(() => {});
      res.json(row);
    } catch (e: any) { routeError(res, e); }
  });

  // Shape a quote for customer eyes: ONLY final selling prices per hotel
  // choice & occupancy. Never costs, margins, or multiplication factors.
  // The projection itself lives in services/quote-lifecycle.ts (allow-list).
  async function customerQuoteView(quote: typeof pricingQuotes.$inferSelect) {
    const lineItems = await listQuoteLineItems(db, quote.id);
    return buildCustomerQuoteView(quote, lineItems);
  }

  // CAS sent→viewed on the first customer look lives in
  // services/quote-workflow.ts (markQuoteViewed); the route supplies the audit
  // writer and payload.

  // Customer quote view. Access: internal pricing roles (preview any state),
  // or the assigned customer — final quotes only. 404 (not 403) on
  // unauthorized so quote existence isn't disclosed.
  app.get("/api/pricing/quotes/:id/customer", isAuthenticated, async (req, res) => {
    try {
      let quote = await findPricingQuote(db, req.params.id as string);
      if (!quote) return res.status(404).json({ message: "Quote not found" });

      const profile = await storage.getOrCreateProfile((req.session as any).userId);
      const isInternal = !!profile && PRICING_INTERNAL_ROLES.includes(profile.role);
      const isAssignedCustomer = !!quote.customerId
        && quote.customerId === (req.session as any).userId
        && CUSTOMER_VISIBLE_QUOTE_STATUSES.has(quote.status);
      if (!isInternal && !isAssignedCustomer)
        return res.status(404).json({ message: "Quote not found" });

      // First customer look at a sent quote marks it viewed. If a concurrent
      // request already transitioned it, keep the quote we loaded.
      if (isAssignedCustomer && quote.status === VIEWED_TRANSITION_FROM) {
        quote = await markQuoteViewed(db, storage, quote, { changedBy: (req.session as any).userId });
      }
      res.json(await customerQuoteView(quote));
    } catch (e: any) { routeError(res, e); }
  });

  // Share-token access: unguessable link for customers without an assigned
  // account. Final quotes only.
  // Public by design (task #25): the unguessable token is the credential.
  // Only final quotes resolve, and the response is shaped to selling
  // prices only via customerQuoteView.
  app.get("/api/pricing/quotes/shared/:token", async (req, res) => {
    try {
      let quote = await findPricingQuoteByShareToken(db, req.params.token as string);
      if (!quote || !CUSTOMER_VISIBLE_QUOTE_STATUSES.has(quote.status))
        return res.status(404).json({ message: "Quote not found" });
      if (quote.status === VIEWED_TRANSITION_FROM) {
        quote = await markQuoteViewed(db, storage, quote, { note: "Viewed via share link" });
      }
      res.json(await customerQuoteView(quote));
    } catch (e: any) { routeError(res, e); }
  });

}
