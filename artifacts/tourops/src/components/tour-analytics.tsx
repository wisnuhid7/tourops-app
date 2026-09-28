import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/use-language";
import { Clock } from "lucide-react";

export function FinancialAnalytics({ tourId }: { tourId: string }) {
  const { data: pricing, isLoading } = useQuery<any>({ queryKey: [`/api/tours/${tourId}/price-breakdown`] });
  const { t } = useLanguage();

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-4">
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">{t("total_price")}</div>
            <div className="text-2xl font-bold">${pricing?.totalPrice?.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className="bg-green-50 border-green-200">
          <CardContent className="pt-4">
            <div className="text-[10px] uppercase text-green-600 font-semibold">{t("netProfit")}</div>
            <div className="text-2xl font-bold text-green-700">${pricing?.netProfit?.toFixed(2)}</div>
          </CardContent>
        </Card>
        <Card className={pricing?.marginPercentage < 10 ? "bg-red-50 border-red-200" : "bg-blue-50 border-blue-200"}>
          <CardContent className="pt-4">
            <div className="text-[10px] uppercase text-muted-foreground font-semibold">{t("margin")}</div>
            <div className="text-2xl font-bold">{pricing?.marginPercentage?.toFixed(1)}%</div>
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">{t("item_category")}</th>
              <th className="p-2 text-right">{t("cost")}</th>
              <th className="p-2 text-right">{t("markup")}</th>
              <th className="p-2 text-right">{t("selling")}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(pricing?.breakdown || []).map((b: any, idx: number) => (
              <tr key={idx} className="hover:bg-muted/50">
                <td className="p-2">{b.item}</td>
                <td className="p-2 text-right">${b.cost?.toFixed(2) || "0.00"}</td>
                <td className="p-2 text-right text-green-600">+{b.markup?.toFixed(2) || b.amount?.toFixed(2) || "0.00"}</td>
                <td className="p-2 text-right font-medium">${((b.cost || 0) + (b.markup || b.amount || 0)).toFixed(2)}</td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="p-2">{t("totals")}</td>
              <td className="p-2 text-right">${pricing?.baseCost?.toFixed(2)}</td>
              <td className="p-2 text-right text-green-600">+${(pricing?.markupAmount + pricing?.serviceFee)?.toFixed(2)}</td>
              <td className="p-2 text-right">${pricing?.totalPrice?.toFixed(2)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="p-3 bg-muted rounded-md text-[10px] text-muted-foreground flex justify-between">
        <span>{t("estimated_sales_tax")} ({(pricing?.totalPrice ? (pricing.tax / pricing.totalPrice) * 100 : 0).toFixed(1)}%):</span>
        <span className="font-mono">${pricing?.tax?.toFixed(2)}</span>
      </div>
    </div>
  );
}

export function TourHistory({ tourId }: { tourId: string }) {
  const { data: auditLogs, isLoading } = useQuery<any[]>({
    queryKey: ["/api/audit-logs", "tour", tourId]
  });
  const { t } = useLanguage();

  if (isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="space-y-4">
      {auditLogs && auditLogs.length > 0 ? (
        <div className="relative pl-6 space-y-6 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
          {auditLogs.map((log) => (
            <div key={log.id} className="relative">
              <div className="absolute -left-[23px] top-1.5 w-3 h-3 rounded-full bg-primary border-4 border-background" />
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-4">
                  <p className="text-sm font-semibold">{log.action?.toUpperCase()}</p>
                  <p className="text-[10px] text-muted-foreground">{new Date(log.createdAt).toLocaleString()}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("by_label")} <span className="font-medium text-foreground">{log.changedByName || "System"}</span>
                </p>
                {log.note && <p className="text-xs italic text-muted-foreground mt-1">"{log.note}"</p>}
                <div className="mt-2 text-[10px] text-muted-foreground bg-muted/30 p-2 rounded border border-dashed">
                  <p className="uppercase font-bold text-[8px] mb-1">{t("raw_diff_internal")}</p>
                  <pre className="whitespace-pre-wrap">{log.note?.includes("Fields changed") ? log.note : t("initial_creation_or_update")}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center py-12 text-center">
          <Clock className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">{t("no_history_found")}</p>
        </div>
      )}
    </div>
  );
}

export function TourMarginBadge({ tourId }: { tourId: string }) {
  const { data: pricing } = useQuery<any>({ queryKey: [`/api/tours/${tourId}/price-breakdown`] });
  const { t } = useLanguage();
  if (!pricing || pricing.marginPercentage === undefined || pricing.marginPercentage === null) return null;

  if (pricing.marginPercentage < 10) {
    return <Badge variant="destructive" className="h-4 text-[8px]">{t("low_margin")}</Badge>;
  }
  return <Badge variant="outline" className="h-4 text-[8px] text-green-600 border-green-200">{Number(pricing.marginPercentage).toFixed(0)}% {t("margin")}</Badge>;
}
