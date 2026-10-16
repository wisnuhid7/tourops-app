import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getFullImageUrl } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useLocation } from "wouter";
import { Plus, Search, MapPin, Calendar, Eye, EyeOff, Pencil, Trash2, ListOrdered, X, FileDown, Clock, Utensils, Plane, Hotel, Activity, ChevronDown, ChevronUp, DollarSign, Sparkles, Loader2, Upload, UserCheck } from "lucide-react";
import type { Tour } from "@workspace/db";
import { ItineraryEditor } from "@/components/itinerary-editor";
import { TourImportDialog } from "@/components/tour-import-dialog";
import { TourExportButton } from "@/components/tour-export-button";
import { FinancialAnalytics, TourHistory, TourMarginBadge } from "@/components/tour-analytics";
import { TourGeneratorInner } from "@/pages/admin/tour-generator";

export default function AdminTours() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [itineraryTour, setItineraryTour] = useState<Tour | null>(null);
  const [editingTour, setEditingTour] = useState<Tour | null>(null);

  const { data: tours, isLoading } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  const { data: accommodationSummary } = useQuery<Record<string, { hotels: string[]; guides: string[] }>>({
    queryKey: ["/api/tours/accommodation-summary"],
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tours/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      toast({ title: t("tour_deleted") });
    },
  });

  const togglePublish = useMutation({
    mutationFn: (tour: Tour) => apiRequest("PATCH", `/api/tours/${tour.id}`, { isPublished: !tour.isPublished }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tours"] }),
  });

  const filteredTours = tours?.filter((t) => (t.title || "").toLowerCase().includes(search.toLowerCase())) || [];

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif">{t("tours")}</h1>
          <p className="text-muted-foreground text-sm">{t("manage_tour_catalog")}</p>
        </div>
        <div className="flex gap-2">
          <TourExportButton ids={filteredTours.map((t) => t.id)} />
          <TourImportDialog />
          <Button data-testid="button-create-tour" onClick={() => setLocation("/admin/tour-generator")}>
            <Plus className="h-4 w-4 mr-2" />{t("create_tour")}
          </Button>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("search_tours_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-tours" />
      </div>

      {filteredTours.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <MapPin className="h-12 w-12 text-muted-foreground/40 mb-4" />
            <h3 className="font-semibold mb-1">{t("no_tours_found")}</h3>
            <p className="text-sm text-muted-foreground">{t("create_first_tour")}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredTours.map((tour) => (
            <Card key={tour.id} className="overflow-visible" data-testid={`card-tour-${tour.id}`}>
              {tour.imageUrl && (
                <div className="aspect-video overflow-hidden rounded-t-md">
                  <img src={getFullImageUrl(tour.imageUrl)} alt={tour.title} className="w-full h-full object-cover" />
                </div>
              )}
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{tour.title}</h3>
                  <Badge variant={tour.isPublished ? "default" : "secondary"}>
                    {tour.isPublished ? t("published") : t("draft")}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{tour.description}</p>
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{tour.duration} {t("days")}</span>
                  {tour.countries && tour.countries.length > 0 && (
                    <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{tour.countries.join(", ")}</span>
                  )}
                  {tour.basePrice ? <span className="font-medium text-foreground">${tour.basePrice}</span> : null}
                  <TourMarginBadge tourId={tour.id} />
                </div>
                {tour.tags && tour.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {tour.tags.map((tag) => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}
                  </div>
                )}
                {(() => {
                  const acc = accommodationSummary?.[tour.id];
                  if (!acc || (acc.hotels.length === 0 && acc.guides.length === 0)) return null;
                  return (
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" data-testid={`accommodation-${tour.id}`}>
                      {acc.hotels.length > 0 && (
                        <span className="flex items-center gap-1"><Hotel className="h-3 w-3" />{acc.hotels.join(", ")}</span>
                      )}
                      {acc.guides.length > 0 && (
                        <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{acc.guides.join(", ")}</span>
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-1 pt-1">
                  <Button size="icon" variant="ghost" onClick={() => togglePublish.mutate(tour)} data-testid={`button-toggle-publish-${tour.id}`}>
                    {tour.isPublished ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setEditingTour(tour)} data-testid={`button-edit-tour-${tour.id}`}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setItineraryTour(tour)} data-testid={`button-itinerary-${tour.id}`}>
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" asChild data-testid={`button-pdf-${tour.id}`}>
                    <a href={`/api/tours/${tour.id}/pdf`} target="_blank" rel="noreferrer">
                      <FileDown className="h-4 w-4 text-primary" />
                    </a>
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(tour.id)} data-testid={`button-delete-tour-${tour.id}`}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!itineraryTour} onOpenChange={(open) => !open && setItineraryTour(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("itinerary_analytics")}: {itineraryTour?.title}</DialogTitle></DialogHeader>
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

      <Dialog open={!!editingTour} onOpenChange={(open) => !open && setEditingTour(null)}>
        <DialogContent className="max-w-7xl max-h-[95vh] overflow-y-auto">
          {editingTour && (
            <TourGeneratorInner
              initialTourId={editingTour.id}
              onCancel={() => setEditingTour(null)}
              onSaved={() => setEditingTour(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
