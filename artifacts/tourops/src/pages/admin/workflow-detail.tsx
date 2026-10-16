import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { ArrowLeft, CheckCircle, Clock, AlertTriangle, CircleDot, SkipForward, Plane, Hotel, Bus, UserCheck, Ticket, Workflow, Globe, User, ListChecks, StickyNote } from "lucide-react";
import { SERVICE_TYPES, WORKFLOW_STATUSES, STEP_STATUSES } from "@/lib/constants";
import type { BookingWorkflow, WorkflowStep, Booking, UserProfile } from "@workspace/db";
import { useState } from "react";

const serviceIcons: Record<string, any> = {
  airline: Plane, hotel: Hotel, transport: Bus, guide: UserCheck, sights: Ticket,
};

const stepStatusIcons: Record<string, any> = {
  pending: Clock, done: CheckCircle, blocked: AlertTriangle, skipped: SkipForward,
};

const stepIconWrap: Record<string, string> = {
  done: "bg-green-100 dark:bg-green-900/30",
  blocked: "bg-destructive/10",
  skipped: "bg-muted",
  pending: "bg-primary/10",
};

const stepIconColor: Record<string, string> = {
  done: "text-green-600 dark:text-green-400",
  blocked: "text-destructive",
  skipped: "text-muted-foreground",
  pending: "text-primary",
};

export default function AdminWorkflowDetail() {
  const [, params] = useRoute("/:prefix/workflows/:id");
  const { toast } = useToast();
  const { t } = useLanguage();
  const workflowId = params?.id;

  const { data: workflow, isLoading } = useQuery<BookingWorkflow>({
    queryKey: ["/api/workflows", workflowId],
    enabled: !!workflowId,
  });
  const { data: steps } = useQuery<WorkflowStep[]>({
    queryKey: ["/api/workflows", workflowId, "steps"],
    enabled: !!workflowId,
  });
  const { data: booking } = useQuery<Booking>({
    queryKey: ["/api/bookings", workflow?.bookingId],
    enabled: !!workflow?.bookingId,
  });
  const { data: allUsers } = useQuery<UserProfile[]>({ queryKey: ["/api/user-profiles"] });
  const { data: currentUserProfile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const isOps = currentUserProfile?.role === "admin" || currentUserProfile?.role === "super_admin" || currentUserProfile?.role === "operations_manager";

  const updateWorkflow = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/workflows/${workflowId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", workflowId] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      if (workflow?.bookingId) {
        queryClient.invalidateQueries({ queryKey: ["/api/bookings", workflow.bookingId, "workflows"] });
        queryClient.invalidateQueries({ queryKey: ["/api/bookings", workflow.bookingId, "assignments"] });
      }
      toast({ title: t("workflow_updated") });
    },
  });

  const updateStep = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/workflow-steps/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", workflowId, "steps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", workflowId] });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      toast({ title: t("step_updated") });
    },
    onError: () => toast({ title: t("update_failed"), variant: "destructive" }),
  });

  const [editStepId, setEditStepId] = useState<string | null>(null);
  const [stepNotes, setStepNotes] = useState("");
  const [stepDueDate, setStepDueDate] = useState("");

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4"><Skeleton className="h-9 w-9 rounded-md" /><Skeleton className="h-8 w-64" /></div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      </div>
    );
  }

  if (!workflow) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <Workflow className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">{t("workflow_not_found")}</p>
            <Link href="/admin/bookings"><Button variant="outline" size="sm" className="mt-4" data-testid="button-back-to-bookings"><ArrowLeft className="h-4 w-4 mr-2" />{t("bookings")}</Button></Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const Icon = serviceIcons[workflow.serviceType] || Workflow;
  const assignedUser = allUsers?.find(u => u.userId === workflow.assignedUserId);
  const assignedName = assignedUser?.companyName
    || (assignedUser as any)?.user?.firstName
    || (workflow.assignedUserId ? t("assigned_to") : t("unassigned"));
  const sortedSteps = [...(steps || [])].sort((a, b) => a.stepOrder - b.stepOrder);
  const completedSteps = sortedSteps.filter(s => s.status === "done").length;
  const totalSteps = sortedSteps.length;
  const pct = totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0;

  const startEditing = (step: WorkflowStep) => {
    setEditStepId(step.id);
    setStepNotes(step.notes || "");
    setStepDueDate(step.dueDate ? new Date(step.dueDate).toISOString().split("T")[0] : "");
  };

  const saveEditing = (step: WorkflowStep) => {
    const data: Record<string, any> = { id: step.id, notes: stepNotes };
    const existing = step.dueDate ? new Date(step.dueDate).toISOString().split("T")[0] : "";
    if (stepDueDate !== existing) data.dueDate = stepDueDate || null;
    // Close the editor only on success so a failed save keeps the draft visible.
    updateStep.mutate(data, { onSuccess: () => setEditStepId(null) });
  };

  const summary = [
    { icon: Icon, label: t("service_label"), value: SERVICE_TYPES[workflow.serviceType], testid: "summary-service" },
    { icon: Globe, label: t("country"), value: workflow.countryCode || t("global"), testid: "summary-country" },
    { icon: User, label: t("assigned_to"), value: assignedName, testid: "summary-assigned" },
    { icon: ListChecks, label: t("progress"), value: `${completedSteps}/${totalSteps} ${t("steps_suffix")}`, testid: "summary-progress" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center gap-4">
        <Link href={booking ? `/admin/bookings/${booking.id}` : "/admin/bookings"}>
          <Button variant="ghost" size="icon" data-testid="button-back-workflow"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 shrink-0">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold font-serif" data-testid="text-workflow-service">{SERVICE_TYPES[workflow.serviceType]}</h1>
            <Badge variant={workflow.status === "completed" ? "default" : workflow.status === "blocked" ? "destructive" : "outline"}>
              {WORKFLOW_STATUSES[workflow.status || "not_assigned"]}
            </Badge>
          </div>
          {booking && (
            <Link href={`/admin/bookings/${booking.id}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline" data-testid="link-workflow-booking">
              {t("booking_prefix")} {booking.bookingCode}{booking.groupName ? ` · ${booking.groupName}` : ""}
            </Link>
          )}
        </div>
        {isOps && (
          <Select
            value={workflow.assignedUserId || "none"}
            onValueChange={(v) =>
              updateWorkflow.mutate({
                assignedUserId: v === "none" ? null : v,
                status: v === "none" ? "not_assigned" : (workflow.status === "not_assigned" ? "assigned" : workflow.status),
              })
            }
            disabled={updateWorkflow.isPending}
          >
            <SelectTrigger className="w-[180px]" data-testid="select-workflow-assigned-user">
              <SelectValue placeholder={t("assign_to_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("unassigned")}</SelectItem>
              {allUsers?.filter((u) => u.role !== "customer").map((u) => (
                <SelectItem key={u.id} value={u.userId}>{u.companyName || u.userId}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select value={workflow.status || "not_assigned"} onValueChange={(v) => updateWorkflow.mutate({ status: v })}>
          <SelectTrigger className="w-[160px]" data-testid="select-workflow-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(WORKFLOW_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summary.map((s) => (
          <Card key={s.testid}>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-muted-foreground">
                <s.icon className="h-3.5 w-3.5" />
                <p className="text-xs">{s.label}</p>
              </div>
              <p className="text-sm font-medium mt-1 truncate" data-testid={s.testid}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${pct === 100 ? "bg-green-500" : "bg-primary"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs font-medium text-muted-foreground tabular-nums w-9 text-right">{pct}%</span>
      </div>

      {workflow.notes && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <StickyNote className="h-3.5 w-3.5" />
              <p className="text-xs">{t("notes")}</p>
            </div>
            <p className="text-sm whitespace-pre-wrap">{workflow.notes}</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">{t("workflow_steps")}</h2>
        {sortedSteps.length > 0 ? (
          <ol className="relative">
            {sortedSteps.map((step, i) => {
              const status = step.status || "pending";
              const StepIcon = stepStatusIcons[status] || CircleDot;
              const isEditing = editStepId === step.id;
              const overdue = status !== "done" && status !== "skipped" && !!step.dueDate && new Date(step.dueDate) < new Date();
              const isLast = i === sortedSteps.length - 1;

              return (
                <li key={step.id} className="relative pl-12 pb-3" data-testid={`card-step-${step.id}`}>
                  {/* timeline connector */}
                  {!isLast && <span className="absolute left-4 top-9 bottom-0 w-px bg-border" aria-hidden />}
                  <span className={`absolute left-0 top-3 w-8 h-8 rounded-full flex items-center justify-center ring-4 ring-background ${stepIconWrap[status] || stepIconWrap.pending}`}>
                    <StepIcon className={`h-4 w-4 ${stepIconColor[status] || stepIconColor.pending}`} />
                  </span>
                  <Card className={overdue ? "border-destructive/40" : undefined}>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground tabular-nums">{t("step_prefix")} {step.stepOrder}</span>
                            <p className={`font-medium text-sm ${status === "skipped" ? "line-through text-muted-foreground" : ""}`}>{step.stepName}</p>
                            {overdue && <Badge variant="destructive" className="h-4 text-[10px] px-1 uppercase">{t("overdue")}</Badge>}
                          </div>
                          {step.notes && !isEditing && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{step.notes}</p>}
                          <div className="flex flex-wrap items-center gap-3 mt-1">
                            {step.dueDate && (
                              <p className={`text-xs flex items-center ${overdue ? "text-destructive font-semibold" : "text-muted-foreground"}`}>
                                <Clock className="h-3 w-3 mr-1" />
                                {t("due_label")} {new Date(step.dueDate).toLocaleDateString()}
                              </p>
                            )}
                            {step.updatedAt && status !== "pending" && (
                              <p className="text-xs text-muted-foreground">
                                {t("updated_label")} {new Date(step.updatedAt).toLocaleString()}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Select
                            value={status}
                            onValueChange={(v) => updateStep.mutate({ id: step.id, status: v })}
                          >
                            <SelectTrigger className="w-[120px] h-8" data-testid={`select-step-status-${step.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STEP_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {!isEditing && (
                            <Button variant="ghost" size="sm" onClick={() => startEditing(step)} data-testid={`button-edit-step-${step.id}`}>
                              {t("notes")}
                            </Button>
                          )}
                        </div>
                      </div>
                      {isEditing && (
                        <div className="mt-3 space-y-3 border-t pt-3">
                          <div className="grid sm:grid-cols-[160px_1fr] gap-3">
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">{t("set_due_date")}</Label>
                              <Input
                                type="date"
                                className="h-8 text-xs mt-1"
                                value={stepDueDate}
                                onChange={(e) => setStepDueDate(e.target.value)}
                                data-testid={`input-step-due-${step.id}`}
                              />
                            </div>
                            <div>
                              <Label className="text-[10px] uppercase text-muted-foreground">{t("notes")}</Label>
                              <Textarea
                                className="mt-1"
                                rows={2}
                                value={stepNotes}
                                onChange={(e) => setStepNotes(e.target.value)}
                                placeholder={t("add_step_notes_placeholder")}
                                data-testid={`input-step-notes-${step.id}`}
                              />
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditStepId(null)} data-testid={`button-cancel-step-${step.id}`}>{t("cancel")}</Button>
                            <Button size="sm" onClick={() => saveEditing(step)} disabled={updateStep.isPending} data-testid={`button-save-step-${step.id}`}>{t("save")}</Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ol>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center py-12">
              <Workflow className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">{t("no_steps_configured")}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
