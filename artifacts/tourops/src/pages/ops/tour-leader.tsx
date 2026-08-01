import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getFullImageUrl } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { BOOKING_STATUSES } from "@/lib/constants";
import { Users, Globe, Calendar, MapPin, Plus, BookOpen, AlertTriangle } from "lucide-react";
import type { Tour, Booking } from "@workspace/db";

export default function TravelAgentDashboard() {
  const { t } = useLanguage();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Users className="h-6 w-6 text-primary" />{t("agent_dashboard")}</h1>
        <p className="text-muted-foreground text-sm">{t("tour_leader_subtitle")}</p>
      </div>
      <Tabs defaultValue="assignments">
        <TabsList>
          <TabsTrigger value="assignments">{t("lc_my_assigned_tours")}</TabsTrigger>
          <TabsTrigger value="tours">{t("browse_tours_tab")}</TabsTrigger>
          <TabsTrigger value="bookings">{t("my_client_bookings_tab")}</TabsTrigger>
        </TabsList>
        <TabsContent value="assignments"><AssignedTours /></TabsContent>
        <TabsContent value="tours"><TourCatalog /></TabsContent>
        <TabsContent value="bookings"><ClientBookings /></TabsContent>
      </Tabs>
    </div>
  );
}

function TourCatalog() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [bookingTour, setBookingTour] = useState<Tour | null>(null);
  const { data: tours, isLoading } = useQuery<Tour[]>({ queryKey: ["/api/tours/public"] });
  const filtered = tours?.filter(t => (t.title || "").toLowerCase().includes(search.toLowerCase())) || [];

  if (isLoading) return <div className="pt-4"><Skeleton className="h-40 w-full" /></div>;

  return (
    <div className="space-y-4 mt-4">
      <Input placeholder={t("search_tours_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" data-testid="input-search-tours" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map(tour => (
          <Card key={tour.id} className="overflow-hidden" data-testid={`card-tour-${tour.id}`}>
            {tour.imageUrl && <div className="aspect-video overflow-hidden"><img src={getFullImageUrl(tour.imageUrl)} alt={tour.title} className="w-full h-full object-cover" /></div>}
            <CardContent className="p-4 space-y-2">
              <h3 className="font-semibold">{tour.title}</h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{tour.duration} days</span>
                {tour.countries && tour.countries.length > 0 && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{tour.countries.join(", ")}</span>}
              </div>
              <p className="text-lg font-bold text-primary">${tour.basePrice}</p>
              <Button size="sm" className="w-full" onClick={() => setBookingTour(tour)} data-testid={`button-book-${tour.id}`}>
                <Plus className="h-4 w-4 mr-1" />Book for client
              </Button>
            </CardContent>
          </Card>
        ))}
        {filtered.length === 0 && <Card className="col-span-full"><CardContent className="py-16 text-center text-muted-foreground">No published tours found.</CardContent></Card>}
      </div>

      <Dialog open={!!bookingTour} onOpenChange={(open) => !open && setBookingTour(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Book "{bookingTour?.title}" for a client</DialogTitle></DialogHeader>
          {bookingTour && <NewClientBookingForm tour={bookingTour} onClose={() => setBookingTour(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewClientBookingForm({ tour, onClose }: { tour: Tour; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [groupName, setGroupName] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [notes, setNotes] = useState("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/bookings", {
      tourId: tour.id,
      bookingType: "custom_leader",
      groupName,
      partySizeExpected: partySize,
      totalPrice: Math.round(parseFloat(tour.basePrice as any) * partySize) || undefined,
      notes,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bookings"] });
      toast({ title: t("booking_created_for_client") });
      onClose();
    },
    onError: () => toast({ title: t("failed_to_create_booking"), variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div><Label>{t("client_group_name_label")}</Label><Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("client_name_placeholder")} data-testid="input-client-name" /></div>
      <div><Label>{t("party_size_label")}</Label><Input type="number" min={1} value={partySize} onChange={(e) => setPartySize(parseInt(e.target.value) || 1)} /></div>
      <div><Label>{t("notes_label")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => create.mutate()} disabled={!groupName || create.isPending} data-testid="button-confirm-booking">
          {create.isPending ? t("adding") : "Create booking"}
        </Button>
        <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
      </div>
    </div>
  );
}

interface Assignment {
  booking: { id: string; bookingCode: string; status: string; groupName: string | null; partySizeExpected: number | null; notes: string | null };
  tour: { id: string; title: string } | null;
  departure: { startDate: string; endDate: string } | null;
  passengers: { id: string; firstName: string; lastName: string; dietaryNotes: string | null; mobilityNotes: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null }[];
}

function AssignedTours() {
  const { t } = useLanguage();
  const { data: assignments, isLoading } = useQuery<Assignment[]>({ queryKey: ["/api/tour-leader/assignments"] });

  if (isLoading) return <div className="pt-4"><Skeleton className="h-40 w-full" /></div>;
  if (!assignments?.length) {
    return <Card className="mt-4"><CardContent className="py-16 text-center text-muted-foreground">{t("lc_no_assignments")}</CardContent></Card>;
  }

  return (
    <div className="space-y-4 mt-4">
      {assignments.map((a) => (
        <Card key={a.booking.id} data-testid={`assignment-${a.booking.id}`}>
          <CardContent className="p-4 space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{a.tour?.title ?? a.booking.bookingCode}</p>
                <p className="text-xs text-muted-foreground">{a.booking.bookingCode}{a.booking.groupName ? ` · ${a.booking.groupName}` : ""}</p>
                {a.departure && <p className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="h-3 w-3" />{a.departure.startDate} – {a.departure.endDate}</p>}
              </div>
              <Badge variant="outline" className="capitalize">{a.booking.status?.replace("_", " ")}</Badge>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-1">{t("lc_passenger_list")}</h4>
              <div className="space-y-1">
                {a.passengers.map((p) => (
                  <div key={p.id} className="rounded-md border p-2 text-sm">
                    <p className="font-medium">{p.firstName} {p.lastName}</p>
                    <div className="text-xs text-muted-foreground space-x-3">
                      {p.dietaryNotes && <span>{t("lc_dietary")}: {p.dietaryNotes}</span>}
                      {p.mobilityNotes && <span>{t("lc_mobility")}: {p.mobilityNotes}</span>}
                      {p.emergencyContactName && <span>{t("lc_emergency")}: {p.emergencyContactName} {p.emergencyContactPhone ?? ""}</span>}
                    </div>
                  </div>
                ))}
                {a.passengers.length === 0 && <p className="text-xs text-muted-foreground">{t("lc_no_passengers")}</p>}
              </div>
            </div>

            <IncidentSection bookingId={a.booking.id} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function IncidentSection({ bookingId }: { bookingId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const { data: incidents } = useQuery<any[]>({ queryKey: [`/api/bookings/${bookingId}/incidents`] });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState("low");

  const report = useMutation({
    mutationFn: () => apiRequest("POST", `/api/bookings/${bookingId}/incidents`, { title, description, severity }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/bookings/${bookingId}/incidents`] });
      setTitle(""); setDescription(""); setSeverity("low");
      toast({ title: t("lc_incident_reported") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <h4 className="font-semibold text-sm mb-1 flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{t("lc_report_incident")}</h4>
      <div className="space-y-2">
        <Input placeholder={t("lc_title")} value={title} onChange={(e) => setTitle(e.target.value)} data-testid={`incident-title-${bookingId}`} />
        <Textarea rows={2} placeholder={t("lc_description")} value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="flex items-center gap-2">
          <Select value={severity} onValueChange={setSeverity}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t("lc_severity_low")}</SelectItem>
              <SelectItem value="medium">{t("lc_severity_medium")}</SelectItem>
              <SelectItem value="high">{t("lc_severity_high")}</SelectItem>
              <SelectItem value="critical">{t("lc_severity_critical")}</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => report.mutate()} disabled={!title.trim() || !description.trim() || report.isPending} data-testid={`incident-submit-${bookingId}`}>{t("lc_report_incident")}</Button>
        </div>
      </div>
      {incidents && incidents.length > 0 && (
        <div className="mt-2 space-y-1">
          {incidents.map((i) => (
            <div key={i.id} className="rounded-md border p-2 text-xs flex items-center justify-between">
              <span>{i.title} <span className="text-muted-foreground">({i.severity})</span></span>
              <Badge variant={i.status === "resolved" ? "default" : "secondary"} className="capitalize">{i.status}</Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ClientBookings() {
  const { user } = useAuth();
  const { data: bookings, isLoading } = useQuery<Booking[]>({ queryKey: ["/api/bookings"] });
  const mine = bookings?.filter(b => b.customerId === user?.id) || [];

  if (isLoading) return <div className="pt-4"><Skeleton className="h-40 w-full" /></div>;

  if (mine.length === 0) {
    return <Card className="mt-4"><CardContent className="py-16 text-center text-muted-foreground">You haven't created any client bookings yet.</CardContent></Card>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
      {mine.map(b => (
        <Card key={b.id} data-testid={`card-booking-${b.id}`}>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{b.groupName || b.bookingCode}</p>
                <p className="text-xs text-muted-foreground">{b.bookingCode}</p>
              </div>
              <Badge variant="outline">{BOOKING_STATUSES[b.status || "submitted"]}</Badge>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users className="h-3 w-3" />{b.partySizeExpected} pax</span>
              {b.totalPrice ? <span className="font-medium text-foreground">${b.totalPrice}</span> : null}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
