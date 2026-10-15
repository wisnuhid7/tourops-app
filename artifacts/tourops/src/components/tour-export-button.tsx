import { useState } from "react";
import * as XLSX from "xlsx";
import { buildWorkbook } from "@workspace/tour-spreadsheet";
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
// buildWorkbook() lives in the shared @workspace/tour-spreadsheet package.
// ---------------------------------------------------------------------------

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
