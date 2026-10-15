import { useState } from "react";
import * as XLSX from "xlsx";
import { buildTemplate, parseWorkbook } from "@workspace/tour-spreadsheet";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Upload, FileDown, CheckCircle2, XCircle, Loader2 } from "lucide-react";

// ---------------------------------------------------------------------------
// Master Tour Template — Excel bulk import / export.
// The sheet contract and the buildTemplate()/parseWorkbook() implementations
// now live in the shared workspace package @workspace/tour-spreadsheet, which
// is the single source of truth shared with the api-server round-trip tests.
// Sheet contract (kept in sync with GET /api/tours/export + POST /api/tours/import):
//   Tours:      ref | title | description | category | countries | highlights |
//               inclusions | exclusions | tags | imageUrl | basePrice |
//               childPrice | singleSupplement | duration
//   Days:       tourRef | dayNumber | title | countryCode | city | description |
//               activities | imageUrl
//   Items:      tourRef | dayNumber | itemType | title | startTime | endTime |
//               cost | currency | isOptional | bookingRequired | hotelName |
//               sightName | guideName | sortOrder | description
//   Departures: tourRef | startDate | endDate | capacity | pricePerPerson | allowPublicJoin
// countries/tags are comma-separated. hotelName/sightName/guideName must
// match EXACTLY a name already registered in the catalogs; leaving cost
// blank pulls the catalog price. duration is the total nights/days shown
// to customers; if omitted the importer derives it from the day row count.
// isOptional / bookingRequired accept "true"/"false" (case-insensitive).
// startDate/endDate must be YYYY-MM-DD. capacity is seats (integer ≥ 1).
// pricePerPerson is optional override in whole currency units (integer ≥ 0).
// allowPublicJoin defaults to true; use FALSE/No/0 to disable.
// ---------------------------------------------------------------------------

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
                    {r.ok
                    ? ` — ${r.days} ${t("days")}${r.departures ? `, ${r.departures} departure${r.departures !== 1 ? "s" : ""}` : ""}`
                    : ` — ${r.error}`}
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
