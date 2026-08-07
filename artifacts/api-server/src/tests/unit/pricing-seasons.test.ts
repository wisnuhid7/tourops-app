/**
 * Unit tests for pricing-season logic:
 * - patchPricingSeasonSchema: validates date format and ordering including
 *   one-bound PATCH updates (only startDate or only endDate supplied).
 * - sortBySeasonWindow: rate-card preference ordering — season-specific cards
 *   (window fully within season) sort ahead of year-round defaults.
 *
 * No DB or network access; all tests are pure/synchronous.
 */
import { describe, it, expect } from "vitest";
import { patchPricingSeasonSchema, insertPricingSeasonSchema } from "@workspace/db";
import { sortBySeasonWindow } from "../../services/rate-resolver";

// ---- insertPricingSeasonSchema ----
describe("insertPricingSeasonSchema", () => {
  const valid = {
    name: "Summer Peak",
    startDate: "2025-06-01",
    endDate: "2025-08-31",
    priority: 10,
    isActive: true,
  };

  it("accepts a well-formed season", () => {
    const r = insertPricingSeasonSchema.safeParse(valid);
    expect(r.success).toBe(true);
  });

  it("rejects invalid startDate format", () => {
    const r = insertPricingSeasonSchema.safeParse({ ...valid, startDate: "01-06-2025" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error)).toContain("startDate");
  });

  it("rejects inverted date range", () => {
    const r = insertPricingSeasonSchema.safeParse({ ...valid, startDate: "2025-09-01", endDate: "2025-08-01" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error)).toContain("endDate");
  });

  it("accepts same-day range", () => {
    const r = insertPricingSeasonSchema.safeParse({ ...valid, startDate: "2025-06-01", endDate: "2025-06-01" });
    expect(r.success).toBe(true);
  });
});

// ---- patchPricingSeasonSchema ----
describe("patchPricingSeasonSchema", () => {
  it("accepts an empty patch (all fields optional)", () => {
    expect(patchPricingSeasonSchema.safeParse({}).success).toBe(true);
  });

  it("accepts name-only patch", () => {
    expect(patchPricingSeasonSchema.safeParse({ name: "Holiday" }).success).toBe(true);
  });

  it("accepts priority-only patch", () => {
    expect(patchPricingSeasonSchema.safeParse({ priority: 5 }).success).toBe(true);
  });

  it("accepts isActive-only patch", () => {
    expect(patchPricingSeasonSchema.safeParse({ isActive: false }).success).toBe(true);
  });

  it("accepts startDate-only patch without checking endDate ordering (single-bound)", () => {
    // The schema cannot know the persisted endDate, so single-bound patches
    // pass schema validation; the route merges with the DB record and checks.
    const r = patchPricingSeasonSchema.safeParse({ startDate: "2025-07-01" });
    expect(r.success).toBe(true);
  });

  it("accepts endDate-only patch without checking startDate ordering (single-bound)", () => {
    const r = patchPricingSeasonSchema.safeParse({ endDate: "2025-05-01" });
    expect(r.success).toBe(true);
  });

  it("rejects invalid date format on startDate", () => {
    const r = patchPricingSeasonSchema.safeParse({ startDate: "2025/07/01" });
    expect(r.success).toBe(false);
  });

  it("rejects inverted range when both dates are provided", () => {
    const r = patchPricingSeasonSchema.safeParse({ startDate: "2025-09-01", endDate: "2025-08-01" });
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error)).toContain("endDate");
  });

  it("accepts same-day range when both dates are provided", () => {
    const r = patchPricingSeasonSchema.safeParse({ startDate: "2025-06-15", endDate: "2025-06-15" });
    expect(r.success).toBe(true);
  });
});

// ---- sortBySeasonWindow ----
describe("sortBySeasonWindow", () => {
  const season = { startDate: "2025-12-15", endDate: "2026-01-05" };

  const seasonSpecific = { id: "a", validFrom: new Date("2025-12-15"), validTo: new Date("2026-01-05") };
  const narrowWithin   = { id: "b", validFrom: new Date("2025-12-20"), validTo: new Date("2025-12-31") };
  const yearRound      = { id: "c", validFrom: null,                   validTo: null };
  const overlapping    = { id: "d", validFrom: new Date("2025-11-01"), validTo: new Date("2026-02-28") }; // wider than season
  const onebound       = { id: "e", validFrom: new Date("2025-12-15"), validTo: null };                   // missing end bound

  it("returns rows unchanged when no season is matched", () => {
    const rows = [yearRound, seasonSpecific];
    expect(sortBySeasonWindow(rows, null)).toEqual(rows);
  });

  it("season-specific cards sort before year-round defaults", () => {
    const rows = [yearRound, seasonSpecific];
    const sorted = sortBySeasonWindow(rows, season);
    expect(sorted[0].id).toBe("a"); // season-specific first
    expect(sorted[1].id).toBe("c"); // year-round last
  });

  it("narrow window fully within season also sorts first", () => {
    const rows = [yearRound, narrowWithin];
    const sorted = sortBySeasonWindow(rows, season);
    expect(sorted[0].id).toBe("b");
    expect(sorted[1].id).toBe("c");
  });

  it("window wider than season is treated as general (not season-specific)", () => {
    const rows = [overlapping, seasonSpecific];
    const sorted = sortBySeasonWindow(rows, season);
    expect(sorted[0].id).toBe("a"); // exact season first
    expect(sorted[1].id).toBe("d"); // wider range → general
  });

  it("one-bound card (missing validTo) is treated as general", () => {
    const rows = [onebound, seasonSpecific];
    const sorted = sortBySeasonWindow(rows, season);
    expect(sorted[0].id).toBe("a"); // season-specific first
    expect(sorted[1].id).toBe("e"); // one-bound → general
  });

  it("preserves relative order within each tier", () => {
    // Two season-specific and two general, all in original order a→b→c→d.
    const rows = [
      { id: "a", validFrom: new Date("2025-12-15"), validTo: new Date("2026-01-05") },
      { id: "b", validFrom: null, validTo: null },
      { id: "c", validFrom: new Date("2025-12-20"), validTo: new Date("2025-12-31") },
      { id: "d", validFrom: null, validTo: null },
    ];
    const sorted = sortBySeasonWindow(rows, season);
    expect(sorted.map(r => r.id)).toEqual(["a", "c", "b", "d"]);
  });

  it("global vs destination-scoped priority: sortBySeasonWindow has no knowledge of destination; caller filters before sort", () => {
    // When the resolver filters seasons by destination, it passes only the
    // applicable rows to sortBySeasonWindow. This test confirms the function
    // accepts an already-filtered row set without modification.
    const destSpecific = { id: "dest", validFrom: new Date("2025-12-15"), validTo: new Date("2026-01-05") };
    const sorted = sortBySeasonWindow([destSpecific], season);
    expect(sorted).toHaveLength(1);
    expect(sorted[0].id).toBe("dest");
  });

  it("no-match: when caller passes null season (no match), rows are returned as-is (year-round wins)", () => {
    // This reflects the resolver warning path: no season matched the departure
    // date, so sortBySeasonWindow is a no-op and the original order (DB newest-
    // first) determines which card is used.
    const rows = [yearRound, seasonSpecific];
    expect(sortBySeasonWindow(rows, null)).toEqual(rows);
  });
});
