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
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Plus, Calendar, Users, MapPin, Plane } from "lucide-react";
import type { TourDeparture, Tour, Airport } from "@workspace/db";

export default function AdminDepartures() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [showCreate, setShowCreate] = useState(false);

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

  const statusColors: Record<string, string> = {
    open: "default",
    closed: "secondary",
    sold_out: "destructive",
    cancelled: "outline",
  };

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

      {!departures || departures.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center py-16"><Calendar className="h-12 w-12 text-muted-foreground/40 mb-4" /><h3 className="font-semibold mb-1">{t("no_departures_admin")}</h3><p className="text-sm text-muted-foreground">{t("create_departure_hint")}</p></CardContent></Card>
      ) : (
        <div className="space-y-2">
          {departures.map((dep) => {
            const tour = tours?.find((t) => t.id === dep.tourId);
            const depAir = airports?.find(a => a.id === dep.departureAirportId);
            const arrAir = airports?.find(a => a.id === dep.arrivalAirportId);
            return (
              <Card key={dep.id} data-testid={`card-departure-${dep.id}`}>
                <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{tour?.title || t("unknown_tour")}</p>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{dep.startDate} to {dep.endDate}</span>
                      <span className="flex items-center gap-1"><Users className="h-3 w-3" />{dep.capacityBooked}/{dep.capacityTotal} {t("booked_suffix")}</span>
                      {dep.pricePerPerson && <span>${dep.pricePerPerson} / {t("per_person")}</span>}
                    </div>
                    {(depAir || arrAir) && (
                      <div className="flex items-center gap-2 mt-2 text-[10px] font-mono bg-slate-50 p-1 rounded border w-fit">
                        <Plane className="h-3 w-3" />
                        {depAir ? depAir.code : "???"} → {arrAir ? arrAir.code : "???"}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {dep.publicJoinEnabled && <Badge variant="outline">{t("public_badge")}</Badge>}
                    <Badge variant={statusColors[dep.status || "open"] as any}>{dep.status || "open"}</Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
