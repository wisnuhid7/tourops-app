/**
 * headers.ts
 *
 * Canonical sheet names and column orders for the Master Tour Template.
 *
 * ⚠️ FROZEN CONTRACT — these arrays define the on-disk spreadsheet layout.
 * Changing order or spelling breaks both the client round-trip and any
 * previously exported files. Add new columns at the END only, and update the
 * consumers in the same change.
 */

/** Sheet tab names, in workbook append order. */
export const SHEET_NAMES = {
  instructions: "Instructions",
  tours: "Tours",
  days: "Days",
  items: "Items",
  departures: "Departures",
} as const;

/** Allowed `itemType` values, rendered into the instructions sheet. */
export const ITEM_TYPES =
  "arrival, departure, sight, hotel, guide, meal, transport, flight, custom";

/** Tours sheet columns, in order. */
export const TOURS_HEADERS = [
  "ref",
  "title",
  "description",
  "category",
  "countries",
  "highlights",
  "inclusions",
  "exclusions",
  "tags",
  "imageUrl",
  "basePrice",
  "childPrice",
  "singleSupplement",
  "duration",
] as const;

/** Days sheet columns, in order. */
export const DAYS_HEADERS = [
  "tourRef",
  "dayNumber",
  "title",
  "countryCode",
  "city",
  "description",
  "activities",
  "imageUrl",
] as const;

/** Items sheet columns, in order. */
export const ITEMS_HEADERS = [
  "tourRef",
  "dayNumber",
  "itemType",
  "title",
  "startTime",
  "endTime",
  "cost",
  "currency",
  "isOptional",
  "bookingRequired",
  "hotelName",
  "sightName",
  "guideName",
  "sortOrder",
  "description",
] as const;

/** Departures sheet columns, in order. */
export const DEPARTURES_HEADERS = [
  "tourRef",
  "startDate",
  "endDate",
  "capacity",
  "pricePerPerson",
  "allowPublicJoin",
] as const;
