/**
 * xlsx-tour-utils.ts
 *
 * Pure functions extracted from the TourOps frontend components for use in
 * server-side tests.  These are replicated (not imported) because the source
 * files live in the tourops Vite/React package; importing them here would
 * drag in React/Vite resolution chains that are incompatible with the
 * api-server vitest environment.
 *
 * ⚠️  KEEP IN SYNC WITH:
 *   • artifacts/tourops/src/components/tour-export-button.tsx  → buildWorkbook()
 *   • artifacts/tourops/src/components/tour-import-dialog.tsx  → parseWorkbook()
 *
 * Any change to the cell layout, column order, or normalisation logic in the
 * client components MUST be reflected here, otherwise the spreadsheet-level
 * round-trip test will drift from reality.
 */

import * as XLSX from "xlsx";

// ---------------------------------------------------------------------------
// buildWorkbook — mirrors tour-export-button.tsx:buildWorkbook()
// Creates an xlsx workbook from the JSON array returned by GET /api/tours/export.
// ---------------------------------------------------------------------------
export function buildWorkbook(tours: any[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  const ITEM_TYPES = "arrival, departure, sight, hotel, guide, meal, transport, flight, custom";

  // Instructions sheet
  const instructions = [
    ["MASTER TOUR TEMPLATE — instructions"],
    [""],
    ["1. Fill the Tours sheet: one row per tour. 'ref' is any short code you invent (e.g. T1) to link the other sheets."],
    ["2. Fill the Days sheet: one row per day, linked by tourRef. dayNumber starts at 1."],
    ["3. Fill the Items sheet: one row per service on a day (hotel, guide, transport, sight entrance, meal...)."],
    [`4. itemType must be one of: ${ITEM_TYPES}.`],
    ["5. hotelName / sightName must match EXACTLY a name already registered in your catalogs. If cost is left blank, the catalog price is used."],
    ["6. countries and tags are comma-separated lists (e.g. Israel, Jordan)."],
    ["7. PRICES ARE CALCULATED AUTOMATICALLY by the pricing engine from the services you list here (hotels, guides, sights, transport)"],
    ["   plus what you configure in the Pricing screens: company margin, free tour-leader policy, group-size bus costing,"],
    ["   airfare per departure city and season, and taxes/fees. You do NOT need to fill any price on the Tours sheet."],
    ["8. basePrice / childPrice / singleSupplement are OPTIONAL fallbacks, shown only while a tour has no pricing data yet. Leave them blank."],
    ["9. Imported tours are created as DRAFTS — review them, set up pricing, then publish from the Tours page."],
    ["10. Upload this file in Staff Portal → Tours → Import Excel."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");

  // Tours sheet
  const toursHeader = ["ref", "title", "description", "category", "countries", "highlights", "inclusions", "exclusions", "tags", "imageUrl", "basePrice", "childPrice", "singleSupplement", "duration"];
  const toursRows = tours.map((t) => [
    t.ref,
    t.title,
    t.description,
    t.category,
    t.countries,
    t.highlights,
    t.inclusions,
    t.exclusions,
    t.tags,
    t.imageUrl,
    t.basePrice,
    t.childPrice,
    t.singleSupplement,
    t.duration ?? "",
  ]);
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([toursHeader, ...toursRows]), "Tours");

  // Days sheet
  const daysHeader = ["tourRef", "dayNumber", "title", "countryCode", "city", "description", "activities", "imageUrl"];
  const daysRows: any[][] = [];
  for (const t of tours) {
    for (const d of t.days ?? []) {
      daysRows.push([t.ref, d.dayNumber, d.title, d.countryCode, d.city, d.description, d.activities, d.imageUrl ?? ""]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([daysHeader, ...daysRows]), "Days");

  // Items sheet
  const itemsHeader = ["tourRef", "dayNumber", "itemType", "title", "startTime", "endTime", "cost", "currency", "isOptional", "bookingRequired", "hotelName", "sightName", "guideName", "sortOrder", "description"];
  const itemsRows: any[][] = [];
  for (const t of tours) {
    for (const d of t.days ?? []) {
      for (const it of d.items ?? []) {
        itemsRows.push([
          t.ref,
          d.dayNumber,
          it.itemType,
          it.title,
          it.startTime ?? "",
          it.endTime ?? "",
          it.cost ?? "",
          it.currency ?? "USD",
          it.isOptional ? "true" : "false",
          it.bookingRequired ? "true" : "false",
          it.hotelName ?? "",
          it.sightName ?? "",
          it.guideName ?? "",
          it.sortOrder ?? 0,
          it.description ?? "",
        ]);
      }
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([itemsHeader, ...itemsRows]), "Items");

  return wb;
}

// ---------------------------------------------------------------------------
// parseWorkbook — mirrors tour-import-dialog.tsx:parseWorkbook()
// Parses a WorkBook produced by buildWorkbook (or the blank template) into
// the JSON payload shape accepted by POST /api/tours/import.
// ---------------------------------------------------------------------------
export function parseWorkbook(wb: XLSX.WorkBook): { tours: any[] } {
  const sheet = (name: string, required = true) => {
    const ws = wb.Sheets[name];
    if (!ws) {
      if (required) throw new Error(`Missing sheet "${name}" — download the template and keep its sheet names.`);
      return [] as any[];
    }
    return XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
  };

  const toursRows = sheet("Tours").filter((r: any) => String(r.title).trim() && !String(r.title).startsWith("Example:"));
  const daysRows = sheet("Days");
  const itemsRows = sheet("Items");
  const departureRows = sheet("Departures", false);
  if (toursRows.length === 0) throw new Error("The Tours sheet has no rows to import (the example row is ignored).");

  // Referential integrity checks
  const tourRefs = new Set(toursRows.map((r: any) => String(r.ref || r.title).trim()));
  const problems: string[] = [];
  const dayKeys = new Set<string>();
  for (const d of daysRows) {
    const ref = String(d.tourRef ?? "").trim();
    if (!ref && !String(d.title ?? "").trim()) continue;
    if (!tourRefs.has(ref)) { problems.push(`Days row "${d.title || ref || "?"}": tourRef "${ref}" does not match any ref on the Tours sheet`); continue; }
    const n = Number(d.dayNumber);
    if (!Number.isInteger(n) || n < 1) { problems.push(`Days row "${d.title || "?"}" (tour ${ref}): dayNumber must be a whole number ≥ 1`); continue; }
    const key = `${ref}#${n}`;
    if (dayKeys.has(key)) problems.push(`Tour ${ref}: duplicate dayNumber ${n} on the Days sheet`);
    dayKeys.add(key);
  }
  for (const it of itemsRows) {
    const ref = String(it.tourRef ?? "").trim();
    if (!ref && !String(it.title ?? "").trim()) continue;
    if (!tourRefs.has(ref)) { problems.push(`Items row "${it.title || "?"}": tourRef "${ref}" does not match any ref on the Tours sheet`); continue; }
    if (!dayKeys.has(`${ref}#${Number(it.dayNumber)}`)) problems.push(`Items row "${it.title || "?"}" (tour ${ref}): no Days row with dayNumber ${it.dayNumber}`);
  }
  for (const dep of departureRows) {
    const ref = String(dep.tourRef ?? "").trim();
    if (!ref && !String(dep.startDate ?? "").trim()) continue;
    if (!tourRefs.has(ref)) problems.push(`Departures row (${dep.startDate || "?"}): tourRef "${ref}" does not match any ref on the Tours sheet`);
  }
  if (problems.length) throw new Error(problems.slice(0, 5).join(" • ") + (problems.length > 5 ? ` • …and ${problems.length - 5} more` : ""));

  const list = (v: any) => String(v ?? "").split(",").map((s: string) => s.trim()).filter(Boolean);
  const str = (v: any) => { const s = String(v ?? "").trim(); return s || undefined; };
  const num = (v: any) => { const s = String(v ?? "").trim(); return s === "" ? undefined : s; };
  const boolFalse = (v: any) => { const s = String(v ?? "").trim().toLowerCase(); return s === "true" || s === "1" || s === "yes"; };
  const boolTrue = (v: any) => { const s = String(v ?? "").trim().toLowerCase(); return !(s === "false" || s === "no" || s === "0"); };

  return {
    tours: toursRows.map((r: any) => {
      const ref = String(r.ref || r.title).trim();
      const days = daysRows
        .filter((d: any) => String(d.tourRef).trim() === ref)
        .sort((a: any, b: any) => Number(a.dayNumber) - Number(b.dayNumber))
        .map((d: any) => ({
          dayNumber: Number(d.dayNumber),
          title: String(d.title || `Day ${d.dayNumber}`),
          countryCode: str(d.countryCode),
          city: str(d.city),
          description: str(d.description),
          activities: str(d.activities),
          imageUrl: str(d.imageUrl),
          items: itemsRows
            .filter((it: any) => String(it.tourRef).trim() === ref && Number(it.dayNumber) === Number(d.dayNumber))
            .map((it: any) => ({
              itemType: String(it.itemType || "custom").trim().toLowerCase(),
              title: String(it.title || "").trim(),
              startTime: str(it.startTime),
              endTime: str(it.endTime),
              cost: num(it.cost),
              currency: str(it.currency) ?? "USD",
              isOptional: boolFalse(it.isOptional),
              bookingRequired: boolFalse(it.bookingRequired),
              hotelName: str(it.hotelName),
              sightName: str(it.sightName),
              guideName: str(it.guideName),
              sortOrder: it.sortOrder !== undefined && it.sortOrder !== "" ? Number(it.sortOrder) : undefined,
              description: str(it.description),
            })),
        }));
      const departures = departureRows
        .filter((dep: any) => String(dep.tourRef ?? "").trim() === ref && String(dep.startDate ?? "").trim())
        .map((dep: any) => ({
          startDate: String(dep.startDate).trim(),
          endDate: String(dep.endDate ?? "").trim() || String(dep.startDate).trim(),
          capacity: dep.capacity !== "" ? Number(dep.capacity) : undefined,
          pricePerPerson: dep.pricePerPerson !== "" ? Number(dep.pricePerPerson) : undefined,
          allowPublicJoin: boolTrue(dep.allowPublicJoin),
        }));
      const explicitDuration = num(r.duration);
      return {
        ref,
        title: String(r.title).trim(),
        description: str(r.description),
        category: str(r.category),
        countries: list(r.countries),
        tags: list(r.tags),
        basePrice: num(r.basePrice) ?? "0",
        childPrice: num(r.childPrice),
        singleSupplement: num(r.singleSupplement),
        highlights: str(r.highlights),
        inclusions: str(r.inclusions),
        exclusions: str(r.exclusions),
        imageUrl: str(r.imageUrl),
        duration: explicitDuration ? Number(explicitDuration) : undefined,
        days,
        departures,
      };
    }),
  };
}
