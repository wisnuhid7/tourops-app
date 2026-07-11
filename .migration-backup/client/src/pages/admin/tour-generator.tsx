import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, ArrowLeft, Wand2, Calendar, MapPin, Info, Sparkles, Languages, ChevronDown, X, BedDouble, UserCheck } from "lucide-react";
import { useLocation } from "wouter";
import type { Tour, TourDay, TourDayItem, Country, City, Sight, Hotel, GuideRate } from "@shared/schema";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { getFullImageUrl } from "@/lib/utils";
import { ErrorBoundary } from "@/components/error-boundary";
import { useLanguage } from "@/hooks/use-language";

type EditableDayItem = Partial<TourDayItem> & { itemType: "hotel" | "guide"; title: string };
type EditableDay = Partial<TourDay> & { items?: EditableDayItem[] };

function TourGeneratorInner() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useLanguage();
  const [selectedTourId, setSelectedTourId] = useState<string>(() => {
    return new URLSearchParams(window.location.search).get("id") || "new-tour";
  });
  
  // Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [highlights, setHighlights] = useState("");
  const [inclusions, setInclusions] = useState("");
  const [exclusions, setExclusions] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [basePrice, setBasePrice] = useState(0);
  const [childPrice, setChildPrice] = useState(0);
  const [singleSupplement, setSingleSupplement] = useState(0);
  const [selectedCountries, setSelectedCountries] = useState<string[]>([]);
  const [tags, setTags] = useState("");
  const [galleryUrls, setGalleryUrls] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  
  const [duration, setDuration] = useState(1);
  const [category, setCategory] = useState("cultural");
  const [days, setDays] = useState<EditableDay[]>([]);
  const [translations, setTranslations] = useState<any>({});
  const [activeLang, setActiveLang] = useState("en");

  // AI Parameters
  const [aiOpen, setAiOpen] = useState(false);
  const [aiParams, setAiParams] = useState({
    destination: "",
    duration: 5,
    travelerType: "family",
    interests: ["culture", "history"],
    budget: "medium",
    pace: "normal"
  });

  const aiInterests = ["culture", "history", "nature", "adventure", "food", "shopping", "beach", "religion"];

  // Queries
  const { data: tours, isLoading: loadingTours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  console.log("RENDER_TOUR_GENERATOR - tours:", tours === undefined ? "undefined" : Array.isArray(tours) ? `Array(${tours.length})` : typeof tours, "isLoading:", loadingTours);
  const { data: countries } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const { data: cities } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });
  const { data: sights } = useQuery<Sight[]>({ queryKey: ["/api/master/sights"] });
  const { data: hotels } = useQuery<Hotel[]>({ queryKey: ["/api/hotels"] });
  const { data: guideRates } = useQuery<GuideRate[]>({ queryKey: ["/api/rates/guide"] });

  const { data: existingDays, isLoading: loadingDays, isFetching: fetchingDays } = useQuery<TourDay[]>({
    queryKey: [`/api/tours/${selectedTourId}/days`],
    enabled: selectedTourId !== "new-tour",
  });

  const { data: existingDayItems, isFetching: fetchingDayItems } = useQuery<TourDayItem[]>({
    queryKey: [`/api/tours/${selectedTourId}/day-items`],
    enabled: selectedTourId !== "new-tour",
  });

  useEffect(() => {
    if (selectedTourId === "new-tour") {
      setTitle("");
      setDescription("");
      setHighlights("");
      setInclusions("");
      setExclusions("");
      setInternalNotes("");
      setBasePrice(0);
      setChildPrice(0);
      setSingleSupplement(0);
      setSelectedCountries([]);
      setTags("");
      setGalleryUrls("");
      setImageUrl("");
      setDuration(1);
      setCategory("cultural");
      setDays([{ dayNumber: 1, title: "Arrival", description: "", activities: "" }]);
    } else {
      const tour = tours?.find(t => String(t.id) === String(selectedTourId));
      if (tour) {
        setTitle(tour.title || "");
        setDescription(tour.description || "");
        setHighlights(tour.highlights || "");
        setInclusions(tour.inclusions || "");
        setExclusions(tour.exclusions || "");
        setInternalNotes(tour.internalNotes || "");
        setBasePrice(Number(tour.basePrice) || 0);
        setChildPrice(Number(tour.childPrice) || 0);
        setSingleSupplement(Number(tour.singleSupplement) || 0);
        setSelectedCountries(Array.isArray(tour.countries) ? tour.countries.filter(Boolean) : []);
        setTags(Array.isArray(tour.tags) ? tour.tags.filter(Boolean).join(", ") : "");
        setGalleryUrls(Array.isArray(tour.galleryUrls) ? tour.galleryUrls.filter(Boolean).join(", ") : "");
        setImageUrl(tour.imageUrl || "");
        setDuration(tour.duration || 1);
        const rawCategory = tour.category;
        const safeCategory = typeof rawCategory === "string" && rawCategory !== "null" && rawCategory !== "NULL" ? rawCategory : "";
        setCategory(safeCategory);
        const rawTranslations = (tour as any).translations;
        setTranslations(rawTranslations && typeof rawTranslations === "object" ? rawTranslations : {});
      }
    }
  }, [selectedTourId, tours]);

  useEffect(() => {
    if (selectedTourId === "new-tour") return;
    if (daysInitializedRef.current) return; // Don't overwrite after user starts editing
    if (fetchingDays || fetchingDayItems) return; // Wait for fresh server data, not stale cache
    if (existingDays) {
      const sorted = [...existingDays].sort((a, b) => a.dayNumber - b.dayNumber);
      setDays(sorted.map(d => ({
        ...d,
        items: (existingDayItems || []).filter(
          it => it.tourDayId === d.id && (it.itemType === "hotel" || it.itemType === "guide")
        ) as EditableDayItem[],
      })));
    } else {
      setDays([]);
    }
    daysInitializedRef.current = true;
  }, [existingDays, existingDayItems, fetchingDays, fetchingDayItems, selectedTourId]);

  // Draft System
  const [hasDraft, setHasDraft] = useState(false);
  const skipDraftRef = useRef(false);
  const initializedRef = useRef(false);
  const daysInitializedRef = useRef(false);

  useEffect(() => {
    // Reset refs on tour change
    skipDraftRef.current = false;
    initializedRef.current = false;
    daysInitializedRef.current = false;
    setHasDraft(false);

    const draftKey = `tour-draft-${selectedTourId}`;
    const draft = localStorage.getItem(draftKey);
    if (draft) {
      setHasDraft(true);
    } else {
      skipDraftRef.current = true;
    }
  }, [selectedTourId]);

  useEffect(() => {
    if (!loadingTours && !loadingDays && skipDraftRef.current && !initializedRef.current) {
       // Just marking that the initial server load is done, so we can start autosaving
       initializedRef.current = true;
    }
  }, [loadingTours, loadingDays]);

  const restoreDraft = () => {
    const draftKey = `tour-draft-${selectedTourId}`;
    const draftStr = localStorage.getItem(draftKey);
    if (draftStr) {
      try {
        const draft = JSON.parse(draftStr);
        setTitle(draft.title || "");
        setDescription(draft.description || "");
        setHighlights(draft.highlights || "");
        setInclusions(draft.inclusions || "");
        setExclusions(draft.exclusions || "");
        setInternalNotes(draft.internalNotes || "");
        setBasePrice(Number(draft.basePrice) || 0);
        setChildPrice(Number(draft.childPrice) || 0);
        setSingleSupplement(Number(draft.singleSupplement) || 0);
        setSelectedCountries(Array.isArray(draft.selectedCountries) ? draft.selectedCountries : []);
        setTags(draft.tags || "");
        setGalleryUrls(draft.galleryUrls || "");
        setImageUrl(draft.imageUrl || "");
        setDuration(draft.duration || 1);
        setCategory(draft.category || "cultural");
        if (draft.days && Array.isArray(draft.days)) {
           setDays(draft.days);
        }
        toast({ title: "Draft restored successfully." });
      } catch (e) {
        toast({ title: "Failed to restore draft", variant: "destructive" });
      }
    }
    setHasDraft(false);
    skipDraftRef.current = true;
    initializedRef.current = true;
  };

  const discardDraft = () => {
    localStorage.removeItem(`tour-draft-${selectedTourId}`);
    setHasDraft(false);
    skipDraftRef.current = true;
    initializedRef.current = true;
    toast({ title: "Draft discarded." });
  };

  useEffect(() => {
    if (hasDraft || !skipDraftRef.current || !initializedRef.current) return;
    
    // Don't autosave empty new tours
    if (selectedTourId === "new-tour" && !title && !description) return;

    const timeoutId = setTimeout(() => {
      const draftKey = `tour-draft-${selectedTourId}`;
      const draftData = {
        title, description, duration, category,
        highlights, inclusions, exclusions, internalNotes,
        basePrice, childPrice, singleSupplement,
        selectedCountries, tags, galleryUrls, imageUrl, days
      };
      localStorage.setItem(draftKey, JSON.stringify(draftData));
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [
    selectedTourId, title, description, duration, category,
    highlights, inclusions, exclusions, internalNotes,
    basePrice, childPrice, singleSupplement,
    selectedCountries, tags, galleryUrls, imageUrl, days,
    hasDraft
  ]);

  // Mutations
  const saveMutation = useMutation({
    mutationFn: async () => {
      const baseTourData = { 
        title, description, duration, category, translations,
        highlights, inclusions, exclusions, internalNotes,
        basePrice: String(basePrice), childPrice: String(childPrice), singleSupplement: String(singleSupplement),
        countries: selectedCountries,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        galleryUrls: galleryUrls.split(",").map((t) => t.trim()).filter(Boolean),
        imageUrl
      };
      
      const payload = {
        tour: baseTourData,
        days: days
      };

      const res = await apiRequest("PUT", `/api/tours/${selectedTourId}/full`, payload);
      const newTour = await res.json();
      return newTour.id;
    },
    onSuccess: (tourId) => {
      localStorage.removeItem(`tour-draft-${selectedTourId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      queryClient.invalidateQueries({ queryKey: [`/api/tours/${selectedTourId}/days`] });
      queryClient.invalidateQueries({ queryKey: [`/api/tours/${selectedTourId}/day-items`] });
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      toast({ title: t("tour_saved_successfully") });
      setLocation("/admin");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const addCityMutation = useMutation({
    mutationFn: async ({ name, countryCode }: { name: string; countryCode?: string }) => {
      const selectedCountry = countries?.find(c => c.code === countryCode);
      const countryId = selectedCountry?.id || countries?.[0]?.id;
      if (!countryId) {
        throw new Error("No country found in the system. Please ensure countries are loaded.");
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

  const handleAddCity = async (name: string, countryCode: string | undefined | null, dayIndex: number) => {
    try {
      const selectedCountry = countries?.find(c => c.code === countryCode);
      const countryId = selectedCountry?.id || countries?.[0]?.id;
      if (!countryId) {
        toast({ title: "Error", description: "No country found in the system.", variant: "destructive" });
        return;
      }
      
      const newCity = await addCityMutation.mutateAsync({ name, countryCode: countryCode || undefined });
      const matchedCountry = countries?.find(c => c.id === newCity.countryId);
      if (matchedCountry) {
        updateDay(dayIndex, "countryCode", matchedCountry.code);
      }
      updateDay(dayIndex, "city", newCity.name);
    } catch (e) {
      // Error handled by mutation
    }
  };

  const aiMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/ai/generate-tour", aiParams);
      return res.json();
    },
    onSuccess: (data) => {
      setTitle(data.title || "");
      setDescription(data.description || "");
      setCategory(typeof data.category === "string" ? data.category : "cultural");
      
      if (data.highlights) setHighlights(data.highlights);
      if (data.inclusions) setInclusions(data.inclusions);
      if (data.exclusions) setExclusions(data.exclusions);
      if (data.internalNotes) setInternalNotes(data.internalNotes);
      if (data.basePrice) setBasePrice(Number(data.basePrice));
      if (data.childPrice) setChildPrice(Number(data.childPrice));
      if (data.singleSupplement) setSingleSupplement(Number(data.singleSupplement));
      if (data.tags && Array.isArray(data.tags)) setTags(data.tags.join(", "));
      if (data.countryCode) {
        const c = countries?.find(c => c.code === data.countryCode);
        if (c) setSelectedCountries((prev) => (prev.includes(c.name) ? prev : [...prev, c.name]));
      }
      if (data.imageUrl) {
        setImageUrl(`https://picsum.photos/seed/${encodeURIComponent(data.title || "tour")}/1200/800`);
      }
      
      const enrichedDays = data.days?.map((d: any, i: number) => {
        let dayImageUrl = d.imageUrl;
        if (dayImageUrl) {
            dayImageUrl = `https://picsum.photos/seed/${encodeURIComponent(d.title || "day"+i)}/800/600`;
        }
        return {
          ...d,
          dayNumber: i + 1,
          imageUrl: dayImageUrl || ""
        };
      }) || [];

      setDuration(enrichedDays.length);
      setDays(enrichedDays);
      setAiOpen(false);
      toast({ title: t("itinerary_generated_ai") });
    },
    onError: (e: Error) => toast({ title: t("ai_generation_failed"), description: e.message, variant: "destructive" }),
  });


  const translateMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        title,
        description,
        days: days.map(d => ({ title: d.title, description: d.description, activities: d.activities }))
      };
      const res = await apiRequest("POST", "/api/ai/translate-content", payload);
      return res.json();
    },
    onSuccess: (data) => {
      setTranslations({
        es: { title: data.es.title, description: data.es.description },
        id: { title: data.id.title, description: data.id.description }
      });
      setDays(prevDays => prevDays.map((d, i) => ({
        ...d,
        translations: {
          es: data.es.days?.[i] || {},
          id: data.id.days?.[i] || {}
        }
      })));
      toast({ title: t("auto_translated_successfully") });
    },
    onError: (e: Error) => toast({ title: t("translation_failed"), description: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (activeLang !== "en" && title && !translateMutation.isPending) {
      if (!translations?.[activeLang]?.title) {
        translateMutation.mutate();
      }
    }
  }, [activeLang]);

  const handleAddDay = () => {
    const nextDay = days.length + 1;
    setDays([...days, { dayNumber: nextDay, title: `Day ${nextDay}`, description: "", activities: "" }]);
    setDuration(nextDay);
  };

  const handleRemoveDay = (index: number) => {
    const newDays = days.filter((_, i) => i !== index).map((d, i) => ({ ...d, dayNumber: i + 1 }));
    setDays(newDays);
    setDuration(newDays.length);
  };

  const updateDay = (index: number, field: keyof TourDay, value: any) => {
    const newDays = [...days];
    newDays[index] = { ...newDays[index], [field]: value };
    setDays(newDays);
  };

  const addDayItem = (index: number, item: EditableDayItem) => {
    const newDays = [...days];
    const currentItems = newDays[index].items || [];
    if (currentItems.some(i => i.itemType === item.itemType && i.title === item.title)) return;
    newDays[index] = { ...newDays[index], items: [...currentItems, item] };
    setDays(newDays);
  };

  const removeDayItem = (index: number, itemToRemove: EditableDayItem) => {
    const newDays = [...days];
    newDays[index] = {
      ...newDays[index],
      items: (newDays[index].items || []).filter(i => i !== itemToRemove),
    };
    setDays(newDays);
  };

  if (loadingTours) return <div className="p-8"><Skeleton className="h-12 w-full" /></div>;

  return (
    <div className="container mx-auto p-6 space-y-8 max-w-5xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setLocation("/admin")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">{t("tour_generator")}</h1>
              <p className="text-muted-foreground">{t("design_itinerary_subtitle")}</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <div className="flex bg-muted p-1 rounded-md">
              {["en", "es", "id"].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveLang(lang)}
                  className={`px-3 py-1.5 text-sm font-medium rounded-sm transition-all ${
                    activeLang === lang 
                      ? "bg-background text-foreground shadow-sm" 
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
          <Button
            variant="outline"
            onClick={() => translateMutation.mutate()}
            disabled={translateMutation.isPending || selectedTourId === "new-tour"}
            className="gap-2"
          >
            <Languages className="h-4 w-4" />
            {translateMutation.isPending ? t("translating") : t("auto_translate")}
          </Button>

          <Dialog open={aiOpen} onOpenChange={setAiOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2 border-primary text-primary hover:bg-primary/10 shadow-sm transition-all duration-300">
                <Wand2 className="h-4 w-4" />
                {t("ai_generate")}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  {t("ai_tour_generator")}
                </DialogTitle>
                <DialogDescription>
                  {t("ai_generator_description")}
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="dest" className="text-right">{t("destination")}</Label>
                  <Input
                    id="dest"
                    className="col-span-3"
                    placeholder="e.g. Bali, Indonesia"
                    value={aiParams.destination}
                    onChange={(e) => setAiParams({...aiParams, destination: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">{t("duration")}</Label>
                  <Input
                    type="number"
                    className="col-span-3"
                    value={aiParams.duration}
                    onChange={(e) => setAiParams({...aiParams, duration: parseInt(e.target.value)})}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label className="text-right">{t("travelers")}</Label>
                  <Select value={aiParams.travelerType} onValueChange={(v) => setAiParams({...aiParams, travelerType: v})}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="solo">{t("solo")}</SelectItem>
                      <SelectItem value="couple">{t("couple")}</SelectItem>
                      <SelectItem value="family">{t("family")}</SelectItem>
                      <SelectItem value="group">{t("large_group")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-start gap-4 pt-2">
                  <Label className="text-right pt-2">{t("interests")}</Label>
                  <div className="col-span-3 grid grid-cols-2 gap-2">
                    {aiInterests.map(interest => (
                      <div key={interest} className="flex items-center space-x-2">
                        <Checkbox
                          id={`interest-${interest}`}
                          checked={aiParams.interests.includes(interest)}
                          onCheckedChange={(checked) => {
                            const newInterests = checked
                              ? [...aiParams.interests, interest]
                              : aiParams.interests.filter(i => i !== interest);
                            setAiParams({...aiParams, interests: newInterests});
                          }}
                        />
                        <label htmlFor={`interest-${interest}`} className="text-xs capitalize cursor-pointer">{interest}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">{t("budget")}</Label>
                    <Select value={aiParams.budget} onValueChange={(v) => setAiParams({...aiParams, budget: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="budget">{t("budget")}</SelectItem>
                        <SelectItem value="medium">{t("standard")}</SelectItem>
                        <SelectItem value="luxury">{t("luxury")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs uppercase text-muted-foreground">{t("pace")}</Label>
                    <Select value={aiParams.pace} onValueChange={(v) => setAiParams({...aiParams, pace: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="relaxed">{t("relaxed")}</SelectItem>
                        <SelectItem value="normal">{t("normal")}</SelectItem>
                        <SelectItem value="active">{t("active")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => aiMutation.mutate()}
                  disabled={aiMutation.isPending || !aiParams.destination}
                  className="w-full gap-2"
                >
                  {aiMutation.isPending ? t("generating") : t("generate_itinerary")}
                  <Sparkles className="h-4 w-4" />
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-2 shadow-md">
            <Save className="h-4 w-4" />
            {saveMutation.isPending ? t("saving") : t("save_tour")}
          </Button>
        </div>
      </div>

      {hasDraft && (
        <div className="bg-amber-50 border border-amber-200 text-amber-800 p-4 rounded-md shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Info className="h-5 w-5 text-amber-500" />
            <p className="font-medium text-sm">{t("unsaved_draft_found")}</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={discardDraft} className="text-amber-700 hover:text-amber-900 hover:bg-amber-100">{t("discard")}</Button>
            <Button size="sm" onClick={restoreDraft} className="bg-amber-500 hover:bg-amber-600 text-white">{t("restore_draft")}</Button>
          </div>
        </div>
      )}

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-4">
          <TabsTrigger value="general">{t("general_info")}</TabsTrigger>
          <TabsTrigger value="details">{t("pricing_details")}</TabsTrigger>
          <TabsTrigger value="media">{t("media_tags")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card className="border-primary/20 shadow-lg">
        <CardHeader className="bg-primary/5">
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            {t("general_information")}
          </CardTitle>
          <CardDescription>{t("select_template_subtitle")}</CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>{t("template_existing_tour")}</Label>
              <div className="relative">
                <select
                  value={selectedTourId}
                  onChange={(e) => setSelectedTourId(e.target.value)}
                  className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none pr-8 font-medium cursor-pointer"
                >
                  <option value="new-tour">{t("start_new_tour")}</option>
                  {tours?.map(tr => (
                    <option key={tr.id} value={tr.id}>{tr.title}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 opacity-50 pointer-events-none" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t("tour_title")}</Label>
              <Input
                value={activeLang === 'en' ? title : (translations?.[activeLang]?.title || '')}
                onChange={(e) => {
                  if (activeLang === 'en') setTitle(e.target.value);
                  else setTranslations({ ...translations, [activeLang]: { ...translations?.[activeLang], title: e.target.value } });
                }}
                placeholder="e.g. Wonders of Indonesia"
                className="font-semibold"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("overall_description")}</Label>
            <Textarea
              value={activeLang === 'en' ? description : (translations?.[activeLang]?.description || '')}
              onChange={(e) => {
                  if (activeLang === 'en') setDescription(e.target.value);
                  else setTranslations({ ...translations, [activeLang]: { ...translations?.[activeLang], description: e.target.value } });
              }}
              placeholder={t("describe_tour_placeholder")}
              rows={3}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label>{t("duration_days")}</Label>
              <Input
                type="number"
                value={duration}
                readOnly
                className="bg-muted font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("category_label")}</Label>
              <Select value={category || "none"} onValueChange={(val) => setCategory(val === "none" ? "" : val)}>
                <SelectTrigger>
                  <SelectValue placeholder={t("select_category")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("select_category")}</SelectItem>
                  <SelectItem value="cultural">{t("cultural")}</SelectItem>
                  <SelectItem value="adventure">{t("adventure")}</SelectItem>
                  <SelectItem value="religious">{t("religious")}</SelectItem>
                  <SelectItem value="leisure">{t("leisure")}</SelectItem>
                  {category && !["cultural", "adventure", "religious", "leisure", "null", "NULL", "none"].includes(category) && (
                    <SelectItem value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="details">
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              {t("pricing_details")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>{t("base_price_dollar")}</Label>
                <Input type="number" value={basePrice} onChange={(e) => setBasePrice(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>{t("child_price_dollar")}</Label>
                <Input type="number" value={childPrice} onChange={(e) => setChildPrice(parseInt(e.target.value) || 0)} />
              </div>
              <div className="space-y-2">
                <Label>{t("single_supplement_dollar")}</Label>
                <Input type="number" value={singleSupplement} onChange={(e) => setSingleSupplement(parseInt(e.target.value) || 0)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("highlights")}</Label>
                <Textarea value={highlights} onChange={(e) => setHighlights(e.target.value)} placeholder={t("key_highlights_placeholder")} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>{t("internal_notes")}</Label>
                <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder={t("admin_only_notes_placeholder")} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>{t("inclusions")}</Label>
                <Textarea value={inclusions} onChange={(e) => setInclusions(e.target.value)} placeholder={t("whats_included_placeholder")} rows={3} />
              </div>
              <div className="space-y-2">
                <Label>{t("exclusions")}</Label>
                <Textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} placeholder={t("whats_not_included_placeholder")} rows={3} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t("countries_required")}</Label>
                <Select
                  value=""
                  onValueChange={(v) => {
                    if (!selectedCountries.includes(v)) {
                      setSelectedCountries([...selectedCountries, v]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("add_country_placeholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {countries?.filter((c) => !selectedCountries.includes(c.name)).map((c) => (
                      <SelectItem key={c.code} value={c.name}>
                        {c.name} ({c.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedCountries.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {selectedCountries.map((name) => (
                      <Badge key={name} variant="secondary" className="gap-1 pr-1">
                        {name}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 hover:bg-transparent"
                          onClick={() => setSelectedCountries(selectedCountries.filter((c) => c !== name))}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="media">
        <Card className="border-primary/20 shadow-lg">
          <CardHeader className="bg-primary/5">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {t("media_tags")}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("cover_image_url")}</Label>
                  <div className="flex gap-2 items-center">
                    <Input
                      type="text"
                      placeholder="https://example.com/image.jpg"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                    />
                    {imageUrl && (
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => setImageUrl("")}>
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {imageUrl && (
                  <div className="border rounded-md overflow-hidden bg-muted h-32 w-full max-w-sm relative group">
                    <img
                      src={imageUrl}
                      alt="Cover Preview"
                      className="object-cover w-full h-full cursor-pointer hover:opacity-90 transition-opacity"
                      onClick={() => window.open(imageUrl, '_blank')}
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                      onLoad={(e) => (e.currentTarget.style.display = 'block')}
                    />
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                      <span className="text-white text-xs font-medium">{t("click_to_view")}</span>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t("tags_comma_separated")}</Label>
                  <Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="adventure, cultural, family" />
                </div>
                <div className="space-y-2">
                  <Label>{t("gallery_urls_comma_separated")}</Label>
                  <Input value={galleryUrls} onChange={(e) => setGalleryUrls(e.target.value)} placeholder="url1, url2, url3" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
      </Tabs>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-semibold flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" />
            {t("itinerary")}
          </h2>
          <Button variant="outline" onClick={handleAddDay} className="gap-2 border-primary/30 hover:bg-primary/5">
            <Plus className="h-4 w-4" />
            {t("add_day")}
          </Button>
        </div>

        <div className="relative space-y-8 before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-300 before:to-transparent">
          {days.filter(Boolean).map((day, index) => (
            <div key={index} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
              {/* Icon */}
              <div className="flex items-center justify-center w-10 h-10 rounded-full border border-white bg-slate-300 group-[.is-active]:bg-primary text-slate-500 group-[.is-active]:text-white shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2">
                <span className="font-bold text-sm">{day.dayNumber}</span>
              </div>
              {/* Content */}
              <Card className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] p-4 shadow-md hover:shadow-lg transition-shadow border-primary/10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex-1 mr-4">
                    <Input 
                      value={activeLang === 'en' ? (day.title || "") : ((day as any).translations?.[activeLang]?.title || "")} 
                      onChange={(e) => {
                        if (activeLang === 'en') updateDay(index, "title", e.target.value);
                        else {
                          const trans = (day as any).translations || {};
                          updateDay(index, "translations", { ...trans, [activeLang]: { ...trans[activeLang], title: e.target.value } });
                        }
                      }}
                      placeholder="Day Title"
                      className="text-lg font-bold border-none p-0 focus-visible:ring-0 placeholder:text-muted-foreground/30"
                    />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleRemoveDay(index)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">{t("location")}</Label>
                      <Input
                        value={day.city || ""}
                        onChange={(e) => updateDay(index, "city", e.target.value)}
                        placeholder={t("city")}
                        list="cities-datalist"
                        className="h-8 text-xs"
                      />
                      {(() => {
                        const typedCity = day.city?.trim();
                        const cityExists = cities?.some(c => c.name.toLowerCase() === typedCity?.toLowerCase());
                        const showAddCityButton = typedCity && !cityExists && countries && countries.length > 0;
                        if (!showAddCityButton) return null;
                        return (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => handleAddCity(typedCity, day.countryCode, index)}
                            disabled={addCityMutation.isPending}
                            className="mt-1.5 h-7 px-2 text-[10px] text-primary bg-primary/10 hover:bg-primary/20 flex items-center gap-1 w-full justify-start rounded border border-primary/20 transition-all"
                          >
                            <Plus className="h-3 w-3" />
                            {t("add_open_quote")}{typedCity}{t("close_quote_new_city")}
                          </Button>
                        );
                      })()}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">{t("country")}</Label>
                      <Select
                        value={day.countryCode || ""}
                        onValueChange={(v) => updateDay(index, "countryCode", v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder={t("country")} />
                        </SelectTrigger>
                        <SelectContent>
                          {countries?.map(c => <SelectItem key={c.id} value={c.code}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">{t("description")}</Label>
                    <Textarea
                      value={activeLang === 'en' ? (day.description || "") : ((day as any).translations?.[activeLang]?.description || "")}
                      onChange={(e) => {
                        if (activeLang === 'en') updateDay(index, "description", e.target.value);
                        else {
                          const trans = (day as any).translations || {};
                          updateDay(index, "translations", { ...trans, [activeLang]: { ...trans[activeLang], description: e.target.value } });
                        }
                      }}
                      placeholder={t("what_happens_today_placeholder")}
                      className="text-sm resize-none"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <Label className="text-[10px] uppercase text-muted-foreground">{t("activities_sights_hotel_guide")}</Label>
                      {day.city && (
                        <div className="flex items-center gap-1">
                          <Select
                            onValueChange={(v) => {
                              const current = day.activities || "";
                              updateDay(index, "activities", current ? `${current}, ${v}` : v);
                            }}
                          >
                            <SelectTrigger className="h-6 w-[120px] text-[10px] bg-primary/10 border-none">
                              <SelectValue placeholder={t("add_sight_placeholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                const city = cities?.find(c => c.name === day.city);
                                const filtered = sights?.filter(s => s.cityId === city?.id && s.name) || [];
                                if (filtered.length === 0) {
                                  return <SelectItem value="__none__" disabled>{t("no_sights_found")}</SelectItem>;
                                }
                                return filtered.map(s => (
                                  <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                          <Select
                            value=""
                            onValueChange={(v) => {
                              const hotel = hotels?.find(h => h.id === v);
                              if (!hotel) return;
                              addDayItem(index, { itemType: "hotel", title: hotel.name, hotelId: hotel.id, cost: "0" });
                            }}
                          >
                            <SelectTrigger className="h-6 w-[120px] text-[10px] bg-primary/10 border-none">
                              <SelectValue placeholder={t("add_hotel_placeholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                const city = cities?.find(c => c.name === day.city);
                                const filtered = hotels?.filter(h => h.cityId === city?.id && h.name) || [];
                                if (filtered.length === 0) {
                                  return <SelectItem value="__none__" disabled>{t("no_hotels_found")}</SelectItem>;
                                }
                                return filtered.map(h => (
                                  <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                          <Select
                            value=""
                            onValueChange={(v) => {
                              const guide = guideRates?.find(g => g.id === v);
                              if (!guide) return;
                              addDayItem(index, { itemType: "guide", title: guide.guideName, guideId: guide.id, cost: "0" });
                            }}
                          >
                            <SelectTrigger className="h-6 w-[120px] text-[10px] bg-primary/10 border-none">
                              <SelectValue placeholder={t("add_guide_placeholder")} />
                            </SelectTrigger>
                            <SelectContent>
                              {(() => {
                                const filtered = guideRates?.filter(g =>
                                  g.guideName &&
                                  (!g.cityBase || g.cityBase.toLowerCase() === day.city?.toLowerCase() ||
                                   !g.countryCode || g.countryCode.toUpperCase() === day.countryCode?.toUpperCase())
                                ) || [];
                                if (filtered.length === 0) {
                                  return <SelectItem value="__none__" disabled>{t("no_guides_found")}</SelectItem>;
                                }
                                return filtered.map(g => (
                                  <SelectItem key={g.id} value={g.id}>{g.guideName}</SelectItem>
                                ));
                              })()}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    {day.items && day.items.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {day.items.map((item, itemIdx) => (
                          <Badge key={itemIdx} variant="secondary" className="gap-1 pr-1 text-[10px] font-normal">
                            {item.itemType === "hotel" ? <BedDouble className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                            {item.title}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-3.5 w-3.5 hover:bg-transparent"
                              onClick={() => removeDayItem(index, item)}
                            >
                              <X className="h-2.5 w-2.5" />
                            </Button>
                          </Badge>
                        ))}
                      </div>
                    )}
                    <Textarea
                      value={activeLang === 'en' ? (day.activities || "") : ((day as any).translations?.[activeLang]?.activities || "")}
                      onChange={(e) => {
                        if (activeLang === 'en') updateDay(index, "activities", e.target.value);
                        else {
                          const trans = (day as any).translations || {};
                          updateDay(index, "translations", { ...trans, [activeLang]: { ...trans[activeLang], activities: e.target.value } });
                        }
                      }}
                      placeholder={t("activities_examples_placeholder")}
                      className="text-sm bg-primary/5 italic"
                      rows={2}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-[10px] uppercase text-muted-foreground">{t("day_image_url_optional")}</Label>
                    <div className="flex gap-1 items-center">
                      <Input
                        type="text"
                        placeholder="https://example.com/image.jpg"
                        value={day.imageUrl || ""}
                        onChange={(e) => updateDay(index, "imageUrl", e.target.value)}
                        className="h-8 text-xs"
                      />
                      {day.imageUrl && (
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive shrink-0" onClick={() => updateDay(index, "imageUrl", "")}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    {day.imageUrl && (
                      <div className="mt-2 border rounded overflow-hidden h-16 w-full bg-muted relative group">
                        <img
                          src={day.imageUrl}
                          alt="Preview"
                          className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                          onClick={() => window.open(day.imageUrl ?? undefined, '_blank')}
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                          onLoad={(e) => (e.currentTarget.style.display = 'block')}
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                          <span className="text-white text-[8px] font-medium">{t("view_label")}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            </div>
          ))}
        </div>

        <div className="flex justify-center pt-4">
          <Button variant="outline" onClick={handleAddDay} className="gap-2 border-dashed border-2 h-16 w-full max-w-md hover:bg-primary/5 hover:border-primary/50">
            <Plus className="h-5 w-5" />
            {t("add_next_day")}
          </Button>
        </div>
      </div>
      <datalist id="cities-datalist">
        {cities?.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
    </div>
    </div>
  );
}

export default function TourGenerator() {
  return (
    <ErrorBoundary>
      <TourGeneratorInner />
    </ErrorBoundary>
  );
}
