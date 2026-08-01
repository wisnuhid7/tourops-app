import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Hotel, Bus, UserCheck, Ticket, Clock, CheckCircle, AlertTriangle, ClipboardList, ArrowRight, Calendar, Settings } from "lucide-react";
import { SERVICE_TYPES, WORKFLOW_STATUSES } from "@/lib/constants";
import type { BookingWorkflow } from "@workspace/db";

const serviceIcons: Record<string, any> = {
  airline: ClipboardList, hotel: Hotel, transport: Bus, guide: UserCheck, sights: Ticket,
};

export default function OpsDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: workflows, isLoading } = useQuery<BookingWorkflow[]>({
    queryKey: ["/api/ops/workflows"],
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/workflows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ops/workflows"] });
      toast({ title: t("task_updated") });
    },
  });

  const active = (workflows || []).filter((w) => w.status !== "completed" && w.status !== "cancelled").length;
  const completed = (workflows || []).filter((w) => w.status === "completed").length;

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-ops-title">{t("operations_dashboard")}</h1>
        <p className="text-muted-foreground text-sm">{t("manage_assigned_tasks")}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm text-muted-foreground">{t("active_tasks")}</p><p className="text-2xl font-bold">{active}</p></div>
              <div className="w-10 h-10 rounded-md bg-primary/10 flex items-center justify-center"><Clock className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-sm text-muted-foreground">{t("completed")}</p><p className="text-2xl font-bold">{completed}</p></div>
              <div className="w-10 h-10 rounded-md bg-green-600/10 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-green-600" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-4">{t("your_tasks")}</h2>
        {!workflows || workflows.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center py-16"><ClipboardList className="h-12 w-12 text-muted-foreground/40 mb-4" /><h3 className="font-semibold mb-1">{t("no_tasks_assigned")}</h3><p className="text-sm text-muted-foreground">{t("tasks_will_appear_country_manager")}</p></CardContent></Card>
        ) : (
          <div className="space-y-2">
            {workflows.map((wf) => {
              const Icon = serviceIcons[wf.serviceType] || ClipboardList;
              return (
                <Card key={wf.id} data-testid={`card-ops-task-${wf.id}`} className="hover-elevate cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <Link href={`/ops/workflows/${wf.id}`} className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-md ${wf.status === "blocked" ? "bg-destructive/10" : "bg-primary/10"} flex items-center justify-center`}>
                            <Icon className={`h-5 w-5 ${wf.status === "blocked" ? "text-destructive" : "text-primary"}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-sm truncate">{SERVICE_TYPES[wf.serviceType]}</p>
                              {wf.status === "blocked" && <Badge variant="destructive" className="text-[10px] h-4">{t("blocked_badge")}</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              {wf.currentStep || t("awaiting_action")} {wf.countryCode ? `| ${wf.countryCode}` : ""}
                            </p>
                          </div>
                        </div>
                      </Link>
                      <div className="flex items-center gap-4">
                        <div className="hidden sm:flex flex-col items-end">
                           <Badge variant={wf.status === "completed" ? "default" : "outline"} className="text-[10px] mb-1">
                            {WORKFLOW_STATUSES[wf.status || "assigned"]}
                           </Badge>
                           <p className="text-[10px] text-muted-foreground flex items-center">
                             <Calendar className="h-3 w-3 mr-1" /> {t("sla_ongoing")}
                           </p>
                        </div>
                        <Select
                          value={wf.status || "assigned"}
                          onValueChange={(v) => updateWorkflow.mutate({ id: wf.id, status: v })}
                        >
                          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(WORKFLOW_STATUSES).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {wf.bookingId && (
                          <Link href={`/ops/booking-operations/${wf.bookingId}`}>
                            <Button variant="ghost" size="icon" title={t("lc_operations")} data-testid={`link-ops-booking-${wf.id}`}><Settings className="h-4 w-4" /></Button>
                          </Link>
                        )}
                        <Link href={`/ops/workflows/${wf.id}`}>
                          <Button variant="ghost" size="icon"><ArrowRight className="h-4 w-4" /></Button>
                        </Link>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
