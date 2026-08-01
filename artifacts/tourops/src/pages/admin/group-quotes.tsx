import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Plus, Trash2, Calculator, Eye, Link2, CheckCircle2 } from "lucide-react";
import type { Tour, PricingQuote, PricingRule, AirfareRate, GroupSizeBand, PricingQuoteLineItem } from "@workspace/db";

const OCCUPANCIES = ["matrimonial", "double", "single", "third_person", "child", "infant"] as const;
type Occ = (typeof OCCUPANCIES)[number];

interface HotelForm { hotelName: string; hotelId?: string; rates: Record<Occ, string> }
const emptyHotel = (): HotelForm => ({ hotelName: "", rates: { matrimonial: "", double: "", single: "", third_person: "", child: "", infant: "" } });

export default function AdminGroupQuotes() {
  const { toast } = useToast();
  const { t } = useLanguage();

  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  const { data: quotes, isLoading } = useQuery<PricingQuote[]>({ queryKey: ["/api/pricing/quotes"] });
  const { data: rules } = useQuery<PricingRule[]>({ queryKey: ["/api/pricing/rules"] });
  const { data: rates } = useQuery<AirfareRate[]>({ queryKey: ["/api/pricing/airfare-rates"] });
  const { data: bands } = useQuery<GroupSizeBand[]>({ queryKey: ["/api/pricing/group-size-bands"] });

  // ---- Quote builder state ----
  const [showBuilder, setShowBuilder] = useState(false);
  const [tourId, setTourId] = useState("");
  const [paxCount, setPaxCount] = useState("10");
  const [nights, setNights] = useState("7");
  const [transportationShare, setTransportationShare] = useState("0");
  const [guideDriverShare, setGuideDriverShare] = useState("0");
  const [sightseeingShare, setSightseeingShare] = useState("0");
  const [airfarePerPerson, setAirfarePerPerson] = useState("0");
  const [hotels, setHotels] = useState<HotelForm[]>([emptyHotel()]);
  const [resolveWarnings, setResolveWarnings] = useState<string[]>([]);

  const resetBuilder = () => {
    setTourId(""); setPaxCount("10"); setNights("7");
    setTransportationShare("0"); setGuideDriverShare("0"); setSightseeingShare("0"); setAirfarePerPerson("0");
    setHotels([emptyHotel()]);
    setResolveWarnings([]);
  };

  // Rate-driven costing: prefill the builder from supplier rate cards.
  const autoFill = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/pricing/resolve", {
        tourId,
        paxCount: parseInt(paxCount, 10),
      });
      return res.json();
    },
    onSuccess: (r: any) => {
      setTransportationShare(r.components.transportationShare);
      setGuideDriverShare(r.components.guideDriverShare);
      setSightseeingShare(r.components.sightseeingShare);
      setAirfarePerPerson(r.components.airfarePerPerson);
      if (r.nights > 0) setNights(String(r.nights));
      if (r.hotels?.length) {
        setHotels(r.hotels.map((h: any) => ({
          hotelName: h.hotelName ?? "",
          hotelId: h.hotelId,
          rates: {
            matrimonial: h.nightlyRates.matrimonial ?? "",
            double: h.nightlyRates.double ?? "",
            single: h.nightlyRates.single ?? "",
            third_person: h.nightlyRates.third_person ?? "",
            child: h.nightlyRates.child ?? "",
            infant: h.nightlyRates.infant ?? "",
          },
        })));
      }
      setResolveWarnings(r.warnings ?? []);
      toast({ title: t("pe_autofill_done") });
    },
    onError: (e: any) => toast({ title: t("error_title"), description: e.message, variant: "destructive" }),
  });

  const createQuote = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pricing/quotes", {
      tourId,
      paxCount: parseInt(paxCount, 10),
      nights: parseInt(nights, 10),
      components: { transportationShare, guideDriverShare, sightseeingShare, airfarePerPerson },
      hotels: hotels.map((h, i) => ({
        hotelChoice: i + 1,
        hotelId: h.hotelId,
        hotelName: h.hotelName || undefined,
        nightlyRates: Object.fromEntries(OCCUPANCIES.filter((o) => h.rates[o] !== "").map((o) => [o, h.rates[o]])),
      })),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/quotes"] });
      setShowBuilder(false);
      resetBuilder();
      toast({ title: t("pe_quote_created") });
    },
    onError: (e: any) => toast({ title: t("pe_quote_failed"), description: String(e?.message ?? ""), variant: "destructive" }),
  });

  // ---- Breakdown dialog ----
  const [breakdownId, setBreakdownId] = useState<string | null>(null);
  const { data: breakdown } = useQuery<PricingQuote & { lineItems: PricingQuoteLineItem[]; groupSizeBand: GroupSizeBand | null }>({
    queryKey: ["/api/pricing/quotes", breakdownId, "internal"],
    queryFn: async () => {
      const res = await fetch(`/api/pricing/quotes/${breakdownId}/internal`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!breakdownId,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiRequest("PATCH", `/api/pricing/quotes/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/quotes"] });
      toast({ title: t("pe_status_updated") });
    },
    onError: (e: any) => toast({ title: t("error_title"), description: String(e?.message ?? ""), variant: "destructive" }),
  });
  // Actions offered per current status (server enforces roles & transitions).
  const statusActions = (status: string): { to: string; label: string }[] => {
    switch (status) {
      case "draft": return [{ to: "pending_approval", label: t("pe_submit_approval") }];
      case "pending_approval": return [
        { to: "approved", label: t("pe_approve") },
        { to: "rejected", label: t("pe_reject") },
      ];
      case "rejected": case "expired": return [{ to: "draft", label: t("pe_back_to_draft") }];
      case "approved": case "final": return [{ to: "sent", label: t("pe_send") }];
      case "sent": case "viewed": return [{ to: "accepted", label: t("pe_mark_accepted") }];
      default: return [];
    }
  };
  // Mirrors server CUSTOMER_VISIBLE_QUOTE_STATUSES: approved quotes are not
  // customer-visible until explicitly sent (legacy "final" stays shareable).
  const SHAREABLE = ["final", "sent", "viewed", "accepted"];

  const copyShareLink = async (id: string) => {
    const res = await fetch(`/api/pricing/quotes/${id}/internal`, { credentials: "include" });
    if (!res.ok) { toast({ title: t("error_title"), variant: "destructive" }); return; }
    const q = await res.json();
    await navigator.clipboard.writeText(`${window.location.origin}/quotes/shared/${q.shareToken}`);
    toast({ title: t("pe_share_link_copied") });
  };

  // ---- Settings tabs mutations (rules / airfare / bands) ----
  const [newRule, setNewRule] = useState({ name: "", marginType: "percentage", marginValue: "20", freePassengerPaying: "3", freePassengerFree: "1", roundingRule: "cent" });
  const addRule = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pricing/rules", {
      name: newRule.name, marginType: newRule.marginType, marginValue: newRule.marginValue,
      freePassengerPaying: parseInt(newRule.freePassengerPaying, 10),
      freePassengerFree: parseInt(newRule.freePassengerFree, 10),
      roundingRule: newRule.roundingRule,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/rules"] }); toast({ title: t("pe_rule_created") }); },
    onError: (e: any) => toast({ title: t("error_title"), description: String(e?.message ?? ""), variant: "destructive" }),
  });
  const deleteRule = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pricing/rules/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pricing/rules"] }),
    onError: (e: any) => toast({ title: t("pe_delete_blocked"), description: String(e?.message ?? ""), variant: "destructive" }),
  });

  const [newRate, setNewRate] = useState({ origin: "", destination: "", ratePerPerson: "", childRate: "", infantRate: "" });
  const addRate = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pricing/airfare-rates", {
      origin: newRate.origin, destination: newRate.destination,
      ratePerPerson: newRate.ratePerPerson, childRate: newRate.childRate || undefined,
      infantRate: newRate.infantRate || undefined,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/airfare-rates"] }); setNewRate({ origin: "", destination: "", ratePerPerson: "", childRate: "", infantRate: "" }); toast({ title: t("pe_rate_created") }); },
    onError: (e: any) => toast({ title: t("error_title"), description: String(e?.message ?? ""), variant: "destructive" }),
  });
  const deleteRate = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pricing/airfare-rates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pricing/airfare-rates"] }),
  });

  // ---- Exchange rates ----
  const { data: fxRates } = useQuery<any[]>({ queryKey: ["/api/pricing/exchange-rates"] });
  const [newFx, setNewFx] = useState({ sourceCurrency: "", targetCurrency: "USD", rate: "" });
  const addFx = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pricing/exchange-rates", {
      sourceCurrency: newFx.sourceCurrency.trim().toUpperCase(),
      targetCurrency: newFx.targetCurrency.trim().toUpperCase(),
      rate: newFx.rate.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/exchange-rates"] });
      setNewFx({ sourceCurrency: "", targetCurrency: "USD", rate: "" });
      toast({ title: t("pe_fx_created") });
    },
    onError: (e: any) => toast({ title: t("error_title"), description: String(e?.message ?? ""), variant: "destructive" }),
  });
  const toggleFx = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiRequest("PATCH", `/api/pricing/exchange-rates/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pricing/exchange-rates"] }),
    onError: (e: any) => toast({ title: t("error_title"), description: String(e?.message ?? ""), variant: "destructive" }),
  });

  // ---- Manual price override (admin) ----
  const [overrideLi, setOverrideLi] = useState<PricingQuoteLineItem | null>(null);
  const [overrideValue, setOverrideValue] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const applyOverride = useMutation({
    mutationFn: () => apiRequest("POST", `/api/pricing/quotes/${breakdownId}/override`, {
      lineItemId: overrideLi!.id, overrideValue: overrideValue.trim(), reason: overrideReason.trim(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/quotes", breakdownId, "internal"] });
      setOverrideLi(null); setOverrideValue(""); setOverrideReason("");
      toast({ title: t("pe_override_applied") });
    },
    onError: (e: any) => toast({ title: t("error_title"), description: String(e?.message ?? ""), variant: "destructive" }),
  });

  const toggleBand = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => apiRequest("PATCH", `/api/pricing/group-size-bands/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pricing/group-size-bands"] }),
    onError: (e: any) => toast({ title: t("error_title"), description: String(e?.message ?? ""), variant: "destructive" }),
  });

  const money = (v: string | null | undefined, cur = "USD") => v == null ? "—" : `${cur} ${v}`;
  const tourTitle = (id: string) => tours?.find((x) => x.id === id)?.title ?? id.slice(0, 8);

  return (
    <div className="p-6 space-y-6" data-testid="page-group-quotes">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("pe_group_quotes")}</h1>
          <p className="text-muted-foreground text-sm">{t("pe_group_quotes_subtitle")}</p>
        </div>
        <Button onClick={() => setShowBuilder(true)} data-testid="button-new-quote">
          <Calculator className="w-4 h-4 mr-2" />{t("pe_new_quote")}
        </Button>
      </div>

      <Tabs defaultValue="quotes">
        <TabsList>
          <TabsTrigger value="quotes" data-testid="tab-quotes">{t("pe_quotes")}</TabsTrigger>
          <TabsTrigger value="rules" data-testid="tab-rules">{t("pe_pricing_rules")}</TabsTrigger>
          <TabsTrigger value="airfare" data-testid="tab-airfare">{t("pe_airfare_rates")}</TabsTrigger>
          <TabsTrigger value="bands" data-testid="tab-bands">{t("pe_group_bands")}</TabsTrigger>
          <TabsTrigger value="fx" data-testid="tab-fx">{t("pe_exchange_rates")}</TabsTrigger>
        </TabsList>

        {/* ---- Quotes list ---- */}
        <TabsContent value="quotes" className="space-y-3 mt-4">
          {isLoading ? <Skeleton className="h-32 w-full" /> : !quotes?.length ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">{t("pe_no_quotes")}</CardContent></Card>
          ) : quotes.map((q) => (
            <Card key={q.id} data-testid={`card-quote-${q.id}`}>
              <CardContent className="py-4 flex flex-wrap items-center gap-4 justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{tourTitle(q.tourId)}</div>
                  <div className="text-sm text-muted-foreground">
                    {q.paxCount} {t("pe_pax")} · {q.nights} {t("pe_nights")} · {q.assistanceType === "professional_guide" ? t("pe_professional_guide") : t("pe_driver_chaperone")}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={["approved", "final", "accepted"].includes(q.status) ? "default" : ["rejected", "cancelled", "expired"].includes(q.status) ? "destructive" : "secondary"}>{q.status}</Badge>
                  <Button size="sm" variant="outline" onClick={() => setBreakdownId(q.id)} data-testid={`button-breakdown-${q.id}`}>
                    <Eye className="w-4 h-4 mr-1" />{t("pe_breakdown")}
                  </Button>
                  {statusActions(q.status).map((a) => (
                    <Button key={a.to} size="sm" variant="outline" disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: q.id, status: a.to })} data-testid={`button-status-${a.to}-${q.id}`}>
                      <CheckCircle2 className="w-4 h-4 mr-1" />{a.label}
                    </Button>
                  ))}
                  {SHAREABLE.includes(q.status) && (
                    <Button size="sm" variant="outline" onClick={() => copyShareLink(q.id)} data-testid={`button-share-${q.id}`}>
                      <Link2 className="w-4 h-4 mr-1" />{t("pe_copy_share_link")}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ---- Pricing rules ---- */}
        <TabsContent value="rules" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("pe_add_rule")}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div><Label>{t("name_label")}</Label><Input value={newRule.name} onChange={(e) => setNewRule({ ...newRule, name: e.target.value })} data-testid="input-rule-name" /></div>
              <div>
                <Label>{t("pe_margin_type")}</Label>
                <Select value={newRule.marginType} onValueChange={(v) => setNewRule({ ...newRule, marginType: v })}>
                  <SelectTrigger className="w-36" data-testid="select-margin-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t("pe_percentage")}</SelectItem>
                    <SelectItem value="fixed">{t("pe_fixed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{t("pe_margin_value")}</Label><Input className="w-24" value={newRule.marginValue} onChange={(e) => setNewRule({ ...newRule, marginValue: e.target.value })} data-testid="input-margin-value" /></div>
              <div><Label>{t("pe_free_per_paying")}</Label>
                <div className="flex items-center gap-1">
                  <Input className="w-16" value={newRule.freePassengerFree} onChange={(e) => setNewRule({ ...newRule, freePassengerFree: e.target.value })} data-testid="input-free-count" />
                  <span className="text-sm text-muted-foreground">/</span>
                  <Input className="w-16" value={newRule.freePassengerPaying} onChange={(e) => setNewRule({ ...newRule, freePassengerPaying: e.target.value })} data-testid="input-paying-count" />
                </div>
              </div>
              <div>
                <Label>{t("pe_rounding")}</Label>
                <Select value={newRule.roundingRule} onValueChange={(v) => setNewRule({ ...newRule, roundingRule: v })}>
                  <SelectTrigger className="w-44" data-testid="select-rounding-rule"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cent">{t("pe_rounding_cent")}</SelectItem>
                    <SelectItem value="unit_nearest">{t("pe_rounding_unit_nearest")}</SelectItem>
                    <SelectItem value="unit_up">{t("pe_rounding_unit_up")}</SelectItem>
                    <SelectItem value="five_up">{t("pe_rounding_five_up")}</SelectItem>
                    <SelectItem value="ten_up">{t("pe_rounding_ten_up")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={() => addRule.mutate()} disabled={!newRule.name || addRule.isPending} data-testid="button-add-rule"><Plus className="w-4 h-4 mr-1" />{t("add")}</Button>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("name_label")}</TableHead><TableHead>{t("pe_margin")}</TableHead><TableHead>{t("pe_free_policy")}</TableHead><TableHead>{t("pe_rounding")}</TableHead><TableHead>{t("active")}</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {rules?.map((r) => (
                  <TableRow key={r.id} data-testid={`row-rule-${r.id}`}>
                    <TableCell>{r.name}{!r.tourId && <Badge variant="outline" className="ml-2">{t("pe_global")}</Badge>}</TableCell>
                    <TableCell>{r.marginType === "percentage" ? `${r.marginValue}%` : money(r.marginValue, r.currency)}</TableCell>
                    <TableCell>{r.freePassengerFree} / {r.freePassengerPaying}</TableCell>
                    <TableCell>{t(`pe_rounding_${(r as any).roundingRule ?? "cent"}` as any)}</TableCell>
                    <TableCell><Badge variant={r.isActive ? "default" : "secondary"}>{r.isActive ? t("active") : t("inactive")}</Badge></TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteRule.mutate(r.id)} data-testid={`button-delete-rule-${r.id}`}><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* ---- Airfare rates ---- */}
        <TabsContent value="airfare" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("pe_add_airfare")}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div><Label>{t("pe_origin")}</Label><Input className="w-28" value={newRate.origin} onChange={(e) => setNewRate({ ...newRate, origin: e.target.value })} data-testid="input-origin" /></div>
              <div><Label>{t("pe_destination")}</Label><Input className="w-28" value={newRate.destination} onChange={(e) => setNewRate({ ...newRate, destination: e.target.value })} data-testid="input-destination" /></div>
              <div><Label>{t("pe_rate_per_person")}</Label><Input className="w-28" value={newRate.ratePerPerson} onChange={(e) => setNewRate({ ...newRate, ratePerPerson: e.target.value })} data-testid="input-rate" /></div>
              <div><Label>{t("pe_child_rate")}</Label><Input className="w-28" value={newRate.childRate} onChange={(e) => setNewRate({ ...newRate, childRate: e.target.value })} data-testid="input-child-rate" /></div>
              <div><Label>{t("pe_infant_rate")}</Label><Input className="w-28" value={newRate.infantRate} onChange={(e) => setNewRate({ ...newRate, infantRate: e.target.value })} data-testid="input-infant-rate" /></div>
              <Button onClick={() => addRate.mutate()} disabled={!newRate.origin || !newRate.destination || !newRate.ratePerPerson || addRate.isPending} data-testid="button-add-rate"><Plus className="w-4 h-4 mr-1" />{t("add")}</Button>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("pe_route")}</TableHead><TableHead>{t("pe_rate_per_person")}</TableHead><TableHead>{t("pe_child_rate")}</TableHead><TableHead>{t("pe_infant_rate")}</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {rates?.map((r) => (
                  <TableRow key={r.id} data-testid={`row-rate-${r.id}`}>
                    <TableCell>{r.origin} → {r.destination}</TableCell>
                    <TableCell>{money(r.ratePerPerson, r.currency)}</TableCell>
                    <TableCell>{money(r.childRate, r.currency)}</TableCell>
                    <TableCell>{money(r.infantRate, r.currency)}</TableCell>
                    <TableCell><Button size="icon" variant="ghost" onClick={() => deleteRate.mutate(r.id)} data-testid={`button-delete-rate-${r.id}`}><Trash2 className="w-4 h-4" /></Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* ---- Group size bands ---- */}
        <TabsContent value="bands" className="mt-4">
          <Card><CardContent className="pt-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("pe_band")}</TableHead><TableHead>{t("pe_pax_range")}</TableHead><TableHead>{t("pe_assistance")}</TableHead><TableHead>{t("active")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {bands?.map((b) => (
                  <TableRow key={b.id} data-testid={`row-band-${b.id}`}>
                    <TableCell>{b.label}</TableCell>
                    <TableCell>{b.minPax}–{b.maxPax}</TableCell>
                    <TableCell>{b.assistanceType === "professional_guide" ? t("pe_professional_guide") : t("pe_driver_chaperone")}</TableCell>
                    <TableCell><Switch checked={!!b.isActive} onCheckedChange={(v) => toggleBand.mutate({ id: b.id, isActive: v })} data-testid={`switch-band-${b.id}`} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        {/* ---- Exchange rates ---- */}
        <TabsContent value="fx" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">{t("pe_add_exchange_rate")}</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-3 items-end">
              <div><Label>{t("pe_source_currency")}</Label><Input className="w-24" placeholder="IDR" value={newFx.sourceCurrency} onChange={(e) => setNewFx({ ...newFx, sourceCurrency: e.target.value })} data-testid="input-fx-source" /></div>
              <div><Label>{t("pe_target_currency")}</Label><Input className="w-24" placeholder="USD" value={newFx.targetCurrency} onChange={(e) => setNewFx({ ...newFx, targetCurrency: e.target.value })} data-testid="input-fx-target" /></div>
              <div><Label>{t("pe_fx_rate")}</Label><Input className="w-36" placeholder="0.000061" value={newFx.rate} onChange={(e) => setNewFx({ ...newFx, rate: e.target.value })} data-testid="input-fx-rate" /></div>
              <Button onClick={() => addFx.mutate()} disabled={!newFx.sourceCurrency || !newFx.targetCurrency || !newFx.rate || addFx.isPending} data-testid="button-add-fx"><Plus className="w-4 h-4 mr-1" />{t("add")}</Button>
            </CardContent>
          </Card>
          <Card><CardContent className="pt-4">
            <Table>
              <TableHeader><TableRow>
                <TableHead>{t("pe_currency_pair")}</TableHead><TableHead>{t("pe_fx_rate")}</TableHead><TableHead>{t("active")}</TableHead></TableRow></TableHeader>
              <TableBody>
                {fxRates?.map((r) => (
                  <TableRow key={r.id} data-testid={`row-fx-${r.id}`}>
                    <TableCell>{r.sourceCurrency} → {r.targetCurrency}</TableCell>
                    <TableCell>{r.rate}</TableCell>
                    <TableCell><Switch checked={!!r.isActive} onCheckedChange={(v) => toggleFx.mutate({ id: r.id, isActive: v })} data-testid={`switch-fx-${r.id}`} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>

      {/* ---- Quote builder dialog ---- */}
      <Dialog open={showBuilder} onOpenChange={setShowBuilder}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("pe_new_quote")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-3">
                <Label>{t("tour")}</Label>
                <Select value={tourId} onValueChange={setTourId}>
                  <SelectTrigger data-testid="select-tour"><SelectValue placeholder={t("select_tour")} /></SelectTrigger>
                  <SelectContent>{tours?.map((x) => <SelectItem key={x.id} value={x.id}>{x.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("pe_pax")}</Label><Input type="number" min={1} value={paxCount} onChange={(e) => setPaxCount(e.target.value)} data-testid="input-pax" /></div>
              <div><Label>{t("pe_nights")}</Label><Input type="number" min={0} value={nights} onChange={(e) => setNights(e.target.value)} data-testid="input-nights" /></div>
              <div className="flex items-end pb-2 text-sm text-muted-foreground" data-testid="text-assistance">
                {parseInt(paxCount || "0", 10) >= 16 ? t("pe_professional_guide") : t("pe_driver_chaperone")}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{t("pe_autofill_hint")}</p>
              <Button size="sm" variant="secondary" disabled={!tourId || autoFill.isPending} onClick={() => autoFill.mutate()} data-testid="button-autofill">
                {autoFill.isPending ? t("pe_autofill_loading") : t("pe_autofill")}
              </Button>
            </div>
            {resolveWarnings.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1" data-testid="autofill-warnings">
                <p className="text-xs font-medium">{t("pe_resolve_warnings")}</p>
                {resolveWarnings.map((w, i) => <p key={i} className="text-xs text-muted-foreground">• {w}</p>)}
              </div>
            )}
            <div className="grid grid-cols-4 gap-3">
              <div><Label>{t("pe_transportation")}</Label><Input value={transportationShare} onChange={(e) => setTransportationShare(e.target.value)} data-testid="input-transportation" /></div>
              <div><Label>{t("pe_guide_driver")}</Label><Input value={guideDriverShare} onChange={(e) => setGuideDriverShare(e.target.value)} data-testid="input-guide-driver" /></div>
              <div><Label>{t("pe_sightseeing")}</Label><Input value={sightseeingShare} onChange={(e) => setSightseeingShare(e.target.value)} data-testid="input-sightseeing" /></div>
              <div><Label>{t("pe_airfare")}</Label><Input value={airfarePerPerson} onChange={(e) => setAirfarePerPerson(e.target.value)} data-testid="input-airfare" /></div>
            </div>

            {hotels.map((h, i) => (
              <Card key={i}>
                <CardHeader className="py-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">{t("pe_hotel_choice")} {i + 1}</CardTitle>
                  {hotels.length > 1 && (
                    <Button size="icon" variant="ghost" onClick={() => setHotels(hotels.filter((_, j) => j !== i))} data-testid={`button-remove-hotel-${i}`}><Trash2 className="w-4 h-4" /></Button>
                  )}
                </CardHeader>
                <CardContent className="grid grid-cols-5 gap-3">
                  <div><Label>{t("hotel")}</Label><Input value={h.hotelName} onChange={(e) => setHotels(hotels.map((x, j) => j === i ? { ...x, hotelName: e.target.value } : x))} data-testid={`input-hotel-name-${i}`} /></div>
                  {OCCUPANCIES.map((o) => (
                    <div key={o}>
                      <Label>{t(`pe_${o}` as any)}</Label>
                      <Input placeholder="—" value={h.rates[o]} onChange={(e) => setHotels(hotels.map((x, j) => j === i ? { ...x, rates: { ...x.rates, [o]: e.target.value } } : x))} data-testid={`input-rate-${i}-${o}`} />
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
            {hotels.length < 3 && (
              <Button variant="outline" size="sm" onClick={() => setHotels([...hotels, emptyHotel()])} data-testid="button-add-hotel">
                <Plus className="w-4 h-4 mr-1" />{t("pe_add_hotel_choice")}
              </Button>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowBuilder(false)}>{t("cancel")}</Button>
              <Button onClick={() => createQuote.mutate()} disabled={!tourId || createQuote.isPending} data-testid="button-create-quote">
                <Calculator className="w-4 h-4 mr-1" />{t("pe_calculate_save")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ---- Internal breakdown dialog ---- */}
      <Dialog open={!!breakdownId} onOpenChange={(o) => !o && setBreakdownId(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t("pe_internal_breakdown")}</DialogTitle></DialogHeader>
          {!breakdown ? <Skeleton className="h-40 w-full" /> : (
            <div className="space-y-4" data-testid="breakdown-content">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-muted-foreground">{t("pe_total_group_cost")}</div><div className="font-semibold">{money(breakdown.totalGroupCost, breakdown.currency)}</div></div>
                <div><div className="text-muted-foreground">{t("pe_base_cost_pp")}</div><div className="font-semibold">{money(breakdown.baseCostPerPerson, breakdown.currency)}</div></div>
                <div><div className="text-muted-foreground">{t("pe_margin")}</div><div className="font-semibold">{breakdown.marginType === "percentage" ? `${breakdown.marginValue}%` : money(breakdown.marginValue, breakdown.currency)}</div></div>
                <div><div className="text-muted-foreground">{t("pe_free_adjustment")}</div><div className="font-semibold">× {breakdown.freeAdjustmentFactor}</div></div>
                <div><div className="text-muted-foreground">{t("pe_transportation")}</div><div>{money(breakdown.transportationShare, breakdown.currency)}</div></div>
                <div><div className="text-muted-foreground">{t("pe_guide_driver")}</div><div>{money(breakdown.guideDriverShare, breakdown.currency)}</div></div>
                <div><div className="text-muted-foreground">{t("pe_sightseeing")}</div><div>{money(breakdown.sightseeingShare, breakdown.currency)}</div></div>
                <div><div className="text-muted-foreground">{t("pe_airfare")}</div><div>{money(breakdown.airfarePerPerson, breakdown.currency)}</div></div>
              </div>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("hotel")}</TableHead><TableHead>{t("pe_occupancy")}</TableHead><TableHead>{t("pe_base_cost")}</TableHead><TableHead>{t("pe_margin")}</TableHead><TableHead>{t("pe_free_adjustment")}</TableHead><TableHead>{t("pe_selling_price")}</TableHead><TableHead /></TableRow></TableHeader>
                <TableBody>
                  {breakdown.lineItems?.map((li) => (
                    <TableRow key={li.id} data-testid={`row-line-item-${li.id}`}>
                      <TableCell>{li.hotelName ?? `#${li.hotelChoice}`}</TableCell>
                      <TableCell>{t(`pe_${li.occupancy}` as any)}</TableCell>
                      <TableCell>{money(li.baseCost, breakdown.currency)}</TableCell>
                      <TableCell>{money(li.marginAmount, breakdown.currency)}</TableCell>
                      <TableCell>{money(li.freeAdjustmentAmount, breakdown.currency)}</TableCell>
                      <TableCell className="font-semibold">{money(li.sellingPrice, breakdown.currency)}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="ghost" onClick={() => { setOverrideLi(li); setOverrideValue(li.sellingPrice); setOverrideReason(""); }} data-testid={`button-override-${li.id}`}>
                          {t("pe_override")}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {overrideLi && (
                <div className="rounded-md border p-3 flex flex-wrap items-end gap-3" data-testid="override-form">
                  <div className="text-sm font-medium w-full">{t("pe_override")}: {overrideLi.hotelName ?? `#${overrideLi.hotelChoice}`} · {t(`pe_${overrideLi.occupancy}` as any)}</div>
                  <div><Label>{t("pe_override_value")}</Label><Input className="w-32" value={overrideValue} onChange={(e) => setOverrideValue(e.target.value)} data-testid="input-override-value" /></div>
                  <div className="flex-1 min-w-48"><Label>{t("pe_override_reason")}</Label><Input value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} data-testid="input-override-reason" /></div>
                  <Button size="sm" onClick={() => applyOverride.mutate()} disabled={!overrideValue || overrideReason.trim().length < 5 || applyOverride.isPending} data-testid="button-apply-override">{t("apply")}</Button>
                  <Button size="sm" variant="outline" onClick={() => setOverrideLi(null)}>{t("cancel")}</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
