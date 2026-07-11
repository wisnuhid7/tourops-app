import { useQuery } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Printer, Calendar, MapPin, DollarSign, Upload, Image, Eye } from "lucide-react";
import { Link } from "wouter";
import { useState, useRef } from "react";
import type { Tour, TourDeparture, TourDay } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

type TemplateId = "classic" | "modern" | "elegant";

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

export default function TourBrochure() {
  const [, params] = useRoute("/tours/:id/brochure");
  const preselectedTourId = params?.id;
  const { language, t } = useLanguage();

  const TEMPLATES: { id: TemplateId; name: string; description: string }[] = [
    { id: "classic", name: t("classic") || "Classic", description: t("classic_desc") || "Clean layout with traditional styling" },
    { id: "modern", name: t("modern") || "Modern", description: t("modern_desc") || "Bold headers with accent colors" },
    { id: "elegant", name: t("elegant") || "Elegant", description: t("elegant_desc") || "Refined design with serif typography" },
  ];

  const { data: allTours, isLoading: toursLoading } = useQuery<Tour[]>({
    queryKey: ["/api/tours/public"],
  });

  const [selectedTourId, setSelectedTourId] = useState<string>(preselectedTourId || "");
  const [template, setTemplate] = useState<TemplateId>("classic");
  const [customTitle, setCustomTitle] = useState("");
  const [leaderPhotoUrl, setLeaderPhotoUrl] = useState<string>("");
  const [leaderName, setLeaderName] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tourId = selectedTourId || preselectedTourId;

  const { data: tour } = useQuery<Tour>({
    queryKey: ["/api/tours", tourId],
    enabled: !!tourId,
  });
  const { data: departures } = useQuery<TourDeparture[]>({
    queryKey: ["/api/tours", tourId, "departures"],
    enabled: !!tourId,
  });
  const { data: days } = useQuery<TourDay[]>({
    queryKey: ["/api/tours", tourId, "days"],
    enabled: !!tourId,
  });

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setLeaderPhotoUrl(ev.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (toursLoading) {
    return <div className="p-6"><Skeleton className="h-64" /></div>;
  }

  const tourTitle = tour ? (language === 'en' ? tour.title : ((tour as any).translations?.[language]?.title || tour.title)) : "";
  const tourDesc = tour ? (language === 'en' ? tour.description : ((tour as any).translations?.[language]?.description || tour.description)) : "";
  const tourHighlights = tour ? (language === 'en' ? tour.highlights : ((tour as any).translations?.[language]?.highlights || tour.highlights)) : "";

  const sortedDays = days ? [...days].sort((a, b) => a.dayNumber - b.dayNumber) : [];
  const openDepartures = (departures || []).filter((d) => d.status === "open");
  const highlightLines = tourHighlights ? tourHighlights.split("\n").filter((l: string) => l.trim()) : [];
  const displayTitle = customTitle || tourTitle || t("create_tour_brochure");

  const templateStyles: Record<TemplateId, { headerBg: string; headerText: string; accent: string; font: string; dayBadge: string }> = {
    classic: {
      headerBg: "bg-primary",
      headerText: "text-primary-foreground",
      accent: "text-primary",
      font: "font-serif",
      dayBadge: "bg-primary text-primary-foreground",
    },
    modern: {
      headerBg: "bg-foreground",
      headerText: "text-background",
      accent: "text-foreground",
      font: "font-sans",
      dayBadge: "bg-foreground text-background",
    },
    elegant: {
      headerBg: "bg-muted",
      headerText: "text-foreground",
      accent: "text-muted-foreground",
      font: "font-serif italic",
      dayBadge: "bg-muted-foreground text-muted",
    },
  };

  const ts = templateStyles[template];

  return (
    <div className="max-w-7xl mx-auto">
      <div className="p-6 flex flex-wrap items-center justify-between gap-4 print:hidden">
        <Link href={tourId ? `/tours/${tourId}` : "/tours"}>
          <Button variant="ghost" size="sm" data-testid="button-back-from-brochure">
            <ArrowLeft className="h-4 w-4 mr-1" />{t("back")}
          </Button>
        </Link>
        <h1 className="text-xl font-bold font-serif">{t("create_tour_brochure")}</h1>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setShowPreview(!showPreview)}
            data-testid="button-toggle-preview"
          >
            <Eye className="h-4 w-4 mr-1" />{showPreview ? t("edit_settings") : t("preview")}
          </Button>
          <Button
            onClick={() => window.print()}
            disabled={!tour}
            data-testid="button-print-brochure"
          >
            <Printer className="h-4 w-4 mr-1" />{t("print_save_pdf")}
          </Button>
        </div>
      </div>

      <div className="px-6 pb-6 print:hidden">
        {!showPreview && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("tour_selection")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>{t("select_tour")} *</Label>
                  <Select value={selectedTourId} onValueChange={setSelectedTourId}>
                    <SelectTrigger data-testid="select-brochure-tour">
                      <SelectValue placeholder={t("choose_tour")} />
                    </SelectTrigger>
                    <SelectContent>
                      {allTours?.map((t) => {
                        const title = language === 'en' ? t.title : ((t as any).translations?.[language]?.title || t.title);
                        return <SelectItem key={t.id} value={t.id}>{title}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("custom_brochure_title")}</Label>
                  <Input
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder={tourTitle || t("choose_tour")}
                    data-testid="input-brochure-title"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t("leave_blank_tour_name")}</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("brochure_template")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {TEMPLATES.map((t) => (
                  <div
                    key={t.id}
                    className={`border rounded-md p-3 cursor-pointer transition-colors ${template === t.id ? "border-primary bg-primary/5" : "hover-elevate"}`}
                    onClick={() => setTemplate(t.id)}
                    data-testid={`template-${t.id}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`h-4 w-4 rounded-full border-2 ${template === t.id ? "border-primary bg-primary" : "border-muted-foreground"}`} />
                      <div>
                        <p className="text-sm font-medium">{t.name}</p>
                        <p className="text-xs text-muted-foreground">{t.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">{t("tour_leader_info")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap items-start gap-6">
                  <div className="flex flex-col items-center gap-3">
                    <Avatar className="h-24 w-24">
                      <AvatarImage src={leaderPhotoUrl} alt="Leader" />
                      <AvatarFallback className="text-2xl">
                        {leaderName ? leaderName.charAt(0).toUpperCase() : <Image className="h-8 w-8" />}
                      </AvatarFallback>
                    </Avatar>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoUpload}
                      data-testid="input-leader-photo-file"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="button-upload-leader-photo"
                    >
                      <Upload className="h-3 w-3 mr-1" />{t("upload_photo")}
                    </Button>
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Label>{t("leader_name")}</Label>
                    <Input
                      value={leaderName}
                      onChange={(e) => setLeaderName(e.target.value)}
                      placeholder={t("your_name_leader")}
                      data-testid="input-leader-name"
                    />
                    <p className="text-xs text-muted-foreground mt-1">{t("displayed_brochure_leader")}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {tour ? (
        <div className="p-6 print:p-0 space-y-8" data-testid="brochure-content">
          <div className={`text-center space-y-4 pb-8 border-b rounded-md p-8 ${ts.headerBg} ${ts.headerText}`}>
            {tour.imageUrl && (
              <div className="aspect-video overflow-hidden rounded-md max-h-72 mx-auto">
                <img src={tour.imageUrl} alt={displayTitle} className="w-full h-full object-cover" />
              </div>
            )}
            <h1 className={`text-4xl font-bold ${ts.font}`} data-testid="text-brochure-title">{displayTitle}</h1>
            <div className="flex flex-wrap items-center justify-center gap-6 opacity-90">
              <span className="flex items-center gap-1"><Calendar className="h-5 w-5" />{tour.duration} {t("days")}</span>
              {tour.countries && tour.countries.length > 0 && (
                <span className="flex items-center gap-1"><MapPin className="h-5 w-5" />{tour.countries.join(", ")}</span>
              )}
              {tour.basePrice ? (
                <span className="flex items-center gap-1"><DollarSign className="h-5 w-5" />{t("starting_from")} ${Number(tour.basePrice).toLocaleString()}</span>
              ) : null}
            </div>
            {(leaderName || leaderPhotoUrl) && (
              <div className="flex items-center justify-center gap-3 pt-4 border-t border-current/20">
                {leaderPhotoUrl && (
                  <Avatar className="h-12 w-12 border-2 border-current/20">
                    <AvatarImage src={leaderPhotoUrl} alt={leaderName} />
                    <AvatarFallback>{leaderName?.charAt(0)}</AvatarFallback>
                  </Avatar>
                )}
                {leaderName && (
                  <div className="text-left">
                    <p className="text-xs opacity-75">{t("tour_leader_info")}</p>
                    <p className="font-semibold">{leaderName}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {tourDesc && (
            <div className="space-y-2">
              <h2 className={`text-2xl font-bold ${ts.font} ${ts.accent}`}>{t("about_this_tour")}</h2>
              <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{tourDesc}</p>
            </div>
          )}

          {highlightLines.length > 0 && (
            <div className="space-y-3">
              <h2 className={`text-2xl font-bold ${ts.font} ${ts.accent}`}>{t("highlights")}</h2>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {highlightLines.map((h: string, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1 h-2 w-2 rounded-full bg-primary shrink-0" />
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {sortedDays.length > 0 && (
            <div className="space-y-4">
              <h2 className={`text-2xl font-bold ${ts.font} ${ts.accent}`}>{t("day_by_day_itinerary")}</h2>
              <div className="space-y-4">
                {sortedDays.map((day) => {
                  const rawDayTitle = language === 'en' ? day.title : ((day as any).translations?.[language]?.title || day.title);
                  const dayTitle = cleanDayTitle(rawDayTitle, day.dayNumber);
                  const dayDesc = language === 'en' ? day.description : ((day as any).translations?.[language]?.description || day.description);
                  const dayAct = language === 'en' ? day.activities : ((day as any).translations?.[language]?.activities || day.activities);
                  return (
                    <div key={day.id} className="border rounded-md p-4 space-y-1 break-inside-avoid" data-testid={`brochure-day-${day.dayNumber}`}>
                      <div className="flex flex-wrap items-center gap-3">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${ts.dayBadge}`}>{t("tour_day")} #{day.dayNumber}</span>
                        <h3 className="font-semibold">{dayTitle}</h3>
                        {day.city && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{day.city}</span>
                        )}
                      </div>
                      {dayDesc && <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{dayDesc}</p>}
                      {dayAct && <p className="text-xs text-muted-foreground">{t("activities_sights")}: {dayAct}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {openDepartures.length > 0 && (
            <div className="space-y-3">
              <h2 className={`text-2xl font-bold ${ts.font} ${ts.accent}`}>{t("available_departures")}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2 pr-4 font-semibold">{t("start_date")}</th>
                      <th className="py-2 pr-4 font-semibold">{t("end_date")}</th>
                      <th className="py-2 pr-4 font-semibold">{t("price_person")}</th>
                      <th className="py-2 pr-4 font-semibold">{t("availability")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {openDepartures.map((dep) => (
                      <tr key={dep.id} className="border-b" data-testid={`brochure-departure-${dep.id}`}>
                        <td className="py-2 pr-4">{dep.startDate ? new Date(dep.startDate).toLocaleDateString() : t("date_tba")}</td>
                        <td className="py-2 pr-4">{dep.endDate ? new Date(dep.endDate).toLocaleDateString() : t("date_tba")}</td>
                        <td className="py-2 pr-4">{dep.pricePerPerson ? `$${Number(dep.pricePerPerson).toLocaleString()}` : t("contact_for_pricing")}</td>
                        <td className="py-2 pr-4">{dep.capacityTotal ? `${dep.capacityBooked || 0}/${dep.capacityTotal}` : t("open_capacity_label")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="text-center text-xs text-muted-foreground border-t pt-4 print:mt-8">
            {leaderName && <p className="mb-1">{t("led_by")} {leaderName}</p>}
            <p>{t("generated_on")} {new Date().toLocaleDateString()} | {t("contact_details_bookings")}</p>
          </div>
        </div>
      ) : (
        <div className="px-6 pb-6">
          <Card>
            <CardContent className="flex flex-col items-center py-16">
              <Image className="h-12 w-12 text-muted-foreground/40 mb-4" />
              <p className="text-muted-foreground text-sm">{t("choose_tour")}</p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
