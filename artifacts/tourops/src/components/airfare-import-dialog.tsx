import { useState } from "react";
import * as XLSX from "xlsx";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Upload, FileDown, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Airfare Rates Template — Excel bulk import.
// Sheet contract (must stay in sync with the server's
// POST /api/pricing/airfare-rates/import):
//   AirfareRates: origin | destination | airline | ratePerPerson | childRate |
//                 infantRate | currency | validFrom | validTo
// validFrom/validTo define the SEASON (leave blank = always valid).
// Dates must be entered as YYYY-MM-DD. Import is all-or-nothing: any bad row
// rejects the whole file.
// ---------------------------------------------------------------------------

function buildTemplate() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["AIRFARE RATES TEMPLATE — instructions"],
    [""],
    ["1. One row per route + season on the AirfareRates sheet."],
    ["2. origin / destination: city name or IATA airport code (e.g. TLV, Tel Aviv). Use the same spelling everywhere."],
    ["3. ratePerPerson: adult fare. childRate / infantRate are optional (blank child = same as adult, blank infant = no infant fare)."],
    ["4. validFrom / validTo define the SEASON, format YYYY-MM-DD (e.g. 2026-06-01). Leave both blank for a year-round fare."],
    ["5. For several seasons on the same route, add one row per season (e.g. TLV → AMM summer, TLV → AMM winter)."],
    ["6. currency defaults to USD if left blank."],
    ["7. These fares apply automatically to EVERY tour priced with this route — update once, all tours follow."],
    ["8. The import is all-or-nothing: if any row has an error, nothing is imported and you'll see what to fix."],
    ["9. Upload in Staff Portal → Pricing Engine → Airfare Rates → Import Excel."],
  ]), "Instructions");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["origin", "destination", "airline", "ratePerPerson", "childRate", "infantRate", "currency", "validFrom", "validTo"],
    ["Example: TLV", "AMM", "Royal Jordanian", 320, 250, 50, "USD", "2026-06-01", "2026-08-31"],
    ["Example: TLV", "AMM", "Royal Jordanian", 260, 200, 50, "USD", "2026-09-01", "2027-05-31"],
  ]), "AirfareRates");
  return wb;
}

function parseWorkbook(wb: XLSX.WorkBook): { rates: any[] } {
  const ws = wb.Sheets["AirfareRates"];
  if (!ws) throw new Error('Missing sheet "AirfareRates" — download the template and keep its sheet names.');
  // raw:true keeps Excel date cells as serial numbers (locale-independent)
  // instead of display-formatted strings like "6/1/2026".
  const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "", raw: true })
    .filter((r) => String(r.origin).trim() && !String(r.origin).startsWith("Example:"));
  if (rows.length === 0) throw new Error("The AirfareRates sheet has no rows to import (example rows are ignored).");

  const problems: string[] = [];
  const num = (v: any) => {
    const s = String(v ?? "").trim();
    return s === "" ? undefined : s;
  };
  // Strict date parsing: Excel serial numbers (real date cells) or literal
  // YYYY-MM-DD text. Locale-formatted strings like "6/1/2026" are ambiguous
  // (June 1 vs Jan 6) and rejected.
  const date = (v: any, field: string, label: string) => {
    if (v === null || v === undefined || String(v).trim() === "") return null;
    if (typeof v === "number" && isFinite(v)) {
      const p = XLSX.SSF.parse_date_code(v);
      if (p) return new Date(Date.UTC(p.y, p.m - 1, p.d)).toISOString();
    }
    const s = String(v).trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    if (m) {
      const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      if (!isNaN(d.getTime()) && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]) return d.toISOString();
    }
    problems.push(`${label}: ${field} "${s}" is not a valid date — use YYYY-MM-DD (e.g. 2026-06-01)`);
    return null;
  };
  const rates = rows.map((r, i) => {
    const label = `Row ${i + 2} (${r.origin || "?"} → ${r.destination || "?"})`;
    if (!String(r.destination).trim()) problems.push(`${label}: destination is required`);
    if (num(r.ratePerPerson) === undefined) problems.push(`${label}: ratePerPerson is required`);
    return {
      origin: String(r.origin).trim(),
      destination: String(r.destination).trim(),
      airline: String(r.airline ?? "").trim() || null,
      ratePerPerson: num(r.ratePerPerson),
      childRate: num(r.childRate) ?? null,
      infantRate: num(r.infantRate) ?? null,
      currency: String(r.currency ?? "").trim() || "USD",
      validFrom: date(r.validFrom, "validFrom", label),
      validTo: date(r.validTo, "validTo", label),
    };
  });
  if (problems.length) throw new Error(problems.slice(0, 5).join(" • ") + (problems.length > 5 ? ` • …and ${problems.length - 5} more` : ""));
  return { rates };
}

export function AirfareImportDialog() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);

  const importMutation = useMutation({
    mutationFn: async (payload: { rates: any[] }) => {
      const res = await apiRequest("POST", "/api/pricing/airfare-rates/import", payload);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/airfare-rates"] });
      toast({ title: `${data.created} ${t("airfares_imported")}` });
      setOpen(false);
    },
    onError: (e: any) => toast({ title: t("import_failed"), description: e?.message, variant: "destructive" }),
  });

  const onFile = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      importMutation.mutate(parseWorkbook(wb));
    } catch (e: any) {
      toast({ title: t("import_failed"), description: e?.message, variant: "destructive" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="button-import-airfares">
          <Upload className="h-4 w-4 mr-2" />{t("import_excel")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{t("airfare_rates_template")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("import_airfares_hint")}</p>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => XLSX.writeFile(buildTemplate(), "airfare-rates-template.xlsx")}
            data-testid="button-download-airfare-template"
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
              data-testid="input-import-airfare-file"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }}
            />
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
