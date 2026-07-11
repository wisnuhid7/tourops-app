import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { WORKFLOW_STATUSES } from "@/lib/constants";
import { Plane, Ticket, Plus, Pencil, Trash2 } from "lucide-react";
import type { BookingWorkflow, Booking } from "@workspace/db";

export default function FlightAgentDashboard() {
  const { t } = useLanguage();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Plane className="h-6 w-6 text-primary" />{t("flight_dashboard")}</h1>
        <p className="text-muted-foreground text-sm">Manage ticket issuance and date changes for all airline bookings.</p>
      </div>
      <Tabs defaultValue="tasks">
        <TabsList>
          <TabsTrigger value="tasks">Airline tasks</TabsTrigger>
          <TabsTrigger value="rates">Airline rate cards</TabsTrigger>
        </TabsList>
        <TabsContent value="tasks"><AirlineTasks /></TabsContent>
        <TabsContent value="rates"><AirlineRates /></TabsContent>
      </Tabs>
    </div>
  );
}

function AirlineTasks() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: workflows, isLoading } = useQuery<(BookingWorkflow & { booking?: Booking })[]>({
    queryKey: ["/api/flight-agent/workflows"],
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/workflows/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/flight-agent/workflows"] });
      toast({ title: t("workflow_updated") });
    },
  });

  if (isLoading) return <div className="pt-4"><Skeleton className="h-40 w-full" /></div>;

  if (!workflows || workflows.length === 0) {
    return <Card className="mt-4"><CardContent className="py-16 text-center text-muted-foreground">No airline tasks yet.</CardContent></Card>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {workflows.map(wf => (
        <Card key={wf.id} data-testid={`card-workflow-${wf.id}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{wf.booking?.bookingCode || "Booking"}</p>
                <p className="text-xs text-muted-foreground">{wf.booking?.groupName || "—"}</p>
              </div>
              <Badge variant="outline" className="capitalize">{wf.status?.replace(/_/g, " ")}</Badge>
            </div>
            {wf.notes && <p className="text-xs text-muted-foreground">{wf.notes}</p>}
            <Select value={wf.status || ""} onValueChange={(v) => updateWorkflow.mutate({ id: wf.id, status: v })}>
              <SelectTrigger className="h-8 text-xs" data-testid={`select-status-${wf.id}`}><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(WORKFLOW_STATUSES).map(([s, label]) => (
                  <SelectItem key={s} value={s}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function AirlineRates() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: rates, isLoading } = useQuery<any[]>({ queryKey: ["/api/rates/airline"] });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const deleteRate = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rates/airline/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rates/airline"] });
      toast({ title: "Rate deleted" });
    },
  });

  if (isLoading) return <div className="pt-4"><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-4 mt-4">
      <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }} data-testid="button-add-airline-rate">
        <Plus className="h-4 w-4 mr-1" /> Add rate
      </Button>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(rates || []).map(rate => (
          <Card key={rate.id} data-testid={`card-rate-${rate.id}`}>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <p className="font-semibold text-sm">{rate.airlineName || rate.route || "Airline rate"}</p>
                <p className="text-xs text-muted-foreground">${rate.price || rate.cost || 0}</p>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditing(rate); setDialogOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => deleteRate.mutate(rate.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!rates || rates.length === 0) && (
          <Card><CardContent className="py-10 text-center text-muted-foreground col-span-2">No airline rates configured.</CardContent></Card>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Edit" : "Add"} airline rate</DialogTitle></DialogHeader>
          <AirlineRateForm rate={editing} onClose={() => setDialogOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AirlineRateForm({ rate, onClose }: { rate: any; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [airlineName, setAirlineName] = useState(rate?.airlineName || "");
  const [route, setRoute] = useState(rate?.route || "");
  const [price, setPrice] = useState(rate?.price?.toString() || "0");

  const save = useMutation({
    mutationFn: () => {
      const data = { airlineName, route, price: parseFloat(price) || 0 };
      if (rate) return apiRequest("PATCH", `/api/rates/airline/${rate.id}`, data);
      return apiRequest("POST", "/api/rates/airline", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/rates/airline"] });
      toast({ title: "Rate saved" });
      onClose();
    },
  });

  return (
    <div className="space-y-3">
      <div><Label>Airline</Label><Input value={airlineName} onChange={(e) => setAirlineName(e.target.value)} /></div>
      <div><Label>Route</Label><Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="ATH-JFK" /></div>
      <div><Label>Price ($)</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("saving") : t("save")}</Button>
        <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
