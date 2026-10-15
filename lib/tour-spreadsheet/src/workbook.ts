/**
 * workbook.ts
 *
 * The shared tour spreadsheet contract: build and parse the Master Tour
 * Template workbook.
 *
 * These three functions are byte-for-byte behaviour-preserving ports of:
 *   • artifacts/tourops/src/components/tour-import-dialog.tsx → buildTemplate(), parseWorkbook()
 *   • artifacts/tourops/src/components/tour-export-button.tsx  → buildWorkbook()
 *
 * Do NOT change cell layout, column order, sheet order, defaults, or
 * normalisation semantics without updating every consumer in the same change.
 */

import * as XLSX from "xlsx";
import {
  DAYS_HEADERS,
  DEPARTURES_HEADERS,
  ITEMS_HEADERS,
  SHEET_NAMES,
  TOURS_HEADERS,
} from "./headers";
import { EXPORT_INSTRUCTIONS, TEMPLATE_INSTRUCTIONS } from "./instructions";
import { boolFalse, boolTrue, list, num, str } from "./normalizers";

// ---------------------------------------------------------------------------
// buildTemplate — blank Master Tour Template (Instructions/Tours/Days/Items/Departures)
// Mirrors tour-import-dialog.tsx:buildTemplate()
// ---------------------------------------------------------------------------
export function buildTemplate(): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(TEMPLATE_INSTRUCTIONS),
    SHEET_NAMES.instructions,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...TOURS_HEADERS],
      ["T1", "Example: Highlights of Israel – 5 Days", "A short example tour. Delete this row.", "cultural", "Israel", "Old City of Jerusalem; Dead Sea", "Hotels; Guide; Transport", "Flights; Travel insurance", "faith, history", "", "", "", "", 5],
    ]),
    SHEET_NAMES.tours,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...DAYS_HEADERS],
      ["T1", 1, "Arrival in Tel Aviv", "IL", "Tel Aviv", "Welcome and transfer to the hotel.", "Airport pickup; Welcome dinner", ""],
      ["T1", 2, "Jerusalem Old City", "IL", "Jerusalem", "Full day walking tour.", "Western Wall; Via Dolorosa", ""],
    ]),
    SHEET_NAMES.days,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...ITEMS_HEADERS],
      ["T1", 1, "transport", "Airport transfer", "14:00", "15:00", 60, "USD", "false", "false", "", "", "", 0, "Private van"],
      ["T1", 1, "hotel", "Overnight in Tel Aviv", "", "", "", "USD", "false", "false", "Jerusalem Hotel", "", "", 1, "Leave cost blank to use the catalog rate"],
      ["T1", 2, "guide", "Licensed guide (full day)", "09:00", "17:00", 250, "USD", "false", "false", "", "", "Licensed Guide Name", 0, "Leave cost blank to use the catalog rate"],
      ["T1", 2, "sight", "Entrance fees", "10:00", "", 25, "USD", "true", "false", "", "Sight Name", "", 1, ""],
    ]),
    SHEET_NAMES.items,
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      [...DEPARTURES_HEADERS],
      ["T1", "2026-03-15", "2026-03-19", 20, "", "TRUE"],
      ["T1", "2026-04-12", "2026-04-16", 16, 1200, "TRUE"],
    ]),
    SHEET_NAMES.departures,
  );
  return wb;
}

// ---------------------------------------------------------------------------
// buildWorkbook — export workbook from GET /api/tours/export JSON
// Mirrors tour-export-button.tsx:buildWorkbook()
// NOTE: intentionally omits a Departures sheet (matches existing behaviour),
// so exported files round-trip tours/days/items only.
// ---------------------------------------------------------------------------
export function buildWorkbook(tours: any[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ── Instructions sheet (same as the blank template) ──────────────────────
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(EXPORT_INSTRUCTIONS),
    SHEET_NAMES.instructions,
  );

  // ── Tours sheet ───────────────────────────────────────────────────────────
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
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([[...TOURS_HEADERS], ...toursRows]),
    SHEET_NAMES.tours,
  );

  // ── Days sheet ────────────────────────────────────────────────────────────
  const daysRows: any[][] = [];
  for (const t of tours) {
    for (const d of t.days ?? []) {
      daysRows.push([t.ref, d.dayNumber, d.title, d.countryCode, d.city, d.description, d.activities, d.imageUrl ?? ""]);
    }
  }
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([[...DAYS_HEADERS], ...daysRows]),
    SHEET_NAMES.days,
  );

  // ── Items sheet ───────────────────────────────────────────────────────────
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
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([[...ITEMS_HEADERS], ...itemsRows]),
    SHEET_NAMES.items,
  );

  return wb;
}

// ---------------------------------------------------------------------------
// parseWorkbook — parse a WorkBook into the POST /api/tours/import payload
// Mirrors tour-import-dialog.tsx:parseWorkbook()
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

  const toursRows = sheet(SHEET_NAMES.tours).filter((r: any) => String(r.title).trim() && !String(r.title).startsWith("Example:"));
  const daysRows = sheet(SHEET_NAMES.days);
  const itemsRows = sheet(SHEET_NAMES.items);
  const departureRows = sheet(SHEET_NAMES.departures, false);
  if (toursRows.length === 0) throw new Error("The Tours sheet has no rows to import (the example row is ignored).");

  // Referential integrity BEFORE posting: orphan rows and bad day numbers
  // must fail loudly, not be silently dropped.
  const tourRefs = new Set(toursRows.map((r: any) => String(r.ref || r.title).trim()));
  const problems: string[] = [];
  const dayKeys = new Set<string>();
  for (const d of daysRows) {
    const ref = String(d.tourRef ?? "").trim();
    if (!ref && !String(d.title ?? "").trim()) continue; // fully blank row
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
    if (!ref && !String(dep.startDate ?? "").trim()) continue; // fully blank row
    if (!tourRefs.has(ref)) problems.push(`Departures row (${dep.startDate || "?"}): tourRef "${ref}" does not match any ref on the Tours sheet`);
  }
  if (problems.length) throw new Error(problems.slice(0, 5).join(" • ") + (problems.length > 5 ? ` • …and ${problems.length - 5} more` : ""));

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
