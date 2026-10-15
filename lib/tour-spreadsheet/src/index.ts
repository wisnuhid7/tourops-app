/**
 * @workspace/tour-spreadsheet
 *
 * Single source of truth for the Master Tour Template spreadsheet contract,
 * shared by the staff-portal UI (Vite/React) and the api-server test helpers.
 *
 * Public surface:
 *   • buildTemplate()  — blank template workbook (Instructions/Tours/Days/Items/Departures)
 *   • buildWorkbook()  — export workbook from GET /api/tours/export JSON
 *   • parseWorkbook()  — parse a workbook into the POST /api/tours/import payload
 *   • sheet name + column constants (FROZEN contract)
 *   • cell normalizers and instruction rows
 *   • DTO types (see ./types)
 */

export { buildTemplate, buildWorkbook, parseWorkbook } from "./workbook";

export {
  DAYS_HEADERS,
  DEPARTURES_HEADERS,
  ITEMS_HEADERS,
  ITEM_TYPES,
  SHEET_NAMES,
  TOURS_HEADERS,
} from "./headers";

export { EXPORT_INSTRUCTIONS, TEMPLATE_INSTRUCTIONS } from "./instructions";

export { boolFalse, boolTrue, list, num, str } from "./normalizers";

export type {
  ParsedDay,
  ParsedDeparture,
  ParsedItem,
  ParsedTour,
  ParsedWorkbook,
  SpreadsheetCell,
  WorkbookRow,
} from "./types";
