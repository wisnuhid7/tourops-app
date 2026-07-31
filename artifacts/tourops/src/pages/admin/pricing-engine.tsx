import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Pencil, Calculator, Users, TrendingUp, Plane, FileText,
  ChevronDown, ChevronUp, DollarSign, Eye
} from "lucide-react";
import { useLanguage } from "@/hooks/use-language";

// ── Types ────────────────────────────────────────────────────────────────────

interface GroupSizeBand {
  id: string; label: string; minPax: number; maxPax: number;
  sortOrder: number; isActive: boolean;
}

interface PricingRule {
  id: string; name: string; tourId: string | null;
  marginType: "fixed" | "percentage"; marginValue: string;
  freePassengerPaying: number; freePassengerFree: number;
  currency: string; isActive: boolean; createdAt: string;
}

interface AirfareRate {
  id: string; origin: string; destination: string;
  ratePerPerson: string; currency: string; isActive: boolean;
  validFrom: string | null; validTo: string | null;
}

interface PricingQuote {
  id: string; tourId: string; paxCount: number; nights: number;
  currency: string; status: "draft" | "final" | "archived";
  assistanceType: string; baseCostPerPerson: string;
  totalGroupCost: string; marginType: string; marginValue: string;
  freeAdjustmentFactor: string; transportationShare: string;
  guideDriverShare: string; sightseeingShare: string; airfarePerPerson: string;
  notes: string | null; customerId: string | null; shareToken: string | null;
  createdAt: string;
}

interface QuoteInternal extends PricingQuote {
  groupSizeBand: { label: string } | null;
  lineItems: Array<{
    hotelChoice: number; hotelName: string | null; occupancy: string;
    hotelNightlyRate: string; hotelCostTotal: string; baseCost: string;
    marginAmount: string; freeAdjustmentAmount: string; sellingPrice: string;
  }>;
}

interface Tour { id: string; name: string; }

// ── Helper ───────────────────────────────────────────────────────────────────

function fmt(v: string | number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(v));
}

// ── Group Size Bands Tab ──────────────────────────────────────────────────────

function BandsTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [form, setForm] = useState({ label: "", minPax: "2", maxPax: "10", sortOrder: "0" });
  const [editing, setEditing] = useState<GroupSizeBand | null>(null);

  const { data: bands = [] } = useQuery<GroupSizeBand[]>({ queryKey: ["/api/pricing/group-size-bands"] });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pricing/group-size-bands", {
      label: form.label, minPax: Number(form.minPax), maxPax: Number(form.maxPax), sortOrder: Number(form.sortOrder),
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/group-size-bands"] }); toast({ title: t("success"), description: t("pe_band_created") }); setForm({ label: "", minPax: "2", maxPax: "10", sortOrder: "0" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (b: GroupSizeBand) => apiRequest("PATCH", `/api/pricing/group-size-bands/${b.id}`, { label: b.label, minPax: b.minPax, maxPax: b.maxPax, sortOrder: b.sortOrder, isActive: b.isActive }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/group-size-bands"] }); setEditing(null); toast({ title: t("success"), description: t("pe_band_updated") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pricing/group-size-bands/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/group-size-bands"] }); toast({ title: t("deleted"), description: t("pe_band_deleted") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = (b: GroupSizeBand) => updateMut.mutate({ ...b, isActive: !b.isActive });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />{t("pe_add_band")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <Label>{t("pe_band_label")}</Label>
              <Input placeholder="16-25" value={form.label} onChange={e => setForm(p => ({ ...p, label: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_min_pax")}</Label>
              <Input type="number" min={1} value={form.minPax} onChange={e => setForm(p => ({ ...p, minPax: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_max_pax")}</Label>
              <Input type="number" min={1} value={form.maxPax} onChange={e => setForm(p => ({ ...p, maxPax: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_sort_order")}</Label>
              <Input type="number" min={0} value={form.sortOrder} onChange={e => setForm(p => ({ ...p, sortOrder: e.target.value }))} />
            </div>
          </div>
          <Button className="mt-4" onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.label}>
            <Plus className="w-4 h-4 mr-2" />{t("pe_add_band")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("pe_bands_list")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pe_band_label")}</TableHead>
                <TableHead>{t("pe_min_pax")}</TableHead>
                <TableHead>{t("pe_max_pax")}</TableHead>
                <TableHead>{t("pe_sort_order")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bands.map(b => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">{b.label}</TableCell>
                  <TableCell>{b.minPax}</TableCell>
                  <TableCell>{b.maxPax}</TableCell>
                  <TableCell>{b.sortOrder}</TableCell>
                  <TableCell>
                    <Switch checked={b.isActive} onCheckedChange={() => toggleActive(b)} />
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-2">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(b)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(b.id)} disabled={deleteMut.isPending}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {bands.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t("pe_no_bands")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("pe_edit_band")}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>{t("pe_band_label")}</Label>
                <Input value={editing.label} onChange={e => setEditing(p => p && ({ ...p, label: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_min_pax")}</Label>
                <Input type="number" value={editing.minPax} onChange={e => setEditing(p => p && ({ ...p, minPax: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_max_pax")}</Label>
                <Input type="number" value={editing.maxPax} onChange={e => setEditing(p => p && ({ ...p, maxPax: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_sort_order")}</Label>
                <Input type="number" value={editing.sortOrder} onChange={e => setEditing(p => p && ({ ...p, sortOrder: Number(e.target.value) }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            <Button onClick={() => editing && updateMut.mutate(editing)} disabled={updateMut.isPending}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Pricing Rules Tab ─────────────────────────────────────────────────────────

function RulesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [form, setForm] = useState({
    name: "", marginType: "percentage" as "fixed" | "percentage",
    marginValue: "20", freePassengerPaying: "3", freePassengerFree: "1",
    currency: "USD", tourId: "",
  });
  const [editing, setEditing] = useState<PricingRule | null>(null);

  const { data: rules = [] } = useQuery<PricingRule[]>({ queryKey: ["/api/pricing/rules"] });
  const { data: tours = [] } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pricing/rules", {
      name: form.name, marginType: form.marginType, marginValue: form.marginValue,
      freePassengerPaying: Number(form.freePassengerPaying),
      freePassengerFree: Number(form.freePassengerFree),
      currency: form.currency, tourId: form.tourId || null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/rules"] }); toast({ title: t("success"), description: t("pe_rule_created") }); setForm({ name: "", marginType: "percentage", marginValue: "20", freePassengerPaying: "3", freePassengerFree: "1", currency: "USD", tourId: "" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (r: PricingRule) => apiRequest("PATCH", `/api/pricing/rules/${r.id}`, {
      name: r.name, marginType: r.marginType, marginValue: r.marginValue,
      freePassengerPaying: r.freePassengerPaying, freePassengerFree: r.freePassengerFree,
      currency: r.currency, isActive: r.isActive,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/rules"] }); setEditing(null); toast({ title: t("success"), description: t("pe_rule_updated") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pricing/rules/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/rules"] }); toast({ title: t("deleted"), description: t("pe_rule_deleted") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />{t("pe_add_rule")}</CardTitle><CardDescription>{t("pe_rule_desc")}</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>{t("pe_rule_name")}</Label>
              <Input placeholder="Standard 2025" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_margin_type")}</Label>
              <Select value={form.marginType} onValueChange={v => setForm(p => ({ ...p, marginType: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">{t("pe_margin_percentage")}</SelectItem>
                  <SelectItem value="fixed">{t("pe_margin_fixed")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("pe_margin_value")} {form.marginType === "percentage" ? "(%)" : "(amount)"}</Label>
              <Input type="number" min={0} step="0.01" value={form.marginValue} onChange={e => setForm(p => ({ ...p, marginValue: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_free_paying")}</Label>
              <Input type="number" min={1} value={form.freePassengerPaying} onChange={e => setForm(p => ({ ...p, freePassengerPaying: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_free_free")}</Label>
              <Input type="number" min={0} value={form.freePassengerFree} onChange={e => setForm(p => ({ ...p, freePassengerFree: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("currency")}</Label>
              <Input placeholder="USD" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} />
            </div>
            <div className="space-y-1 md:col-span-3">
              <Label>{t("pe_rule_tour")} <span className="text-muted-foreground text-xs">({t("pe_optional")})</span></Label>
              <Select value={form.tourId || "global"} onValueChange={v => setForm(p => ({ ...p, tourId: v === "global" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder={t("pe_global_rule")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">{t("pe_global_rule")}</SelectItem>
                  {tours.map(tour => <SelectItem key={tour.id} value={tour.id}>{tour.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name}>
            <Plus className="w-4 h-4 mr-2" />{t("pe_add_rule")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("pe_rules_list")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pe_rule_name")}</TableHead>
                <TableHead>{t("pe_margin_type")}</TableHead>
                <TableHead>{t("pe_margin_value")}</TableHead>
                <TableHead>{t("pe_free_policy")}</TableHead>
                <TableHead>{t("currency")}</TableHead>
                <TableHead>{t("scope")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rules.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="capitalize">{r.marginType}</TableCell>
                  <TableCell>{r.marginType === "percentage" ? `${r.marginValue}%` : r.marginValue}</TableCell>
                  <TableCell>{r.freePassengerFree} free / {r.freePassengerPaying} paying</TableCell>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell>
                    {r.tourId ? (
                      <Badge variant="outline">{tours.find(t2 => t2.id === r.tourId)?.name ?? r.tourId.slice(0, 8)}</Badge>
                    ) : <Badge>{t("pe_global_rule")}</Badge>}
                  </TableCell>
                  <TableCell>
                    <Switch checked={r.isActive} onCheckedChange={checked => updateMut.mutate({ ...r, isActive: checked })} />
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-2">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(r.id)} disabled={deleteMut.isPending}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {rules.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("pe_no_rules")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("pe_edit_rule")}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1">
                <Label>{t("pe_rule_name")}</Label>
                <Input value={editing.name} onChange={e => setEditing(p => p && ({ ...p, name: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_margin_type")}</Label>
                <Select value={editing.marginType} onValueChange={v => setEditing(p => p && ({ ...p, marginType: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">{t("pe_margin_percentage")}</SelectItem>
                    <SelectItem value="fixed">{t("pe_margin_fixed")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t("pe_margin_value")}</Label>
                <Input type="number" value={editing.marginValue} onChange={e => setEditing(p => p && ({ ...p, marginValue: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_free_paying")}</Label>
                <Input type="number" value={editing.freePassengerPaying} onChange={e => setEditing(p => p && ({ ...p, freePassengerPaying: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_free_free")}</Label>
                <Input type="number" value={editing.freePassengerFree} onChange={e => setEditing(p => p && ({ ...p, freePassengerFree: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("currency")}</Label>
                <Input value={editing.currency} onChange={e => setEditing(p => p && ({ ...p, currency: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            <Button onClick={() => editing && updateMut.mutate(editing)} disabled={updateMut.isPending}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Airfare Rates Tab ─────────────────────────────────────────────────────────

function AirfareTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [form, setForm] = useState({ origin: "", destination: "", ratePerPerson: "", currency: "USD", validFrom: "", validTo: "" });
  const [editing, setEditing] = useState<AirfareRate | null>(null);

  const { data: rates = [] } = useQuery<AirfareRate[]>({ queryKey: ["/api/pricing/airfare-rates"] });

  const createMut = useMutation({
    mutationFn: () => apiRequest("POST", "/api/pricing/airfare-rates", {
      origin: form.origin, destination: form.destination, ratePerPerson: form.ratePerPerson,
      currency: form.currency, validFrom: form.validFrom || null, validTo: form.validTo || null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/airfare-rates"] }); toast({ title: t("success"), description: t("pe_airfare_created") }); setForm({ origin: "", destination: "", ratePerPerson: "", currency: "USD", validFrom: "", validTo: "" }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMut = useMutation({
    mutationFn: (r: AirfareRate) => apiRequest("PATCH", `/api/pricing/airfare-rates/${r.id}`, {
      origin: r.origin, destination: r.destination, ratePerPerson: r.ratePerPerson,
      currency: r.currency, isActive: r.isActive,
      validFrom: r.validFrom || null, validTo: r.validTo || null,
    }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/airfare-rates"] }); setEditing(null); toast({ title: t("success"), description: t("pe_airfare_updated") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pricing/airfare-rates/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/airfare-rates"] }); toast({ title: t("deleted"), description: t("pe_airfare_deleted") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="w-4 h-4" />{t("pe_add_airfare")}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="space-y-1">
              <Label>{t("pe_origin")}</Label>
              <Input placeholder="CGK" value={form.origin} onChange={e => setForm(p => ({ ...p, origin: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_destination")}</Label>
              <Input placeholder="JFK" value={form.destination} onChange={e => setForm(p => ({ ...p, destination: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_rate_per_person")}</Label>
              <Input type="number" min={0} step="0.01" placeholder="500.00" value={form.ratePerPerson} onChange={e => setForm(p => ({ ...p, ratePerPerson: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("currency")}</Label>
              <Input placeholder="USD" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("valid_from_label")}</Label>
              <Input type="date" value={form.validFrom} onChange={e => setForm(p => ({ ...p, validFrom: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("valid_to_label")}</Label>
              <Input type="date" value={form.validTo} onChange={e => setForm(p => ({ ...p, validTo: e.target.value }))} />
            </div>
          </div>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.origin || !form.destination || !form.ratePerPerson}>
            <Plus className="w-4 h-4 mr-2" />{t("pe_add_airfare")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t("pe_airfare_list")}</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("pe_origin")}</TableHead>
                <TableHead>{t("pe_destination")}</TableHead>
                <TableHead>{t("pe_rate_per_person")}</TableHead>
                <TableHead>{t("currency")}</TableHead>
                <TableHead>{t("valid_from_label")}</TableHead>
                <TableHead>{t("valid_to_label")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="text-right">{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map(r => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono font-bold">{r.origin}</TableCell>
                  <TableCell className="font-mono font-bold">{r.destination}</TableCell>
                  <TableCell>{fmt(r.ratePerPerson, r.currency)}</TableCell>
                  <TableCell>{r.currency}</TableCell>
                  <TableCell>{r.validFrom ? new Date(r.validFrom).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>{r.validTo ? new Date(r.validTo).toLocaleDateString() : "—"}</TableCell>
                  <TableCell>
                    <Switch checked={r.isActive} onCheckedChange={checked => updateMut.mutate({ ...r, isActive: checked })} />
                  </TableCell>
                  <TableCell className="text-right flex justify-end gap-2">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(r)}><Pencil className="w-4 h-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => deleteMut.mutate(r.id)} disabled={deleteMut.isPending}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
              {rates.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("pe_no_airfares")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={o => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("pe_edit_airfare")}</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("pe_origin")}</Label>
                <Input value={editing.origin} onChange={e => setEditing(p => p && ({ ...p, origin: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_destination")}</Label>
                <Input value={editing.destination} onChange={e => setEditing(p => p && ({ ...p, destination: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_rate_per_person")}</Label>
                <Input type="number" value={editing.ratePerPerson} onChange={e => setEditing(p => p && ({ ...p, ratePerPerson: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("currency")}</Label>
                <Input value={editing.currency} onChange={e => setEditing(p => p && ({ ...p, currency: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("valid_from_label")}</Label>
                <Input type="date" value={editing.validFrom?.slice(0, 10) ?? ""} onChange={e => setEditing(p => p && ({ ...p, validFrom: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("valid_to_label")}</Label>
                <Input type="date" value={editing.validTo?.slice(0, 10) ?? ""} onChange={e => setEditing(p => p && ({ ...p, validTo: e.target.value }))} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>{t("cancel")}</Button>
            <Button onClick={() => editing && updateMut.mutate(editing)} disabled={updateMut.isPending}>{t("save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Quote Create Form ─────────────────────────────────────────────────────────

type HotelInput = {
  hotelChoice: 1 | 2 | 3;
  hotelName: string;
  rates: { double: string; single: string; third_person: string; child: string };
};

const emptyHotel = (choice: 1 | 2 | 3): HotelInput => ({
  hotelChoice: choice,
  hotelName: "",
  rates: { double: "", single: "", third_person: "", child: "" },
});

function CreateQuoteDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: (q: any) => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [form, setForm] = useState({
    tourId: "", paxCount: "10", nights: "7", currency: "USD", notes: "",
    transportationShare: "0", guideDriverShare: "0", sightseeingShare: "0", airfarePerPerson: "0",
  });
  const [hotels, setHotels] = useState<HotelInput[]>([emptyHotel(1)]);

  const { data: tours = [] } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });
  const { data: rules = [] } = useQuery<PricingRule[]>({ queryKey: ["/api/pricing/rules"] });

  const createMut = useMutation({
    mutationFn: async () => {
      const payload = {
        tourId: form.tourId,
        paxCount: Number(form.paxCount),
        nights: Number(form.nights),
        currency: form.currency || undefined,
        notes: form.notes || undefined,
        components: {
          transportationShare: form.transportationShare || "0",
          guideDriverShare: form.guideDriverShare || "0",
          sightseeingShare: form.sightseeingShare || "0",
          airfarePerPerson: form.airfarePerPerson || "0",
        },
        hotels: hotels.map(h => ({
          hotelChoice: h.hotelChoice,
          hotelName: h.hotelName || undefined,
          nightlyRates: Object.fromEntries(
            Object.entries(h.rates).filter(([, v]) => v !== "")
          ),
        })),
      };
      const res = await apiRequest("POST", "/api/pricing/quotes", payload);
      const created = await res.json() as { id: string };
      // Fetch full internal breakdown so the caller gets a QuoteInternal object
      const internalRes = await apiRequest("GET", `/api/pricing/quotes/${created.id}/internal`);
      return internalRes.json() as Promise<QuoteInternal>;
    },
    onSuccess: (data: QuoteInternal) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing/quotes"] });
      toast({ title: t("success"), description: t("pe_quote_created") });
      onCreated(data);
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const addHotel = () => {
    if (hotels.length < 3) {
      const next = (hotels.length + 1) as 1 | 2 | 3;
      setHotels(prev => [...prev, emptyHotel(next)]);
    }
  };

  const removeHotel = (idx: number) => {
    setHotels(prev => prev.filter((_, i) => i !== idx).map((h, i) => ({ ...h, hotelChoice: (i + 1) as 1 | 2 | 3 })));
  };

  const updateHotelRate = (idx: number, occ: string, val: string) => {
    setHotels(prev => prev.map((h, i) => i === idx ? { ...h, rates: { ...h.rates, [occ]: val } } : h));
  };

  const activeRules = (rules as PricingRule[]).filter(r => r.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calculator className="w-5 h-5" />{t("pe_create_quote")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Basic */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1">
              <Label>{t("tour")}</Label>
              <Select value={form.tourId} onValueChange={v => setForm(p => ({ ...p, tourId: v }))}>
                <SelectTrigger><SelectValue placeholder={t("pe_select_tour")} /></SelectTrigger>
                <SelectContent>
                  {tours.map(tour => <SelectItem key={tour.id} value={tour.id}>{tour.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{t("pe_pax_count")}</Label>
              <Input type="number" min={1} value={form.paxCount} onChange={e => setForm(p => ({ ...p, paxCount: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("pe_nights")}</Label>
              <Input type="number" min={0} value={form.nights} onChange={e => setForm(p => ({ ...p, nights: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>{t("currency")}</Label>
              <Input placeholder="USD" value={form.currency} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} />
            </div>
          </div>

          {/* Cost components */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{t("pe_cost_components")}</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{t("pe_transportation_share")}</Label>
                <Input type="number" min={0} step="0.01" value={form.transportationShare} onChange={e => setForm(p => ({ ...p, transportationShare: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_guide_driver_share")}</Label>
                <Input type="number" min={0} step="0.01" value={form.guideDriverShare} onChange={e => setForm(p => ({ ...p, guideDriverShare: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_sightseeing_share")}</Label>
                <Input type="number" min={0} step="0.01" value={form.sightseeingShare} onChange={e => setForm(p => ({ ...p, sightseeingShare: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>{t("pe_airfare_per_person")}</Label>
                <Input type="number" min={0} step="0.01" value={form.airfarePerPerson} onChange={e => setForm(p => ({ ...p, airfarePerPerson: e.target.value }))} />
              </div>
            </CardContent>
          </Card>

          {/* Hotel choices */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">{t("pe_hotel_choices")}</Label>
              {hotels.length < 3 && <Button size="sm" variant="outline" onClick={addHotel}><Plus className="w-4 h-4 mr-1" />{t("pe_add_hotel")}</Button>}
            </div>
            {hotels.map((h, idx) => (
              <Card key={idx} className="border-dashed">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">{t("pe_hotel_choice")} {h.hotelChoice}</CardTitle>
                  {hotels.length > 1 && <Button size="icon" variant="ghost" onClick={() => removeHotel(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1">
                    <Label>{t("hotel_name")} <span className="text-muted-foreground text-xs">({t("pe_optional")})</span></Label>
                    <Input placeholder="Grand Hotel" value={h.hotelName} onChange={e => setHotels(prev => prev.map((p2, i) => i === idx ? { ...p2, hotelName: e.target.value } : p2))} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(["double", "single", "third_person", "child"] as const).map(occ => (
                      <div key={occ} className="space-y-1">
                        <Label className="capitalize">{t(`pe_occ_${occ}`)}</Label>
                        <Input type="number" min={0} step="0.01" placeholder="0.00" value={h.rates[occ]} onChange={e => updateHotelRate(idx, occ, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label>{t("pe_notes")}</Label>
            <Textarea rows={2} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          {activeRules.length === 0 && (
            <p className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md">{t("pe_no_active_rule_warning")}</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("cancel")}</Button>
          <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.tourId}>
            <Calculator className="w-4 h-4 mr-2" />{createMut.isPending ? t("pe_computing") : t("pe_compute_quote")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Quote Internal Breakdown ──────────────────────────────────────────────────

function QuoteBreakdown({ quote, onClose }: { quote: QuoteInternal; onClose: () => void }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const currency = quote.currency || "USD";

  const patchMut = useMutation({
    mutationFn: (data: { status?: string; notes?: string | null }) => apiRequest("PATCH", `/api/pricing/quotes/${quote.id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/pricing/quotes"] }); toast({ title: t("success"), description: t("pe_quote_updated") }); },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  // group line items by hotel choice
  const byHotel = quote.lineItems.reduce<Record<number, typeof quote.lineItems>>((acc, li) => {
    acc[li.hotelChoice] ??= [];
    acc[li.hotelChoice].push(li);
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onClose}>← {t("pe_back_to_quotes")}</Button>
        <div className="flex items-center gap-2">
          <Select value={quote.status} onValueChange={v => patchMut.mutate({ status: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="draft">{t("pe_status_draft")}</SelectItem>
              <SelectItem value="final">{t("pe_status_final")}</SelectItem>
              <SelectItem value="archived">{t("pe_status_archived")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_pax_count")}</p><p className="text-2xl font-bold">{quote.paxCount}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_nights")}</p><p className="text-2xl font-bold">{quote.nights}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_assistance_type")}</p><p className="text-sm font-bold capitalize">{quote.assistanceType.replace("_", " ")}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_band")}</p><p className="text-sm font-bold">{quote.groupSizeBand?.label ?? "—"}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_base_cost_pp")}</p><p className="text-xl font-bold text-blue-600">{fmt(quote.baseCostPerPerson, currency)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_total_group_cost")}</p><p className="text-xl font-bold text-blue-600">{fmt(quote.totalGroupCost, currency)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_margin")}</p><p className="text-sm font-bold">{quote.marginType === "percentage" ? `${quote.marginValue}%` : fmt(quote.marginValue, currency)}</p></CardContent></Card>
        <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground uppercase tracking-wide">{t("pe_free_factor")}</p><p className="text-sm font-bold">×{Number(quote.freeAdjustmentFactor).toFixed(4)}</p></CardContent></Card>
      </div>

      {/* Cost components */}
      <Card>
        <CardHeader><CardTitle className="text-sm">{t("pe_cost_components")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div><p className="text-xs text-muted-foreground">{t("pe_transportation_share")}</p><p className="font-semibold">{fmt(quote.transportationShare, currency)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("pe_guide_driver_share")}</p><p className="font-semibold">{fmt(quote.guideDriverShare, currency)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("pe_sightseeing_share")}</p><p className="font-semibold">{fmt(quote.sightseeingShare, currency)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t("pe_airfare_per_person")}</p><p className="font-semibold">{fmt(quote.airfarePerPerson, currency)}</p></div>
          </div>
        </CardContent>
      </Card>

      {/* Line items by hotel */}
      {Object.entries(byHotel).map(([choice, items]) => (
        <Card key={choice}>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              {t("pe_hotel_choice")} {choice}
              {items[0]?.hotelName && <span className="font-normal text-muted-foreground">— {items[0].hotelName}</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("pe_occupancy")}</TableHead>
                  <TableHead>{t("pe_nightly_rate")}</TableHead>
                  <TableHead>{t("pe_hotel_total")}</TableHead>
                  <TableHead>{t("pe_base_cost")}</TableHead>
                  <TableHead>{t("pe_margin_amount")}</TableHead>
                  <TableHead>{t("pe_free_adj")}</TableHead>
                  <TableHead className="font-bold">{t("pe_selling_price")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((li, i) => (
                  <TableRow key={i}>
                    <TableCell className="capitalize">{li.occupancy.replace("_", " ")}</TableCell>
                    <TableCell>{fmt(li.hotelNightlyRate, currency)}</TableCell>
                    <TableCell>{fmt(li.hotelCostTotal, currency)}</TableCell>
                    <TableCell>{fmt(li.baseCost, currency)}</TableCell>
                    <TableCell className="text-green-600">+{fmt(li.marginAmount, currency)}</TableCell>
                    <TableCell className="text-amber-600">+{fmt(li.freeAdjustmentAmount, currency)}</TableCell>
                    <TableCell className="font-bold text-primary">{fmt(li.sellingPrice, currency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ── Quotes Tab ────────────────────────────────────────────────────────────────

function QuotesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [viewingQuote, setViewingQuote] = useState<QuoteInternal | null>(null);

  const { data: quotes = [], isLoading } = useQuery<PricingQuote[]>({ queryKey: ["/api/pricing/quotes"] });
  const { data: tours = [] } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });

  const loadInternal = async (q: PricingQuote) => {
    try {
      const res = await apiRequest("GET", `/api/pricing/quotes/${q.id}/internal`);
      const data: QuoteInternal = await res.json();
      setViewingQuote(data);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const patchMut = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/pricing/quotes/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/pricing/quotes"] }),
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  if (viewingQuote) {
    return <QuoteBreakdown quote={viewingQuote} onClose={() => setViewingQuote(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setShowCreate(true)}><Calculator className="w-4 h-4 mr-2" />{t("pe_create_quote")}</Button>
      </div>

      <Card>
        <CardHeader><CardTitle>{t("pe_quotes_list")}</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-center py-8 text-muted-foreground">{t("loading")}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("tour")}</TableHead>
                  <TableHead>{t("pe_pax_count")}</TableHead>
                  <TableHead>{t("pe_nights")}</TableHead>
                  <TableHead>{t("pe_total_group_cost")}</TableHead>
                  <TableHead>{t("pe_base_cost_pp")}</TableHead>
                  <TableHead>{t("status")}</TableHead>
                  <TableHead>{t("date")}</TableHead>
                  <TableHead className="text-right">{t("actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotes.map(q => (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">{tours.find(t2 => t2.id === q.tourId)?.name ?? q.tourId.slice(0, 8)}</TableCell>
                    <TableCell>{q.paxCount}</TableCell>
                    <TableCell>{q.nights}</TableCell>
                    <TableCell className="font-semibold text-blue-600">{fmt(q.totalGroupCost, q.currency)}</TableCell>
                    <TableCell>{fmt(q.baseCostPerPerson, q.currency)}</TableCell>
                    <TableCell>
                      <Select value={q.status} onValueChange={v => patchMut.mutate({ id: q.id, status: v })}>
                        <SelectTrigger className="w-28 h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">{t("pe_status_draft")}</SelectItem>
                          <SelectItem value="final">{t("pe_status_final")}</SelectItem>
                          <SelectItem value="archived">{t("pe_status_archived")}</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">{new Date(q.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" variant="outline" onClick={() => loadInternal(q)}>
                        <Eye className="w-4 h-4 mr-1" />{t("pe_view_breakdown")}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {quotes.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">{t("pe_no_quotes")}</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateQuoteDialog open={showCreate} onOpenChange={setShowCreate} onCreated={q => setViewingQuote(q)} />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function PricingEngine() {
  const { t } = useLanguage();

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("pe_title")}</h1>
          <p className="text-muted-foreground">{t("pe_subtitle")}</p>
        </div>

        <Tabs defaultValue="quotes">
          <TabsList className="mb-6">
            <TabsTrigger value="quotes" className="flex items-center gap-2"><FileText className="w-4 h-4" />{t("pe_tab_quotes")}</TabsTrigger>
            <TabsTrigger value="rules" className="flex items-center gap-2"><TrendingUp className="w-4 h-4" />{t("pe_tab_rules")}</TabsTrigger>
            <TabsTrigger value="bands" className="flex items-center gap-2"><Users className="w-4 h-4" />{t("pe_tab_bands")}</TabsTrigger>
            <TabsTrigger value="airfare" className="flex items-center gap-2"><Plane className="w-4 h-4" />{t("pe_tab_airfare")}</TabsTrigger>
          </TabsList>
          <TabsContent value="quotes"><QuotesTab /></TabsContent>
          <TabsContent value="rules"><RulesTab /></TabsContent>
          <TabsContent value="bands"><BandsTab /></TabsContent>
          <TabsContent value="airfare"><AirfareTab /></TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
