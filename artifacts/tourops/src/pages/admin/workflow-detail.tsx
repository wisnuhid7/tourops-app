import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { ArrowLeft, CheckCircle, Clock, AlertTriangle, CircleDot, SkipForward, Plane, Hotel, Bus, UserCheck, Ticket, Workflow } from "lucide-react";
import { SERVICE_TYPES, WORKFLOW_STATUSES, STEP_STATUSES } from "@/lib/constants";
import type { BookingWorkflow, WorkflowStep, Booking, UserProfile } from "@workspace/db";
import { useState } from "react";

const serviceIcons: Record<string, any> = {
  airline: Plane, hotel: Hotel, transport: Bus, guide: UserCheck, sights: Ticket,
};

const stepStatusIcons: Record<string, any> = {
  pending: Clock, done: CheckCircle, blocked: AlertTriangle, skipped: SkipForward,
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

  const updateWorkflow = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/workflows/${workflowId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/workflows", workflowId] });
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
  });

  const [editStepId, setEditStepId] = useState<string | null>(null);
  const [stepNotes, setStepNotes] = useState("");

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  }

  if (!workflow) {
    return <div className="p-6"><p className="text-muted-foreground">{t("workflow_not_found")}</p></div>;
  }

  const Icon = serviceIcons[workflow.serviceType] || Workflow;
  const assignedUser = allUsers?.find(u => u.userId === workflow.assignedUserId);
  const completedSteps = (steps || []).filter(s => s.status === "done").length;
  const totalSteps = steps?.length || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center gap-4">
        <Link href={booking ? `/admin/bookings/${booking.id}` : "/admin/bookings"}>
          <Button variant="ghost" size="icon" data-testid="button-back-workflow"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <h1 className="text-2xl font-bold font-serif" data-testid="text-workflow-service">{SERVICE_TYPES[workflow.serviceType]}</h1>
            <Badge variant={workflow.status === "completed" ? "default" : workflow.status === "blocked" ? "destructive" : "outline"}>
              {WORKFLOW_STATUSES[workflow.status || "not_assigned"]}
            </Badge>
          </div>
          {booking && <p className="text-sm text-muted-foreground mt-1">{t("booking_prefix")} {booking.bookingCode}</p>}
        </div>
        <Select value={workflow.status || "not_assigned"} onValueChange={(v) => updateWorkflow.mutate({ status: v })}>
          <SelectTrigger className="w-[160px]" data-testid="select-workflow-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(WORKFLOW_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("service_label")}</p><p className="text-sm font-medium mt-1">{SERVICE_TYPES[workflow.serviceType]}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("country")}</p><p className="text-sm font-medium mt-1">{workflow.countryCode || t("global")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("assigned_to")}</p><p className="text-sm font-medium mt-1">{assignedUser?.companyName || assignedUser?.userId || t("unassigned")}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t("progress")}</p><p className="text-sm font-medium mt-1">{completedSteps}/{totalSteps} {t("steps_suffix")}</p></CardContent></Card>
      </div>

      <div className="flex items-center gap-2">
        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
          <div className="bg-primary h-full rounded-full transition-all" style={{ width: `${totalSteps ? (completedSteps / totalSteps) * 100 : 0}%` }} />
        </div>
        <span className="text-xs text-muted-foreground">{totalSteps ? Math.round((completedSteps / totalSteps) * 100) : 0}%</span>
      </div>

      {workflow.notes && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">{t("notes")}</p>
            <p className="text-sm">{workflow.notes}</p>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">{t("workflow_steps")}</h2>
        <div className="space-y-3">
          {steps && steps.length > 0 ? (
            steps.sort((a, b) => a.stepOrder - b.stepOrder).map((step) => {
              const StepIcon = stepStatusIcons[step.status || "pending"] || CircleDot;
              const isEditing = editStepId === step.id;

              return (
                <Card key={step.id} data-testid={`card-step-${step.id}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          step.status === "done" ? "bg-green-100 dark:bg-green-900/30" :
                          step.status === "blocked" ? "bg-destructive/10" :
                          step.status === "skipped" ? "bg-muted" : "bg-primary/10"
                        }`}>
                          <StepIcon className={`h-4 w-4 ${
                            step.status === "done" ? "text-green-600 dark:text-green-400" :
                            step.status === "blocked" ? "text-destructive" :
                            step.status === "skipped" ? "text-muted-foreground" : "text-primary"
                          }`} />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t("step_prefix")} {step.stepOrder}</span>
                            <p className="font-medium text-sm">{step.stepName}</p>
                          </div>
                          {step.notes && <p className="text-xs text-muted-foreground mt-1">{step.notes}</p>}
                          {step.dueDate && (
                            <div className="flex items-center gap-2 mt-1">
                              <p className={`text-xs font-semibold flex items-center ${
                                step.status !== 'done' && new Date(step.dueDate) < new Date() ? 'text-destructive animate-pulse' : 'text-muted-foreground'
                              }`}>
                                <Clock className="h-3 w-3 mr-1" />
                                {t("due_label")} {new Date(step.dueDate).toLocaleDateString()}
                                {step.status !== 'done' && new Date(step.dueDate) < new Date() && (
                                  <Badge variant="destructive" className="ml-2 h-4 text-[10px] px-1 uppercase">{t("overdue")}</Badge>
                                )}
                              </p>
                            </div>
                          )}
                          {step.updatedAt && step.status !== "pending" && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {t("updated_label")} {new Date(step.updatedAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {isEditing && (
                          <div className="flex flex-col gap-1">
                            <Label className="text-[10px] uppercase text-muted-foreground">{t("set_due_date")}</Label>
                            <Input 
                              type="date" 
                              className="h-8 text-xs w-[140px]" 
                              defaultValue={step.dueDate ? new Date(step.dueDate).toISOString().split('T')[0] : ""}
                              onBlur={(e: React.FocusEvent<HTMLInputElement>) => updateStep.mutate({ id: step.id, dueDate: e.target.value })}
                            />
                          </div>
                        )}
                        <Badge variant={
                          step.status === "done" ? "default" :
                          step.status === "blocked" ? "destructive" :
                          step.status === "skipped" ? "secondary" : "outline"
                        }>{STEP_STATUSES[step.status || "pending"]}</Badge>
                        <Select
                          value={step.status || "pending"}
                          onValueChange={(v) => updateStep.mutate({ id: step.id, status: v })}
                        >
                          <SelectTrigger className="w-[120px]" data-testid={`select-step-status-${step.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(STEP_STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (isEditing) {
                              updateStep.mutate({ id: step.id, notes: stepNotes });
                              setEditStepId(null);
                            } else {
                              setEditStepId(step.id);
                              setStepNotes(step.notes || "");
                            }
                          }}
                          data-testid={`button-edit-step-${step.id}`}
                        >
                          {isEditing ? t("save_notes") : t("notes")}
                        </Button>
                      </div>
                    </div>
                    {isEditing && (
                      <div className="mt-3">
                        <Textarea
                          value={stepNotes}
                          onChange={(e) => setStepNotes(e.target.value)}
                          placeholder={t("add_step_notes_placeholder")}
                          data-testid={`input-step-notes-${step.id}`}
                        />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
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
    </div>
  );
}
