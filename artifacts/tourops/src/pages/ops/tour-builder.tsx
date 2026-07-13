import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Wand2, Plus, Search, MapPin, Calendar, Eye, EyeOff, ListOrdered } from "lucide-react";
import type { Tour } from "@workspace/db";
import { ItineraryEditor } from "@/components/itinerary-editor";

export default function TourBuilderDashboard() {
  const { toast } = useToast();
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
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Wand2 className="h-6 w-6 text-primary" />{t("builder_dashboard")}</h1>
          <p className="text-muted-foreground text-sm">{t("tour_builder_subtitle")}</p>
        </div>
        <Button onClick={() => setCreating(true)} data-testid="button-create-tour">
          <Plus className="h-4 w-4 mr-2" />{t("create_tour")}
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("search_tours_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-tours" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No tours yet — create one to begin assembling an itinerary.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(tour => (
            <Card key={tour.id} data-testid={`card-tour-${tour.id}`}>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{tour.title}</h3>
                  <Badge variant={tour.isPublished ? "default" : "secondary"}>{tour.isPublished ? t("published") : t("draft")}</Badge>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{tour.duration} {t("days")}</span>
                  {tour.basePrice ? <span className="font-medium text-foreground">${tour.basePrice}</span> : null}
                </div>
                <div className="flex items-center gap-1 pt-1">
                  <Button size="icon" variant="ghost" onClick={() => togglePublish.mutate(tour)} data-testid={`button-toggle-publish-${tour.id}`}>
                    {tour.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setItineraryTour(tour)} data-testid={`button-itinerary-${tour.id}`}>
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                  <BasicFieldsButton tour={tour} />
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
          <DialogHeader><DialogTitle>{t("daily_schedule")}: {itineraryTour?.title}</DialogTitle></DialogHeader>
          {itineraryTour && <ItineraryEditor tourId={itineraryTour.id} duration={itineraryTour.duration} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BasicFieldsButton({ tour }: { tour: Tour }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();
  const [title, setTitle] = useState(tour.title);
  const [duration, setDuration] = useState(tour.duration);
  const [basePrice, setBasePrice] = useState(tour.basePrice);

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/tours/${tour.id}`, { title, duration, basePrice }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      toast({ title: t("tour_updated") });
      setOpen(false);
    },
  });

  return (
    <>
      <Button size="icon" variant="ghost" onClick={() => setOpen(true)} data-testid={`button-edit-tour-${tour.id}`}>
        <Wand2 className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("tour_structure_pricing")}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>{t("title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("days")}</Label><Input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 1)} /></div>
              <div><Label>{t("base_price_dollar_label")}</Label><Input type="number" value={basePrice as any} onChange={(e) => setBasePrice(e.target.value as any)} /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? t("saving") : t("save")}</Button>
              <Button variant="outline" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CreateTourForm({ onClose, onCreated }: { onClose: () => void; onCreated: (tour: Tour) => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(3);
  const [basePrice, setBasePrice] = useState("0");
  const [countries, setCountries] = useState("");

  const create = useMutation({
    mutationFn: () => apiRequest("POST", "/api/tours", {
      title, duration, basePrice,
      countries: countries ? countries.split(",").map(c => c.trim()).filter(Boolean) : [],
      description: "", isPublished: false,
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
      <div><Label>{t("title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} data-testid="input-new-tour-title" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("days")}</Label><Input type="number" min={1} value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 1)} /></div>
        <div><Label>{t("base_price_dollar_label")}</Label><Input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></div>
      </div>
      <div><Label>{t("countries_comma_separated")}</Label><Input value={countries} onChange={(e) => setCountries(e.target.value)} placeholder="Greece, Italy" /></div>
      <div className="flex gap-2 pt-2">
        <Button onClick={() => create.mutate()} disabled={!title || create.isPending} data-testid="button-confirm-create-tour">
          {create.isPending ? t("adding") : t("create_tour")}
        </Button>
        <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
