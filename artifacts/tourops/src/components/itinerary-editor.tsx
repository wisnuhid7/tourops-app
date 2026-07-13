import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Plus, Search, MapPin, Pencil, Trash2, X, Clock, Utensils, Plane, Hotel, Activity, Loader2, UserCheck, Languages } from "lucide-react";
import type { TourDay, TourDayItem } from "@workspace/db";

export interface City {
  id: string;
  name: string;
  countryId: string;
  isActive: boolean | null;
}

export function ItineraryEditor({ tourId, duration }: { tourId: string; duration: number }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const { data: days, isLoading } = useQuery<TourDay[]>({ queryKey: ["/api/tours", tourId, "days"] });
  const { data: citiesList } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });
  const { data: countries } = useQuery<any[]>({ queryKey: ["/api/master/countries"] });

  const [dayNumber, setDayNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [activities, setActivities] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [editDay, setEditDay] = useState<TourDay | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const addCityMutation = useMutation({
    mutationFn: async ({ name, countryCode }: { name: string; countryCode?: string }) => {
      const selectedCountry = countries?.find(c => c.code === countryCode);
      const countryId = selectedCountry?.id || countries?.[0]?.id;
      if (!countryId) {
        throw new Error("No country found in the system.");
      }
      const res = await apiRequest("POST", "/api/master/cities", {
        name,
        countryId,
        isActive: true
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create city");
      }
      return res.json();
    },
    onSuccess: (newCity) => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      toast({
        title: t("city_added_successfully"),
        description: `"${newCity.name}" ${t("added_to_master_list")}`
      });
    },
    onError: (err: Error) => {
      toast({
        title: t("failed_to_add_city"),
        description: err.message,
        variant: "destructive"
      });
    }
  });

  const typedCity = city.trim();
  const cityExists = citiesList?.some(c => c.name.toLowerCase() === typedCity.toLowerCase());
  const showAddCityButton = typedCity && !cityExists && countries && countries.length > 0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setImageUrl(data.url);
      toast({ title: t("image_uploaded_successfully") });
    } catch (error) {
      toast({ title: t("failed_to_upload_image"), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const createDay = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/tours/${tourId}/days`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours", tourId, "days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      setTitle(""); setDescription(""); setCountryCode(""); setCity(""); setActivities(""); setImageUrl("");
      setDayNumber((prev) => prev + 1);
      toast({ title: t("day_added") });
    },
    onError: () => toast({ title: t("failed_to_add_day"), variant: "destructive" }),
  });

  const updateDay = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/tour-days/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours", tourId, "days"] });
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      setEditDay(null);
      toast({ title: t("day_updated") });
    },
  });

  const deleteDay = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tour-days/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours", tourId, "days"] });
      toast({ title: t("day_removed") });
    },
  });

  const sortedDays = days ? [...days].sort((a, b) => a.dayNumber - b.dayNumber) : [];

  if (isLoading) return <Skeleton className="h-40" />;

  return (
    <div className="space-y-4">
      <div className="space-y-3 border rounded-md p-4">
        <p className="font-medium text-sm">{t("add_day")}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("day_number")}</Label>
            <Input type="number" value={dayNumber} onChange={(e) => setDayNumber(parseInt(e.target.value) || 1)} min={1} max={duration} data-testid="input-day-number" />
          </div>
          <div>
            <Label>{t("country_code")}</Label>
            <Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} placeholder="GR" data-testid="input-day-country" />
          </div>
        </div>
        <div>
          <Label>{t("day_title_required")}</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Athens Arrival" data-testid="input-day-title" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t("city")}</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Athens" list="cities-datalist" />
            {showAddCityButton && (
              <Button
                type="button"
                variant="ghost"
                onClick={async () => {
                  try {
                    const newCity = await addCityMutation.mutateAsync({ name: typedCity, countryCode });
                    setCity(newCity.name);
                    const matchedCountry = countries?.find(c => c.id === newCity.countryId);
                    if (matchedCountry) {
                      setCountryCode(matchedCountry.code);
                    }
                  } catch (e) {}
                }}
                disabled={addCityMutation.isPending}
                className="mt-1.5 h-7 px-2 text-[10px] text-primary bg-primary/10 hover:bg-primary/20 flex items-center gap-1 w-full justify-start rounded border border-primary/20 transition-all"
              >
                <Plus className="h-3 w-3" />
                {t("add_open_quote")}{typedCity}{t("close_quote_new_city")}
              </Button>
            )}
          </div>
          <div>
            <Label>{t("day_image_optional")}</Label>
            <div className="flex gap-2 items-center">
              <Input type="file" accept="image/*" onChange={handleFileUpload} disabled={isUploading} className="cursor-pointer" />
              {isUploading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
            </div>
            {imageUrl && (
              <div className="flex items-center gap-2 mt-2">
                <Badge variant="outline" className="text-xs max-w-[200px] truncate">{imageUrl}</Badge>
                <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setImageUrl("")}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
        <div>
          <Label>{t("description")}</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("day_description_placeholder")} />
        </div>
        <div>
          <Label>{t("activities")}</Label>
          <Textarea value={activities} onChange={(e) => setActivities(e.target.value)} placeholder={t("activities_placeholder")} />
        </div>
        <Button
          onClick={() => createDay.mutate({ dayNumber, title, description, countryCode: countryCode || undefined, city: city || undefined, activities: activities || undefined, imageUrl: imageUrl || undefined })}
          disabled={!title || createDay.isPending}
          data-testid="button-add-day"
        >
          {createDay.isPending ? t("adding") : t("add_day")}
        </Button>
      </div>

      {sortedDays.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">{t("no_itinerary_days")}</p>
      ) : (
        <div className="space-y-2">
          {sortedDays.map((day) => (
            <Card key={day.id} data-testid={`card-day-${day.id}`}>
              <CardContent className="p-4">
                {editDay?.id === day.id ? (
                  <EditDayForm day={editDay} onSave={(data) => updateDay.mutate({ id: day.id, ...data })} onCancel={() => setEditDay(null)} isPending={updateDay.isPending} />
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline">{t("day_label")} {day.dayNumber}</Badge>
                          <span className="font-medium text-sm">{day.title}</span>
                          {day.countryCode && <Badge variant="secondary" className="text-xs">{day.countryCode}</Badge>}
                          {day.city && <span className="text-xs text-muted-foreground">{day.city}</span>}
                        </div>
                        {day.description && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{day.description}</p>}
                        {day.imageUrl && (
                          <div className="mt-3 w-32 h-20 rounded overflow-hidden border">
                            <img src={day.imageUrl} alt={day.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditDay(day)} data-testid={`button-edit-day-${day.id}`}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => deleteDay.mutate(day.id)} data-testid={`button-delete-day-${day.id}`}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>

                    <div className="border-t pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">{t("schedule_items")}</p>
                      <DayItemsEditor dayId={day.id} />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      <datalist id="cities-datalist">
        {citiesList?.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </div>
  );
}

function DayItemsEditor({ dayId }: { dayId: string }) {
  const { t } = useLanguage();
  const { data: items, isLoading } = useQuery<TourDayItem[]>({ queryKey: [`/api/tour-days/${dayId}/items`] });

  const [searchQuery, setSearchQuery] = useState("");
  const { data: sights } = useQuery<any[]>({ queryKey: ["/api/master/sights"] });
  const { data: hotels } = useQuery<any[]>({ queryKey: ["/api/hotels"] });
  const { data: guides } = useQuery<any[]>({ queryKey: ["/api/rates/guide"] });

  const [showAdd, setShowAdd] = useState(false);
  const [type, setType] = useState("custom");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cost, setCost] = useState("0");
  const [time, setTime] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const filteredResults = useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const q = searchQuery.toLowerCase();
    const sResults = (sights || []).filter(s => s.name.toLowerCase().includes(q)).map(s => ({ ...s, type: 'sight' }));
    const hResults = (hotels || []).filter(h => h.name.toLowerCase().includes(q)).map(h => ({ ...h, type: 'hotel' }));
    const gResults = (guides || []).filter(g => g.guideName.toLowerCase().includes(q)).map(g => ({ ...g, name: g.guideName, type: 'guide' }));
    return [...sResults, ...hResults, ...gResults].slice(0, 10);
  }, [searchQuery, sights, hotels, guides]);

  const handleSelectResult = (res: any) => {
    setTitle(res.name);
    setDesc(res.description || "");
    setCost(res.individualTicketCost?.toString() || res.basePrice?.toString() || res.price?.toString() || "0");
    setType(res.type);
    setSelectedId(res.id);
    setSearchQuery("");
  };

  const createItem = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/tour-days/${dayId}/items`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tour-days/${dayId}/items`] });
      setShowAdd(false); setTitle(""); setDesc(""); setCost("0"); setTime(""); setSelectedId(null);
    },
  });

  const deleteItem = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/tour-day-items/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [`/api/tour-days/${dayId}/items`] }),
  });

  const getItemIcon = (type: string) => {
    switch (type) {
      case 'meal': return <Utensils className="h-3 w-3" />;
      case 'flight': return <Plane className="h-3 w-3" />;
      case 'hotel': return <Hotel className="h-3 w-3" />;
      case 'guide': return <UserCheck className="h-3 w-3" />;
      case 'sight': return <MapPin className="h-3 w-3" />;
      case 'transport': return <Activity className="h-3 w-3" />;
      case 'arrival': return <Plane className="h-3 w-3 rotate-45" />;
      case 'departure': return <Plane className="h-3 w-3 -rotate-45" />;
      default: return <Clock className="h-3 w-3" />;
    }
  };

  if (isLoading) return <Skeleton className="h-20 w-full" />;

  return (
    <div className="space-y-2">
      {items?.map((item) => (
        <div key={item.id} className="flex items-center justify-between gap-3 p-2 bg-white rounded border border-dashed text-xs">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-muted rounded-full">{getItemIcon(item.itemType)}</div>
            <div>
              <div className="flex items-center gap-2">
                {item.startTime && <span className="font-mono text-muted-foreground">{item.startTime}</span>}
                <span className="font-medium">{item.title}</span>
              </div>
              {item.description && <p className="text-muted-foreground truncate max-w-[200px]">{item.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            {parseFloat(item.cost.toString()) > 0 && (
              <Badge variant="outline" className="font-mono font-normal">
                ${item.cost}
              </Badge>
            )}
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => deleteItem.mutate(item.id)}>
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ))}

      {showAdd ? (
        <div className="p-3 bg-muted/50 rounded-md space-y-3 mt-2 border border-primary/20">
          <div className="relative">
            <Label className="text-[10px]">{t("search_master_data")}</Label>
            <div className="flex gap-1">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("search_database_placeholder")}
                className="h-7 text-xs"
              />
              <Search className="h-4 w-4 mt-1.5 text-muted-foreground" />
            </div>
            {filteredResults.length > 0 && (
              <div className="absolute z-10 w-full bg-white border rounded shadow-lg mt-1 max-h-40 overflow-auto">
                {filteredResults.map((res: any) => (
                  <div
                    key={res.id}
                    className="p-2 text-[10px] hover:bg-muted cursor-pointer flex justify-between items-center"
                    onClick={() => handleSelectResult(res)}
                  >
                    <span>{res.name} ({res.type})</span>
                    <Badge variant="outline" className="text-[8px] h-4">{t("select_label")}</Badge>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[10px]">{t("type_label")}</Label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full text-xs p-1 rounded border bg-white"
              >
                <option value="sight">{t("sight")}</option>
                <option value="meal">{t("meal")}</option>
                <option value="hotel">{t("hotel")}</option>
                <option value="guide">{t("guide")}</option>
                <option value="transport">{t("transport")}</option>
                <option value="flight">{t("flight")}</option>
                <option value="custom">{t("custom")}</option>
              </select>
            </div>
            <div>
              <Label className="text-[10px]">{t("time")}</Label>
              <Input value={time} onChange={(e) => setTime(e.target.value)} placeholder="09:00" className="h-7 text-xs" />
            </div>
          </div>
          {type === 'hotel' && (
            <div>
              <Label className="text-[10px]">{t("select_hotel")}</Label>
              <Select
                value={selectedId || ""}
                onValueChange={(v) => {
                  const hotel = hotels?.find(h => h.id === v);
                  if (hotel) handleSelectResult({ ...hotel, type: 'hotel' });
                }}
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t("choose_hotel_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {(hotels && hotels.length > 0) ? hotels.map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  )) : <SelectItem value="__none__" disabled>{t("no_hotels_found")}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          {type === 'guide' && (
            <div>
              <Label className="text-[10px]">{t("select_guide")}</Label>
              <Select
                value={selectedId || ""}
                onValueChange={(v) => {
                  const guide = guides?.find(g => g.id === v);
                  if (guide) handleSelectResult({ ...guide, name: guide.guideName, type: 'guide' });
                }}
              >
                <SelectTrigger className="h-7 text-xs"><SelectValue placeholder={t("choose_guide_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {(guides && guides.length > 0) ? guides.map((g: any) => (
                    <SelectItem key={g.id} value={g.id}>{g.guideName}</SelectItem>
                  )) : <SelectItem value="__none__" disabled>{t("no_guides_found")}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-[10px]">{t("title_required")}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("item_name_placeholder")} className="h-7 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">{t("description")}</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder={t("short_note_placeholder")} className="h-7 text-xs" />
          </div>
          <div>
            <Label className="text-[10px]">{t("base_cost")}</Label>
            <Input type="number" value={cost} onChange={(e) => setCost(e.target.value)} className="h-7 text-xs" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="h-7 text-[10px]" onClick={() => createItem.mutate({
              itemType: type, title, description: desc, cost: parseFloat(cost) || 0, startTime: time,
              sightId: type === 'sight' ? selectedId : null,
              hotelId: type === 'hotel' ? selectedId : null,
              guideId: type === 'guide' ? selectedId : null
            })}>{t("add")}</Button>
            <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowAdd(false)}>{t("cancel")}</Button>
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          className="w-full h-8 text-[10px] border-dashed"
          onClick={() => setShowAdd(true)}
        >
          <Plus className="h-3 w-3 mr-1" /> {t("add_schedule_item")}
        </Button>
      )}
    </div>
  );
}

function EditDayForm({ day, onSave, onCancel, isPending }: { day: TourDay; onSave: (data: any) => void; onCancel: () => void; isPending: boolean }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [title, setTitle] = useState(day.title);
  const [description, setDescription] = useState(day.description || "");
  const [countryCode, setCountryCode] = useState(day.countryCode || "");
  const [city, setCity] = useState(day.city || "");
  const [activities, setActivities] = useState(day.activities || "");
  const [imageUrl, setImageUrl] = useState(day.imageUrl || "");
  const [dayNumber, setDayNumber] = useState(day.dayNumber);
  const [isUploading, setIsUploading] = useState(false);

  type DayTr = { title?: string; description?: string; activities?: string };
  const initialTr = (day.translations as any) || {};
  const [trLang, setTrLang] = useState<"es" | "id">("es");
  const [esTr, setEsTr] = useState<DayTr>(initialTr.es || {});
  const [idTr, setIdTr] = useState<DayTr>(initialTr.id || {});
  const curTr = trLang === "es" ? esTr : idTr;
  const setCurTr = trLang === "es" ? setEsTr : setIdTr;
  const setTrField = (f: keyof DayTr, v: string) => setCurTr((prev) => ({ ...prev, [f]: v }));

  const { data: citiesList } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });
  const { data: countries } = useQuery<any[]>({ queryKey: ["/api/master/countries"] });

  const addCityMutation = useMutation({
    mutationFn: async ({ name, countryCode }: { name: string; countryCode?: string }) => {
      const selectedCountry = countries?.find(c => c.code === countryCode);
      const countryId = selectedCountry?.id || countries?.[0]?.id;
      if (!countryId) {
        throw new Error("No country found in the system.");
      }
      const res = await apiRequest("POST", "/api/master/cities", {
        name,
        countryId,
        isActive: true
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.message || "Failed to create city");
      }
      return res.json();
    },
    onSuccess: (newCity) => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      toast({
        title: t("city_added_successfully"),
        description: `"${newCity.name}" ${t("added_to_master_list")}`
      });
    },
    onError: (err: Error) => {
      toast({
        title: t("failed_to_add_city"),
        description: err.message,
        variant: "destructive"
      });
    }
  });

  const typedCity = city.trim();
  const cityExists = citiesList?.some(c => c.name.toLowerCase() === typedCity.toLowerCase());
  const showAddCityButton = typedCity && !cityExists && countries && countries.length > 0;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setImageUrl(data.url);
      toast({ title: t("image_uploaded_successfully") });
    } catch (error) {
      toast({ title: t("failed_to_upload_image"), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("day_number")}</Label><Input type="number" value={dayNumber} onChange={(e) => setDayNumber(parseInt(e.target.value) || 1)} /></div>
        <div><Label>{t("country")}</Label><Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} /></div>
      </div>
      <div><Label>{t("title")}</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div>
        <Label>{t("city")}</Label>
        <Input value={city} onChange={(e) => setCity(e.target.value)} list="cities-datalist" />
        {showAddCityButton && (
          <Button
            type="button"
            variant="ghost"
            onClick={async () => {
              try {
                const newCity = await addCityMutation.mutateAsync({ name: typedCity, countryCode });
                setCity(newCity.name);
                const matchedCountry = countries?.find(c => c.id === newCity.countryId);
                if (matchedCountry) {
                  setCountryCode(matchedCountry.code);
                }
              } catch (e) {}
            }}
            disabled={addCityMutation.isPending}
            className="mt-1.5 h-7 px-2 text-[10px] text-primary bg-primary/10 hover:bg-primary/20 flex items-center gap-1 w-full justify-start rounded border border-primary/20 transition-all"
          >
            <Plus className="h-3 w-3" />
            {t("add_open_quote")}{typedCity}{t("close_quote_new_city")}
          </Button>
        )}
      </div>
      <div>
        <Label>{t("day_image_optional")}</Label>
        <div className="flex gap-2 items-center">
          <Input type="file" accept="image/*" onChange={handleFileUpload} disabled={isUploading} className="cursor-pointer" />
          {isUploading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        </div>
        {imageUrl && (
          <div className="flex items-center gap-2 mt-2">
            <Badge variant="outline" className="text-xs max-w-[200px] truncate">{imageUrl}</Badge>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={() => setImageUrl("")}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div><Label>{t("description")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
      <div><Label>{t("activities")}</Label><Textarea value={activities} onChange={(e) => setActivities(e.target.value)} /></div>

      <div className="border rounded-md p-3 space-y-3">
        <div className="flex items-center gap-2">
          <Languages className="h-4 w-4 text-primary" />
          <Label className="m-0">{t("translations_label")}</Label>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant={trLang === "es" ? "default" : "outline"} onClick={() => setTrLang("es")} className="h-7 px-3 text-xs">Español</Button>
          <Button type="button" size="sm" variant={trLang === "id" ? "default" : "outline"} onClick={() => setTrLang("id")} className="h-7 px-3 text-xs">Bahasa Indonesia</Button>
        </div>
        <div><Label className="text-xs">{t("title")}</Label><Input value={curTr.title || ""} onChange={(e) => setTrField("title", e.target.value)} /></div>
        <div><Label className="text-xs">{t("description")}</Label><Textarea value={curTr.description || ""} onChange={(e) => setTrField("description", e.target.value)} /></div>
        <div><Label className="text-xs">{t("activities")}</Label><Textarea value={curTr.activities || ""} onChange={(e) => setTrField("activities", e.target.value)} /></div>
        <p className="text-[11px] text-muted-foreground">{t("translations_hint")}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onSave({ dayNumber, title, description, countryCode: countryCode || undefined, city: city || undefined, activities: activities || undefined, imageUrl: imageUrl || undefined, translations: { es: esTr, id: idTr } })} disabled={!title || isPending}>
          {isPending ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={onCancel}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
