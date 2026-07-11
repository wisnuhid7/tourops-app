import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  BookOpen, Users, AlertTriangle, CheckCircle, Clock,
  Calendar, ArrowRight, FileText, CreditCard, ClipboardList,
  Workflow, MapPin, DollarSign, Landmark, Hotel, Activity,
  BrainCircuit, Sparkles, TrendingUp, ShieldCheck
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { BOOKING_STATUSES, FULFILLMENT_STATUSES, BOOKING_TYPES } from "@/lib/constants";
import type { Booking, TourDeparture, Tour, BookingWorkflow, Document as DocType, Payment, Sight } from "@shared/schema";

function StatCard({ title, value, icon: Icon, description, color }: {
  title: string; value: string | number; icon: any; description?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground mb-1">{title}</p>
            <p className="text-2xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s/g, '-')}`}>{value}</p>
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          <div className={`w-10 h-10 rounded-md flex items-center justify-center ${color || "bg-primary/10"}`}>
            <Icon className={`h-5 w-5 ${color ? "text-white" : "text-primary"}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminDashboard() {
  const { t, language, setLanguage } = useLanguage();
  const { data: bookings, isLoading: loadingBookings } = useQuery<Booking[]>({ queryKey: ["/api/bookings"] });
  const { data: departures } = useQuery<TourDeparture[]>({ queryKey: ["/api/departures"] });
  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  const { data: workflows } = useQuery<BookingWorkflow[]>({ queryKey: ["/api/workflows"] });
  const { data: documents } = useQuery<DocType[]>({ queryKey: ["/api/documents"] });
  const { data: payments } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const { data: sights } = useQuery<Sight[]>({ queryKey: ["/api/master/sights"] });
  const { data: stats, isLoading: loadingStats } = useQuery<any>({ queryKey: ["/api/admin/stats"] });

  const totalBookings = bookings?.length || 0;
  const confirmedBookings = (bookings || []).filter((b) => b.status === "confirmed").length;
  const pendingBookings = (bookings || []).filter((b) => b.status === "submitted").length;
  const blockedFulfillments = (bookings || []).filter((b) => b.fulfillmentStatus === "blocked").length;
  const upcomingDepartures = (departures || []).filter((d) => d.status === "open").length;
  const pendingDocs = documents ? documents.filter(d => d.status === "uploaded").length : 0;
  const blockedWorkflows = workflows ? workflows.filter(w => w.status === "blocked").length : 0;
  const pendingPayments = payments ? payments.filter(p => p.status === "pending").length : 0;
  const totalTours = tours?.length || 0;

  const totalRevenue = (payments || []).filter(p => p.status === "paid").reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  const pendingRevenue = (payments || []).filter(p => p.status === "pending").reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  // Tour popularity
  const tourStats = tours?.map(t => {
    const bookingCount = (bookings || []).filter(b => b.tourId === t.id && b.status !== "cancelled").length;
    const revenue = (bookings || []).filter(b => b.tourId === t.id && b.status === "confirmed").reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    return { id: t.id, title: t.title, count: bookingCount, revenue };
  }).sort((a, b) => b.count - a.count).slice(0, 5) || [];

  if (loadingBookings) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-8 max-w-[1600px] mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-6 bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-xl">
            <TrendingUp className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold font-serif tracking-tight">{t('dashboardWelcome')}!</h1>
            <p className="text-muted-foreground text-sm flex items-center gap-2">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              {t('adminOverview')}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border">
            <Button
              variant={language === 'en' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-[10px] px-3 font-bold"
              onClick={() => setLanguage('en')}
            >EN</Button>
            <Button
              variant={language === 'es' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-[10px] px-3 font-bold"
              onClick={() => setLanguage('es')}
            >ES</Button>
            <Button
              variant={language === 'id' ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-[10px] px-3 font-bold"
              onClick={() => setLanguage('id')}
            >ID</Button>
          </div>
          <AIAdvisorDialog />
          <Link href="/admin/affiliates">
            <Button variant="outline" className="gap-2 shadow-sm">
              <Users className="h-4 w-4" /> {t('affiliates')}
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title={t('grossSales')} value={`$${(stats?.grossSales || 0).toLocaleString()}`} icon={DollarSign} color="bg-primary/5" />
        <StatCard title={t('netProfit')} value={`$${(stats?.netProfit || 0).toLocaleString()}`} icon={TrendingUp} color="bg-emerald-50" />
        <StatCard title={t('avgBooking')} value={`$${(stats?.avgBookingValue || 0).toLocaleString()}`} icon={CreditCard} color="bg-blue-50" />
        <StatCard title={t('activeAssets')} value={stats?.activeAssets || 0} icon={Hotel} color="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Top Performing Tours</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-5">
              {tourStats.length > 0 ? tourStats.map((stat) => (
                <div key={stat.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-4 text-sm mb-1">
                    <span className="font-medium truncate max-w-[250px]">{stat.title}</span>
                    <span className="text-muted-foreground">{stat.count} bookings | ${stat.revenue.toLocaleString()}</span>
                  </div>
                  <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary" 
                      style={{ width: `${Math.min(100, (stat.count / (totalBookings || 1)) * 100)}%` }} 
                    />
                  </div>
                </div>
              )) : (
                <p className="text-sm text-muted-foreground py-4 text-center">No tour data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        <LiveActivityFeed />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operations Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fulfillment Funnel</p>
              {[
                { label: "Pending", count: (bookings || []).filter((b) => b.fulfillmentStatus === "pending").length, color: "bg-muted" },
                { label: "In Progress", count: (bookings || []).filter((b) => b.fulfillmentStatus === "in_progress").length, color: "bg-primary" },
                { label: "Completed", count: (bookings || []).filter((b) => b.fulfillmentStatus === "completed").length, color: "bg-green-600" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${item.color}`} />
                    <span>{item.label}</span>
                  </div>
                  <span className="font-bold">{item.count}</span>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Needs Attention</p>
              {pendingDocs > 0 && (
                <Link href="/admin/documents">
                  <div className="flex items-center justify-between text-sm cursor-pointer hover:text-primary">
                    <span className="flex items-center gap-2"><ClipboardList className="h-3.5 w-3.5" /> Pending Documents</span>
                    <Badge variant="secondary" className="h-5">{pendingDocs}</Badge>
                  </div>
                </Link>
              )}
              {pendingPayments > 0 && (
                <Link href="/admin/payments">
                  <div className="flex items-center justify-between text-sm cursor-pointer hover:text-primary">
                    <span className="flex items-center gap-2"><CreditCard className="h-3.5 w-3.5" /> Pending Payments</span>
                    <Badge variant="secondary" className="h-5">{pendingPayments}</Badge>
                  </div>
                </Link>
              )}
              {blockedWorkflows > 0 && (
                <div className="flex items-center justify-between text-sm text-destructive font-medium">
                  <span className="flex items-center gap-2"><AlertTriangle className="h-3.5 w-3.5" /> Blocked Workflows</span>
                  <Badge variant="destructive" className="h-5">{blockedWorkflows}</Badge>
                </div>
              )}
              {sights && sights.filter(s => (s.dataQualityScore || 0) < 70).length > 0 && (
                <Link href="/admin/master-data">
                  <div className="flex items-center justify-between text-sm cursor-pointer hover:text-primary">
                    <span className="flex items-center gap-2"><Landmark className="h-3.5 w-3.5" /> Sights Needs Review</span>
                    <Badge variant="secondary" className="h-5 bg-amber-100 text-amber-700 hover:bg-amber-100 border-amber-200">
                      {sights.filter(s => (s.dataQualityScore || 0) < 70).length}
                    </Badge>
                  </div>
                </Link>
              )}
              {pendingDocs === 0 && pendingPayments === 0 && blockedWorkflows === 0 && (!sights || sights.filter(s => (s.dataQualityScore || 0) < 70).length === 0) && (
                <p className="text-xs text-muted-foreground italic text-center py-2">All clear! No pending actions.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 pb-3">
          <CardTitle className="text-base">Recent Activity</CardTitle>
          <Link href="/admin/bookings">
            <Button variant="ghost" size="sm">View All Bookings <ArrowRight className="ml-1 h-3 w-3" /></Button>
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {bookings && bookings.length > 0 ? (
            <div className="divide-y">
              {[...bookings].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).slice(0, 8).map((booking) => (
                <Link key={booking.id} href={`/admin/bookings/${booking.id}`}>
                  <div className="flex items-center justify-between gap-4 px-6 py-3 hover:bg-muted/30 transition-colors cursor-pointer">
                    <div className="flex items-center gap-4">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${booking.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                        <BookOpen className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{booking.bookingCode}</p>
                        <p className="text-xs text-muted-foreground">{booking.groupName || BOOKING_TYPES[booking.bookingType]} | {booking.partySizeExpected} pax</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <p className="text-xs font-medium">${(booking.totalPrice || 0).toLocaleString()}</p>
                        <p className="text-[10px] text-muted-foreground">{booking.createdAt ? new Date(booking.createdAt).toLocaleDateString() : ""}</p>
                      </div>
                      <Badge variant={booking.status === "confirmed" ? "default" : booking.status === "cancelled" ? "destructive" : "secondary"} className="text-[10px] px-2 py-0">
                        {BOOKING_STATUSES[booking.status || "submitted"]}
                      </Badge>
                      <ArrowRight className="h-4 w-4 text-muted-foreground/30" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <BookOpen className="h-12 w-12 text-muted-foreground/20 mb-4" />
              <p className="text-sm text-muted-foreground">No recent booking activity</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function LiveActivityFeed() {
  const { t } = useLanguage();
  const { data: logs, isLoading } = useQuery<any[]>({ queryKey: ["/api/admin/audit-logs"] });

  if (isLoading) return <Skeleton className="h-64 w-full" />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{t('systemActivity')}</CardTitle>
        <Activity className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="space-y-4 max-h-[400px] overflow-auto pr-2">
          {logs?.map((log) => (
            <div key={log.id} className="flex items-start gap-3 text-xs border-b pb-3 last:border-0 last:pb-0">
              <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                log.action === 'confirmed' ? 'bg-green-500' : 
                log.action === 'updated' ? 'bg-blue-500' : 'bg-muted'
              }`} />
              <div className="space-y-1 flex-1">
                <p className="font-medium">
                  {log.changedByName || 'System'} {log.action} <span className="capitalize">{log.entityType}</span> {(log.entityId || "").slice(0,8)}
                </p>
                <p className="text-muted-foreground line-clamp-1">{log.note || ""}</p>
                <p className="text-[10px] text-muted-foreground">{log.createdAt ? new Date(log.createdAt).toLocaleTimeString() : ""}</p>
              </div>
            </div>
          ))}
          {logs?.length === 0 && <p className="text-center py-8 text-muted-foreground italic">No recent activity</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function AIAdvisorDialog() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<any>(null);

  const getAdvice = async () => {
    setLoading(true);
    try {
      const res = await apiRequest("POST", "/api/admin/ai-consultant", {});
      const data = await res.json();
      setAnalysis(data);
    } catch (e: any) {
      console.error(e);
      toast({ title: "AI advisor failed", description: e?.message || "Please try again.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-primary/10">
          <BrainCircuit className="h-4 w-4 text-primary" /> {t('aiAdvice')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col gap-0 border-none shadow-2xl p-0 overflow-hidden">
        <div className="bg-slate-900 text-white p-8 relative overflow-hidden shrink-0">
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <h2 className="text-2xl font-bold">Tourop AI Strategy</h2>
            </div>
            <p className="text-slate-400 text-sm">Artificial Intelligence Business Consultant</p>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
        </div>
        
        <div className="p-8 space-y-6 overflow-y-auto flex-1 min-h-0">
          {!analysis && !loading && (
            <div className="text-center py-12 space-y-4">
              <BrainCircuit className="h-16 w-16 text-muted-foreground/20 mx-auto" />
              <div className="space-y-2">
                <h3 className="font-semibold text-lg">Analyze Business Performance</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">Our AI will review your gross sales, margins, and tour popularity to give you actionable strategic advice.</p>
              </div>
              <Button onClick={getAdvice} className="gap-2">Run Intelligence Engine</Button>
            </div>
          )}

          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                <BrainCircuit className="h-6 w-6 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
              </div>
              <p className="text-sm font-medium animate-pulse">Consulting global travel trends...</p>
            </div>
          )}

          {analysis && (
            <div className="space-y-6">
              <div className="p-4 bg-primary/5 border border-primary/10 rounded-xl italic text-sm text-slate-700 dark:text-slate-300">
                "{analysis.executiveSummary}"
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <Activity className="h-3 w-3" /> Key Insights
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {analysis.insights.map((insight: string, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 text-xs p-3 bg-slate-50 dark:bg-slate-800 rounded-lg min-w-0">
                      <div className="mt-1 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      <span className="flex-1 min-w-0 break-words">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="font-bold text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                  <TrendingUp className="h-3 w-3" /> Strategic Recommendations
                </h4>
                <div className="space-y-3">
                  {analysis.recommendations.map((rec: any, idx: number) => (
                    <div key={idx} className="p-4 border rounded-xl hover:bg-slate-50 transition-colors">
                      <p className="font-bold text-sm mb-1">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mb-2 break-words">{rec.description}</p>
                      <Badge variant="secondary" className="text-[10px] bg-emerald-100 text-emerald-700 border-none">
                        Impact: {rec.expectedImpact}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="p-6 border-t bg-slate-50 flex justify-end shrink-0">
          <Button variant="outline" onClick={() => setOpen(false)}>Close Advisor</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
