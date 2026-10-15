/**
 * instructions.ts
 *
 * The text rendered on the "Instructions" sheet.
 *
 * Two variants are preserved intentionally:
 *   • TEMPLATE_INSTRUCTIONS — used by the blank downloadable template
 *     (includes the Departures-sheet guidance; 17 rows).
 *   • EXPORT_INSTRUCTIONS   — used by the export workbook, which does NOT
 *     write a Departures sheet (10 numbered steps; 14 rows).
 *
 * These are byte-for-byte copies of the original arrays so the generated
 * spreadsheets remain identical to what users already have.
 */

import { ITEM_TYPES } from "./headers";

/** Instructions sheet rows for the blank Master Tour Template. */
export const TEMPLATE_INSTRUCTIONS: string[][] = [
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
  ["10. Fill the Departures sheet to create bookable departures with dates and seat capacity (optional but recommended)."],
  ["    startDate / endDate must be YYYY-MM-DD. capacity is the total seat count (integer ≥ 1, defaults to 20)."],
  ["    pricePerPerson is an optional whole-number price override. allowPublicJoin: TRUE lets customers discover and join; FALSE keeps it staff-only."],
  ["11. Upload this file in Staff Portal → Tours → Import Excel."],
];

/** Instructions sheet rows for the export workbook (no Departures sheet). */
export const EXPORT_INSTRUCTIONS: string[][] = [
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
