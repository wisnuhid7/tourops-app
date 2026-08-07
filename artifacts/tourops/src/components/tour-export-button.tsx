import { useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { FileDown, Loader2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

// ---------------------------------------------------------------------------
// Builds an Excel workbook in the exact Master Tour Template format so the
// downloaded file can be edited and re-uploaded via Import Excel without any
// manual reformatting.  Hotel and sight references are preserved as names so
// the catalog lookup in the importer resolves them correctly.
// ---------------------------------------------------------------------------

const ITEM_TYPES = "arrival, departure, sight, hotel, guide, meal, transport, flight, custom";

function buildWorkbook(tours: any[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();

  // ── Instructions sheet (same as the blank template) ──────────────────────
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

  // ── Tours sheet ───────────────────────────────────────────────────────────
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

  // ── Days sheet ────────────────────────────────────────────────────────────
  const daysHeader = ["tourRef", "dayNumber", "title", "countryCode", "city", "description", "activities", "imageUrl"];
  const daysRows: any[][] = [];
  for (const t of tours) {
    for (const d of t.days ?? []) {
      daysRows.push([t.ref, d.dayNumber, d.title, d.countryCode, d.city, d.description, d.activities, d.imageUrl ?? ""]);
    }
  }
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([daysHeader, ...daysRows]), "Days");

  // ── Items sheet ───────────────────────────────────────────────────────────
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

interface Props {
  /** When provided, only those tour IDs are exported; omit to export all. */
  ids?: string[];
  /** Label suffix shown next to the count, defaults to using the search-visible list */
  label?: string;
}

export function TourExportButton({ ids, label }: Props) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);

  const handleExport = async () => {
    setLoading(true);
    try {
      const query = ids && ids.length > 0 ? `?ids=${ids.join(",")}` : "";
      const res = await apiRequest("GET", `/api/tours/export${query}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as any)?.message ?? "Export failed");
      }
      const { tours } = await res.json();
      const wb = buildWorkbook(tours);
      const timestamp = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `tours-export-${timestamp}.xlsx`);
      toast({ title: `${tours.length} ${t("export_excel_success")}` });
    } catch (e: any) {
      toast({ title: t("export_excel_error"), description: e?.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={handleExport}
      disabled={loading}
      data-testid="button-export-tours"
    >
      {loading
        ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
        : <FileDown className="h-4 w-4 mr-2" />}
      {loading ? t("export_excel_downloading") : (label ?? t("export_excel"))}
    </Button>
  );
}
