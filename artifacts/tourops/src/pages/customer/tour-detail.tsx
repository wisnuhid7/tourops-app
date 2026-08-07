import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { PublicHeader } from "@/components/public-header";
import { ArrowLeft, Calendar, MapPin, Users, DollarSign, Clock, CheckCircle, Printer, Plane, Flag, Bed, Bus, Utensils, User, CircleDollarSign, Languages, Star, Mail, Phone, Cake, Receipt } from "lucide-react";
import { getFullImageUrl, getGoogleMapsEmbedUrl } from "@/lib/utils";
import { Link } from "wouter";
import { useState, useRef } from "react";
import type { Tour, TourDeparture, TourDay } from "@workspace/db";

function PublicGroupsList({ departureId }: { departureId: string }) {
  const { t } = useLanguage();
  const { data: groups, isLoading } = useQuery<any[]>({
    queryKey: ["/api/departures", departureId, "public-groups"],
  });

  if (isLoading) return <Skeleton className="h-10 w-full mt-2" />;
  if (!groups || groups.length === 0) return null;

  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("join_existing_group")}</p>
      {groups.map((group) => (
        <div key={group.id} className="flex items-center justify-between p-2 bg-primary/5 rounded-md border border-primary/10">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">{group.groupName}</span>
            <Badge variant="outline" className="text-[10px] h-4">{group.partySizeExpected} pax</Badge>
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs" asChild>
            <Link href={`${window.location.pathname}?joinCode=${group.joinCode}`}>{t("join_group")}</Link>
          </Button>
        </div>
      ))}
    </div>
  );
}

function DayHotelGuideInfo({ dayId }: { dayId: string }) {
  const { lt } = useLanguage();
  const { data: items } = useQuery<any[]>({ queryKey: ["/api/tour-days", dayId, "items"] });
  // Guide badges intentionally excluded — guides are presented only in the
  // "Meet Your Guides" section at the bottom of the page.
  const relevant = items?.filter((i) => i.itemType === "hotel") || [];
  if (relevant.length === 0) return null;

  return (
    <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 flex flex-wrap gap-2">
      {relevant.map((item) => (
        <Badge key={item.id} variant="outline" className="gap-1.5 font-normal text-xs">
          <Bed className="h-3 w-3" />
          {lt(item, "title")}
        </Badge>
      ))}
    </div>
  );
}

function TourGuidesSummary({ tourId }: { tourId: string }) {
  const { t, lt } = useLanguage();
  const { data: guides } = useQuery<any[]>({ queryKey: ["/api/tours", tourId, "guides"] });
  if (!guides || guides.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-bold font-serif mb-4">{t("meet_your_guides")}</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {guides.map((g) => (
          <Card
            key={g.id}
            data-testid={`card-tour-guide-${g.id}`}
            className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850 shadow-sm rounded-xl"
          >
            <CardContent className="p-5 flex items-start gap-4">
              {g.photoUrl ? (
                <img
                  src={getFullImageUrl(g.photoUrl)}
                  alt={g.guideName}
                  className="h-16 w-16 rounded-full object-cover border-2 border-white dark:border-slate-700 shadow-sm flex-shrink-0"
                  onError={(e) => {
                    // Fall back to the generic avatar (with icon) if the photo fails to load
                    e.currentTarget.outerHTML =
                      '<div class="h-16 w-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center flex-shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-400"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>';
                  }}
                />
              ) : (
                <div className="h-16 w-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center flex-shrink-0">
                  <User className="h-7 w-7 text-slate-400" />
                </div>
              )}
              <div className="flex-1 min-w-0 space-y-1">
                <p className="font-semibold text-slate-900 dark:text-slate-50 break-words" data-testid={`text-guide-name-${g.id}`}>
                  {g.guideName}
                </p>
                {g.language && (
                  <p className="text-sm text-muted-foreground flex items-start gap-1.5" data-testid={`text-guide-language-${g.id}`}>
                    <Languages className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <span className="min-w-0 break-words">{lt(g, "language")}</span>
                  </p>
                )}
                {g.age != null && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid={`text-guide-age-${g.id}`}>
                    <Cake className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{t("guide_age")}: {g.age}</span>
                  </p>
                )}
                {g.email && (
                  <p className="text-sm text-muted-foreground flex items-start gap-1.5" data-testid={`text-guide-email-${g.id}`}>
                    <Mail className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <a href={`mailto:${g.email}`} className="min-w-0 break-all hover:underline">{g.email}</a>
                  </p>
                )}
                {g.phone && (
                  <p className="text-sm text-muted-foreground flex items-start gap-1.5" data-testid={`text-guide-phone-${g.id}`}>
                    <Phone className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
                    <a href={`tel:${g.phone}`} className="min-w-0 break-all hover:underline">{g.phone}</a>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function TourHotelsSummary({ tourId }: { tourId: string }) {
  const { t, lt } = useLanguage();
  const { data: hotels } = useQuery<any[]>({ queryKey: ["/api/tours", tourId, "hotels"] });
  if (!hotels || hotels.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-bold font-serif mb-4">{t("where_youll_stay")}</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {hotels.map((h) => {
          const embedUrl = getGoogleMapsEmbedUrl(h.googleMapsUrl, h.googleMapsUrl ? h.name : undefined);
          return (
            <Card
              key={h.id}
              data-testid={`card-tour-hotel-${h.id}`}
              className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850 shadow-sm rounded-xl overflow-hidden"
            >
              {h.imageUrl && (
                <div className="h-40 w-full overflow-hidden">
                  <img
                    src={getFullImageUrl(h.imageUrl)}
                    alt={h.name}
                    className="w-full h-full object-cover"
                    onError={(e) => { e.currentTarget.parentElement!.style.display = "none"; }}
                  />
                </div>
              )}
              <CardContent className="p-5 space-y-3">
                {[h.roomRateMatrimonial, h.roomRateDouble, h.roomRateTriple].some((r: any) => r) && (
                  <div data-testid={`room-rates-${h.id}`}>
                    <p className="text-xs text-muted-foreground mb-1">{t("room_rates_from_label")}</p>
                    <div className="flex flex-wrap gap-2">
                      {h.roomRateMatrimonial && <Badge variant="secondary">{t("room_matrimonial")}: {h.currency} {h.roomRateMatrimonial}</Badge>}
                      {h.roomRateDouble && <Badge variant="secondary">{t("room_double")}: {h.currency} {h.roomRateDouble}</Badge>}
                      {h.roomRateTriple && <Badge variant="secondary">{t("room_triple")}: {h.currency} {h.roomRateTriple}</Badge>}
                    </div>
                  </div>
                )}
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-slate-900 dark:text-slate-50 leading-snug" data-testid={`text-hotel-name-${h.id}`}>
                    {h.name}
                  </p>
                  {h.starRating ? (
                    <div className="flex items-center gap-0.5 flex-shrink-0 mt-0.5" data-testid={`stars-hotel-${h.id}`} aria-label={`${h.starRating} stars`}>
                      {Array.from({ length: h.starRating }).map((_, i) => (
                        <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {h.contactPhone && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid={`text-hotel-phone-${h.id}`}>
                      <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                      <a href={`tel:${h.contactPhone}`} className="truncate hover:underline">{h.contactPhone}</a>
                    </p>
                  )}
                  {h.contactEmail && (
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5" data-testid={`text-hotel-email-${h.id}`}>
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      <a href={`mailto:${h.contactEmail}`} className="truncate hover:underline">{h.contactEmail}</a>
                    </p>
                  )}
                </div>
                {h.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line" data-testid={`text-hotel-description-${h.id}`}>
                    {lt(h, "description")}
                  </p>
                )}
                {embedUrl && (
                  <div className="rounded-lg overflow-hidden border border-slate-200/60 dark:border-slate-700/60">
                    <iframe
                      src={embedUrl}
                      title={`${h.name} map`}
                      className="w-full h-44 block"
                      style={{ border: 0 }}
                      loading="lazy"
                      allowFullScreen
                      referrerPolicy="no-referrer-when-downgrade"
                      data-testid={`map-hotel-${h.id}`}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const cleanDayTitle = (title: string, dayNumber: number): string => {
  if (!title) return "";
  const regex = new RegExp(`^(?:tour\\s+)?day\\s*(?:#\\s*)?${dayNumber}\\s*[:\\-\\s]+`, 'i');
  const generalRegex = /^(?:tour\s+)?day\s*(?:#\s*)?\d+\s*[:\-\s]+/i;
  let cleaned = title.replace(regex, "");
  if (cleaned === title) {
    cleaned = title.replace(generalRegex, "");
  }
  return cleaned.trim();
};

export default function TourDetail() {
  const [matchTours, paramsTours] = useRoute("/tours/:id");
  const [matchAdmin, paramsAdmin] = useRoute("/admin/tours/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const tourId = (matchTours ? paramsTours?.id : matchAdmin ? paramsAdmin?.id : undefined);

  const { language, t } = useLanguage();
  const { data: tour, isLoading } = useQuery<Tour>({ queryKey: ["/api/tours", tourId] });
  const { data: departures } = useQuery<TourDeparture[]>({ queryKey: ["/api/tours", tourId, "departures"] });
  const { data: days } = useQuery<TourDay[]>({ queryKey: ["/api/tours", tourId, "days"] });
  const { data: tourHotels } = useQuery<any[]>({ queryKey: ["/api/tours", tourId, "hotels"], enabled: !!tourId });

  const [showBooking, setShowBooking] = useState(false);
  const [bookingType, setBookingType] = useState("join_public_group");
  const [departureId, setDepartureId] = useState("");
  const [groupName, setGroupName] = useState("");
  const [partySize, setPartySize] = useState(1);
  const [roomType, setRoomType] = useState("");
  const [notes, setNotes] = useState("");

  // Live price-preview: re-fetches whenever party size, room type, or
  // selected departure changes so the breakdown in the dialog always matches
  // exactly what the server will charge.
  const pricePreviewParams = new URLSearchParams({ partySize: String(partySize) });
  if (roomType) pricePreviewParams.set("roomType", roomType);
  if (departureId) pricePreviewParams.set("departureId", departureId);
  const { data: pricePreview, isFetching: pricePreviewFetching, isError: pricePreviewError } = useQuery<{
    perPersonPrice: number; partySize: number; perPersonSubtotal: number;
    roomType: string | null; roomsNeeded: number; accommodationCost: number;
    grandTotal: number; currency: string; currencyMismatch: boolean;
  }>({
    queryKey: ["/api/tours", tourId, "price-preview", partySize, roomType, departureId],
    queryFn: () => apiRequest("GET", `/api/tours/${tourId}/price-preview?${pricePreviewParams}`).then(r => r.json()),
    enabled: !!tourId && showBooking,
    staleTime: 30_000,
    retry: 1,
  });

  // Room types offered by at least one hotel on this tour, with the
  // per-night rate range shown to the customer.
  const roomTypeOptions = [
    { value: "matrimonial", labelKey: "room_matrimonial", field: "roomRateMatrimonial" },
    { value: "doble", labelKey: "room_double", field: "roomRateDouble" },
    { value: "triple", labelKey: "room_triple", field: "roomRateTriple" },
  ].map((o) => {
    const rates = (tourHotels || []).map((h: any) => h[o.field]).filter((r: any) => r && Number(r) > 0).map(Number);
    return { ...o, available: rates.length > 0, minRate: rates.length ? Math.min(...rates) : 0, currency: (tourHotels || [])[0]?.currency || "USD" };
  }).filter((o) => o.available);
  const [joinedGroup, setJoinedGroup] = useState<any>(null);

  // Handle Join Code from URL
  const searchParams = new URLSearchParams(window.location.search);
  const urlJoinCode = searchParams.get("joinCode");

  const { data: joinedGroupData, isLoading: joiningLoading } = useQuery({
    queryKey: ["/api/bookings/by-code", urlJoinCode?.toUpperCase()],
    queryFn: () => apiRequest("GET", `/api/bookings/by-code/${urlJoinCode?.toUpperCase()}`).then(res => res.json()),
    enabled: !!urlJoinCode,
  });

  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  // Guard against rapid double-clicks: isPending updates async, so a fast
  // second click can fire before the disabled state re-renders.
  const submittingRef = useRef(false);
  const submitBooking = (data: any) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    bookMutation.mutate(data);
  };

  const bookMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/bookings", data),
    onSettled: () => { submittingRef.current = false; },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      setShowBooking(false);
      setBookingConfirmed(true);
      toast({ title: t("booking_created_success") });
      navigate("/my-bookings");
    },
    onError: () => toast({ title: t("booking_failed"), variant: "destructive" }),
  });

  const joinGroupMutation = useMutation({
    mutationFn: (data: { joinCode: string; partySizeExpected: number }) =>
      apiRequest("POST", "/api/bookings/join", data),
    onSettled: () => { submittingRef.current = false; },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      setBookingConfirmed(true);
      toast({ title: t("booking_created_success") });
      navigate("/my-bookings");
    },
    onError: (err: any) => {
      // Surface the server's specific reason (already joined, group closed, full).
      const raw = String(err?.message || "").replace(/^\d{3}:\s*/, "");
      let title = t("booking_failed");
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.message) title = parsed.message;
      } catch { if (raw && !/^\s*</.test(raw)) title = raw; }
      toast({ title, variant: "destructive" });
    },
  });
  const submitJoin = (data: { joinCode: string; partySizeExpected: number }) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    joinGroupMutation.mutate(data);
  };

  if (isLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  if (!tour) {
    return <div className="p-6"><p className="text-muted-foreground">{t("tour_not_found")}</p></div>;
  }

  const openDepartures = departures?.filter((d) => d.status === "open") || [];
  // "Starting from" = lowest open-departure price when departures exist,
  // otherwise the server-computed full selling price (base + components +
  // markup + service fee + cheapest per-person accommodation).
  const publicPricing = (tour as any).publicPricing as
    | { perPersonBase: number; accommodationFrom: number; perPersonFrom: number; currency: string }
    | null | undefined;
  const fullSellingPrice = Number(publicPricing?.perPersonFrom) > 0
    ? Number(publicPricing!.perPersonFrom)
    : Number(tour.basePrice) || 0;
  // Accommodation is charged per room at booking; advertise the cheapest
  // per-person share so the displayed price is the full price.
  const accommodationFrom = Number(publicPricing?.accommodationFrom) || 0;
  const departurePrices = openDepartures.map((d) => Number(d.pricePerPerson)).filter((n) => Number.isFinite(n) && n > 0);
  const startingFromPrice = departurePrices.length > 0
    ? Math.min(...departurePrices) + accommodationFrom
    : fullSellingPrice;
  // Child price follows the active price structure: when the adult price comes
  // from a departure, scale the tour's child rate proportionally (departures
  // have no child-price column); otherwise show the tour's base child price.
  const basePrice = Number(tour.basePrice) || 0;
  const baseChildPrice = Number(tour.childPrice) || 0;
  const usingDeparturePrice = departurePrices.length > 0;
  // Scale the child price to the displayed adult price so both reflect the
  // same price structure (departure price or full computed selling price).
  const startingChildPrice = baseChildPrice > 0 && basePrice > 0
    ? (startingFromPrice !== basePrice
        ? Math.round(startingFromPrice * (Math.min(baseChildPrice, basePrice) / basePrice))
        : Math.min(baseChildPrice, startingFromPrice))
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <PublicHeader />
      {/* Join Group Dialog (Automatic) */}
      <Dialog open={!!urlJoinCode && !!joinedGroupData && !bookingConfirmed} onOpenChange={(v) => !v && navigate(`/tours/${tourId}`)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              {t("join_group")}: {joinedGroupData?.groupName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
              <p className="text-sm text-muted-foreground">{t("joining_group_for")}</p>
              <p className="font-bold text-lg mt-1">{language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("departure")} {joinedGroupData?.departureId}</p>
            </div>
            
            <div className="space-y-2">
              <Label>{t("party_size_including_you")}</Label>
              <Input 
                type="number" 
                min={1} 
                value={partySize} 
                onChange={(e) => setPartySize(parseInt(e.target.value) || 1)} 
              />
            </div>

            <Button
              className="w-full h-12 text-lg font-bold shadow-lg shadow-primary/20"
              onClick={() => {
                if (!urlJoinCode) {
                  toast({ title: t("invalid_group_link"), variant: "destructive" });
                  return;
                }
                // Join goes through the dedicated join endpoint: the server
                // resolves group/leader/price from the code and enforces
                // membership rules (active group, no self-join, no duplicates).
                submitJoin({ joinCode: urlJoinCode, partySizeExpected: partySize });
              }}
              disabled={joinGroupMutation.isPending}
            >
              {joinGroupMutation.isPending ? t("loading") : t("confirm_and_join")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link href="/tours">
          <Button variant="ghost" size="sm"><ArrowLeft className="h-4 w-4 mr-1" />{t("back_to_tours")}</Button>
        </Link>
        <Link href={`/tours/${tourId}/brochure`}>
          <Button variant="outline" size="sm" data-testid="button-view-brochure">
            <Printer className="h-4 w-4 mr-1" />{t("view_brochure")}
          </Button>
        </Link>
      </div>

      <div className="aspect-video overflow-hidden rounded-md">
        <img src={tour.imageUrl || "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=1200"} alt={language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)} className="w-full h-full object-cover" />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold font-serif" data-testid="text-tour-title">{language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)}</h1>
            <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-muted-foreground">
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />{tour.duration} {t("days")}</span>
              {Array.isArray(tour.countries) && tour.countries.length > 0 && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{tour.countries.join(", ")}</span>}
            </div>
          </div>
          <div className="text-right">
            {startingFromPrice > 0 ? (
              <div className="bg-primary/5 p-4 rounded-lg border border-primary/10">
                <p className="text-xs text-muted-foreground uppercase font-bold tracking-wider mb-1">{t("starting_from")}</p>
                <div className="flex items-baseline justify-end gap-1">
                  <span className="text-3xl font-bold text-primary">${startingFromPrice.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground">/ {t("per_person")}</span>
                </div>
                {(startingChildPrice > 0 || Number(tour.singleSupplement) > 0) && (
                  <div className="mt-2 pt-2 border-t border-primary/10 text-xs text-muted-foreground space-y-1">
                    {startingChildPrice > 0 && <p>{t("child_price")} ${startingChildPrice.toLocaleString()}</p>}
                    {Number(tour.singleSupplement) > 0 && <p>{t("single_supp")} +${Number(tour.singleSupplement).toLocaleString()}</p>}
                  </div>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <p className="text-muted-foreground leading-relaxed">{language === 'en' ? tour.description : ((tour as any).translations?.[language]?.description || tour.description)}</p>

        {tour.galleryUrls && tour.galleryUrls.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tour.galleryUrls.map((url, i) => (
              <div key={i} className="aspect-square rounded-md overflow-hidden border shadow-sm">
                <img src={url} alt={`${language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)} gallery ${i+1}`} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" />
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(() => {
            const highlightsStr = language === 'en' ? tour.highlights : ((tour as any).translations?.[language]?.highlights || tour.highlights);
            return highlightsStr && (
              <Card className="md:col-span-1 border-none shadow-sm bg-slate-50 dark:bg-slate-900">
                <CardContent className="p-5">
                  <h3 className="font-bold mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-primary" /> {t("highlights")}</h3>
                  <ul className="space-y-2">
                    {highlightsStr.split('\n').filter(Boolean).map((h: string, i: number) => (
                      <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                        <div className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                        {h.trim()}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })()}

          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(() => {
              const inclusionsStr = language === 'en' ? tour.inclusions : ((tour as any).translations?.[language]?.inclusions || tour.inclusions);
              return inclusionsStr && (
                <Card className="border-none shadow-sm bg-emerald-50/50 dark:bg-emerald-950/20 border-l-4 border-l-emerald-500">
                  <CardContent className="p-5">
                    <h3 className="font-bold text-emerald-700 dark:text-emerald-400 mb-4 flex items-center gap-2"><CheckCircle className="h-4 w-4" /> {t("inclusions")}</h3>
                    <ul className="space-y-3">
                      {inclusionsStr.split('\n').filter(Boolean).map((inc: string, i: number) => {
                        const lowerText = inc.toLowerCase();
                        let Icon = CheckCircle;
                        if (lowerText.includes('air') || lowerText.includes('flight')) Icon = Plane;
                        else if (lowerText.includes('meet') || lowerText.includes('transfer') || lowerText.includes('porterage')) Icon = Flag;
                        else if (lowerText.includes('hotel') || lowerText.includes('night') || lowerText.includes('accommodation') || lowerText.includes('room')) Icon = Bed;
                        else if (lowerText.includes('touring') || lowerText.includes('coach') || lowerText.includes('bus')) Icon = Bus;
                        else if (lowerText.includes('breakfast') || lowerText.includes('dinner') || lowerText.includes('meal') || lowerText.includes('buffet')) Icon = Utensils;
                        else if (lowerText.includes('guide') || lowerText.includes('escort') || lowerText.includes('services of')) Icon = User;
                        else if (lowerText.includes('fee') || lowerText.includes('entrance') || lowerText.includes('sightseeing')) Icon = CircleDollarSign;
                        else if (lowerText.includes('tip') || lowerText.includes('gratuities')) Icon = CircleDollarSign;
                        
                        return (
                          <li key={i} className="text-sm text-muted-foreground flex items-start gap-3">
                            <Icon className="h-5 w-5 mt-0.5 text-slate-700 dark:text-slate-300 flex-shrink-0" />
                            <span className="leading-relaxed">{inc.trim()}</span>
                          </li>
                        );
                      })}
                    </ul>
                  </CardContent>
                </Card>
              );
            })()}
            {(() => {
              const exclusionsStr = language === 'en' ? tour.exclusions : ((tour as any).translations?.[language]?.exclusions || tour.exclusions);
              return exclusionsStr && (
                <Card className="border-none shadow-sm bg-rose-50/50 dark:bg-rose-950/20 border-l-4 border-l-rose-500">
                  <CardContent className="p-5">
                    <h3 className="font-bold text-rose-700 dark:text-rose-400 mb-3 flex items-center gap-2"><ArrowLeft className="h-4 w-4 rotate-45" /> {t("exclusions")}</h3>
                    <ul className="space-y-2">
                      {exclusionsStr.split('\n').filter(Boolean).map((exc: string, i: number) => (
                        <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                          <div className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                          {exc.trim()}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              );
            })()}
          </div>
        </div>
      </div>

      {days && days.length > 0 && (
        <div>
          <h2 className="text-xl font-bold font-serif mb-4">{t("itinerary")}</h2>
          <div className="space-y-3">
            {[...days].sort((a, b) => a.dayNumber - b.dayNumber).map((day) => (
              <Card key={day.id} data-testid={`card-day-${day.dayNumber}`} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-850 shadow-sm rounded-xl">
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Day number badge on the left */}
                    <div className="w-12 h-12 flex-shrink-0 bg-white dark:bg-slate-800 border border-slate-200/60 dark:border-slate-700/60 rounded-md flex items-center justify-center font-bold text-slate-800 dark:text-slate-200 shadow-sm text-lg">
                      {day.dayNumber}
                    </div>

                    {/* Main content + optional image on the right */}
                    <div className="flex-1 min-w-0 flex flex-col md:flex-row gap-5 justify-between">
                      {/* Text details */}
                      <div className="flex-1 space-y-3 min-w-0">
                        <div>
                          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-50 leading-snug">
                            {cleanDayTitle(language === 'en' ? day.title : ((day as any).translations?.[language]?.title || day.title), day.dayNumber)}
                          </h3>
                          {day.city && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1 font-medium">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {day.city}
                              {day.countryCode ? `, ${
                                (() => {
                                  try {
                                    const localeCode = language === 'id' ? 'id' : language === 'es' ? 'es' : 'en';
                                    return new Intl.DisplayNames([localeCode], {type: 'region'}).of(day.countryCode) || day.countryCode;
                                  } catch {
                                    return day.countryCode;
                                  }
                                })()
                              }` : ""}
                            </p>
                          )}
                        </div>

                        {day.description && (
                          <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {language === 'en' ? day.description : ((day as any).translations?.[language]?.description || day.description)}
                          </p>
                        )}

                        {day.activities && (
                          <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 space-y-1">
                            <p className="text-xs font-bold uppercase tracking-wider text-slate-450 dark:text-slate-400">
                              {t("activities_sights")}
                            </p>
                            <p className="text-sm text-slate-550 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                              {language === 'en' ? day.activities : ((day as any).translations?.[language]?.activities || day.activities)}
                            </p>
                          </div>
                        )}

                        <DayHotelGuideInfo dayId={day.id} />
                      </div>

                      {/* Day image on the right */}
                      {day.imageUrl && (
                        <div className="w-full md:w-52 aspect-[16/10] md:h-32 rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm flex-shrink-0 self-center md:self-start">
                          <img
                            src={getFullImageUrl(day.imageUrl)}
                            alt={language === 'en' ? day.title : ((day as any).translations?.[language]?.title || day.title)}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.parentElement!.style.display = 'none'; }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {tourId && <TourGuidesSummary tourId={tourId} />}

      {tourId && <TourHotelsSummary tourId={tourId} />}

      <div>
        <h2 className="text-xl font-bold font-serif mb-4">{t("available_departures")}</h2>
        {openDepartures.length === 0 ? (
          <Card><CardContent className="flex flex-col items-center py-12"><Calendar className="h-10 w-10 text-muted-foreground/40 mb-3" /><p className="text-sm text-muted-foreground">{t("no_departures")}</p></CardContent></Card>
        ) : (
          <div className="space-y-2">
            {openDepartures.map((dep) => (
              <Card key={dep.id} data-testid={`card-departure-${dep.id}`}>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4">
                      <div>
                        <p className="font-medium">{dep.startDate} - {dep.endDate}</p>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="flex items-center gap-1"><Users className="h-3 w-3" />{Math.max(0, (dep.capacityTotal || 0) - (dep.capacityBooked || 0))} {t("spots_left")}</span>
                          {dep.pricePerPerson && <span className="flex items-center gap-1"><DollarSign className="h-3 w-3" />{(Number(dep.pricePerPerson) + accommodationFrom).toLocaleString()} / {t("per_person")}</span>}
                        </div>
                      </div>
                    </div>
                    {isAuthenticated ? (
                      <Dialog open={showBooking && departureId === dep.id} onOpenChange={(open) => { setShowBooking(open); if (open) setDepartureId(dep.id); }}>
                        <DialogTrigger asChild>
                          <Button data-testid={`button-book-${dep.id}`}>{t("book_now")}</Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader><DialogTitle>{t("book_this_tour")}</DialogTitle></DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <Label>{t("booking_type")}</Label>
                              <Select value={bookingType} onValueChange={setBookingType}>
                                <SelectTrigger data-testid="select-booking-type"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="join_public_group">{t("join_public_group")}</SelectItem>
                                  <SelectItem value="leader_group">{t("create_leader_group")}</SelectItem>
                                  <SelectItem value="private_family">{t("private_family")}</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            {bookingType === "leader_group" && (
                              <div><Label>{t("group_name")}</Label><Input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder={t("my_travel_group_placeholder")} data-testid="input-group-name" /></div>
                            )}
                            <div><Label>{t("party_size")}</Label><Input type="number" min={1} value={partySize} onChange={(e) => setPartySize(parseInt(e.target.value) || 1)} data-testid="input-party-size" /></div>
                            {roomTypeOptions.length > 0 && (
                              <div>
                                <Label>{t("room_type")}</Label>
                                <Select value={roomType} onValueChange={setRoomType}>
                                  <SelectTrigger data-testid="select-room-type"><SelectValue placeholder={t("select_room_type")} /></SelectTrigger>
                                  <SelectContent>
                                    {roomTypeOptions.map((o) => (
                                      <SelectItem key={o.value} value={o.value} data-testid={`option-room-${o.value}`}>
                                        {t(o.labelKey as any)} — {o.currency} {o.minRate} {t("per_night_label")}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            )}
                            <div><Label>{t("notes_optional")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("special_requests_placeholder")} /></div>

                            {/* ── Price Breakdown ── */}
                            {pricePreviewError ? (
                              <p className="text-sm text-destructive text-center py-2">{t("booking_failed")}</p>
                            ) : pricePreviewFetching && !pricePreview ? (
                              <Skeleton className="h-24 w-full" />
                            ) : pricePreview && (
                              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-2 text-sm">
                                <p className="font-semibold flex items-center gap-1.5 text-primary">
                                  <Receipt className="h-4 w-4" />{t("booking_price_breakdown")}
                                </p>
                                <div className="space-y-1 text-muted-foreground">
                                  <div className="flex justify-between">
                                    <span>{pricePreview.partySize} × {pricePreview.currency} {pricePreview.perPersonPrice.toLocaleString()} / {t("per_person")}</span>
                                    <span className="font-medium text-foreground">{pricePreview.currency} {pricePreview.perPersonSubtotal.toLocaleString()}</span>
                                  </div>
                                  {pricePreview.currencyMismatch ? (
                                    // Accommodation is in a different currency — booking would be rejected.
                                    // Hide grand total (it would be wrong) and block confirmation.
                                    <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5 pt-1 border-t border-primary/20 mt-2">
                                      <Bed className="h-3.5 w-3.5 flex-shrink-0" />
                                      {t("accommodation_cost_label")}: pricing unavailable — please contact us
                                    </p>
                                  ) : (
                                    <>
                                      {pricePreview.accommodationCost > 0 && (
                                        <>
                                          <div className="flex justify-between">
                                            <span className="flex items-center gap-1">
                                              <Bed className="h-3.5 w-3.5" />
                                              {t("accommodation_cost_label")}
                                              {roomType && ` (${t(roomType === "matrimonial" ? "room_matrimonial" : roomType === "doble" ? "room_double" : "room_triple")})`}
                                            </span>
                                            <span className="font-medium text-foreground">{pricePreview.currency} {pricePreview.accommodationCost.toLocaleString()}</span>
                                          </div>
                                          <div className="text-xs">
                                            {t("booking_rooms_needed")}: {pricePreview.roomsNeeded}
                                          </div>
                                        </>
                                      )}
                                      <div className="flex justify-between border-t border-primary/20 pt-2 font-bold text-foreground">
                                        <span>{t("grand_total")}</span>
                                        <span>{pricePreview.currency} {pricePreview.grandTotal.toLocaleString()}</span>
                                      </div>
                                    </>
                                  )}
                                </div>
                              </div>
                            )}

                            <Button
                              className="w-full"
                              onClick={() => submitBooking({
                                tourId: tour.id,
                                departureId: dep.id,
                                bookingType,
                                groupName: bookingType === "leader_group" ? groupName : undefined,
                                partySizeExpected: partySize,
                                roomType: roomType || undefined,
                                notes,
                                // Per-person price excludes accommodation — the server
                                // prices and adds the selected room type itself.
                                totalPrice: Number(dep.pricePerPerson || publicPricing?.perPersonBase || tour.basePrice || 0) * partySize,
                              })}
                              disabled={
                                bookMutation.isPending ||
                                (roomTypeOptions.length > 0 && !roomType) ||
                                !pricePreview ||
                                pricePreviewFetching ||
                                pricePreviewError ||
                                pricePreview.currencyMismatch
                              }
                              data-testid="button-confirm-booking"
                            >
                              {bookMutation.isPending ? t("loading") : pricePreviewFetching ? t("loading") : t("confirm_booking")}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <a href="/#login"><Button data-testid="button-sign-in-to-book">{t("sign_in_to_book")}</Button></a>
                    )}
                  </div>
                  <PublicGroupsList departureId={dep.id} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
