import { useState } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Upload, FileDown, CheckCircle2, XCircle, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Master Tour Template — Excel bulk import.
// Sheet contract (must stay in sync with buildTemplate() and the server's
// POST /api/tours/import):
//   Tours: ref | title | description | category | countries | basePrice |
//          childPrice | singleSupplement | highlights | inclusions |
//          exclusions | tags | imageUrl
//   Days:  tourRef | dayNumber | title | countryCode | city | description | activities
//   Items: tourRef | dayNumber | itemType | title | startTime | cost |
//          hotelName | sightName | description
// countries/tags are comma-separated. hotelName/sightName must match the
// catalog by name; leaving cost blank pulls the catalog price.
// ---------------------------------------------------------------------------

const ITEM_TYPES = "arrival, departure, sight, hotel, guide, meal, transport, flight, custom";

function buildTemplate() {
  const wb = XLSX.utils.book_new();
  const instructions = [
    ["MASTER TOUR TEMPLATE — instructions"],
    [""],
    ["1. Fill the Tours sheet: one row per tour. 'ref' is any short code you invent (e.g. T1) to link the other sheets."],
    ["2. Fill the Days sheet: one row per day, linked by tourRef. dayNumber starts at 1."],
    ["3. Fill the Items sheet: one row per service on a day (hotel, guide, transport, sight entrance, meal...)."],
    [`4. itemType must be one of: ${ITEM_TYPES}.`],
    ["5. hotelName / sightName must match EXACTLY a name already registered in your catalogs. If cost is left blank, the catalog price is used."],
    ["6. countries and tags are comma-separated lists (e.g. Israel, Jordan)."],
    ["7. Imported tours are created as DRAFTS — review them, then publish from the Tours page."],
    ["8. Upload this file in Staff Portal → Tours → Import Excel."],
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(instructions), "Instructions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["ref", "title", "description", "category", "countries", "basePrice", "childPrice", "singleSupplement", "highlights", "inclusions", "exclusions", "tags", "imageUrl"],
    ["T1", "Example: Highlights of Israel – 5 Days", "A short example tour. Delete this row.", "cultural", "Israel", 800, 400, 250, "Old City of Jerusalem; Dead Sea", "Hotels; Guide; Transport", "Flights; Travel insurance", "faith, history", ""],
  ]), "Tours");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["tourRef", "dayNumber", "title", "countryCode", "city", "description", "activities"],
    ["T1", 1, "Arrival in Tel Aviv", "IL", "Tel Aviv", "Welcome and transfer to the hotel.", "Airport pickup; Welcome dinner"],
    ["T1", 2, "Jerusalem Old City", "IL", "Jerusalem", "Full day walking tour.", "Western Wall; Via Dolorosa"],
  ]), "Days");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["tourRef", "dayNumber", "itemType", "title", "startTime", "cost", "hotelName", "sightName", "description"],
    ["T1", 1, "transport", "Airport transfer", "14:00", 60, "", "", "Private van"],
    ["T1", 1, "hotel", "Overnight in Tel Aviv", "", "", "Jerusalem Hotel", "", "Leave cost blank to use the catalog rate"],
    ["T1", 2, "guide", "Licensed guide (full day)", "09:00", 250, "", "", ""],
    ["T1", 2, "sight", "Entrance fees", "10:00", 25, "", "", ""],
  ]), "Items");
  return wb;
}

function parseWorkbook(wb: XLSX.WorkBook): { tours: any[] } {
  const sheet = (name: string) => {
    const ws = wb.Sheets[name];
    if (!ws) throw new Error(`Missing sheet "${name}" — download the template and keep its sheet names.`);
    return XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
  };
  const toursRows = sheet("Tours").filter((r) => String(r.title).trim() && !String(r.title).startsWith("Example:"));
  const daysRows = sheet("Days");
  const itemsRows = sheet("Items");
  if (toursRows.length === 0) throw new Error("The Tours sheet has no rows to import (the example row is ignored).");

  // Referential integrity BEFORE posting: orphan rows and bad day numbers
  // must fail loudly, not be silently dropped.
  const tourRefs = new Set(toursRows.map((r) => String(r.ref || r.title).trim()));
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
  if (problems.length) throw new Error(problems.slice(0, 5).join(" • ") + (problems.length > 5 ? ` • …and ${problems.length - 5} more` : ""));

  const list = (v: any) => String(v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const str = (v: any) => { const s = String(v ?? "").trim(); return s || undefined; };
  const num = (v: any) => { const s = String(v ?? "").trim(); return s === "" ? undefined : s; };

  return {
    tours: toursRows.map((r) => {
      const ref = String(r.ref || r.title).trim();
      const days = daysRows
        .filter((d) => String(d.tourRef).trim() === ref)
        .sort((a, b) => Number(a.dayNumber) - Number(b.dayNumber))
        .map((d) => ({
          dayNumber: Number(d.dayNumber),
          title: String(d.title || `Day ${d.dayNumber}`),
          countryCode: str(d.countryCode),
          city: str(d.city),
          description: str(d.description),
          activities: str(d.activities),
          items: itemsRows
            .filter((it) => String(it.tourRef).trim() === ref && Number(it.dayNumber) === Number(d.dayNumber))
            .map((it) => ({
              itemType: String(it.itemType || "custom").trim().toLowerCase(),
              title: String(it.title || "").trim(),
              startTime: str(it.startTime),
              cost: num(it.cost),
              hotelName: str(it.hotelName),
              sightName: str(it.sightName),
              description: str(it.description),
            })),
        }));
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
        days,
      };
    }),
  };
}

export function TourImportDialog() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<{ created: number; failed: number; results: any[] } | null>(null);

  const importMutation = useMutation({
    mutationFn: async (payload: { tours: any[] }) => {
      const res = await apiRequest("POST", "/api/tours/import", payload);
      return res.json();
    },
    onSuccess: (data) => {
      setResults(data);
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tours/accommodation-summary"] });
      toast({ title: `${data.created} ${t("tours_imported")}` });
    },
    onError: (e: any) => toast({ title: t("import_failed"), description: e?.message, variant: "destructive" }),
  });

  const onFile = async (file: File) => {
    setResults(null);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      importMutation.mutate(parseWorkbook(wb));
    } catch (e: any) {
      toast({ title: t("import_failed"), description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setResults(null); }}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-tours">
          <Upload className="h-4 w-4 mr-2" />{t("import_excel")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("master_tour_template")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("import_tours_hint")}</p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => XLSX.writeFile(buildTemplate(), "master-tour-template.xlsx")}
            data-testid="button-download-template"
          >
            <FileDown className="h-4 w-4 mr-2" />{t("download_template")}
          </Button>
          <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-muted/50">
            {importMutation.isPending ? <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /> : <Upload className="h-6 w-6 text-muted-foreground" />}
            <span className="text-sm text-muted-foreground">{t("upload_filled_template")}</span>
            <input
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              data-testid="input-import-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
            />
          </label>
          {results && (
            <div className="space-y-1 max-h-48 overflow-y-auto text-sm" data-testid="import-results">
              {results.results.map((r: any, i: number) => (
                <div key={i} className="flex items-start gap-2">
                  {r.ok ? <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" /> : <XCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />}
                  <span>
                    <span className="font-medium">{r.title || r.ref}</span>
                    {r.ok ? ` — ${r.days} ${t("days")}` : ` — ${r.error}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
