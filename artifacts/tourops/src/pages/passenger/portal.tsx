import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { CheckCircle2, XCircle, BedDouble, MapPin } from "lucide-react";
import { useState } from "react";

interface Completion {
  complete: boolean;
  missing: string[];
}
interface Trip {
  traveler: any;
  completion: Completion;
  booking: { id: string; bookingCode: string; status: string; groupName: string | null; partySizeExpected: number | null; currency: string | null };
  tour: { id: string; title: string; destination: string | null } | null;
  departure: { id: string; startDate: string; endDate: string; status: string } | null;
  itinerary: { dayNumber: number; title: string; description: string | null; city: string | null }[];
  paymentStatus: { installments: number; paid: number; fullyPaid: boolean };
  room: { label: string; roomType: string } | null;
}

export default function PassengerPortal() {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery<{ trips: Trip[] }>({ queryKey: ["/api/passenger/dashboard"] });

  if (isLoading) {
    return <div className="p-6 space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
  }

  const trips = data?.trips ?? [];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" data-testid="page-passenger-portal">
      <div>
        <h1 className="text-2xl font-bold font-serif">{t("lc_passenger_portal")}</h1>
        <p className="text-muted-foreground text-sm mt-1">{t("lc_passenger_portal_subtitle")}</p>
      </div>
      {trips.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t("lc_no_trips")}</CardContent></Card>
      ) : (
        trips.map((trip) => <TripCard key={trip.booking.id} trip={trip} />)
      )}
    </div>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const { t } = useLanguage();
  return (
    <Card data-testid={`card-trip-${trip.booking.id}`}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg">{trip.tour?.title ?? trip.booking.bookingCode}</CardTitle>
            <p className="text-sm text-muted-foreground">{trip.booking.bookingCode}{trip.booking.groupName ? ` · ${trip.booking.groupName}` : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="capitalize">{trip.booking.status?.replace("_", " ")}</Badge>
            <Badge variant={trip.paymentStatus.fullyPaid ? "default" : "secondary"}>
              {trip.paymentStatus.fullyPaid ? t("lc_fully_paid") : t("lc_payment_pending")}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {trip.departure && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            {t("lc_departure")}: {trip.departure.startDate} – {trip.departure.endDate}
          </p>
        )}

        <CompletionChecklist completion={trip.completion} />

        {trip.itinerary.length > 0 && (
          <div>
            <h4 className="font-semibold text-sm mb-2">{t("lc_itinerary")}</h4>
            <div className="space-y-2">
              {trip.itinerary.map((d) => (
                <div key={d.dayNumber} className="rounded-md border p-2 text-sm">
                  <p className="font-medium">{t("lc_day")} {d.dayNumber}: {d.title}</p>
                  {d.city && <p className="text-xs text-muted-foreground">{d.city}</p>}
                  {d.description && <p className="text-xs text-muted-foreground mt-0.5">{d.description}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 className="font-semibold text-sm mb-1 flex items-center gap-2"><BedDouble className="h-4 w-4" />{t("lc_my_room")}</h4>
          {trip.room ? (
            <p className="text-sm">{trip.room.label} <span className="text-muted-foreground capitalize">({trip.room.roomType})</span></p>
          ) : (
            <p className="text-sm text-muted-foreground">{t("lc_no_room")}</p>
          )}
        </div>

        <ProfileForm traveler={trip.traveler} />
      </CardContent>
    </Card>
  );
}

function CompletionChecklist({ completion }: { completion: Completion }) {
  const { t } = useLanguage();
  if (completion.complete) {
    return (
      <div className="flex items-center gap-2 text-sm text-green-600" data-testid="completion-complete">
        <CheckCircle2 className="h-4 w-4" /> {t("lc_all_complete")}
      </div>
    );
  }
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">
      <p className="font-medium flex items-center gap-2 text-amber-700"><XCircle className="h-4 w-4" />{t("lc_missing")}:</p>
      <ul className="list-disc ml-6 text-amber-700">
        {completion.missing.map((m) => <li key={m}>{m}</li>)}
      </ul>
    </div>
  );
}

function ProfileForm({ traveler }: { traveler: any }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [form, setForm] = useState({
    phone: traveler.phone ?? "",
    dob: traveler.dob ?? "",
    gender: traveler.gender ?? "",
    nationality: traveler.nationality ?? "",
    passportNumber: traveler.passportNumber ?? "",
    passportExpiry: traveler.passportExpiry ?? "",
    dietaryNotes: traveler.dietaryNotes ?? "",
    mobilityNotes: traveler.mobilityNotes ?? "",
    emergencyContactName: traveler.emergencyContactName ?? "",
    emergencyContactPhone: traveler.emergencyContactPhone ?? "",
    roomingPreference: traveler.roomingPreference ?? "",
  });
  const [acceptTerms, setAcceptTerms] = useState(!!traveler.termsAcceptedAt);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/passenger/profile/${traveler.id}`, { ...form, acceptTerms }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/passenger/dashboard"] });
      toast({ title: t("lc_profile_saved") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  return (
    <div>
      <h4 className="font-semibold text-sm mb-2">{t("lc_my_profile")}</h4>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><Label>{t("lc_phone")}</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} data-testid="input-profile-phone" /></div>
        <div><Label>{t("lc_dob")}</Label><Input type="date" value={form.dob} onChange={(e) => set("dob", e.target.value)} /></div>
        <div><Label>{t("lc_gender")}</Label><Input value={form.gender} onChange={(e) => set("gender", e.target.value)} /></div>
        <div><Label>{t("lc_nationality")}</Label><Input value={form.nationality} onChange={(e) => set("nationality", e.target.value)} /></div>
        <div><Label>{t("lc_passport_number")}</Label><Input value={form.passportNumber} onChange={(e) => set("passportNumber", e.target.value)} /></div>
        <div><Label>{t("lc_passport_expiry")}</Label><Input type="date" value={form.passportExpiry} onChange={(e) => set("passportExpiry", e.target.value)} /></div>
        <div><Label>{t("lc_emergency_contact_name")}</Label><Input value={form.emergencyContactName} onChange={(e) => set("emergencyContactName", e.target.value)} /></div>
        <div><Label>{t("lc_emergency_contact_phone")}</Label><Input value={form.emergencyContactPhone} onChange={(e) => set("emergencyContactPhone", e.target.value)} /></div>
        <div><Label>{t("lc_rooming_preference")}</Label><Input value={form.roomingPreference} onChange={(e) => set("roomingPreference", e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div><Label>{t("lc_dietary_notes")}</Label><Textarea rows={2} value={form.dietaryNotes} onChange={(e) => set("dietaryNotes", e.target.value)} /></div>
        <div><Label>{t("lc_mobility_notes")}</Label><Textarea rows={2} value={form.mobilityNotes} onChange={(e) => set("mobilityNotes", e.target.value)} /></div>
      </div>
      <div className="flex items-center gap-2 mt-3">
        <Checkbox id={`terms-${traveler.id}`} checked={acceptTerms} onCheckedChange={(v) => setAcceptTerms(!!v)} data-testid="checkbox-accept-terms" />
        <Label htmlFor={`terms-${traveler.id}`} className="cursor-pointer">{t("lc_accept_terms")}</Label>
      </div>
      <Button className="mt-3" onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-profile">
        {save.isPending ? t("saving") : t("lc_save_profile")}
      </Button>
    </div>
  );
}
