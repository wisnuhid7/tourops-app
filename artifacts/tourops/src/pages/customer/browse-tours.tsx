import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Link, useLocation } from "wouter";
import { Search, MapPin, Calendar, ArrowRight, Filter, Tag, X, Users, Bed, Compass, Sparkles, SlidersHorizontal, Globe } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getFullImageUrl } from "@/lib/utils";
import { useLanguage } from "@/hooks/use-language";
import { useAuth } from "@/hooks/use-auth";
import { useState, useMemo } from "react";
import { PublicHeader } from "@/components/public-header";
import type { Tour } from "@workspace/db";

const DEFAULT_TOUR_CATEGORIES = [
  "Leisure",
  "Adventure",
  "Cultural",
  "Beach",
  "City Break",
  "Wildlife",
  "Religious",
  "Historical",
  "Nature",
];

const DURATION_OPTIONS = [
  { label: "Any Duration", value: "any" },
  { label: "1–5 days", value: "1-5" },
  { label: "6–10 days", value: "6-10" },
  { label: "11–15 days", value: "11-15" },
  { label: "16+ days", value: "16+" },
];

const FALLBACK_TOUR_IMAGE = "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?auto=format&fit=crop&q=80&w=800";

export default function BrowseTours() {
  const { toast } = useToast();
  const { language, t, lt } = useLanguage();
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

  const { data: tours, isLoading } = useQuery<(Tour & { minDate?: string; maxDate?: string })[]>({
    queryKey: ["/api/tours/public"],
  });

  // Extract all distinct categories available from tours plus default list (deduplicated case-insensitively)
  const availableCategories = useMemo(() => {
    const map = new Map<string, string>();
    DEFAULT_TOUR_CATEGORIES.forEach((c) => {
      const key = c.trim().toLowerCase();
      if (!map.has(key)) map.set(key, c.trim());
    });
    (tours || []).forEach((t) => {
      if (t.category && t.category.trim()) {
        const key = t.category.trim().toLowerCase();
        if (!map.has(key)) map.set(key, t.category.trim());
      }
    });
    return Array.from(map.values());
  }, [tours]);

  const filtered = useMemo(() => {
    return (tours || []).filter((tour) => {
      // Search
      const matchesSearch =
        !search ||
        tour.title.toLowerCase().includes(search.toLowerCase()) ||
        tour.countries?.some((c) => {
          let cName = c.trim().toLowerCase();
          if (cName === "il") cName = "israel";
          else if (cName === "us" || cName === "usa") cName = "united states";
          else if (cName === "uk") cName = "united kingdom";
          else if (cName === "ae" || cName === "uae") cName = "united arab emirates";
          return c.toLowerCase().includes(search.toLowerCase()) || cName.includes(search.toLowerCase());
        }) ||
        tour.tags?.some((tag) => tag.toLowerCase().includes(search.toLowerCase()));

      // Category
      const matchesCategory =
        categoryFilter === "any" ||
        tour.category?.toLowerCase() === categoryFilter.toLowerCase() ||
        tour.tags?.some((t) => t.toLowerCase() === categoryFilter.toLowerCase());

      // Duration
      const dur = tour.duration ?? 0;
      const matchesDuration =
        durationFilter === "any" ||
        (durationFilter === "1-5" && dur <= 5) ||
        (durationFilter === "6-10" && dur >= 6 && dur <= 10) ||
        (durationFilter === "11-15" && dur >= 11 && dur <= 15) ||
        (durationFilter === "16+" && dur >= 16);

      // Price (full computed selling price when available)
      const price = Number((tour as any).publicPricing?.perPersonFrom || tour.basePrice || 0);
      const matchesPrice = price <= maxPrice;

      // Date Range
      let matchesDate = true;
      if (startDate && tour.maxDate) {
        matchesDate = tour.maxDate >= startDate;
      }
      if (endDate && tour.minDate) {
        matchesDate = matchesDate && tour.minDate <= endDate;
      }

      return matchesSearch && matchesCategory && matchesDuration && matchesPrice && matchesDate;
    });
  }, [tours, search, categoryFilter, durationFilter, maxPrice, startDate, endDate]);

  const activeAdvancedFilterCount = useMemo(() => {
    let count = 0;
    if (durationFilter !== "any") count++;
    if (maxPrice < 10000) count++;
    if (startDate) count++;
    if (endDate) count++;
    return count;
  }, [durationFilter, maxPrice, startDate, endDate]);

  const hasActiveFilters = categoryFilter !== "any" || activeAdvancedFilterCount > 0 || !!search;

  const clearFilters = () => {
    setSearch("");
    setCategoryFilter("any");
    setDurationFilter("any");
    setMaxPrice(10000);
    setStartDate("");
    setEndDate("");
  };

  const [joinCode, setJoinCode] = useState("");
  const [, setLocation] = useLocation();
  const { isAuthenticated } = useAuth();

  const handleJoinCode = async () => {
    if (joinCode.length !== 6) {
      toast({
        title: t("invalid_code_title"),
        description: t("enter_6digit_code_desc"),
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await apiRequest("GET", `/api/bookings/by-code/${joinCode.toUpperCase()}`);
      const booking = await res.json();
      const targetPath = `/tours/${booking.tourId}?joinCode=${joinCode.toUpperCase()}`;
      if (!isAuthenticated) {
        toast({
          title: t("login_required"),
          description: t("login_to_join_group_desc"),
        });
        setLocation(`/login?redirect=${encodeURIComponent(targetPath)}&joinCode=${joinCode.toUpperCase()}`);
        return;
      }
      setLocation(targetPath);
    } catch (e: any) {
      toast({
        title: t("error_title"),
        description: t("group_not_found_expired"),
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {!isAuthenticated && <PublicHeader />}
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
          <div className="space-y-4">
            <Skeleton className="h-44 w-full rounded-3xl" />
            <div className="flex gap-2 overflow-hidden">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-9 w-24 rounded-full flex-shrink-0" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-96 rounded-2xl" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {!isAuthenticated && <PublicHeader />}

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Modern Hero & Quick-Access Banner */}
        <section className="relative rounded-3xl overflow-hidden border border-border/50 bg-gradient-to-br from-primary/[0.08] via-background to-accent/30 p-6 sm:p-8 lg:p-10 shadow-sm">
          {/* Subtle ambient light glows */}
          <div className="absolute top-0 right-0 -mr-20 -mt-20 w-72 h-72 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/4 -mb-20 w-72 h-72 rounded-full bg-sky-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 backdrop-blur-sm">
                <Compass className="h-3.5 w-3.5 text-primary" />
                <span>{t("discover_adventure")}</span>
                <span className="w-1 h-1 rounded-full bg-primary/40" />
                <span className="font-bold tabular-nums">
                  {tours?.length || 0} {t("tours_available")}
                </span>
              </div>
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight font-serif text-foreground text-wrap:balance"
                data-testid="text-browse-title"
              >
                {t("explore_tours_title")}
              </h1>
              <p className="text-muted-foreground text-sm sm:text-base leading-relaxed text-wrap:pretty">
                Discover unforgettable curated journeys, handcrafted itineraries, and authentic experiences worldwide.
              </p>
            </div>

            {/* Join Code Glass Card */}
            <div className="bg-card/90 backdrop-blur-md border border-border/70 rounded-2xl p-5 shadow-sm max-w-md w-full lg:w-auto">
              <div className="flex items-center gap-2.5 text-foreground mb-3">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
                  <Users className="h-4.5 w-4.5" />
                </div>
                <div>
                  <p className="text-xs font-bold leading-tight">{t("have_join_code")}</p>
                  <p className="text-[11px] text-muted-foreground">Enter your 6-digit invitation code</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder={t("six_digit_code_placeholder")}
                  className="w-full sm:w-36 h-10 text-center font-mono tracking-widest uppercase text-sm font-bold rounded-xl bg-background/80"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleJoinCode()}
                />
                <Button
                  size="default"
                  className="h-10 px-4 text-xs font-bold rounded-xl shadow-sm active:scale-[0.96] transition-transform"
                  onClick={handleJoinCode}
                >
                  {t("join_group")}
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Search, Filter Bar & Quick Category Chips */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            {/* Unified Search Input */}
            <div className="relative flex-1 max-w-lg">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={t("search_placeholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10 pr-9 h-11 rounded-xl bg-card border-border/70 focus-visible:ring-primary/20 text-sm shadow-2xs"
                data-testid="input-search-public-tours"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5 rounded-full hover:bg-muted transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Toggle & Active Counters */}
            <div className="flex items-center gap-2">
              <Button
                variant={showFilters || activeAdvancedFilterCount > 0 ? "default" : "outline"}
                onClick={() => setShowFilters(!showFilters)}
                className="h-11 px-4 rounded-xl font-medium text-xs flex items-center gap-2 active:scale-[0.96] transition-all"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>{t("filter")}</span>
                {activeAdvancedFilterCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 min-w-[20px] px-1.5 flex items-center justify-center text-[10px] font-bold rounded-full bg-background text-foreground"
                  >
                    {activeAdvancedFilterCount}
                  </Badge>
                )}
              </Button>

              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearFilters}
                  className="h-11 px-3 text-xs text-muted-foreground hover:text-foreground rounded-xl active:scale-[0.96] transition-transform"
                >
                  <X className="h-3.5 w-3.5 mr-1" /> {t("clear")}
                </Button>
              )}
            </div>
          </div>

          {/* Quick-Filter Category Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5 scrollbar-none no-scrollbar">
            <button
              type="button"
              onClick={() => setCategoryFilter("any")}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold active:scale-[0.96] transition-all duration-200 ${
                categoryFilter === "any"
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-card hover:bg-muted border border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {t("all_categories")}
            </button>
            {availableCategories.map((cat) => {
              const isActive = categoryFilter.toLowerCase() === cat.toLowerCase();
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(isActive ? "any" : cat)}
                  className={`flex-shrink-0 px-4 py-2 rounded-full text-xs font-semibold active:scale-[0.96] transition-all duration-200 flex items-center gap-1.5 ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-card hover:bg-muted border border-border/60 text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span>{t(cat.toLowerCase().replace(/\s+/g, "_") as any) || cat}</span>
                </button>
              );
            })}
          </div>

          {/* Advanced Filter Drawer */}
          {showFilters && (
            <Card className="rounded-2xl border-border/70 shadow-lg bg-card/95 backdrop-blur-md animate-in fade-in-50 slide-in-from-top-2 duration-200">
              <CardContent className="p-6">
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <Filter className="h-4 w-4 text-primary" />
                    <h3 className="font-semibold text-sm">{t("filter")}</h3>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowFilters(false)}
                    className="h-7 w-7 p-0 rounded-full"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t("category")}
                    </p>
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="h-10 rounded-xl bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        <SelectItem value="any">{t("all_categories")}</SelectItem>
                        {availableCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {t(cat.toLowerCase().replace(/\s+/g, "_") as any) || cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t("duration")}
                    </p>
                    <Select value={durationFilter} onValueChange={setDurationFilter}>
                      <SelectTrigger className="h-10 rounded-xl bg-background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="rounded-xl">
                        {DURATION_OPTIONS.map((opt) => {
                          let label = opt.label;
                          if (opt.value === "any") label = t("any_duration");
                          else label = opt.label.replace("days", t("days"));
                          return (
                            <SelectItem key={opt.value} value={opt.value}>
                              {label}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      {t("travel_dates")}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="text-xs h-10 rounded-xl bg-background"
                      />
                      <Input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="text-xs h-10 rounded-xl bg-background"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {t("max_price")}
                      </p>
                      <span className="text-xs font-bold font-mono text-primary">
                        ${maxPrice.toLocaleString()}
                      </span>
                    </div>
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

                {hasActiveFilters && (
                  <div className="flex justify-end pt-4 mt-4 border-t border-border/50">
                    <Button variant="outline" size="sm" onClick={clearFilters} className="text-xs rounded-xl">
                      {t("clear_all_filters")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Tour Grid */}
        {filtered.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/80 bg-card/50 p-12 sm:p-16 text-center max-w-xl mx-auto space-y-4">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <Compass className="h-8 w-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-bold font-serif text-foreground">{t("no_tours_found")}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{t("try_adjusting")}</p>
            </div>
            {hasActiveFilters && (
              <Button
                variant="outline"
                className="rounded-xl px-5 active:scale-[0.96] transition-transform"
                onClick={clearFilters}
              >
                {t("clear_all_filters")}
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-7">
            {filtered.map((tour) => {
              const tourTitle = lt(tour, "title") || tour.title;
              const tourDesc = lt(tour, "description") || tour.description;
              const price = Number((tour as any).publicPricing?.perPersonFrom || tour.basePrice || 0);
              const accommodationFrom = Number((tour as any).publicPricing?.accommodationFrom || 0);
              const childPrice = Number(tour.childPrice || 0);

              return (
                <Link key={tour.id} href={`/tours/${tour.id}`}>
                  <article
                    className="group relative flex flex-col h-full bg-card rounded-2xl border border-border/70 hover:border-primary/40 shadow-sm hover:shadow-xl hover:-translate-y-1.5 transition-all duration-300 ease-out overflow-hidden cursor-pointer"
                    data-testid={`card-public-tour-${tour.id}`}
                  >
                    {/* Image Container with Concentric Radius and Inner Outline */}
                    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-2xl bg-muted">
                      <img
                        src={tour.imageUrl ? getFullImageUrl(tour.imageUrl) : FALLBACK_TOUR_IMAGE}
                        alt={tourTitle}
                        onError={(e) => {
                          const target = e.currentTarget;
                          if (target.src !== FALLBACK_TOUR_IMAGE) {
                            target.src = FALLBACK_TOUR_IMAGE;
                          }
                        }}
                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                      />

                      {/* 1px low-opacity inner outline for image edge depth */}
                      <div className="absolute inset-0 ring-1 ring-inset ring-black/10 dark:ring-white/10 rounded-t-2xl pointer-events-none" />

                      {/* Subtle gradient vignette at the top and bottom */}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

                      {/* Floating Category Badge */}
                      {tour.category && (
                        <div className="absolute top-3.5 left-3.5 z-10">
                          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold bg-background/90 dark:bg-background/85 backdrop-blur-md text-foreground shadow-sm border border-border/40">
                            <Tag className="h-3 w-3 text-primary" />
                            <span>{t(tour.category.toLowerCase().replace(/\s+/g, "_") as any) || tour.category}</span>
                          </span>
                        </div>
                      )}

                      {/* Floating Duration Pill */}
                      {tour.duration && (
                        <div className="absolute top-3.5 right-3.5 z-10">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-black/60 backdrop-blur-md text-white shadow-sm">
                            <Calendar className="h-3 w-3" />
                            <span>
                              {tour.duration} {t("days")}
                            </span>
                          </span>
                        </div>
                      )}

                      {/* Floating Location Pill on Bottom Left of Image */}
                      {Array.isArray(tour.countries) && tour.countries.length > 0 && (
                        <div className="absolute bottom-3 left-3.5 z-10 flex items-center gap-1.5 text-white text-xs font-medium drop-shadow-md">
                          <MapPin className="h-3.5 w-3.5 text-primary-foreground" />
                          <span className="line-clamp-1">{tour.countries.join(", ")}</span>
                        </div>
                      )}
                    </div>

                    {/* Card Body */}
                    <div className="p-5 flex-1 flex flex-col justify-between gap-4">
                      <div className="space-y-2">
                        {/* Tags list */}
                        {Array.isArray(tour.tags) && tour.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {tour.tags.slice(0, 3).map((tag) => (
                              <Badge
                                key={tag}
                                variant="outline"
                                className="text-[11px] font-medium py-0 px-2 rounded-md bg-muted/40 border-border/50 text-muted-foreground"
                              >
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        {/* Title */}
                        <h2 className="font-serif font-bold text-lg sm:text-xl text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors duration-200 text-wrap:balance">
                          {tourTitle}
                        </h2>

                        {/* Description */}
                        {tourDesc && (
                          <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2 leading-relaxed text-wrap:pretty">
                            {tourDesc}
                          </p>
                        )}
                      </div>

                      {/* Card Footer with Price & Interactive Action */}
                      <div className="border-t border-border/50 pt-3.5 mt-auto flex items-end justify-between gap-3">
                        <div>
                          {price > 0 ? (
                            <div className="space-y-0.5">
                              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                {t("starting_from")}
                              </p>
                              <div className="flex items-baseline gap-1">
                                <span className="text-2xl font-extrabold text-foreground tracking-tight tabular-nums">
                                  ${price.toLocaleString()}
                                </span>
                                <span className="text-xs text-muted-foreground font-normal">
                                  / {t("per_person")}
                                </span>
                              </div>
                              {accommodationFrom > 0 && (
                                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                                  <Bed className="h-3 w-3" />
                                  <span>{t("price_includes_hotels")}</span>
                                </p>
                              )}
                              {childPrice > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  {t("child_price")} ${childPrice.toLocaleString()}
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-sm text-muted-foreground font-medium">
                              {t("contact_for_pricing")}
                            </span>
                          )}
                        </div>

                        {/* Sleek action pill */}
                        <div className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground shadow-sm transition-all duration-200 active:scale-[0.96] flex-shrink-0">
                          <span>{t("view_details")}</span>
                          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform duration-200" />
                        </div>
                      </div>
                    </div>
                  </article>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

