import { useState, useMemo, useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format, addDays, parseISO, isBefore, startOfToday } from "date-fns";
import {
  PlaneTakeoff,
  Calendar as CalendarIcon,
  Users,
  Bed,
  Check,
  ChevronRight,
  ChevronLeft,
  MapPin,
  Clock,
  Search,
  CheckCircle2,
  Building,
  ShieldCheck,
  Receipt,
  Sparkles,
} from "lucide-react";
import type { Tour, TourDeparture } from "@workspace/db";

// Curated list of popular departure hubs with IATA codes
const POPULAR_DEPARTURE_HUBS = [
  { city: "Jakarta", airport: "Soekarno-Hatta Int'l", code: "CGK", country: "Indonesia" },
  { city: "Bali / Denpasar", airport: "Ngurah Rai Int'l", code: "DPS", country: "Indonesia" },
  { city: "Surabaya", airport: "Juanda Int'l", code: "SUB", country: "Indonesia" },
  { city: "Medan", airport: "Kualanamu Int'l", code: "KNO", country: "Indonesia" },
  { city: "Yogyakarta", airport: "Yogyakarta Int'l", code: "YIA", country: "Indonesia" },
  { city: "Singapore", airport: "Changi Airport", code: "SIN", country: "Singapore" },
  { city: "Kuala Lumpur", airport: "KLIA", code: "KUL", country: "Malaysia" },
  { city: "Sydney", airport: "Kingsford Smith", code: "SYD", country: "Australia" },
  { city: "Melbourne", airport: "Tullamarine", code: "MEL", country: "Australia" },
  { city: "Tokyo", airport: "Haneda / Narita", code: "HND", country: "Japan" },
  { city: "London", airport: "Heathrow", code: "LHR", country: "United Kingdom" },
  { city: "Amsterdam", airport: "Schiphol", code: "AMS", country: "Netherlands" },
  { city: "New York", airport: "John F. Kennedy", code: "JFK", country: "United States" },
  { city: "Los Angeles", airport: "Los Angeles Int'l", code: "LAX", country: "United States" },
];

export interface BookingDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tour: Tour;
  departures: TourDeparture[];
  tourHotels?: any[];
  initialDepartureId?: string;
  initialDateMode?: "open_departure" | "custom_date";
  onBookingSuccess?: () => void;
}

export function BookingDrawer({
  isOpen,
  onClose,
  tour,
  departures,
  tourHotels = [],
  initialDepartureId,
  initialDateMode,
  onBookingSuccess,
}: BookingDrawerProps) {
  const { t, language } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  // Wizard Step: 1 = Departure & Dates, 2 = Travelers & Room, 3 = Review & Book
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [departureCity, setDepartureCity] = useState("Jakarta (CGK)");
  const [customCitySearch, setCustomCitySearch] = useState("");
  const [showCityDropdown, setShowCityDropdown] = useState(false);
  const [isLandOnly, setIsLandOnly] = useState(false);

  // Dual-mode date state: Open Group Departures vs Custom Private Dates
  const [dateMode, setDateMode] = useState<"open_departure" | "custom_date">(
    initialDateMode || "open_departure"
  );
  const [selectedDepartureId, setSelectedDepartureId] = useState<string>(initialDepartureId || "");
  const [customStartDate, setCustomStartDate] = useState<string>("");
  const [customEndDate, setCustomEndDate] = useState<string>("");

  const [partySize, setPartySize] = useState(1);
  const [roomType, setRoomType] = useState<string>("");
  const [bookingType, setBookingType] = useState("join_public_group");
  const [groupName, setGroupName] = useState("");
  const [notes, setNotes] = useState("");

  // Minimum lead time: 7 days
  const minLeadDate = useMemo(() => addDays(startOfToday(), 7), []);
  const minDateString = useMemo(() => format(minLeadDate, "yyyy-MM-dd"), [minLeadDate]);

  // Automatically calculate custom end date from tour duration (duration in days: start + duration - 1)
  const computedCustomEndDate = useMemo(() => {
    if (!customStartDate) return "";
    try {
      const start = parseISO(customStartDate);
      const duration = tour.duration || 1;
      const end = addDays(start, Math.max(0, duration - 1));
      return format(end, "yyyy-MM-dd");
    } catch {
      return "";
    }
  }, [customStartDate, tour.duration]);

  useEffect(() => {
    if (computedCustomEndDate) {
      setCustomEndDate(computedCustomEndDate);
    }
  }, [computedCustomEndDate]);

  useEffect(() => {
    if (initialDateMode) {
      setDateMode(initialDateMode);
    }
  }, [initialDateMode]);

  // Sync initialDepartureId when opened
  useEffect(() => {
    if (initialDepartureId) {
      setSelectedDepartureId(initialDepartureId);
    } else if (departures && departures.length > 0 && !selectedDepartureId) {
      const firstOpen = departures.find((d) => d.status === "open");
      if (firstOpen) setSelectedDepartureId(firstOpen.id);
    }
  }, [initialDepartureId, departures]);

  // Restore draft if saved from guest flow
  useEffect(() => {
    try {
      const rawDraft = localStorage.getItem("tourops_pending_booking");
      if (rawDraft) {
        const draft = JSON.parse(rawDraft);
        if (draft.tourId === tour.id) {
          if (draft.dateMode) setDateMode(draft.dateMode);
          if (draft.departureId) setSelectedDepartureId(draft.departureId);
          if (draft.customStartDate) setCustomStartDate(draft.customStartDate);
          if (draft.customEndDate) setCustomEndDate(draft.customEndDate);
          if (draft.departureCity) {
            if (draft.departureCity === "Land Only (Self Arrival)") {
              setIsLandOnly(true);
            } else {
              setDepartureCity(draft.departureCity);
            }
          }
          if (draft.partySize) setPartySize(draft.partySize);
          if (draft.roomType) setRoomType(draft.roomType);
          if (draft.bookingType) setBookingType(draft.bookingType);
          if (draft.groupName) setGroupName(draft.groupName);
          if (draft.notes) setNotes(draft.notes);
          if (isAuthenticated) {
            setCurrentStep(3);
            localStorage.removeItem("tourops_pending_booking");
          }
        }
      }
    } catch {
      // ignore JSON errors
    }
  }, [tour.id, isAuthenticated]);

  // Filter open departures
  const openDepartures = useMemo(() => {
    return (departures || [])
      .filter((d) => d.status === "open")
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [departures]);

  const activeDeparture = useMemo(() => {
    return openDepartures.find((d) => d.id === selectedDepartureId);
  }, [openDepartures, selectedDepartureId]);

  // Determine if chosen date is valid
  const isDateSelected = dateMode === "open_departure" ? !!selectedDepartureId : !!customStartDate;

  // Room type options based on hotel rates
  const roomTypeOptions = useMemo(() => {
    return [
      { value: "matrimonial", labelKey: "room_matrimonial", field: "roomRateMatrimonial" },
      { value: "doble", labelKey: "room_double", field: "roomRateDouble" },
      { value: "triple", labelKey: "room_triple", field: "roomRateTriple" },
    ].map((o) => {
      const rates = tourHotels
        .map((h: any) => h[o.field])
        .filter((r: any) => r && Number(r) > 0)
        .map(Number);
      return {
        ...o,
        available: rates.length > 0,
        minRate: rates.length ? Math.min(...rates) : 0,
        currency: tourHotels[0]?.currency || "USD",
      };
    }).filter((o) => o.available);
  }, [tourHotels]);

  // Set default roomType if available and empty
  useEffect(() => {
    if (!roomType && roomTypeOptions.length > 0) {
      setRoomType(roomTypeOptions[0].value);
    }
  }, [roomTypeOptions, roomType]);

  // Live price-preview calculation
  const pricePreviewParams = new URLSearchParams({ partySize: String(partySize) });
  if (roomType) pricePreviewParams.set("roomType", roomType);
  if (dateMode === "open_departure" && selectedDepartureId) {
    pricePreviewParams.set("departureId", selectedDepartureId);
  }

  const { data: pricePreview, isFetching: isCalculatingPrice } = useQuery<{
    perPersonPrice: number;
    partySize: number;
    perPersonSubtotal: number;
    roomType: string | null;
    roomsNeeded: number;
    accommodationCost: number;
    grandTotal: number;
    currency: string;
  }>({
    queryKey: [
      "/api/tours",
      tour.id,
      "price-preview",
      partySize,
      roomType,
      selectedDepartureId,
      customStartDate,
      dateMode,
    ],
    queryFn: () =>
      apiRequest("GET", `/api/tours/${tour.id}/price-preview?${pricePreviewParams}`).then((r) => r.json()),
    enabled: !!tour.id && isOpen && isDateSelected,
    staleTime: 30_000,
  });

  // Booking Mutation
  const bookMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/bookings", data),
    onSuccess: () => {
      localStorage.removeItem("tourops_pending_booking");
      queryClient.invalidateQueries({ queryKey: ["/api/my-bookings"] });
      toast({
        title: t("booking_created_success") || "Booking confirmed successfully!",
        description: `Booking for ${tour.title} from ${departureCity} has been submitted.`,
      });
      onClose();
      if (onBookingSuccess) onBookingSuccess();
      navigate("/my-bookings");
    },
    onError: (err: any) => {
      const raw = String(err?.message || "");
      toast({
        title: t("booking_failed") || "Booking Failed",
        description: raw || "Unable to complete booking. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Handle final submission or login redirect
  const handleConfirmBooking = () => {
    const resolvedDepartureCity = isLandOnly ? "Land Only (Self Arrival)" : departureCity;
    const matchingHub = POPULAR_DEPARTURE_HUBS.find(
      (h) => `${h.city} (${h.code})` === departureCity || h.city === departureCity
    );

    if (!isAuthenticated) {
      // Save draft to localStorage so the user doesn't lose selections
      const draft = {
        tourId: tour.id,
        dateMode,
        departureId: dateMode === "open_departure" ? selectedDepartureId : undefined,
        customStartDate: dateMode === "custom_date" ? customStartDate : undefined,
        customEndDate: dateMode === "custom_date" ? customEndDate : undefined,
        departureCity: resolvedDepartureCity,
        departureAirportId: matchingHub?.code,
        partySize,
        roomType,
        bookingType,
        groupName,
        notes,
      };
      localStorage.setItem("tourops_pending_booking", JSON.stringify(draft));
      toast({
        title: "Please sign in",
        description: "Your booking preferences have been saved. Sign in to complete your reservation.",
      });
      onClose();
      navigate("/#login");
      return;
    }

    if (dateMode === "open_departure" && !selectedDepartureId) {
      toast({
        title: "Pilih tanggal keberangkatan",
        description: "Silakan pilih tanggal keberangkatan yang tersedia.",
        variant: "destructive",
      });
      setCurrentStep(1);
      return;
    }

    if (dateMode === "custom_date" && !customStartDate) {
      toast({
        title: "Pilih tanggal keberangkatan",
        description: "Silakan tentukan tanggal mulai perjalanan kustom Anda.",
        variant: "destructive",
      });
      setCurrentStep(1);
      return;
    }

    const resolvedBookingType = dateMode === "custom_date"
      ? (bookingType === "leader_group" ? "custom_leader" : "private_family")
      : bookingType;

    const payload = {
      tourId: tour.id,
      departureId: dateMode === "open_departure" ? selectedDepartureId : undefined,
      customStartDate: dateMode === "custom_date" ? customStartDate : undefined,
      customEndDate: dateMode === "custom_date" ? customEndDate : undefined,
      departureCity: resolvedDepartureCity,
      departureAirportId: matchingHub?.code,
      bookingType: resolvedBookingType,
      groupName: (bookingType === "leader_group" || bookingType === "custom_leader") ? groupName : undefined,
      partySizeExpected: partySize,
      roomType: roomType || undefined,
      notes: notes
        ? `[Mode: ${dateMode === "custom_date" ? `Custom Private Dates (${customStartDate} to ${customEndDate})` : "Open Group"}] ${notes}`
        : `[Mode: ${dateMode === "custom_date" ? `Custom Private Dates (${customStartDate} to ${customEndDate})` : "Open Group"}]`,
    };

    bookMutation.mutate(payload);
  };

  // Filtered hubs for search
  const filteredHubs = useMemo(() => {
    if (!customCitySearch.trim()) return POPULAR_DEPARTURE_HUBS;
    const q = customCitySearch.toLowerCase();
    return POPULAR_DEPARTURE_HUBS.filter(
      (h) =>
        h.city.toLowerCase().includes(q) ||
        h.code.toLowerCase().includes(q) ||
        h.country.toLowerCase().includes(q)
    );
  }, [customCitySearch]);

  const tourTitle =
    language === "en"
      ? tour.title
      : (tour as any).translations?.[language]?.title || tour.title;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col bg-background text-foreground shadow-2xl border-l"
      >
        {/* Header */}
        <SheetHeader className="p-6 pb-4 border-b bg-card/60 backdrop-blur-sm sticky top-0 z-20">
          <SheetTitle className="text-xl font-bold font-serif leading-tight">
            {tourTitle}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3 text-primary" />
              {tour.duration} {tour.duration === 1 ? "Day" : "Days"}
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-500" />
              Verified Escorted Tour
            </span>
          </SheetDescription>

          {/* Stepper Header */}
          <div className="flex items-center justify-between pt-4 mt-2 border-t text-xs">
            {/* Step 1 */}
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className={`flex items-center gap-2 transition-colors ${
                currentStep === 1
                  ? "text-primary font-bold"
                  : currentStep > 1
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/60"
              }`}
            >
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                  currentStep === 1
                    ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                    : currentStep > 1
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStep > 1 ? <Check className="h-3 w-3" /> : "1"}
              </div>
              <span>Departure & Date</span>
            </button>

            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />

            {/* Step 2 */}
            <button
              type="button"
              onClick={() => isDateSelected && setCurrentStep(2)}
              disabled={!isDateSelected}
              className={`flex items-center gap-2 transition-colors ${
                currentStep === 2
                  ? "text-primary font-bold"
                  : currentStep > 2
                  ? "text-muted-foreground hover:text-foreground"
                  : "text-muted-foreground/60"
              }`}
            >
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                  currentStep === 2
                    ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                    : currentStep > 2
                    ? "bg-emerald-500 text-white"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {currentStep > 2 ? <Check className="h-3 w-3" /> : "2"}
              </div>
              <span>Travelers & Room</span>
            </button>

            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />

            {/* Step 3 */}
            <button
              type="button"
              onClick={() => isDateSelected && setCurrentStep(3)}
              disabled={!isDateSelected}
              className={`flex items-center gap-2 transition-colors ${
                currentStep === 3
                  ? "text-primary font-bold"
                  : "text-muted-foreground/60"
              }`}
            >
              <div
                className={`h-6 w-6 rounded-full flex items-center justify-center text-[11px] font-semibold transition-all ${
                  currentStep === 3
                    ? "bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/20"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                3
              </div>
              <span>Review & Book</span>
            </button>
          </div>
        </SheetHeader>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* ======================================================== */}
          {/* STEP 1: DEPARTURE CITY & DATES                          */}
          {/* ======================================================== */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Departure City Box */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <PlaneTakeoff className="h-4 w-4 text-primary" />
                    Keberangkatan Dari (Departure City)
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setIsLandOnly(!isLandOnly);
                      if (!isLandOnly) setDepartureCity("Land Only / Destination Meet");
                      else setDepartureCity("Jakarta (CGK)");
                    }}
                    className="text-xs text-primary hover:underline font-medium"
                  >
                    {isLandOnly ? "Pilih Kota Asal" : "Land Only (Tanpa Tiket)"}
                  </button>
                </div>

                {!isLandOnly ? (
                  <div className="relative">
                    <div
                      onClick={() => setShowCityDropdown(!showCityDropdown)}
                      className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/40 cursor-pointer transition-colors shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-md bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                          {departureCity.match(/\(([A-Z]{3})\)/)?.[1] || "HUB"}
                        </div>
                        <div>
                          <p className="font-semibold text-sm leading-snug">{departureCity}</p>
                          <p className="text-xs text-muted-foreground">Titik kumpul & penjemputan logistik</p>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>

                    {showCityDropdown && (
                      <Card className="absolute top-full left-0 right-0 mt-2 z-30 shadow-xl border bg-card max-h-72 overflow-hidden flex flex-col animate-in fade-in zoom-in-95">
                        <div className="p-2.5 border-b bg-muted/40">
                          <div className="relative">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                            <Input
                              placeholder="Cari kota atau kode bandara (e.g. CGK, DPS, SUB)..."
                              value={customCitySearch}
                              onChange={(e) => setCustomCitySearch(e.target.value)}
                              className="pl-8 h-8 text-xs bg-background"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="overflow-y-auto p-1.5 space-y-1">
                          {filteredHubs.map((hub) => (
                            <div
                              key={hub.code}
                              onClick={() => {
                                setDepartureCity(`${hub.city} (${hub.code})`);
                                setShowCityDropdown(false);
                                setCustomCitySearch("");
                              }}
                              className={`flex items-center justify-between p-2 rounded-md text-xs cursor-pointer transition-colors ${
                                departureCity.includes(hub.code)
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "hover:bg-muted"
                              }`}
                            >
                              <div className="flex items-center gap-2.5">
                                <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-[11px] font-bold text-foreground">
                                  {hub.code}
                                </span>
                                <div>
                                  <p className="font-medium text-foreground">{hub.city}</p>
                                  <p className="text-[10px] text-muted-foreground">
                                    {hub.airport} • {hub.country}
                                  </p>
                                </div>
                              </div>
                              {departureCity.includes(hub.code) && (
                                <Check className="h-3.5 w-3.5 text-primary" />
                              )}
                            </div>
                          ))}
                          {filteredHubs.length === 0 && (
                            <div className="p-3 text-center text-xs text-muted-foreground">
                              Tidak ada bandara cocok. Anda bisa mengetik kota kustom di bawah:
                              <Button
                                size="sm"
                                variant="outline"
                                className="mt-2 w-full text-xs h-7"
                                onClick={() => {
                                  setDepartureCity(customCitySearch.trim());
                                  setShowCityDropdown(false);
                                }}
                              >
                                Gunakan "{customCitySearch.trim()}"
                              </Button>
                            </div>
                          )}
                        </div>
                      </Card>
                    )}
                  </div>
                ) : (
                  <div className="p-3 rounded-lg border border-dashed border-primary/30 bg-primary/5 flex items-start gap-3">
                    <Building className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-primary">Land Package Only (Self Arrival)</p>
                      <p className="text-[11px] text-muted-foreground">
                        Anda mengatur transportasi kedatangan mandiri ke meeting point destinasi (bandara/lobi hotel lokal).
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Dual-Mode Departure Dates Selector */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-primary" />
                    {t("travel_date_label")}
                  </Label>
                  <Badge variant="outline" className="text-[11px] font-normal gap-1 bg-primary/5 text-primary border-primary/20">
                    <Clock className="h-3 w-3" />
                    {tour.duration} Hari / {Math.max(1, tour.duration - 1)} Malam
                  </Badge>
                </div>

                <Tabs value={dateMode} onValueChange={(v) => setDateMode(v as any)} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 p-1 bg-muted/80 rounded-xl">
                    <TabsTrigger value="open_departure" className="text-xs font-semibold rounded-lg data-[state=active]:shadow-sm">
                      {t("public_group_badge")}
                    </TabsTrigger>
                    <TabsTrigger value="custom_date" className="text-xs font-semibold rounded-lg data-[state=active]:shadow-sm gap-1">
                      <Sparkles className="h-3 w-3 text-amber-500" />
                      {t("choose_custom_date_btn")}
                    </TabsTrigger>
                  </TabsList>

                  {/* Mode 1: Open Group Departures */}
                  <TabsContent value="open_departure" className="mt-3 space-y-2">
                    {openDepartures.length === 0 ? (
                      <Card className="border-dashed bg-muted/20">
                        <CardContent className="p-6 text-center text-xs text-muted-foreground space-y-2">
                          <CalendarIcon className="h-8 w-8 mx-auto text-muted-foreground/30" />
                          <p className="font-medium text-foreground">{t("no_departures")}</p>
                          <p className="text-[11px]">{t("no_active_open_departures")}</p>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setDateMode("custom_date")}
                            className="mt-2 text-primary font-semibold text-xs gap-1.5"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                            {t("set_custom_date_btn")}
                          </Button>
                        </CardContent>
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 gap-2.5">
                        {openDepartures.map((dep) => {
                          const isSelected = selectedDepartureId === dep.id;
                          const spotsLeft = Math.max(0, (dep.capacityTotal || 0) - (dep.capacityBooked || 0));

                          return (
                            <div
                              key={dep.id}
                              onClick={() => setSelectedDepartureId(dep.id)}
                              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all duration-200 relative ${
                                isSelected
                                  ? "bg-primary/5 border-primary ring-2 ring-primary/20 shadow-md"
                                  : "bg-card hover:bg-accent/40 border-border/80 hover:border-primary/40 shadow-sm"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-foreground">
                                      {dep.startDate} — {dep.endDate}
                                    </span>
                                    {isSelected && (
                                      <Badge className="bg-primary text-primary-foreground text-[10px] h-4 px-1.5 gap-1">
                                        <Check className="h-2.5 w-2.5" /> Selected
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <Users className="h-3 w-3 text-primary/70" />
                                      {spotsLeft} seat tersisa
                                    </span>
                                    <span>•</span>
                                    <span className="flex items-center gap-1 font-medium text-foreground">
                                      {dep.pricePerPerson ? (
                                        <>USD {Number(dep.pricePerPerson).toLocaleString()} / pax</>
                                      ) : (
                                        <>Base Price: USD {Number(tour.basePrice).toLocaleString()} / pax</>
                                      )}
                                    </span>
                                  </div>
                                </div>

                                <div
                                  className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                                    isSelected
                                      ? "bg-primary border-primary text-primary-foreground"
                                      : "border-muted-foreground/30"
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </TabsContent>

                  {/* Mode 2: Custom Private Dates */}
                  <TabsContent value="custom_date" className="mt-3 space-y-3">
                    <Card className="border-amber-200/60 bg-gradient-to-br from-amber-50/50 via-background to-background dark:border-amber-950/40 dark:from-amber-950/10 shadow-sm">
                      <CardContent className="p-4 space-y-3.5 text-xs">
                        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold">
                          <Sparkles className="h-4 w-4 flex-shrink-0" />
                          <span>{t("custom_private_date_title")}</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed text-[11px]">
                          {t("custom_private_date_desc")}
                        </p>

                        <div className="space-y-1.5 pt-1">
                          <Label htmlFor="custom-start-date" className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                            <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                            {t("select_custom_start_date")}
                          </Label>
                          <Input
                            id="custom-start-date"
                            type="date"
                            min={minDateString}
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            className="h-10 text-sm bg-background border-border font-medium cursor-pointer"
                          />
                          <p className="text-[11px] text-muted-foreground">
                            {t("custom_date_lead_time_notice")}
                          </p>
                        </div>

                        {customStartDate && customEndDate && (
                          <div className="p-3 rounded-lg bg-primary/5 border border-primary/15 space-y-1 mt-2">
                            <div className="flex justify-between items-center text-xs">
                              <span className="text-muted-foreground font-medium">{t("custom_trip_schedule")}</span>
                              <Badge variant="outline" className="font-semibold text-primary border-primary/30 text-[10px]">
                                {t("private_custom_badge")}
                              </Badge>
                            </div>
                            <p className="font-bold text-sm text-foreground">
                              {customStartDate} s/d {customEndDate}
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium pt-0.5">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              <span>{(t("duration_locked_notice") || "Durasi {duration} hari terkunci otomatis").replace("{duration}", String(tour.duration))}</span>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 2: TRAVELERS & ROOM SELECTION                      */}
          {/* ======================================================== */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Selected Departure Summary Banner */}
              {dateMode === "open_departure" && activeDeparture ? (
                <div className="p-3 bg-primary/5 border border-primary/15 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span className="text-muted-foreground">{t("selected_schedule_group")}</span>
                    <p className="font-semibold text-foreground">
                      {activeDeparture.startDate} — {activeDeparture.endDate}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-primary/30 text-primary">
                    {departureCity}
                  </Badge>
                </div>
              ) : dateMode === "custom_date" && customStartDate ? (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-between text-xs">
                  <div>
                    <span className="text-amber-800 dark:text-amber-400 font-medium flex items-center gap-1">
                      <Sparkles className="h-3 w-3" /> {t("custom_date_private_label")}
                    </span>
                    <p className="font-semibold text-foreground">
                      {customStartDate} — {customEndDate}
                    </p>
                  </div>
                  <Badge variant="outline" className="border-amber-500/30 text-amber-700 dark:text-amber-400">
                    {departureCity}
                  </Badge>
                </div>
              ) : null}

              {/* Number of Travelers */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  Jumlah Peserta (Travelers)
                </Label>
                <div className="flex items-center justify-between p-3 border rounded-lg bg-card">
                  <div>
                    <p className="font-medium text-sm">Dewasa & Anak (Total Pax)</p>
                    <p className="text-xs text-muted-foreground">Total orang yang ikut dalam perjalanan</p>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => setPartySize(Math.max(1, partySize - 1))}
                      disabled={partySize <= 1}
                    >
                      -
                    </Button>
                    <span className="w-8 text-center font-bold text-sm">{partySize}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => {
                        const maxCapacity = activeDeparture
                          ? Math.max(1, (activeDeparture.capacityTotal || 20) - (activeDeparture.capacityBooked || 0))
                          : 20;
                        setPartySize(Math.min(maxCapacity, partySize + 1));
                      }}
                    >
                      +
                    </Button>
                  </div>
                </div>
              </div>

              {/* Room Type Selector */}
              {roomTypeOptions.length > 0 && (
                <div className="space-y-3">
                  <Label className="text-sm font-semibold flex items-center gap-2">
                    <Bed className="h-4 w-4 text-primary" />
                    Pilihan Tipe Kamar Hotel (Room Type)
                  </Label>
                  <div className="grid grid-cols-1 gap-2.5">
                    {roomTypeOptions.map((o) => {
                      const isSelected = roomType === o.value;
                      return (
                        <div
                          key={o.value}
                          onClick={() => setRoomType(o.value)}
                          className={`p-3 rounded-lg border cursor-pointer transition-all flex items-center justify-between ${
                            isSelected
                              ? "bg-primary/5 border-primary ring-1 ring-primary/20"
                              : "bg-card hover:bg-muted/40 border-border"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <p className="text-sm font-semibold">{t(o.labelKey as any)}</p>
                            <p className="text-xs text-muted-foreground">
                              Mulai dari {o.currency} {o.minRate.toLocaleString()} / malam
                            </p>
                          </div>
                          <div
                            className={`h-4 w-4 rounded-full border flex items-center justify-center ${
                              isSelected ? "bg-primary border-primary text-white" : "border-muted-foreground/30"
                            }`}
                          >
                            {isSelected && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Booking Type Selector */}
              <div className="space-y-3">
                <Label className="text-sm font-semibold">Tipe Pemesanan (Booking Type)</Label>
                <Select value={bookingType} onValueChange={setBookingType}>
                  <SelectTrigger className="bg-card">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="join_public_group">Join Public Group (Gabung Grup Terbuka)</SelectItem>
                    <SelectItem value="leader_group">Create Leader Group (Bikin Rombongan Sendiri)</SelectItem>
                    <SelectItem value="private_family">Private Family (Tur Khusus Keluarga)</SelectItem>
                  </SelectContent>
                </Select>
                {bookingType === "leader_group" && (
                  <div className="pt-2 space-y-1.5">
                    <Label className="text-xs">Nama Rombongan / Grup</Label>
                    <Input
                      placeholder="e.g. Keluarga Besar Pratama / Alumni 98"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/* STEP 3: REVIEW & CONFIRM BOOKING                         */}
          {/* ======================================================== */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Comprehensive Summary Card */}
              <Card className="border shadow-sm bg-card/60 backdrop-blur-sm overflow-hidden">
                <div className="bg-primary/10 px-4 py-2.5 border-b flex items-center justify-between">
                  <span className="text-xs font-bold text-primary flex items-center gap-1.5 uppercase tracking-wider">
                    <Receipt className="h-3.5 w-3.5" />
                    Trip Booking Summary
                  </span>
                  <Badge variant="outline" className="text-[10px] bg-background">
                    {tour.duration} Hari / {Math.max(1, tour.duration - 1)} Malam
                  </Badge>
                </div>
                <CardContent className="p-4 space-y-3 text-xs">
                  <div className="flex justify-between items-start pb-2 border-b">
                    <span className="text-muted-foreground">Tur Paket:</span>
                    <span className="font-semibold text-right max-w-[240px] text-foreground">
                      {tourTitle}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <PlaneTakeoff className="h-3 w-3 text-primary" /> Keberangkatan:
                    </span>
                    <span className="font-medium text-foreground">{departureCity}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <CalendarIcon className="h-3 w-3 text-primary" /> {t("travel_date_label")}
                    </span>
                    <span className="font-medium text-foreground">
                      {dateMode === "open_departure" && activeDeparture
                        ? `${activeDeparture.startDate} — ${activeDeparture.endDate}`
                        : dateMode === "custom_date" && customStartDate
                        ? `${customStartDate} — ${computedCustomEndDate || customEndDate} ${t("private_tour_suffix")}`
                        : "TBD"}
                    </span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Users className="h-3 w-3 text-primary" /> Jumlah Peserta:
                    </span>
                    <span className="font-medium text-foreground">{partySize} Orang</span>
                  </div>

                  {roomType && (
                    <div className="flex justify-between items-center pb-2 border-b">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <Bed className="h-3 w-3 text-primary" /> Kamar Hotel:
                      </span>
                      <span className="font-medium capitalize text-foreground">{roomType} Room</span>
                    </div>
                  )}

                  {/* Pricing Breakdown */}
                  <div className="pt-2 space-y-1.5 bg-muted/30 p-3 rounded-lg">
                    {isCalculatingPrice ? (
                      <Skeleton className="h-14 w-full" />
                    ) : pricePreview ? (
                      <>
                        <div className="flex justify-between items-center text-muted-foreground">
                          <span>Biaya Tur ({partySize} pax × {pricePreview.currency} {pricePreview.perPersonPrice.toLocaleString()}):</span>
                          <span>{pricePreview.currency} {pricePreview.perPersonSubtotal.toLocaleString()}</span>
                        </div>
                        {pricePreview.accommodationCost > 0 && (
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span>Akomodasi Kamar ({pricePreview.roomsNeeded} kamar):</span>
                            <span>{pricePreview.currency} {pricePreview.accommodationCost.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="flex justify-between items-center pt-2 border-t font-bold text-sm text-foreground">
                          <span>Total Estimasi:</span>
                          <span className="text-primary text-base">
                            {pricePreview.currency} {pricePreview.grandTotal.toLocaleString()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between items-center pt-1 font-bold text-sm">
                        <span>Estimasi Harga:</span>
                        <span className="text-primary">
                          USD {(Number(tour.basePrice) * partySize).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Special Requests / Notes */}
              <div className="space-y-2">
                <Label className="text-xs font-semibold">
                  Catatan Khusus / Permintaan Penjemputan (Opsional)
                </Label>
                <Textarea
                  placeholder="Contoh: Butuh penjemputan bandara jam 10 pagi, menu vegetarian, dll."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs min-h-[70px] resize-none"
                />
              </div>

              {/* Authentication Status Notice */}
              {!isAuthenticated && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2.5 text-xs text-amber-700 dark:text-amber-400">
                  <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Simpan Draf & Masuk Akun</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Anda belum login. Saat menekan tombol konfirmasi di bawah, preferensi rute dan jadwal Anda akan disimpan dan Anda akan diarahkan untuk login/daftar dengan cepat.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Fixed Footer with Navigation Controls */}
        <div className="p-4 border-t bg-card/90 backdrop-blur-sm sticky bottom-0 z-20 flex items-center justify-between gap-3">
          {currentStep > 1 ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
              className="gap-1.5"
            >
              <ChevronLeft className="h-4 w-4" /> Kembali
            </Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              Batal
            </Button>
          )}

          {currentStep < 3 ? (
            <Button
              type="button"
              size="sm"
              disabled={currentStep === 1 && !isDateSelected}
              onClick={() => setCurrentStep((prev) => (prev + 1) as any)}
              className="gap-1.5 px-6 shadow-md"
            >
              Lanjutkan <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={handleConfirmBooking}
              disabled={bookMutation.isPending}
              className="gap-2 px-6 shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
            >
              {bookMutation.isPending ? (
                "Memproses..."
              ) : isAuthenticated ? (
                <>
                  <Check className="h-4 w-4" /> Konfirmasi Booking
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" /> Masuk & Konfirmasi
                </>
              )}
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
