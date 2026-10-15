import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { CheckCircle2, Trash2, Download, FileText } from "lucide-react";
import { useState, type ReactNode } from "react";
import type { Booking, UserProfile } from "@workspace/db";

const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["confirmed", "cancelled"],
  confirmed: ["in_operation", "cancelled"],
  in_operation: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

export default function BookingOperations() {
  const { t } = useLanguage();
  const [, params] = useRoute("/ops/booking-operations/:bookingId");
  const bookingId = params?.bookingId ?? "";

  const { data: booking, isLoading } = useQuery<Booking>({ queryKey: [`/api/bookings/${bookingId}`], enabled: !!bookingId });

  if (isLoading) return <div className="p-6 space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;

  return (
    <div className="p-6 space-y-4" data-testid="page-booking-operations">
      <div>
        <h1 className="text-2xl font-bold font-serif">{t("lc_booking_operations")}</h1>
        <p className="text-muted-foreground text-sm">{booking?.bookingCode}{booking?.groupName ? ` · ${booking.groupName}` : ""}</p>
      </div>
      <Tabs defaultValue="status">
        <TabsList className="flex-wrap">
          <TabsTrigger value="status">{t("lc_tab_status")}</TabsTrigger>
          <TabsTrigger value="passengers">{t("lc_tab_passengers")}</TabsTrigger>
          <TabsTrigger value="rooming">{t("lc_tab_rooming")}</TabsTrigger>
          <TabsTrigger value="leader">{t("lc_tab_tour_leader")}</TabsTrigger>
          <TabsTrigger value="changes">{t("lc_tab_change_requests")}</TabsTrigger>
          <TabsTrigger value="incidents">{t("lc_tab_incidents")}</TabsTrigger>
          <TabsTrigger value="documents">{t("lc_tab_documents")}</TabsTrigger>
        </TabsList>
        <TabsContent value="status" className="mt-4"><StatusTab bookingId={bookingId} status={booking?.status ?? "submitted"} /></TabsContent>
        <TabsContent value="passengers" className="mt-4"><PassengersTab bookingId={bookingId} /></TabsContent>
        <TabsContent value="rooming" className="mt-4"><RoomingTab bookingId={bookingId} /></TabsContent>
        <TabsContent value="leader" className="mt-4"><TourLeaderTab bookingId={bookingId} current={booking?.tourLeaderUserId ?? null} /></TabsContent>
        <TabsContent value="changes" className="mt-4"><ChangeRequestsTab bookingId={bookingId} /></TabsContent>
        <TabsContent value="incidents" className="mt-4"><IncidentsTab bookingId={bookingId} /></TabsContent>
        <TabsContent value="documents" className="mt-4"><DocumentsTab bookingId={bookingId} /></TabsContent>
      </Tabs>
    </div>
  );
}

function StatusTab({ bookingId, status }: { bookingId: string; status: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [next, setNext] = useState("");
  const [reason, setReason] = useState("");
  const allowed = STATUS_TRANSITIONS[status] ?? [];

  const { data: history } = useQuery<any[]>({ queryKey: [`/api/bookings/${bookingId}/status-history`] });

  const change = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/bookings/${bookingId}/status`, { status: next, reason: reason || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/status-history`] });
      setNext(""); setReason("");
      toast({ title: t("lc_apply") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle className="text-base">{t("lc_current_status")}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="outline" className="capitalize">{status.replace("_", " ")}</Badge>
          {allowed.length > 0 ? (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[180px]">
                <Label>{t("lc_change_status")}</Label>
                <Select value={next} onValueChange={setNext}>
                  <SelectTrigger data-testid="select-next-status"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {allowed.map((s) => <SelectItem key={s} value={s} className="capitalize">{s.replace("_", " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[180px]">
                <Label>{t("lc_reason")}</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button onClick={() => change.mutate()} disabled={!next || change.isPending} data-testid="button-apply-status">{t("lc_apply")}</Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{status}</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="text-base">{t("lc_status_history")}</CardTitle></CardHeader>
        <CardContent>
          {!history?.length ? <p className="text-sm text-muted-foreground">{t("lc_no_history")}</p> : (
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("lc_from")}</TableHead><TableHead>{t("lc_to")}</TableHead>
                <TableHead>{t("lc_reason")}</TableHead><TableHead>{t("lc_changed_at")}</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {history.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell className="capitalize">{h.fromStatus}</TableCell>
                    <TableCell className="capitalize">{h.toStatus}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.reason ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.createdAt ? new Date(h.createdAt).toLocaleString() : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PassengersTab({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const { data } = useQuery<{ passengers: any[] }>({ queryKey: [`/api/bookings/${bookingId}/passenger-completion`] });
  const passengers = data?.passengers ?? [];
  return (
    <Card>
      <CardContent className="pt-6">
        {passengers.length === 0 ? <p className="text-sm text-muted-foreground">{t("lc_no_passengers")}</p> : (
          <Table>
            <TableHeader><TableRow>
              <TableHead>{t("lc_passenger")}</TableHead><TableHead>{t("lc_email")}</TableHead><TableHead>{t("lc_status_col")}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {passengers.map((p) => (
                <TableRow key={p.id} data-testid={`pax-completion-${p.id}`}>
                  <TableCell>{p.firstName} {p.lastName}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.email ?? "—"}</TableCell>
                  <TableCell>
                    {p.complete
                      ? <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />{t("lc_complete_badge")}</Badge>
                      : <span className="text-xs text-amber-700">{p.missing.join(", ")}</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RoomingTab({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: rooms } = useQuery<any[]>({ queryKey: [`/api/bookings/${bookingId}/rooms`] });
  const { data: completion } = useQuery<{ passengers: any[] }>({ queryKey: [`/api/bookings/${bookingId}/passenger-completion`] });
  const [label, setLabel] = useState("");
  const [roomType, setRoomType] = useState("double");

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/rooms`] });
  };

  const createRoom = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bookings/${bookingId}/rooms`, { label, roomType }),
    onSuccess: () => { invalidate(); setLabel(""); toast({ title: t("lc_room_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const deleteRoom = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rooms/${id}`),
    onSuccess: () => { invalidate(); toast({ title: t("lc_room_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const assign = useMutation({
    mutationFn: (body: { travelerId: string; roomId: string | null }) => apiRequest("POST", `/api/bookings/${bookingId}/rooms/assign`, body),
    onSuccess: () => { invalidate(); toast({ title: t("lc_assign_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const passengers = completion?.passengers ?? [];
  const roomOf = (travelerId: string) => (rooms ?? []).find((r) => r.occupants?.some((o: any) => o.id === travelerId))?.id ?? "";

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">{t("lc_rooms")}</CardTitle>
          <a href={`/api/bookings/${bookingId}/documents/rooming-list?format=csv`} target="_blank" rel="noreferrer">
            <Button size="sm" variant="outline"><Download className="h-4 w-4 mr-1" />{t("lc_export_csv")}</Button>
          </a>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div><Label>{t("lc_room_label")}</Label><Input value={label} onChange={(e) => setLabel(e.target.value)} data-testid="input-room-label" /></div>
            <div className="min-w-[140px]">
              <Label>{t("lc_room_type")}</Label>
              <Select value={roomType} onValueChange={setRoomType}>
                <SelectTrigger data-testid="select-room-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="single">single</SelectItem>
                  <SelectItem value="double">double</SelectItem>
                  <SelectItem value="triple">triple</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => createRoom.mutate()} disabled={!label.trim() || createRoom.isPending} data-testid="button-create-room">{t("lc_create_room")}</Button>
          </div>
          {!rooms?.length ? <p className="text-sm text-muted-foreground">{t("lc_no_rooms")}</p> : (
            <div className="space-y-2">
              {rooms.map((r) => (
                <div key={r.id} className="rounded-md border p-2 flex items-center justify-between" data-testid={`room-${r.id}`}>
                  <div className="text-sm">
                    <span className="font-medium">{r.label}</span> <span className="text-muted-foreground capitalize">({r.roomType}, {t("lc_capacity")} {r.capacity})</span>
                    <div className="text-xs text-muted-foreground">{t("lc_occupants")}: {r.occupants?.map((o: any) => `${o.firstName} ${o.lastName}`).join(", ") || "—"}</div>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => deleteRoom.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">{t("lc_assign_to_room")}</CardTitle></CardHeader>
        <CardContent>
          {passengers.length === 0 ? <p className="text-sm text-muted-foreground">{t("lc_no_passengers")}</p> : (
            <div className="space-y-2">
              {passengers.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm">{p.firstName} {p.lastName}</span>
                  <Select value={roomOf(p.id)} onValueChange={(v) => assign.mutate({ travelerId: p.id, roomId: v === "__none" ? null : v })}>
                    <SelectTrigger className="w-[200px]" data-testid={`assign-room-${p.id}`}><SelectValue placeholder={t("lc_unassigned")} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">{t("lc_unassigned")}</SelectItem>
                      {(rooms ?? []).map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function TourLeaderTab({ bookingId, current }: { bookingId: string; current: string | null }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: profiles, isError } = useQuery<UserProfile[]>({ queryKey: ["/api/user-profiles"], retry: false });
  const [selected, setSelected] = useState<string>(current ?? "");

  const leaders = (profiles ?? []).filter((p) => p.role === "tour_leader");

  const assign = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/bookings/${bookingId}/tour-leader`, { tourLeaderUserId: selected || null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}`] });
      toast({ title: t("lc_leader_assigned") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{t("lc_tab_tour_leader")}</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm"><span className="text-muted-foreground">{t("lc_current_tour_leader")}: </span>{current ?? t("lc_none")}</p>
        {isError || !profiles ? (
          <div>
            <Label>{t("lc_select_tour_leader")}</Label>
            <Input value={selected} onChange={(e) => setSelected(e.target.value)} placeholder="user id" data-testid="input-leader-id" />
          </div>
        ) : (
          <div>
            <Label>{t("lc_select_tour_leader")}</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger data-testid="select-tour-leader"><SelectValue placeholder={t("lc_none")} /></SelectTrigger>
              <SelectContent>
                {leaders.map((p) => <SelectItem key={p.userId} value={p.userId}>{p.companyName || p.userId}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <Button onClick={() => assign.mutate()} disabled={assign.isPending} data-testid="button-assign-leader">{t("lc_assign_leader")}</Button>
      </CardContent>
    </Card>
  );
}

function ChangeRequestsTab({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: requests } = useQuery<any[]>({ queryKey: [`/api/bookings/${bookingId}/change-requests`] });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const resolve = useMutation({
    mutationFn: (v: { id: string; decision: "approved" | "rejected" }) =>
      apiRequest("PATCH", `/api/change-requests/${v.id}/resolve`, { decision: v.decision, resolutionNotes: notes[v.id] || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/change-requests`] });
      toast({ title: t("lc_resolved") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!requests?.length) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("lc_no_change_requests")}</CardContent></Card>;

  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <Card key={r.id} data-testid={`change-request-${r.id}`}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Badge variant="outline" className="capitalize">{r.requestType?.replace("_", " ")}</Badge>
                {typeof r.paxDelta === "number" && r.paxDelta !== null && <span className="ml-2 text-xs text-muted-foreground">{t("lc_pax_delta")}: {r.paxDelta}</span>}
              </div>
              <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"} className="capitalize">{r.status}</Badge>
            </div>
            <p className="text-sm">{r.details}</p>
            {r.status === "pending" && (
              <div className="space-y-2">
                <Textarea rows={2} placeholder={t("lc_resolution_notes")} value={notes[r.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [r.id]: e.target.value }))} />
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => resolve.mutate({ id: r.id, decision: "approved" })} disabled={resolve.isPending} data-testid={`approve-${r.id}`}>{t("lc_approve")}</Button>
                  <Button size="sm" variant="destructive" onClick={() => resolve.mutate({ id: r.id, decision: "rejected" })} disabled={resolve.isPending}>{t("lc_reject")}</Button>
                </div>
              </div>
            )}
            {r.resolutionNotes && <p className="text-xs text-muted-foreground">{r.resolutionNotes}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IncidentsTab({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: incidents } = useQuery<any[]>({ queryKey: [`/api/bookings/${bookingId}/incidents`] });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const update = useMutation({
    mutationFn: (v: { id: string; status: "acknowledged" | "resolved" }) =>
      apiRequest("PATCH", `/api/incidents/${v.id}`, { status: v.status, resolutionNotes: notes[v.id] || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/incidents`] });
      toast({ title: t("lc_incident_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!incidents?.length) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{t("lc_no_incidents")}</CardContent></Card>;

  return (
    <div className="space-y-3">
      {incidents.map((i) => (
        <Card key={i.id} data-testid={`incident-${i.id}`}>
          <CardContent className="pt-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">{i.title}</span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">{i.severity}</Badge>
                <Badge variant={i.status === "resolved" ? "default" : "secondary"} className="capitalize">{i.status}</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{i.description}</p>
            {i.status !== "resolved" && (
              <div className="space-y-2">
                <Textarea rows={2} placeholder={t("lc_resolution_notes")} value={notes[i.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))} />
                <div className="flex gap-2">
                  {i.status !== "acknowledged" && <Button size="sm" variant="outline" onClick={() => update.mutate({ id: i.id, status: "acknowledged" })} disabled={update.isPending}>{t("lc_acknowledge")}</Button>}
                  <Button size="sm" onClick={() => update.mutate({ id: i.id, status: "resolved" })} disabled={update.isPending}>{t("lc_resolve")}</Button>
                </div>
              </div>
            )}
            {i.resolutionNotes && <p className="text-xs text-muted-foreground">{i.resolutionNotes}</p>}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function DocumentsTab({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);
  const [isConfirmationOpen, setIsConfirmationOpen] = useState(false);
  const [isConfirmationLoading, setIsConfirmationLoading] = useState(false);

  const loadConfirmation = async () => {
    setIsConfirmationOpen(true);
    setIsConfirmationLoading(true);
    setConfirmation(null);
    try {
      const res = await apiRequest("GET", `/api/bookings/${bookingId}/documents/booking-confirmation`);
      setConfirmation(await res.json());
    } catch {
      setConfirmation(null);
    } finally {
      setIsConfirmationLoading(false);
    }
  };

  const closeConfirmation = (open: boolean) => {
    setIsConfirmationOpen(open);
    if (!open) {
      setConfirmation(null);
      setIsConfirmationLoading(false);
    }
  };

  return (
    <Card>
      <CardContent className="pt-6 flex flex-wrap gap-2">
        <Button variant="outline" onClick={loadConfirmation} data-testid="button-view-confirmation"><FileText className="h-4 w-4 mr-1" />{t("lc_view_confirmation")}</Button>
        <a href={`/api/bookings/${bookingId}/documents/rooming-list?format=csv`} target="_blank" rel="noreferrer">
          <Button variant="outline"><Download className="h-4 w-4 mr-1" />{t("lc_rooming_list_csv")}</Button>
        </a>
        <a href={`/api/bookings/${bookingId}/documents/passenger-manifest?format=csv`} target="_blank" rel="noreferrer">
          <Button variant="outline"><Download className="h-4 w-4 mr-1" />{t("lc_manifest_csv")}</Button>
        </a>

        <Dialog open={isConfirmationOpen} onOpenChange={closeConfirmation}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{t("lc_booking_confirmation")}</DialogTitle></DialogHeader>
            {isConfirmationLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("lc_confirmation_loading")}</p>
            ) : confirmation ? (
              <BookingConfirmationView confirmation={confirmation} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">{t("lc_confirmation_unavailable")}</p>
            )}
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

type BookingConfirmation = {
  generatedAt?: string | null;
  bookingCode?: string | null;
  status?: string | null;
  groupName?: string | null;
  tour?: { title?: string | null } | null;
  departure?: { startDate?: string | null; endDate?: string | null } | null;
  passengerCount?: number | null;
  passengers?: Array<{ firstName?: string | null; lastName?: string | null }> | null;
  totalPrice?: string | number | null;
  currency?: string | null;
  paymentSchedule?: Array<{
    label?: string | null;
    amount?: string | number | null;
    dueDate?: string | null;
    status?: string | null;
  }> | null;
};

function ConfirmationField({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="space-y-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-semibold">{value === null || value === undefined || value === "" ? "—" : value}</dd>
    </div>
  );
}

function ConfirmationSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

function formatConfirmationDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString();
}

function formatConfirmationAmount(amount: string | number | null | undefined, currency: string | null | undefined) {
  if (amount === null || amount === undefined || amount === "") return "—";
  const numericAmount = typeof amount === "number" ? amount : Number(amount);
  if (!Number.isFinite(numericAmount)) return String(amount);
  const currencyCode = currency?.trim().toUpperCase();
  if (currencyCode && /^[A-Z]{3}$/.test(currencyCode)) {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: currencyCode }).format(numericAmount);
  }
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(numericAmount);
}

function confirmationStatusVariant(status: string | null | undefined): "default" | "secondary" | "destructive" {
  if (status === "completed") return "default";
  if (status === "cancelled") return "destructive";
  return "secondary";
}

function formatConfirmationStatus(status: string | null | undefined) {
  return status ? status.replace(/_/g, " ") : "—";
}

function BookingConfirmationView({ confirmation }: { confirmation: BookingConfirmation }) {
  const { t } = useLanguage();
  const passengers = confirmation.passengers ?? [];
  const passengerNames = passengers
    .map((passenger) => `${passenger.firstName ?? ""} ${passenger.lastName ?? ""}`.trim())
    .filter(Boolean)
    .join(", ");
  const paymentSchedule = confirmation.paymentSchedule ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4 border-b pb-4">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{t("lc_booking_code")}</p>
          <p className="text-xl font-semibold">{confirmation.bookingCode || "—"}</p>
          {confirmation.groupName && <p className="text-sm text-muted-foreground">{confirmation.groupName}</p>}
          <p className="text-xs text-muted-foreground">{t("date")}: {formatConfirmationDate(confirmation.generatedAt)}</p>
        </div>
        {confirmation.status && (
          <Badge variant={confirmationStatusVariant(confirmation.status)} className="capitalize">
            {formatConfirmationStatus(confirmation.status)}
          </Badge>
        )}
      </div>

      <ConfirmationSection title={t("tour")}>
        <dl className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
          <ConfirmationField label={t("tour")} value={confirmation.tour?.title} />
          <ConfirmationField label={t("lc_group")} value={confirmation.groupName} />
        </dl>
      </ConfirmationSection>

      <ConfirmationSection title={t("lc_departure")}>
        <dl className="grid gap-4 rounded-md border p-4 sm:grid-cols-2">
          <ConfirmationField label={t("start_date")} value={formatConfirmationDate(confirmation.departure?.startDate)} />
          <ConfirmationField label={t("end_date")} value={formatConfirmationDate(confirmation.departure?.endDate)} />
          <ConfirmationField
            label={t("party_size")}
            value={confirmation.passengerCount === null || confirmation.passengerCount === undefined ? "—" : `${confirmation.passengerCount} ${t("travelers_suffix")}`}
          />
          <ConfirmationField label={t("lc_passenger_list")} value={passengerNames || "—"} />
        </dl>
      </ConfirmationSection>

      <ConfirmationSection title={t("payment_schedule_title")}>
        <div className="space-y-3 rounded-md border p-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <ConfirmationField label={t("total_price")} value={formatConfirmationAmount(confirmation.totalPrice, confirmation.currency)} />
            <ConfirmationField label={t("currency")} value={confirmation.currency} />
          </dl>
          {paymentSchedule.length > 0 && (
            <div className="space-y-2 border-t pt-3">
              {paymentSchedule.map((installment, index) => (
                <div key={`${installment.label ?? "installment"}-${index}`} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{installment.label || "—"}</p>
                    <p className="text-xs text-muted-foreground">{t("due_date")}: {formatConfirmationDate(installment.dueDate)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-sm font-semibold">{formatConfirmationAmount(installment.amount, confirmation.currency)}</span>
                    {installment.status && <Badge variant="outline" className="capitalize">{formatConfirmationStatus(installment.status)}</Badge>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </ConfirmationSection>
    </div>
  );
}
