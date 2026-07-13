import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { FileText, MapPin, Calendar, Search, X, Plus, Loader2, Image as ImageIcon, Languages, Sparkles } from "lucide-react";
import type { Tour } from "@workspace/db";

export default function ContentEditorDashboard() {
  const { t } = useLanguage();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Tour | null>(null);

  const { data: tours, isLoading } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  const filtered = tours?.filter(t => (t.title || "").toLowerCase().includes(search.toLowerCase())) || [];

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
      <div>
        <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><FileText className="h-6 w-6 text-primary" />{t("editor_dashboard")}</h1>
        <p className="text-muted-foreground text-sm">{t("content_editor_subtitle")}</p>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder={t("search_tours_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" data-testid="input-search-tours" />
      </div>

      {filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">No tours found.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(tour => (
            <Card key={tour.id} className="overflow-hidden cursor-pointer hover-elevate" onClick={() => setEditing(tour)} data-testid={`card-tour-${tour.id}`}>
              {tour.imageUrl ? (
                <div className="aspect-video overflow-hidden">
                  <img src={tour.imageUrl} alt={tour.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video bg-muted flex items-center justify-center">
                  <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold leading-tight">{tour.title}</h3>
                  <Badge variant={tour.isPublished ? "default" : "secondary"}>{tour.isPublished ? t("published") : t("draft")}</Badge>
                </div>
                <p className="text-sm text-muted-foreground line-clamp-2">{tour.description || "No description yet."}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{tour.duration} {t("days")}</span>
                  {tour.countries && tour.countries.length > 0 && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{tour.countries.join(", ")}</span>}
                </div>
                {tour.tags && tour.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">{tour.tags.map(tag => <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>)}</div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit content: {editing?.title}</DialogTitle></DialogHeader>
          {editing && <ContentForm tour={editing} onClose={() => setEditing(null)} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ContentForm({ tour, onClose }: { tour: Tour; onClose: () => void }) {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [description, setDescription] = useState(tour.description || "");
  const [highlights, setHighlights] = useState(tour.highlights || "");
  const [inclusions, setInclusions] = useState(tour.inclusions || "");
  const [exclusions, setExclusions] = useState(tour.exclusions || "");
  const [imageUrl, setImageUrl] = useState(tour.imageUrl || "");
  const [galleryUrls, setGalleryUrls] = useState<string[]>(tour.galleryUrls || []);
  const [newGalleryUrl, setNewGalleryUrl] = useState("");
  const [tags, setTags] = useState<string[]>(tour.tags || []);
  const [newTag, setNewTag] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  type TrFields = { title?: string; description?: string; highlights?: string; inclusions?: string; exclusions?: string };
  const initialTr = (tour.translations as any) || {};
  const [trLang, setTrLang] = useState<"es" | "id">("es");
  const [esTr, setEsTr] = useState<TrFields>(initialTr.es || {});
  const [idTr, setIdTr] = useState<TrFields>(initialTr.id || {});
  const curTr = trLang === "es" ? esTr : idTr;
  const setCurTr = trLang === "es" ? setEsTr : setIdTr;
  const setTrField = (field: keyof TrFields, value: string) =>
    setCurTr((prev) => ({ ...prev, [field]: value }));

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, onDone: (url: string) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append("image", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      onDone(data.url);
      toast({ title: t("image_uploaded_successfully") });
    } catch {
      toast({ title: t("failed_to_upload_image"), variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const save = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/tours/${tour.id}`, {
      description, highlights, inclusions, exclusions, imageUrl, galleryUrls, tags,
      translations: { es: esTr, id: idTr },
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      toast({ title: t("content_saved") });
      onClose();
    },
    onError: () => toast({ title: t("failed_to_save"), variant: "destructive" }),
  });

  const autoTranslate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/ai/translate-tour/${tour.id}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      const tr = data?.tour?.translations;
      if (tr) {
        setEsTr(tr.es || {});
        setIdTr(tr.id || {});
      }
      queryClient.invalidateQueries({ queryKey: ["/api/tours"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tours", tour.id, "days"] });
      toast({ title: t("translations_updated") });
    },
    onError: () => toast({ title: t("translation_failed"), variant: "destructive" }),
  });

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("cover_image_label")}</Label>
        <div className="flex gap-2 items-center">
          <Input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, setImageUrl)} disabled={isUploading} />
          {isUploading && <Loader2 className="h-4 w-4 animate-spin shrink-0" />}
        </div>
        {imageUrl && <img src={imageUrl} alt="cover" className="mt-2 h-24 rounded border object-cover" />}
      </div>

      <div>
        <Label>{t("description")}</Label>
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} data-testid="textarea-description" />
      </div>
      <div>
        <Label>{t("highlights")}</Label>
        <Textarea value={highlights} onChange={(e) => setHighlights(e.target.value)} rows={3} placeholder={t("one_highlight_per_line")} data-testid="textarea-highlights" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t("inclusions")}</Label>
          <Textarea value={inclusions} onChange={(e) => setInclusions(e.target.value)} rows={3} />
        </div>
        <div>
          <Label>{t("exclusions")}</Label>
          <Textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} rows={3} />
        </div>
      </div>

      <div>
        <Label>{t("gallery_label")}</Label>
        <div className="flex gap-2 items-center mb-2">
          <Input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, (url) => setGalleryUrls(prev => [...prev, url]))} disabled={isUploading} />
        </div>
        {galleryUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {galleryUrls.map((url, i) => (
              <div key={i} className="relative">
                <img src={url} className="h-16 w-16 object-cover rounded border" />
                <button onClick={() => setGalleryUrls(prev => prev.filter((_, idx) => idx !== i))} className="absolute -top-1.5 -right-1.5 bg-white rounded-full border shadow p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <Label>{t("tags_label")}</Label>
        <div className="flex gap-2 mb-2">
          <Input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder={t("tag_example_placeholder")} onKeyDown={(e) => { if (e.key === "Enter" && newTag.trim()) { setTags(prev => [...prev, newTag.trim()]); setNewTag(""); } }} />
          <Button type="button" variant="outline" onClick={() => { if (newTag.trim()) { setTags(prev => [...prev, newTag.trim()]); setNewTag(""); } }}><Plus className="h-4 w-4" /></Button>
        </div>
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <Badge key={i} variant="outline" className="text-xs gap-1">
              {tag}
              <button onClick={() => setTags(prev => prev.filter((_, idx) => idx !== i))}><X className="h-3 w-3" /></button>
            </Badge>
          ))}
        </div>
      </div>

      <div className="border rounded-md p-3 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Languages className="h-4 w-4 text-primary" />
            <Label className="m-0">{t("translations_label")}</Label>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => autoTranslate.mutate()} disabled={autoTranslate.isPending} data-testid="button-auto-translate">
            {autoTranslate.isPending
              ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />{t("translating")}</>
              : <><Sparkles className="h-3.5 w-3.5 mr-1" />{t("auto_translate")}</>}
          </Button>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant={trLang === "es" ? "default" : "outline"} onClick={() => setTrLang("es")} className="h-7 px-3 text-xs" data-testid="button-tr-lang-es">Español</Button>
          <Button type="button" size="sm" variant={trLang === "id" ? "default" : "outline"} onClick={() => setTrLang("id")} className="h-7 px-3 text-xs" data-testid="button-tr-lang-id">Bahasa Indonesia</Button>
        </div>
        <div>
          <Label className="text-xs">{t("title")}</Label>
          <Input value={curTr.title || ""} onChange={(e) => setTrField("title", e.target.value)} data-testid="input-tr-title" />
        </div>
        <div>
          <Label className="text-xs">{t("description")}</Label>
          <Textarea value={curTr.description || ""} onChange={(e) => setTrField("description", e.target.value)} rows={3} data-testid="textarea-tr-description" />
        </div>
        <div>
          <Label className="text-xs">{t("highlights")}</Label>
          <Textarea value={curTr.highlights || ""} onChange={(e) => setTrField("highlights", e.target.value)} rows={2} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">{t("inclusions")}</Label>
            <Textarea value={curTr.inclusions || ""} onChange={(e) => setTrField("inclusions", e.target.value)} rows={2} />
          </div>
          <div>
            <Label className="text-xs">{t("exclusions")}</Label>
            <Textarea value={curTr.exclusions || ""} onChange={(e) => setTrField("exclusions", e.target.value)} rows={2} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{t("translations_hint")}</p>
      </div>

      <div className="flex gap-2 pt-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending} data-testid="button-save-content">
          {save.isPending ? t("saving") : t("save")}
        </Button>
        <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
