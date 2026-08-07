import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Link, useLocation } from "wouter";
import { Search, MapPin, Calendar, DollarSign, ArrowRight, Filter, Tag, X, Users, Bed } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useLanguage } from "@/hooks/use-language";
import { useState, useMemo } from "react";
import { PublicHeader } from "@/components/public-header";
import type { Tour } from "@workspace/db";

const TOUR_CATEGORIES = ["Adventure", "Cultural", "Beach", "City Break", "Wildlife", "Religious", "Historical", "Nature"];
const DURATION_OPTIONS = [
  { label: "Any Duration", value: "any" },
  { label: "1–5 days", value: "1-5" },
  { label: "6–10 days", value: "6-10" },
  { label: "11–15 days", value: "11-15" },
  { label: "16+ days", value: "16+" },
];

export default function BrowseTours() {
  const { toast } = useToast();
  const { language, t } = useLanguage();
  const [search, setSearch] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("search") || "";
    }
    return "";
  });
  const [categoryFilter, setCategoryFilter] = useState("any");
  const [durationFilter, setDurationFilter] = useState("any");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [maxPrice, setMaxPrice] = useState(10000);
  const [showFilters, setShowFilters] = useState(false);

  const { data: tours, isLoading } = useQuery<(Tour & { minDate?: string; maxDate?: string })[]>({ queryKey: ["/api/tours/public"] });

  const filtered = useMemo(() => {
    return (tours || []).filter((t) => {
      // Search
      const matchesSearch = !search ||
        t.title.toLowerCase().includes(search.toLowerCase()) ||
        t.countries?.some((c) => {
          let cName = c.trim().toLowerCase();
          if (cName === 'il') cName = 'israel';
          else if (cName === 'us' || cName === 'usa') cName = 'united states';
          else if (cName === 'uk') cName = 'united kingdom';
          else if (cName === 'ae' || cName === 'uae') cName = 'united arab emirates';
          return c.toLowerCase().includes(search.toLowerCase()) || cName.includes(search.toLowerCase());
        }) ||
        t.tags?.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

      // Category
      const matchesCategory = categoryFilter === "any" || t.category === categoryFilter ||
        t.tags?.includes(categoryFilter);

      // Duration
      const dur = t.duration ?? 0;
      const matchesDuration = durationFilter === "any" ||
        (durationFilter === "1-5" && dur <= 5) ||
        (durationFilter === "6-10" && dur >= 6 && dur <= 10) ||
        (durationFilter === "11-15" && dur >= 11 && dur <= 15) ||
        (durationFilter === "16+" && dur >= 16);

      // Price (full computed selling price when available)
      const price = Number((t as any).publicPricing?.perPersonFrom || t.basePrice || 0);
      const matchesPrice = price <= maxPrice;

      // Date Range
      let matchesDate = true;
      if (startDate && t.maxDate) {
        matchesDate = t.maxDate >= startDate;
      }
      if (endDate && t.minDate) {
        matchesDate = matchesDate && t.minDate <= endDate;
      }

      return matchesSearch && matchesCategory && matchesDuration && matchesPrice && matchesDate;
    });
  }, [tours, search, categoryFilter, durationFilter, maxPrice, startDate, endDate]);

  const hasActiveFilters = categoryFilter !== "any" || durationFilter !== "any" || maxPrice < 10000 || startDate || endDate;

  const clearFilters = () => {
    setCategoryFilter("any");
    setDurationFilter("any");
    setMaxPrice(10000);
    setStartDate("");
    setEndDate("");
  };

  const [joinCode, setJoinCode] = useState("");
  const [, setLocation] = useLocation();

  const handleJoinCode = async () => {
    if (joinCode.length !== 6) {
      toast({ title: t("invalid_code_title"), description: t("enter_6digit_code_desc"), variant: "destructive" });
      return;
    }

    try {
      const res = await apiRequest("GET", `/api/bookings/by-code/${joinCode.toUpperCase()}`);
      const booking = await res.json();
      setLocation(`/tours/${booking.tourId}?joinCode=${joinCode.toUpperCase()}`);
    } catch (e: any) {
      toast({ title: t("error_title"), description: t("group_not_found_expired"), variant: "destructive" });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PublicHeader />
      <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif" data-testid="text-browse-title">{t("explore_tours_title")}</h1>
          <p className="text-muted-foreground text-sm">{t("discover_adventure")} — {tours?.length || 0} {t("tours_available")}</p>
        </div>
        
        <Card className="w-full md:w-auto bg-primary/5 border-primary/20 shadow-sm border-dashed">
          <CardContent className="p-3 flex flex-col sm:flex-row gap-3 items-center">
            <div className="flex items-center gap-2 text-primary font-medium">
              <Users className="h-4 w-4" />
              <span className="text-xs">{t("have_join_code")}</span>
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Input
                placeholder={t("six_digit_code_placeholder")}
                className="w-full sm:w-32 h-8 text-center font-mono tracking-widest uppercase text-xs"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleJoinCode()}
              />
              <Button size="sm" className="h-8 text-xs" onClick={handleJoinCode}>{t("join_group")}</Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search + Filter Bar */}
      <div className="space-y-3">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t("search_placeholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              data-testid="input-search-public-tours"
            />
          </div>
          <Button
            variant={showFilters ? "default" : "outline"}
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            {t("filter")}
            {hasActiveFilters && <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-[10px]">!</Badge>}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-1" /> {t("clear")}
            </Button>
          )}
        </div>

        {showFilters && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm font-medium mb-2">{t("category")}</p>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">{t("all_categories")}</SelectItem>
                      {TOUR_CATEGORIES.map((cat) => (
                        <SelectItem key={cat} value={cat}>{t(cat.toLowerCase().replace(/\s+/g, "_") as any) || cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">{t("duration")}</p>
                  <Select value={durationFilter} onValueChange={setDurationFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DURATION_OPTIONS.map((opt) => {
                        let label = opt.label;
                        if (opt.value === "any") label = t("any_duration");
                        else label = opt.label.replace("days", t("days"));
                        return <SelectItem key={opt.value} value={opt.value}>{label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">{t("travel_dates")}</p>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setStartDate(e.target.value)}
                      className="text-xs h-9"
                    />
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEndDate(e.target.value)}
                      className="text-xs h-9"
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium mb-2">{t("max_price")}: ${maxPrice.toLocaleString()}</p>
                  <Slider
                    min={0}
                    max={10000}
                    step={100}
                    value={[maxPrice]}
                    onValueChange={([v]) => setMaxPrice(v)}
                    className="mt-3"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Tour Grid */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center py-16">
            <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">{t("no_tours_found")}</h3>
            <p className="text-sm text-muted-foreground">{t("try_adjusting")}</p>
            {hasActiveFilters && (
              <Button variant="outline" className="mt-4" onClick={clearFilters}>
                {t("clear_all_filters")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((tour) => (
            <Link key={tour.id} href={`/tours/${tour.id}`}>
              <Card className="overflow-hidden hover-elevate cursor-pointer group h-full flex flex-col" data-testid={`card-public-tour-${tour.id}`}>
                <div className="aspect-video overflow-hidden">
                  <img
                    src={tour.imageUrl || "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=800"}
                    alt={language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <CardContent className="p-4 space-y-3 flex-1 flex flex-col">
                  <div className="flex flex-wrap gap-1">
                    {tour.category && (
                      <Badge variant="secondary" className="text-xs">
                        <Tag className="h-2.5 w-2.5 mr-1" />{t(tour.category.toLowerCase().replace(/\s+/g, "_") as any) || tour.category}
                      </Badge>
                    )}
                    {(tour.tags || []).slice(0, 2).map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                  <h3 className="font-semibold text-lg leading-tight">{language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)}</h3>
                  <p className="text-sm text-muted-foreground line-clamp-2 flex-1">{language === 'en' ? tour.description : ((tour as any).translations?.[language]?.description || tour.description)}</p>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{tour.duration} {t("days")}</span>
                    {Array.isArray(tour.countries) && tour.countries.length > 0 && (
                      <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{tour.countries.join(", ")}</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-4 pt-1">
                    {Number((tour as any).publicPricing?.perPersonFrom || tour.basePrice) > 0 ? (
                      <div>
                        <span className="text-lg font-bold flex items-center gap-1">
                          <DollarSign className="h-4 w-4" />{Number((tour as any).publicPricing?.perPersonFrom || tour.basePrice).toLocaleString()}
                          <span className="text-xs font-normal text-muted-foreground">/ {t("per_person")}</span>
                        </span>
                        {Number(tour.childPrice) > 0 && (
                          <p className="text-xs text-muted-foreground">{t("child_price")} ${Number(tour.childPrice).toLocaleString()}</p>
                        )}
                        {Number((tour as any).publicPricing?.accommodationFrom) > 0 && (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 mt-0.5">
                            <Bed className="h-3 w-3" />{t("price_includes_hotels")}
                          </p>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground font-medium">{t("contact_for_pricing")}</span>
                    )}
                    <Button variant="ghost" size="sm">
                      {t("view_details")} <ArrowRight className="ml-1 h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
