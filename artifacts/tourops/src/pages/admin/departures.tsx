import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Plus, Calendar, Plane, Pencil, Trash2, Search } from "lucide-react";
import type { TourDeparture, Tour, Airport } from "@workspace/db";

export default function AdminDepartures() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tourFilter, setTourFilter] = useState("all");

  const { data: departures, isLoading } = useQuery<TourDeparture[]>({ queryKey: ["/api/departures"] });
  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  const { data: airports } = useQuery<Airport[]>({ queryKey: ["/api/master/airports"] });

  const [tourId, setTourId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [capacity, setCapacity] = useState(20);
  const [price, setPrice] = useState(0);
  const [publicJoin, setPublicJoin] = useState(true);
  const [departureAirportId, setDepartureAirportId] = useState("");
  const [arrivalAirportId, setArrivalAirportId] = useState("");

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/departures", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] }); // covers ["/api/tours", tourId, "departures"] on customer pages
      setShowCreate(false);
      setTourId("");
      setStartDate("");
      setEndDate("");
      setCapacity(20);
      setPrice(0);
      setPublicJoin(true);
      setDepartureAirportId("");
      setArrivalAirportId("");
      toast({ title: t("departure_created") });
    },
    onError: () => toast({ title: t("failed_to_create_departure"), variant: "destructive" }),
  });

  // Edit dialog state
  const [editDep, setEditDep] = useState<TourDeparture | null>(null);
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editCapacity, setEditCapacity] = useState(20);
  const [editPrice, setEditPrice] = useState(0);
  const [editStatus, setEditStatus] = useState("open");
  const [editPublicJoin, setEditPublicJoin] = useState(true);
  const [deleteDep, setDeleteDep] = useState<TourDeparture | null>(null);

  const openEdit = (dep: TourDeparture) => {
    setEditDep(dep);
    setEditStartDate(dep.startDate || "");
    setEditEndDate(dep.endDate || "");
    setEditCapacity(dep.capacityTotal || 0);
    setEditPrice(Number(dep.pricePerPerson) || 0);
    setEditStatus(dep.status || "open");
    setEditPublicJoin(!!dep.publicJoinEnabled);
  };

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => apiRequest("PATCH", `/api/departures/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      setEditDep(null);
      toast({ title: t("departure_updated") });
    },
    onError: () => toast({ title: t("failed_to_update_departure"), variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/departures/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/departures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      setDeleteDep(null);
      toast({ title: t("departure_deleted") });
    },
    onError: (e: any) => {
      setDeleteDep(null);
      toast({ title: t("failed_to_delete_departure"), description: e?.message, variant: "destructive" });
    },
  });

  const statusColors: Record<string, string> = {
    open: "default",
    closed: "secondary",
    sold_out: "destructive",
    cancelled: "outline",
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filtersActive = Boolean(normalizedSearch) || statusFilter !== "all" || tourFilter !== "all";
  const filtered = (departures || []).filter((dep) => {
    const tour = tours?.find((tr) => tr.id === dep.tourId);
    const depAir = airports?.find((airport) => airport.id === dep.departureAirportId);
    const arrAir = airports?.find((airport) => airport.id === dep.arrivalAirportId);
    const searchText = [
      tour?.title,
      dep.startDate,
      dep.endDate,
      depAir?.code,
      arrAir?.code,
      dep.notes,
      dep.status,
      dep.pricePerPerson != null ? String(dep.pricePerPerson) : "",
    ].filter(Boolean).join(" ").toLowerCase();

    return (!normalizedSearch || searchText.includes(normalizedSearch)) &&
      (statusFilter === "all" || dep.status === statusFilter) &&
      (tourFilter === "all" || dep.tourId === tourFilter);
  });

  if (isLoading) return <div className="p-6"><Skeleton className="h-8 w-48 mb-4" />{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 mb-2" />)}</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif">{t("departures")}</h1>
          <p className="text-muted-foreground text-sm">{t("manage_departure_dates")}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-departure"><Plus className="h-4 w-4 mr-2" />{t("create_departure")}</Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>{t("create_new_departure")}</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label>{t("tour")}</Label>
                <Select value={tourId} onValueChange={setTourId}>
                  <SelectTrigger data-testid="select-departure-tour"><SelectValue placeholder={t("select_tour_placeholder")} /></SelectTrigger>
                  <SelectContent>
                    {tours?.map((tr) => <SelectItem key={tr.id} value={tr.id}>{tr.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("start_date")}</Label><Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} data-testid="input-start-date" /></div>
                <div><Label>{t("end_date")}</Label><Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} data-testid="input-end-date" /></div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="flex items-center gap-1"><Plane className="h-3 w-3" /> {t("departure_airport")}</Label>
                  <Select value={departureAirportId} onValueChange={setDepartureAirportId}>
                    <SelectTrigger><SelectValue placeholder={t("select_airport_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      {airports?.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="flex items-center gap-1"><Plane className="h-3 w-3" /> {t("arrival_airport")}</Label>
                  <Select value={arrivalAirportId} onValueChange={setArrivalAirportId}>
                    <SelectTrigger><SelectValue placeholder={t("select_airport_placeholder")} /></SelectTrigger>
                    <SelectContent>
                      {airports?.map((a) => <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div><Label>{t("capacity")}</Label><Input type="number" value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value) || 0)} /></div>
                <div><Label>{t("price_per_person")}</Label><Input type="number" value={price} onChange={(e) => setPrice(parseInt(e.target.value) || 0)} /></div>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={publicJoin} onCheckedChange={setPublicJoin} />
                <Label>{t("allow_public_join")}</Label>
              </div>
              <Button
                className="w-full"
                onClick={() => createMutation.mutate({
                  tourId, startDate, endDate,
                  capacityTotal: capacity,
                  pricePerPerson: price,
                  publicJoinEnabled: publicJoin,
                  departureAirportId: departureAirportId || null,
                  arrivalAirportId: arrivalAirportId || null
                })}
                disabled={!tourId || !startDate || !endDate || capacity < 1 || createMutation.isPending}
                data-testid="button-save-departure"
              >{createMutation.isPending ? t("creating") : t("create_departure")}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_departures_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-departures" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40" data-testid="select-departures-status"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_status")}</SelectItem>
            <SelectItem value="open">open</SelectItem>
            <SelectItem value="closed">closed</SelectItem>
            <SelectItem value="sold_out">sold_out</SelectItem>
            <SelectItem value="cancelled">cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tourFilter} onValueChange={setTourFilter}>
          <SelectTrigger className="w-56" data-testid="select-departures-tour"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("all_tours")}</SelectItem>
            {tours?.map((tour) => <SelectItem key={tour.id} value={tour.id}>{tour.title}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!departures || departures.length === 0 ? (
        filtersActive ? (
          <Table>
            <TableBody>
              <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("no_results")}</TableCell></TableRow>
            </TableBody>
          </Table>
        ) : (
        <Card><CardContent className="flex flex-col items-center py-16"><Calendar className="h-12 w-12 text-muted-foreground/40 mb-4" /><h3 className="font-semibold mb-1">{t("no_departures_admin")}</h3><p className="text-sm text-muted-foreground">{t("create_departure_hint")}</p></CardContent></Card>
        )
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("tour_label")}</TableHead>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("booked_label")}</TableHead>
              <TableHead>{t("price")}</TableHead>
              <TableHead>{t("route_label")}</TableHead>
              <TableHead>{t("public_badge")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
          {filtered.map((dep) => {
            const tour = tours?.find((t) => t.id === dep.tourId);
            const depAir = airports?.find(a => a.id === dep.departureAirportId);
            const arrAir = airports?.find(a => a.id === dep.arrivalAirportId);
            return (
              <TableRow key={dep.id} data-testid={`card-departure-${dep.id}`}>
                <TableCell className="font-medium">{tour?.title || t("unknown_tour")}</TableCell>
                <TableCell>{dep.startDate} → {dep.endDate}</TableCell>
                <TableCell>{dep.capacityBooked}/{dep.capacityTotal} {t("booked_suffix")}</TableCell>
                <TableCell>{dep.pricePerPerson != null ? `$${dep.pricePerPerson} / ${t("per_person")}` : "—"}</TableCell>
                <TableCell>
                  {(depAir || arrAir) ? <span className="flex items-center gap-1"><Plane className="h-4 w-4" />{depAir?.code || "—"} → {arrAir?.code || "—"}</span> : "—"}
                </TableCell>
                <TableCell>{dep.publicJoinEnabled ? <Badge variant="outline">{t("public_badge")}</Badge> : "—"}</TableCell>
                <TableCell><Badge variant={statusColors[dep.status || "open"] as any}>{dep.status || "open"}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(dep)} data-testid={`button-edit-departure-${dep.id}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" onClick={() => setDeleteDep(dep)} data-testid={`button-delete-departure-${dep.id}`}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_departures_admin")}</TableCell></TableRow>
          )}
          </TableBody>
        </Table>
      )}

      {/* Edit dialog */}
      <Dialog open={!!editDep} onOpenChange={(open) => !open && setEditDep(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{t("edit_departure")}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm font-medium text-muted-foreground">{tours?.find((tr) => tr.id === editDep?.tourId)?.title}</p>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("start_date")}</Label><Input type="date" value={editStartDate} onChange={(e) => setEditStartDate(e.target.value)} data-testid="input-edit-start-date" /></div>
              <div><Label>{t("end_date")}</Label><Input type="date" value={editEndDate} onChange={(e) => setEditEndDate(e.target.value)} data-testid="input-edit-end-date" /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label>{t("capacity")}</Label><Input type="number" value={editCapacity} onChange={(e) => setEditCapacity(parseInt(e.target.value) || 0)} data-testid="input-edit-capacity" /></div>
              <div><Label>{t("price_per_person")}</Label><Input type="number" value={editPrice} onChange={(e) => setEditPrice(parseInt(e.target.value) || 0)} data-testid="input-edit-price" /></div>
            </div>
            <div>
              <Label>{t("status")}</Label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger data-testid="select-edit-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">open</SelectItem>
                  <SelectItem value="closed">closed</SelectItem>
                  <SelectItem value="sold_out">sold_out</SelectItem>
                  <SelectItem value="cancelled">cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editPublicJoin} onCheckedChange={setEditPublicJoin} />
              <Label>{t("allow_public_join")}</Label>
            </div>
            <Button
              className="w-full"
              onClick={() => editDep && updateMutation.mutate({
                id: editDep.id,
                data: {
                  startDate: editStartDate,
                  endDate: editEndDate,
                  capacityTotal: editCapacity,
                  pricePerPerson: editPrice,
                  status: editStatus,
                  publicJoinEnabled: editPublicJoin,
                },
              })}
              disabled={!editStartDate || !editEndDate || editCapacity < 1 || updateMutation.isPending}
              data-testid="button-update-departure"
            >{updateMutation.isPending ? t("saving") : t("save_changes")}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteDep} onOpenChange={(open) => !open && setDeleteDep(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("delete_departure_confirm")}</AlertDialogTitle>
            <AlertDialogDescription>{t("delete_departure_confirm_desc")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteDep && deleteMutation.mutate(deleteDep.id)}
              data-testid="button-confirm-delete-departure"
            >{deleteMutation.isPending ? t("deleting") : t("delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
