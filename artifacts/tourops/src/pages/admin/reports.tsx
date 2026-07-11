import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, AreaChart, Area
} from "recharts";
import { Download, TrendingUp, Users, Calendar, DollarSign, FileText, BarChart3, PieChart } from "lucide-react";
import * as XLSX from "xlsx";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/use-language";

export default function AdminReports() {
  const { t } = useLanguage();
  const { data: analytics, isLoading, isError } = useQuery<any>({
    queryKey: ["/api/admin/analytics"],
  });

  const exportToExcel = () => {
    if (!analytics) return;
    
    const wb = XLSX.utils.book_new();
    
    // Revenue Sheet
    const wsRev = XLSX.utils.json_to_sheet(analytics.revenueByMonth);
    XLSX.utils.book_append_sheet(wb, wsRev, "Monthly Revenue");
    
    // Occupancy Sheet
    const wsOcc = XLSX.utils.json_to_sheet(analytics.occupancy);
    XLSX.utils.book_append_sheet(wb, wsOcc, "Occupancy Heatmap");
    
    XLSX.writeFile(wb, "TourOps_Analytics_Report.xlsx");
  };

  if (isLoading) {
    return (
      <div className="p-8 space-y-8 animate-pulse">
        <div className="h-10 w-48 bg-muted rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-24 w-full" />)}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (isError || !analytics) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] space-y-4 text-center">
        <BarChart3 className="h-16 w-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-slate-700">{t("unable_load_reports")}</h2>
        <p className="text-muted-foreground max-w-sm">
          {t("reports_load_error")}
        </p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8 bg-slate-50/50 min-h-screen pb-20">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">{t("reports_analytics")}</h1>
          <p className="text-muted-foreground mt-1">{t("reports_subtitle")}</p>
        </div>
        <Button onClick={exportToExcel} className="shadow-lg bg-primary hover:bg-primary/90">
          <Download className="h-4 w-4 mr-2" />
          {t("export_all_data")}
        </Button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card className="border-none shadow-sm overflow-hidden group">
          <CardContent className="p-0">
            <div className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("total_revenue")}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">${(analytics.totalRevenue || 0).toLocaleString()}</h3>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                <DollarSign className="h-6 w-6" />
              </div>
            </div>
            <div className="h-1 w-full bg-emerald-500/20" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm overflow-hidden group">
          <CardContent className="p-0">
            <div className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("bookings")}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{analytics.totalBookings}</h3>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-600 group-hover:scale-110 transition-transform">
                <FileText className="h-6 w-6" />
              </div>
            </div>
            <div className="h-1 w-full bg-blue-500/20" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm overflow-hidden group">
          <CardContent className="p-0">
            <div className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("active_tours")}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">{analytics.activeDepartures}</h3>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                <Calendar className="h-6 w-6" />
              </div>
            </div>
            <div className="h-1 w-full bg-amber-500/20" />
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm overflow-hidden group">
          <CardContent className="p-0">
            <div className="p-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-wider">{t("growth")}</p>
                <h3 className="text-2xl font-bold text-slate-900 mt-1">+12.5%</h3>
              </div>
              <div className="h-12 w-12 rounded-2xl bg-rose-500/10 flex items-center justify-center text-rose-600 group-hover:scale-110 transition-transform">
                <TrendingUp className="h-6 w-6" />
              </div>
            </div>
            <div className="h-1 w-full bg-rose-500/20" />
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Chart */}
        <Card className="border-none shadow-xl bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-primary" />
              {t("revenue_performance")}
            </CardTitle>
            <CardDescription>{t("revenue_trend_subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.revenueByMonth}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0f172a" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#0f172a" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="month" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v) => `$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#fff', border: 'none', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                    itemStyle={{ color: '#0f172a', fontWeight: 'bold' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#0f172a" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Occupancy Heatmap-ish Table */}
        <Card className="border-none shadow-xl bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PieChart className="h-5 w-5 text-primary" />
              {t("occupancy_monitor")}
            </CardTitle>
            <CardDescription>{t("occupancy_subtitle")}</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="space-y-4">
              {analytics.occupancy.map((occ: any) => (
                <div key={occ.id} className="space-y-1.5">
                  <div className="flex justify-between text-sm items-center">
                    <span className="font-semibold text-slate-700 truncate max-w-[200px]">{occ.tourTitle}</span>
                    <span className="text-muted-foreground text-xs">{occ.startDate ? new Date(occ.startDate).toLocaleDateString() : "-"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-1000 ${
                          occ.percentage > 80 ? 'bg-emerald-500' : 
                          occ.percentage > 40 ? 'bg-amber-500' : 'bg-slate-300'
                        }`}
                        style={{ width: `${occ.percentage}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold w-12 text-right">{occ.percentage}%</span>
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>{occ.booked} {t("booked_label")}</span>
                    <span>{occ.total} {t("seats_label")}</span>
                  </div>
                </div>
              ))}
              {analytics.occupancy.length === 0 && (
                <div className="py-20 text-center text-muted-foreground">{t("no_upcoming_departures")}</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
