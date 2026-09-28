import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useLocation } from "wouter";
import { 
  Wand2, Plus, Search, Calendar, Eye, EyeOff, ListOrdered, 
  Pencil 
} from "lucide-react";
import type { Tour } from "@workspace/db";
import { ItineraryEditor } from "@/components/itinerary-editor";
import { TourImportDialog } from "@/components/tour-import-dialog";
import { TourExportButton } from "@/components/tour-export-button";
import { FinancialAnalytics, TourHistory, TourMarginBadge } from "@/components/tour-analytics";

export default function TourBuilderDashboard() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [itineraryTour, setItineraryTour] = useState<Tour | null>(null);

  const { data: tours, isLoading } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  const filtered = tours?.filter(t => (t.title || "").toLowerCase().includes(search.toLowerCase())) || [];

  const togglePublish = useMutation({
    mutationFn: (tour: Tour) => apiRequest("PATCH", `/api/tours/${tour.id}`, { isPublished: !tour.isPublished }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tours"] }),
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-56" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2">
            <Wand2 className="h-6 w-6 text-primary" />
            {t("builder_dashboard")}
          </h1>
          <p className="text-muted-foreground text-sm">{t("tour_builder_subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <TourExportButton ids={filtered.map((t) => t.id)} />
          <TourImportDialog />
          <Button onClick={() => setCreating(true)} data-testid="button-create-tour">
            <Plus className="h-4 w-4 mr-2" />{t("create_tour")}
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input 
          placeholder={t("search_tours_placeholder")} 
          value={search} 
          onChange={(e) => setSearch(e.target.value)} 
          className="pl-9" 
          data-testid="input-search-tours" 
        />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No tours yet — create one to begin assembling an itinerary.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(tour => (
            <Card key={tour.id} data-testid={`card-tour-${tour.id}`} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight line-clamp-1">{tour.title}</h3>
                  <div className="flex items-center gap-1 shrink-0">
                    <TourMarginBadge tourId={tour.id} />
                    <Badge variant={tour.isPublished ? "default" : "secondary"}>
                      {tour.isPublished ? t("published") : t("draft")}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {tour.duration} {t("days")}
                  </span>
                  {tour.basePrice ? (
                    <span className="font-medium text-foreground">
                      ${tour.basePrice}
                    </span>
                  ) : null}
                  {tour.countries && tour.countries.length > 0 && (
                    <span className="text-[11px] bg-muted/60 px-1.5 py-0.5 rounded">
                      {tour.countries.join(", ")}
                    </span>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t">
                  <div className="flex items-center gap-1">
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      title={tour.isPublished ? t("published") : t("draft")}
                      onClick={() => togglePublish.mutate(tour)} 
                      data-testid={`button-toggle-publish-${tour.id}`}
                    >
                      {tour.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </Button>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      title={t("itinerary_analytics")}
                      onClick={() => setItineraryTour(tour)} 
                      data-testid={`button-itinerary-${tour.id}`}
                    >
                      <ListOrdered className="h-4 w-4" />
                    </Button>
                    <BasicFieldsButton tour={tour} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("create_tour")}</DialogTitle></DialogHeader>
          <CreateTourForm onClose={() => setCreating(false)} onCreated={(tour) => setItineraryTour(tour)} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!itineraryTour} onOpenChange={(open) => !open && setItineraryTour(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("itinerary_analytics")}: {itineraryTour?.title}</DialogTitle>
          </DialogHeader>
          {itineraryTour && (
            <Tabs defaultValue="schedule">
              <TabsList className="grid w-full grid-cols-3 mb-4">
                <TabsTrigger value="schedule">{t("daily_schedule")}</TabsTrigger>
                <TabsTrigger value="financials">{t("financial_analytics")}</TabsTrigger>
                <TabsTrigger value="history">{t("change_history")}</TabsTrigger>
              </TabsList>
              <TabsContent value="schedule">
                <ItineraryEditor tourId={itineraryTour.id} duration={itineraryTour.duration} tour={itineraryTour} />
              </TabsContent>
              <TabsContent value="financials">
                <FinancialAnalytics tourId={itineraryTour.id} />
              </TabsContent>
              <TabsContent value="history">
                <TourHistory tourId={itineraryTour.id} />
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BasicFieldsButton({ tour }: { tour: Tour }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: masterCountries } = useQuery<any[]>({ queryKey: ["/api/master/countries"] });

  const [title, setTitle] = useState(tour.title);
  const [duration, setDuration] = useState(tour.duration);
  const [basePrice, setBasePrice] = useState(tour.basePrice);
  const [childPrice, setChildPrice] = useState(tour.childPrice || "0");
  const [singleSupplement, setSingleSupplement] = useState(tour.singleSupplement || "0");
  const [category, setCategory] = useState(tour.category || "cultural");
  const [country, setCountry] = useState(tour.countries?.[0] || "");

  const activeCountries = useMemo(() => {
    if (!masterCountries) return [];
    return [...masterCountries]
      .filter((c: any) => c.isActive !== false)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  }, [masterCountries]);

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/tours/${tour.id}`, { 
      title, 
      duration, 
      basePrice,
      childPrice,
      singleSupplement,
      category,
      countries: country ? [country] : tour.countries,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      toast({ title: t("tour_updated") });
      setOpen(false);
    },
    onError: () => toast({ title: t("failed_to_save"), variant: "destructive" }),
  });

  return (
    <>
      <Button 
        size="icon" 
        variant="ghost" 
        title={t("tour_structure_pricing")}
        onClick={() => setOpen(true)} 
        data-testid={`button-edit-tour-${tour.id}`}
      >
        <Wand2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tour_structure_pricing")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>{t("title")}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("days")}</Label>
                <Input type="number" min={1} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 1)} />
              </div>
              <div>
                <Label>{t("category")}</Label>
                <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="cultural, adventure..." />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>{t("base_price_dollar_label")}</Label>
                <Input type="number" min={0} value={basePrice as any} onChange={(e) => setBasePrice(e.target.value as any)} />
              </div>
              <div>
                <Label>{t("child_price")}</Label>
                <Input type="number" min={0} value={childPrice as any} onChange={(e) => setChildPrice(e.target.value as any)} />
              </div>
              <div>
                <Label>{t("single_supplement_dollar")}</Label>
                <Input type="number" min={0} value={singleSupplement as any} onChange={(e) => setSingleSupplement(e.target.value as any)} />
              </div>
            </div>
            <div>
              <Label>{t("country")}</Label>
              <Select 
                value={country || "__none__"} 
                onValueChange={(val) => setCountry(val === "__none__" ? "" : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("select_country_placeholder")} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  <SelectItem value="__none__">-- {t("select_country_placeholder")} --</SelectItem>
                  {activeCountries.map((c: any) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name} ({c.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? t("saving") : t("save")}
              </Button>
              <Button variant="outline" onClick={() => setOpen(false)}>
                {t("cancel")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateTourForm({ onClose, onCreated }: { onClose: () => void; onCreated: (tour: Tour) => void }) {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: masterCountries } = useQuery<any[]>({ queryKey: ["/api/master/countries"] });

  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(3);
  const [basePrice, setBasePrice] = useState("0");
  const [childPrice, setChildPrice] = useState("0");
  const [singleSupplement, setSingleSupplement] = useState("0");
  const [selectedCountry, setSelectedCountry] = useState("");
  const [category, setCategory] = useState("cultural");

  const activeCountries = useMemo(() => {
    if (!masterCountries) return [];
    return [...masterCountries]
      .filter((c: any) => c.isActive !== false)
      .sort((a: any, b: any) => (a.name || "").localeCompare(b.name || ""));
  }, [masterCountries]);

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tours", {
      title, 
      duration, 
      basePrice,
      childPrice,
      singleSupplement,
      category,
      countries: selectedCountry ? [selectedCountry] : [],
      description: "", 
      isPublished: false,
    }).then(res => res.json()),
    onSuccess: (tour: Tour) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      toast({ title: t("tour") + " created" });
      onClose();
      onCreated(tour);
    },
    onError: () => toast({ title: t("failed_to_create_tour"), variant: "destructive" }),
  });

  return (
    <div className="space-y-3">
      <div>
        <Label>{t("title")}</Label>
        <Input 
          value={title} 
          onChange={(e) => setTitle(e.target.value)} 
          placeholder="e.g. 7-Day Classical Greece Discovery" 
          data-testid="input-new-tour-title" 
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("days")}</Label>
          <Input type="number" min={1} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 1)} />
        </div>
        <div>
          <Label>{t("category")}</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="cultural, adventure..." />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>{t("base_price_dollar_label")}</Label>
          <Input type="number" min={0} value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
        </div>
        <div>
          <Label>{t("child_price")}</Label>
          <Input type="number" min={0} value={childPrice} onChange={(e) => setChildPrice(e.target.value)} />
        </div>
        <div>
          <Label>{t("single_supplement_dollar")}</Label>
          <Input type="number" min={0} value={singleSupplement} onChange={(e) => setSingleSupplement(e.target.value)} />
        </div>
      </div>
      <div>
        <Label>{t("country")}</Label>
        <Select 
          value={selectedCountry || "__none__"} 
          onValueChange={(val) => setSelectedCountry(val === "__none__" ? "" : val)}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("select_country_placeholder")} />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            <SelectItem value="__none__">-- {t("select_country_placeholder")} --</SelectItem>
            {activeCountries.map((c: any) => (
              <SelectItem key={c.id} value={c.name}>
                {c.name} ({c.code})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button 
          onClick={() => create.mutate()} 
          disabled={!title || create.isPending} 
          data-testid="button-confirm-create-tour"
        >
          {create.isPending ? t("adding") : t("create_tour")}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </div>
  );
}
