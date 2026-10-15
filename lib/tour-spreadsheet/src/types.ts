/**
 * types.ts
 *
 * Public DTOs for the shared tour spreadsheet contract.
 *
 * These describe the JSON payloads exchanged with the server import/export
 * endpoints. They are documentation-grade types: the runtime functions in
 * workbook.ts intentionally keep loose `any`-based internals so behaviour is
 * byte-for-byte identical to the original client components.
 */

/** A single cell value as accepted/emitted by the spreadsheet helpers. */
export type SpreadsheetCell = string | number | boolean | null | undefined;

/** A parsed sheet row keyed by column header. */
export interface WorkbookRow {
  [column: string]: SpreadsheetCell;
}

// ---------------------------------------------------------------------------
// Parsed output (POST /api/tours/import payload shape)
// ---------------------------------------------------------------------------

export interface ParsedItem {
  itemType: string;
  title: string;
  startTime?: string;
  endTime?: string;
  /** Decimal string preserved as-is (never coerced to a float). */
  cost?: string;
  currency: string;
  isOptional: boolean;
  bookingRequired: boolean;
  hotelName?: string;
  sightName?: string;
  guideName?: string;
  sortOrder?: number;
  description?: string;
}

export interface ParsedDay {
  dayNumber: number;
  title: string;
  countryCode?: string;
  city?: string;
  description?: string;
  activities?: string;
  imageUrl?: string;
  items: ParsedItem[];
}

export interface ParsedDeparture {
  startDate: string;
  /** Defaults to startDate when the sheet cell is blank. */
  endDate: string;
  capacity?: number;
  pricePerPerson?: number;
  /** Defaults to true when the sheet cell is blank. */
  allowPublicJoin: boolean;
}

export interface ParsedTour {
  ref: string;
  title: string;
  description?: string;
  category?: string;
  countries: string[];
  tags: string[];
  /** Decimal string; defaults to "0" when blank. */
  basePrice: string;
  childPrice?: string;
  singleSupplement?: string;
  highlights?: string;
  inclusions?: string;
  exclusions?: string;
  imageUrl?: string;
  duration?: number;
  days: ParsedDay[];
  departures: ParsedDeparture[];
}

export interface ParsedWorkbook {
  tours: ParsedTour[];
}
