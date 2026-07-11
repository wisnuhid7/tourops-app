import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Upload, Pencil, Trash2, CheckCircle, Archive, Hotel, Bus, Users, Ticket,
} from "lucide-react";
import type { HotelRate, TransportRate, GuideRate, SightsRate } from "@shared/schema";
import * as XLSX from "xlsx";
import { useLanguage } from "@/hooks/use-language";

type RateStatus = "draft" | "active" | "archived";

function StatusBadge({ status }: { status: RateStatus | null }) {
  const { t } = useLanguage();
  if (status === "active") return <Badge variant="default" data-testid="badge-status-active">{t("status_active")}</Badge>;
  if (status === "archived") return <Badge variant="secondary" data-testid="badge-status-archived">{t("status_archived")}</Badge>;
  return <Badge variant="outline" className="border-yellow-500 text-yellow-700 dark:text-yellow-400" data-testid="badge-status-draft">{t("status_draft")}</Badge>;
}

function StatusFilter({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useLanguage();
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-36" data-testid="select-status-filter">
        <SelectValue placeholder={t("filter_status_placeholder")} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("all_label")}</SelectItem>
        <SelectItem value="draft">{t("status_draft")}</SelectItem>
        <SelectItem value="active">{t("status_active")}</SelectItem>
        <SelectItem value="archived">{t("status_archived")}</SelectItem>
      </SelectContent>
    </Select>
  );
}

function DeleteConfirmDialog({
  open, onOpenChange, onConfirm, isPending,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; onConfirm: () => void; isPending: boolean;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("delete_rate")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("delete_rate_confirm")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-delete">{t("cancel")}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending} data-testid="button-confirm-delete">
            {isPending ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkUploadDialog({
  open, onOpenChange, sheetName, headerMapping, nameField, apiPath, queryKey,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sheetName: string;
  headerMapping: Record<string, { field: string; transform?: (v: any) => any }>;
  nameField: string;
  apiPath: string;
  queryKey: string;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [fileName, setFileName] = useState("");

  const bulkMutation = useMutation({
    mutationFn: (data: any[]) => apiRequest("POST", `${apiPath}/bulk`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
      toast({ title: t("bulk_upload_successful") });
      setRows([]);
      setFileName("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = evt.target?.result;
      const workbook = XLSX.read(data, { type: "array" });
      const sheet = workbook.Sheets[sheetName] || workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) { toast({ title: t("sheet_not_found"), variant: "destructive" }); return; }
      const raw: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const mapped = raw.map((row) => {
        const obj: Record<string, any> = {};
        for (const [header, config] of Object.entries(headerMapping)) {
          const val = row[header];
          if (val !== undefined && val !== "") {
            obj[config.field] = config.transform ? config.transform(val) : val;
          }
        }
        return obj;
      }).filter((r) => r[nameField] && String(r[nameField]).trim() !== "");
      setRows(mapped);
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setRows([]); setFileName(""); } }}>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("bulk_upload_rates")}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("select_excel_file")}</Label>
            <Input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFile}
              data-testid="input-bulk-file"
            />
          </div>
          {fileName && (
            <p className="text-sm text-muted-foreground" data-testid="text-bulk-file-name">
              {t("file_label")} {fileName}
            </p>
          )}
          {rows.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-bulk-row-count">
              {rows.length} {t("rows_found_ready")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-bulk">{t("cancel")}</Button>
          <Button
            onClick={() => bulkMutation.mutate(rows)}
            disabled={rows.length === 0 || bulkMutation.isPending}
            data-testid="button-confirm-bulk"
          >
            {bulkMutation.isPending ? t("uploading") : `${t("upload_action")} ${rows.length} ${t("rows_label")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const toStr = (v: any) => String(v);
const toBool = (v: any) => String(v).toUpperCase() === "TRUE";
const toIntOrNull = (v: any) => { const n = parseInt(v); return isNaN(n) ? null : n; };
const toStrOrNull = (v: any) => { const s = String(v).trim(); return s === "" ? null : s; };

const hotelHeaderMapping: Record<string, { field: string; transform?: (v: any) => any }> = {
  "country_code": { field: "countryCode" },
  "city": { field: "city" },
  "hotel_name": { field: "hotelName" },
  "hotel_code(optional)": { field: "hotelCode" },
  "room_type(SGL/DBL/TPL/QUAD)": { field: "roomType" },
  "meal_plan(RO/BB/HB/FB/AI)": { field: "mealPlan" },
  "currency(USD/EUR/DOP)": { field: "currency" },
  "valid_from(YYYY-MM-DD)": { field: "validFrom" },
  "valid_to(YYYY-MM-DD)": { field: "validTo" },
  "price_per_room_per_night": { field: "pricePerRoomPerNight", transform: toStr },
  "tax_included(TRUE/FALSE)": { field: "taxIncluded", transform: toBool },
  "min_nights(optional)": { field: "minNights", transform: toIntOrNull },
  "blackout_dates(optional comma list)": { field: "blackoutDates" },
  "notes(optional)": { field: "notes" },
};

const transportHeaderMapping: Record<string, { field: string; transform?: (v: any) => any }> = {
  "country_code": { field: "countryCode" },
  "city_base": { field: "cityBase" },
  "vendor_name": { field: "vendorName" },
  "vendor_code(optional)": { field: "vendorCode" },
  "vehicle_type(SEDAN/VAN/MINIBUS/BUS)": { field: "vehicleType" },
  "seat_capacity": { field: "seatCapacity", transform: (v: any) => parseInt(v) || 0 },
  "rate_mode(PER_DAY/PER_TRANSFER/PER_HOUR/PER_KM)": { field: "rateMode" },
  "currency(USD/EUR/DOP)": { field: "currency" },
  "valid_from(YYYY-MM-DD)": { field: "validFrom" },
  "valid_to(YYYY-MM-DD)": { field: "validTo" },
  "base_price": { field: "basePrice", transform: toStr },
  "included_hours(optional)": { field: "includedHours", transform: toIntOrNull },
  "included_km(optional)": { field: "includedKm", transform: toIntOrNull },
  "overtime_per_hour(optional)": { field: "overtimePerHour", transform: toStrOrNull },
  "extra_per_km(optional)": { field: "extraPerKm", transform: toStrOrNull },
  "route_from_city(optional)": { field: "routeFromCity" },
  "route_to_city(optional)": { field: "routeToCity" },
  "notes(optional)": { field: "notes" },
};

const guideHeaderMapping: Record<string, { field: string; transform?: (v: any) => any }> = {
  "country_code": { field: "countryCode" },
  "city_base": { field: "cityBase" },
  "guide_name": { field: "guideName" },
  "guide_code(optional)": { field: "guideCode" },
  "language(EN/ES/HE/etc)": { field: "language" },
  "rate_unit(HALF_DAY/FULL_DAY/PER_HOUR)": { field: "rateUnit" },
  "currency(USD/EUR/DOP)": { field: "currency" },
  "valid_from(YYYY-MM-DD)": { field: "validFrom" },
  "valid_to(YYYY-MM-DD)": { field: "validTo" },
  "price": { field: "price", transform: toStr },
  "license_level(optional)": { field: "licenseLevel" },
  "notes(optional)": { field: "notes" },
};

const sightsHeaderMapping: Record<string, { field: string; transform?: (v: any) => any }> = {
  "country_code": { field: "countryCode" },
  "city": { field: "city" },
  "attraction_name": { field: "attractionName" },
  "attraction_code(optional)": { field: "attractionCode" },
  "ticket_type(ADULT/CHILD/SENIOR/GROUP)": { field: "ticketType" },
  "currency(USD/EUR/DOP)": { field: "currency" },
  "valid_from(YYYY-MM-DD)": { field: "validFrom" },
  "valid_to(YYYY-MM-DD)": { field: "validTo" },
  "price_per_person": { field: "pricePerPerson", transform: toStr },
  "requires_timeslot(TRUE/FALSE)": { field: "requiresTimeslot", transform: toBool },
  "notes(optional)": { field: "notes" },
};

function HotelRatesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editItem, setEditItem] = useState<HotelRate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [hotelName, setHotelName] = useState("");
  const [hotelCode, setHotelCode] = useState("");
  const [roomType, setRoomType] = useState("");
  const [mealPlan, setMealPlan] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [pricePerRoomPerNight, setPricePerRoomPerNight] = useState("");
  const [taxIncluded, setTaxIncluded] = useState(false);
  const [minNights, setMinNights] = useState("");
  const [blackoutDates, setBlackoutDates] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery<HotelRate[]>({ queryKey: ["/api/rates/hotel"] });

  const filtered = data?.filter((r) => statusFilter === "all" || r.status === statusFilter) || [];

  const resetForm = () => {
    setCountryCode(""); setCity(""); setHotelName(""); setHotelCode(""); setRoomType("");
    setMealPlan(""); setCurrency("USD"); setValidFrom(""); setValidTo(""); setPricePerRoomPerNight("");
    setTaxIncluded(false); setMinNights(""); setBlackoutDates(""); setNotes("");
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: HotelRate) => {
    setEditItem(item);
    setCountryCode(item.countryCode || ""); setCity(item.city || ""); setHotelName(item.hotelName);
    setHotelCode(item.hotelCode || ""); setRoomType(item.roomType || ""); setMealPlan(item.mealPlan || "");
    setCurrency(item.currency || "USD"); setValidFrom(item.validFrom || ""); setValidTo(item.validTo || "");
    setPricePerRoomPerNight(item.pricePerRoomPerNight || ""); setTaxIncluded(item.taxIncluded ?? false);
    setMinNights(item.minNights != null ? String(item.minNights) : ""); setBlackoutDates(item.blackoutDates || "");
    setNotes(item.notes || ""); setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/rates/hotel", d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/hotel"] }); setShowForm(false); toast({ title: t("hotel_rate_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/rates/hotel/${id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/hotel"] }); setShowForm(false); setEditItem(null); toast({ title: t("hotel_rate_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rates/hotel/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/hotel"] }); setDeleteId(null); toast({ title: t("hotel_rate_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/hotel/${id}`, { status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/hotel"] }); toast({ title: t("rate_approved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/hotel/${id}`, { status: "archived" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/hotel"] }); toast({ title: t("rate_archived") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const d: any = {
      countryCode: countryCode || undefined, city: city || undefined, hotelName,
      hotelCode: hotelCode || undefined, roomType: roomType || undefined, mealPlan: mealPlan || undefined,
      currency, validFrom: validFrom || undefined, validTo: validTo || undefined,
      pricePerRoomPerNight: pricePerRoomPerNight || undefined, taxIncluded,
      minNights: minNights ? parseInt(minNights) : undefined,
      blackoutDates: blackoutDates || undefined, notes: notes || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...d });
    else createMutation.mutate(d);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <Button onClick={openCreate} data-testid="button-add-hotel-rate"><Plus className="h-4 w-4 mr-2" />{t("add_rate")}</Button>
        <Button variant="outline" onClick={() => setShowBulk(true)} data-testid="button-bulk-hotel"><Upload className="h-4 w-4 mr-2" />{t("bulk_upload")}</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("hotel_label")}</TableHead>
            <TableHead>{t("city_label")}</TableHead>
            <TableHead>{t("room_label")}</TableHead>
            <TableHead>{t("meal_label")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("valid_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id} data-testid={`row-hotel-rate-${r.id}`}>
              <TableCell className="font-medium" data-testid={`text-hotel-name-${r.id}`}>{r.hotelName}</TableCell>
              <TableCell className="text-muted-foreground">{r.city || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.roomType || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.mealPlan || "-"}</TableCell>
              <TableCell data-testid={`text-hotel-price-${r.id}`}>{r.pricePerRoomPerNight ? `${r.currency || ""} ${r.pricePerRoomPerNight}` : "-"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{r.validFrom || "?"} - {r.validTo || "?"}</TableCell>
              <TableCell><StatusBadge status={r.status as RateStatus} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} data-testid={`button-edit-hotel-rate-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                  {r.status !== "active" && <Button size="icon" variant="ghost" onClick={() => approveMutation.mutate(r.id)} data-testid={`button-approve-hotel-rate-${r.id}`}><CheckCircle className="h-4 w-4" /></Button>}
                  {r.status !== "archived" && <Button size="icon" variant="ghost" onClick={() => archiveMutation.mutate(r.id)} data-testid={`button-archive-hotel-rate-${r.id}`}><Archive className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} data-testid={`button-delete-hotel-rate-${r.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("no_hotel_rates_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("hotel_rate_label")}` : `${t("add_new")} ${t("hotel_rate_label")}`}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>{t("country_code")}</Label><Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} data-testid="input-hotel-country" /></div>
            <div><Label>{t("city_label")}</Label><Input value={city} onChange={(e) => setCity(e.target.value)} data-testid="input-hotel-city" /></div>
            <div><Label>{t("hotel_name")} *</Label><Input value={hotelName} onChange={(e) => setHotelName(e.target.value)} data-testid="input-hotel-name" /></div>
            <div><Label>{t("hotel_code")}</Label><Input value={hotelCode} onChange={(e) => setHotelCode(e.target.value)} data-testid="input-hotel-code" /></div>
            <div>
              <Label>{t("room_type")}</Label>
              <Select value={roomType} onValueChange={setRoomType}>
                <SelectTrigger data-testid="select-hotel-room-type"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SGL">SGL</SelectItem>
                  <SelectItem value="DBL">DBL</SelectItem>
                  <SelectItem value="TPL">TPL</SelectItem>
                  <SelectItem value="QUAD">QUAD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("meal_plan")}</Label>
              <Select value={mealPlan} onValueChange={setMealPlan}>
                <SelectTrigger data-testid="select-hotel-meal-plan"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="RO">RO</SelectItem>
                  <SelectItem value="BB">BB</SelectItem>
                  <SelectItem value="HB">HB</SelectItem>
                  <SelectItem value="FB">FB</SelectItem>
                  <SelectItem value="AI">AI</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="select-hotel-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("price_per_room_night")}</Label><Input value={pricePerRoomPerNight} onChange={(e) => setPricePerRoomPerNight(e.target.value)} data-testid="input-hotel-price" /></div>
            <div><Label>{t("valid_from")}</Label><Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} data-testid="input-hotel-valid-from" /></div>
            <div><Label>{t("valid_to")}</Label><Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} data-testid="input-hotel-valid-to" /></div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={taxIncluded} onCheckedChange={(v) => setTaxIncluded(!!v)} data-testid="checkbox-hotel-tax" id="hotel-tax" />
              <Label htmlFor="hotel-tax">{t("tax_included")}</Label>
            </div>
            <div><Label>{t("min_nights")}</Label><Input type="number" value={minNights} onChange={(e) => setMinNights(e.target.value)} data-testid="input-hotel-min-nights" /></div>
            <div className="md:col-span-2"><Label>{t("blackout_dates")}</Label><Input value={blackoutDates} onChange={(e) => setBlackoutDates(e.target.value)} placeholder={t("comma_separated_placeholder")} data-testid="input-hotel-blackout" /></div>
            <div className="md:col-span-2"><Label>{t("notes")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-hotel-notes" /></div>
          </div>
          {!hotelName && <p className="text-xs text-muted-foreground text-right">{t("fill_required_fields")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-hotel">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!hotelName || createMutation.isPending || updateMutation.isPending} data-testid="button-save-hotel">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkUploadDialog
        open={showBulk} onOpenChange={setShowBulk}
        sheetName="HOTEL_RATES" headerMapping={hotelHeaderMapping}
        nameField="hotelName" apiPath="/api/rates/hotel" queryKey="/api/rates/hotel"
      />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} />
    </div>
  );
}

function TransportRatesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editItem, setEditItem] = useState<TransportRate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [countryCode, setCountryCode] = useState("");
  const [cityBase, setCityBase] = useState("");
  const [vendorName, setVendorName] = useState("");
  const [vendorCode, setVendorCode] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [seatCapacity, setSeatCapacity] = useState("");
  const [rateMode, setRateMode] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [includedHours, setIncludedHours] = useState("");
  const [includedKm, setIncludedKm] = useState("");
  const [overtimePerHour, setOvertimePerHour] = useState("");
  const [extraPerKm, setExtraPerKm] = useState("");
  const [routeFromCity, setRouteFromCity] = useState("");
  const [routeToCity, setRouteToCity] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery<TransportRate[]>({ queryKey: ["/api/rates/transport"] });
  const filtered = data?.filter((r) => statusFilter === "all" || r.status === statusFilter) || [];

  const resetForm = () => {
    setCountryCode(""); setCityBase(""); setVendorName(""); setVendorCode(""); setVehicleType("");
    setSeatCapacity(""); setRateMode(""); setCurrency("USD"); setValidFrom(""); setValidTo("");
    setBasePrice(""); setIncludedHours(""); setIncludedKm(""); setOvertimePerHour("");
    setExtraPerKm(""); setRouteFromCity(""); setRouteToCity(""); setNotes("");
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: TransportRate) => {
    setEditItem(item);
    setCountryCode(item.countryCode || ""); setCityBase(item.cityBase || ""); setVendorName(item.vendorName);
    setVendorCode(item.vendorCode || ""); setVehicleType(item.vehicleType || ""); setSeatCapacity(item.seatCapacity != null ? String(item.seatCapacity) : "");
    setRateMode(item.rateMode || ""); setCurrency(item.currency || "USD"); setValidFrom(item.validFrom || "");
    setValidTo(item.validTo || ""); setBasePrice(item.basePrice || ""); setIncludedHours(item.includedHours != null ? String(item.includedHours) : "");
    setIncludedKm(item.includedKm != null ? String(item.includedKm) : ""); setOvertimePerHour(item.overtimePerHour || "");
    setExtraPerKm(item.extraPerKm || ""); setRouteFromCity(item.routeFromCity || ""); setRouteToCity(item.routeToCity || "");
    setNotes(item.notes || ""); setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/rates/transport", d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/transport"] }); setShowForm(false); toast({ title: t("transport_rate_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/rates/transport/${id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/transport"] }); setShowForm(false); setEditItem(null); toast({ title: t("transport_rate_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rates/transport/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/transport"] }); setDeleteId(null); toast({ title: t("transport_rate_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/transport/${id}`, { status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/transport"] }); toast({ title: t("rate_approved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/transport/${id}`, { status: "archived" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/transport"] }); toast({ title: t("rate_archived") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const d: any = {
      countryCode: countryCode || undefined, cityBase: cityBase || undefined, vendorName,
      vendorCode: vendorCode || undefined, vehicleType: vehicleType || undefined,
      seatCapacity: seatCapacity ? parseInt(seatCapacity) : undefined, rateMode: rateMode || undefined,
      currency, validFrom: validFrom || undefined, validTo: validTo || undefined,
      basePrice: basePrice || undefined, includedHours: includedHours ? parseInt(includedHours) : undefined,
      includedKm: includedKm ? parseInt(includedKm) : undefined,
      overtimePerHour: overtimePerHour || undefined, extraPerKm: extraPerKm || undefined,
      routeFromCity: routeFromCity || undefined, routeToCity: routeToCity || undefined,
      notes: notes || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...d });
    else createMutation.mutate(d);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <Button onClick={openCreate} data-testid="button-add-transport-rate"><Plus className="h-4 w-4 mr-2" />{t("add_rate")}</Button>
        <Button variant="outline" onClick={() => setShowBulk(true)} data-testid="button-bulk-transport"><Upload className="h-4 w-4 mr-2" />{t("bulk_upload")}</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("vendor_label")}</TableHead>
            <TableHead>{t("city_label")}</TableHead>
            <TableHead>{t("vehicle_label")}</TableHead>
            <TableHead>{t("mode_label")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("valid_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id} data-testid={`row-transport-rate-${r.id}`}>
              <TableCell className="font-medium" data-testid={`text-transport-vendor-${r.id}`}>{r.vendorName}</TableCell>
              <TableCell className="text-muted-foreground">{r.cityBase || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.vehicleType || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.rateMode || "-"}</TableCell>
              <TableCell data-testid={`text-transport-price-${r.id}`}>{r.basePrice ? `${r.currency || ""} ${r.basePrice}` : "-"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{r.validFrom || "?"} - {r.validTo || "?"}</TableCell>
              <TableCell><StatusBadge status={r.status as RateStatus} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} data-testid={`button-edit-transport-rate-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                  {r.status !== "active" && <Button size="icon" variant="ghost" onClick={() => approveMutation.mutate(r.id)} data-testid={`button-approve-transport-rate-${r.id}`}><CheckCircle className="h-4 w-4" /></Button>}
                  {r.status !== "archived" && <Button size="icon" variant="ghost" onClick={() => archiveMutation.mutate(r.id)} data-testid={`button-archive-transport-rate-${r.id}`}><Archive className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} data-testid={`button-delete-transport-rate-${r.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("no_transport_rates_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("transport_rate_label")}` : `${t("add_new")} ${t("transport_rate_label")}`}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>{t("country_code")}</Label><Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} data-testid="input-transport-country" /></div>
            <div><Label>{t("city_base")}</Label><Input value={cityBase} onChange={(e) => setCityBase(e.target.value)} data-testid="input-transport-city" /></div>
            <div><Label>{t("vendor_name")} *</Label><Input value={vendorName} onChange={(e) => setVendorName(e.target.value)} data-testid="input-transport-vendor" /></div>
            <div><Label>{t("vendor_code")}</Label><Input value={vendorCode} onChange={(e) => setVendorCode(e.target.value)} data-testid="input-transport-vendor-code" /></div>
            <div>
              <Label>{t("vehicle_type")}</Label>
              <Select value={vehicleType} onValueChange={setVehicleType}>
                <SelectTrigger data-testid="select-transport-vehicle"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SEDAN">SEDAN</SelectItem>
                  <SelectItem value="VAN">VAN</SelectItem>
                  <SelectItem value="MINIBUS">MINIBUS</SelectItem>
                  <SelectItem value="BUS">BUS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("seat_capacity")}</Label><Input type="number" value={seatCapacity} onChange={(e) => setSeatCapacity(e.target.value)} data-testid="input-transport-seats" /></div>
            <div>
              <Label>{t("rate_mode")}</Label>
              <Select value={rateMode} onValueChange={setRateMode}>
                <SelectTrigger data-testid="select-transport-rate-mode"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PER_DAY">PER_DAY</SelectItem>
                  <SelectItem value="PER_TRANSFER">PER_TRANSFER</SelectItem>
                  <SelectItem value="PER_HOUR">PER_HOUR</SelectItem>
                  <SelectItem value="PER_KM">PER_KM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="select-transport-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("base_price")}</Label><Input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} data-testid="input-transport-price" /></div>
            <div><Label>{t("valid_from")}</Label><Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} data-testid="input-transport-valid-from" /></div>
            <div><Label>{t("valid_to")}</Label><Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} data-testid="input-transport-valid-to" /></div>
            <div><Label>{t("included_hours")}</Label><Input type="number" value={includedHours} onChange={(e) => setIncludedHours(e.target.value)} data-testid="input-transport-inc-hours" /></div>
            <div><Label>{t("included_km")}</Label><Input type="number" value={includedKm} onChange={(e) => setIncludedKm(e.target.value)} data-testid="input-transport-inc-km" /></div>
            <div><Label>{t("overtime_per_hour")}</Label><Input value={overtimePerHour} onChange={(e) => setOvertimePerHour(e.target.value)} data-testid="input-transport-overtime" /></div>
            <div><Label>{t("extra_per_km")}</Label><Input value={extraPerKm} onChange={(e) => setExtraPerKm(e.target.value)} data-testid="input-transport-extra-km" /></div>
            <div><Label>{t("route_from_city")}</Label><Input value={routeFromCity} onChange={(e) => setRouteFromCity(e.target.value)} data-testid="input-transport-route-from" /></div>
            <div><Label>{t("route_to_city")}</Label><Input value={routeToCity} onChange={(e) => setRouteToCity(e.target.value)} data-testid="input-transport-route-to" /></div>
            <div className="md:col-span-2"><Label>{t("notes")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-transport-notes" /></div>
          </div>
          {!vendorName && <p className="text-xs text-muted-foreground text-right">{t("fill_required_fields")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-transport">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!vendorName || createMutation.isPending || updateMutation.isPending} data-testid="button-save-transport">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkUploadDialog
        open={showBulk} onOpenChange={setShowBulk}
        sheetName="TRANSPORT_RATES" headerMapping={transportHeaderMapping}
        nameField="vendorName" apiPath="/api/rates/transport" queryKey="/api/rates/transport"
      />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} />
    </div>
  );
}

function GuideRatesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editItem, setEditItem] = useState<GuideRate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [countryCode, setCountryCode] = useState("");
  const [cityBase, setCityBase] = useState("");
  const [guideName, setGuideName] = useState("");
  const [guideCode, setGuideCode] = useState("");
  const [language, setLanguage] = useState("");
  const [rateUnit, setRateUnit] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [price, setPrice] = useState("");
  const [licenseLevel, setLicenseLevel] = useState("");
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery<GuideRate[]>({ queryKey: ["/api/rates/guide"] });
  const filtered = data?.filter((r) => statusFilter === "all" || r.status === statusFilter) || [];

  const resetForm = () => {
    setCountryCode(""); setCityBase(""); setGuideName(""); setGuideCode(""); setLanguage("");
    setRateUnit(""); setCurrency("USD"); setValidFrom(""); setValidTo(""); setPrice("");
    setLicenseLevel(""); setNotes("");
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: GuideRate) => {
    setEditItem(item);
    setCountryCode(item.countryCode || ""); setCityBase(item.cityBase || ""); setGuideName(item.guideName);
    setGuideCode(item.guideCode || ""); setLanguage(item.language || ""); setRateUnit(item.rateUnit || "");
    setCurrency(item.currency || "USD"); setValidFrom(item.validFrom || ""); setValidTo(item.validTo || "");
    setPrice(item.price || ""); setLicenseLevel(item.licenseLevel || ""); setNotes(item.notes || "");
    setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/rates/guide", d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/guide"] }); setShowForm(false); toast({ title: t("guide_rate_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/rates/guide/${id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/guide"] }); setShowForm(false); setEditItem(null); toast({ title: t("guide_rate_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rates/guide/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/guide"] }); setDeleteId(null); toast({ title: t("guide_rate_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/guide/${id}`, { status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/guide"] }); toast({ title: t("rate_approved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/guide/${id}`, { status: "archived" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/guide"] }); toast({ title: t("rate_archived") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const d: any = {
      countryCode: countryCode || undefined, cityBase: cityBase || undefined, guideName,
      guideCode: guideCode || undefined, language: language || undefined, rateUnit: rateUnit || undefined,
      currency, validFrom: validFrom || undefined, validTo: validTo || undefined,
      price: price || undefined, licenseLevel: licenseLevel || undefined, notes: notes || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...d });
    else createMutation.mutate(d);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <Button onClick={openCreate} data-testid="button-add-guide-rate"><Plus className="h-4 w-4 mr-2" />{t("add_rate")}</Button>
        <Button variant="outline" onClick={() => setShowBulk(true)} data-testid="button-bulk-guide"><Upload className="h-4 w-4 mr-2" />{t("bulk_upload")}</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("guide_label")}</TableHead>
            <TableHead>{t("city_label")}</TableHead>
            <TableHead>{t("language")}</TableHead>
            <TableHead>{t("unit_label")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("valid_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id} data-testid={`row-guide-rate-${r.id}`}>
              <TableCell className="font-medium" data-testid={`text-guide-name-${r.id}`}>{r.guideName}</TableCell>
              <TableCell className="text-muted-foreground">{r.cityBase || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.language || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.rateUnit || "-"}</TableCell>
              <TableCell data-testid={`text-guide-price-${r.id}`}>{r.price ? `${r.currency || ""} ${r.price}` : "-"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{r.validFrom || "?"} - {r.validTo || "?"}</TableCell>
              <TableCell><StatusBadge status={r.status as RateStatus} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} data-testid={`button-edit-guide-rate-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                  {r.status !== "active" && <Button size="icon" variant="ghost" onClick={() => approveMutation.mutate(r.id)} data-testid={`button-approve-guide-rate-${r.id}`}><CheckCircle className="h-4 w-4" /></Button>}
                  {r.status !== "archived" && <Button size="icon" variant="ghost" onClick={() => archiveMutation.mutate(r.id)} data-testid={`button-archive-guide-rate-${r.id}`}><Archive className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} data-testid={`button-delete-guide-rate-${r.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("no_guide_rates_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("guide_rate_label")}` : `${t("add_new")} ${t("guide_rate_label")}`}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>{t("country_code")}</Label><Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} data-testid="input-guide-country" /></div>
            <div><Label>{t("city_base")}</Label><Input value={cityBase} onChange={(e) => setCityBase(e.target.value)} data-testid="input-guide-city" /></div>
            <div><Label>{t("guide_name")} *</Label><Input value={guideName} onChange={(e) => setGuideName(e.target.value)} data-testid="input-guide-name" /></div>
            <div><Label>{t("guide_code")}</Label><Input value={guideCode} onChange={(e) => setGuideCode(e.target.value)} data-testid="input-guide-code" /></div>
            <div><Label>{t("language")}</Label><Input value={language} onChange={(e) => setLanguage(e.target.value)} placeholder={t("language_placeholder")} data-testid="input-guide-language" /></div>
            <div>
              <Label>{t("rate_unit")}</Label>
              <Select value={rateUnit} onValueChange={setRateUnit}>
                <SelectTrigger data-testid="select-guide-rate-unit"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="HALF_DAY">HALF_DAY</SelectItem>
                  <SelectItem value="FULL_DAY">FULL_DAY</SelectItem>
                  <SelectItem value="PER_HOUR">PER_HOUR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="select-guide-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("price")}</Label><Input value={price} onChange={(e) => setPrice(e.target.value)} data-testid="input-guide-price" /></div>
            <div><Label>{t("valid_from")}</Label><Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} data-testid="input-guide-valid-from" /></div>
            <div><Label>{t("valid_to")}</Label><Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} data-testid="input-guide-valid-to" /></div>
            <div><Label>{t("license_level")}</Label><Input value={licenseLevel} onChange={(e) => setLicenseLevel(e.target.value)} data-testid="input-guide-license" /></div>
            <div className="md:col-span-2"><Label>{t("notes")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-guide-notes" /></div>
          </div>
          {!guideName && <p className="text-xs text-muted-foreground text-right">{t("fill_required_fields")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-guide">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!guideName || createMutation.isPending || updateMutation.isPending} data-testid="button-save-guide">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkUploadDialog
        open={showBulk} onOpenChange={setShowBulk}
        sheetName="GUIDE_RATES" headerMapping={guideHeaderMapping}
        nameField="guideName" apiPath="/api/rates/guide" queryKey="/api/rates/guide"
      />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} />
    </div>
  );
}

function SightsRatesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [editItem, setEditItem] = useState<SightsRate | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [countryCode, setCountryCode] = useState("");
  const [city, setCity] = useState("");
  const [attractionName, setAttractionName] = useState("");
  const [attractionCode, setAttractionCode] = useState("");
  const [ticketType, setTicketType] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [validFrom, setValidFrom] = useState("");
  const [validTo, setValidTo] = useState("");
  const [pricePerPerson, setPricePerPerson] = useState("");
  const [requiresTimeslot, setRequiresTimeslot] = useState(false);
  const [notes, setNotes] = useState("");

  const { data, isLoading } = useQuery<SightsRate[]>({ queryKey: ["/api/rates/sights"] });
  const filtered = data?.filter((r) => statusFilter === "all" || r.status === statusFilter) || [];

  const resetForm = () => {
    setCountryCode(""); setCity(""); setAttractionName(""); setAttractionCode(""); setTicketType("");
    setCurrency("USD"); setValidFrom(""); setValidTo(""); setPricePerPerson("");
    setRequiresTimeslot(false); setNotes("");
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: SightsRate) => {
    setEditItem(item);
    setCountryCode(item.countryCode || ""); setCity(item.city || ""); setAttractionName(item.attractionName);
    setAttractionCode(item.attractionCode || ""); setTicketType(item.ticketType || "");
    setCurrency(item.currency || "USD"); setValidFrom(item.validFrom || ""); setValidTo(item.validTo || "");
    setPricePerPerson(item.pricePerPerson || ""); setRequiresTimeslot(item.requiresTimeslot ?? false);
    setNotes(item.notes || ""); setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/rates/sights", d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/sights"] }); setShowForm(false); toast({ title: t("sights_rate_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...d }: any) => apiRequest("PATCH", `/api/rates/sights/${id}`, d),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/sights"] }); setShowForm(false); setEditItem(null); toast({ title: t("sights_rate_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/rates/sights/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/sights"] }); setDeleteId(null); toast({ title: t("sights_rate_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/sights/${id}`, { status: "active" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/sights"] }); toast({ title: t("rate_approved") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/rates/sights/${id}`, { status: "archived" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/rates/sights"] }); toast({ title: t("rate_archived") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const d: any = {
      countryCode: countryCode || undefined, city: city || undefined, attractionName,
      attractionCode: attractionCode || undefined, ticketType: ticketType || undefined,
      currency, validFrom: validFrom || undefined, validTo: validTo || undefined,
      pricePerPerson: pricePerPerson || undefined, requiresTimeslot,
      notes: notes || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...d });
    else createMutation.mutate(d);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <StatusFilter value={statusFilter} onChange={setStatusFilter} />
        <Button onClick={openCreate} data-testid="button-add-sights-rate"><Plus className="h-4 w-4 mr-2" />{t("add_rate")}</Button>
        <Button variant="outline" onClick={() => setShowBulk(true)} data-testid="button-bulk-sights"><Upload className="h-4 w-4 mr-2" />{t("bulk_upload")}</Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("attraction_label")}</TableHead>
            <TableHead>{t("city_label")}</TableHead>
            <TableHead>{t("ticket_label")}</TableHead>
            <TableHead>{t("price")}</TableHead>
            <TableHead>{t("valid_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((r) => (
            <TableRow key={r.id} data-testid={`row-sights-rate-${r.id}`}>
              <TableCell className="font-medium" data-testid={`text-sights-name-${r.id}`}>{r.attractionName}</TableCell>
              <TableCell className="text-muted-foreground">{r.city || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{r.ticketType || "-"}</TableCell>
              <TableCell data-testid={`text-sights-price-${r.id}`}>{r.pricePerPerson ? `${r.currency || ""} ${r.pricePerPerson}` : "-"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{r.validFrom || "?"} - {r.validTo || "?"}</TableCell>
              <TableCell><StatusBadge status={r.status as RateStatus} /></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)} data-testid={`button-edit-sights-rate-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                  {r.status !== "active" && <Button size="icon" variant="ghost" onClick={() => approveMutation.mutate(r.id)} data-testid={`button-approve-sights-rate-${r.id}`}><CheckCircle className="h-4 w-4" /></Button>}
                  {r.status !== "archived" && <Button size="icon" variant="ghost" onClick={() => archiveMutation.mutate(r.id)} data-testid={`button-archive-sights-rate-${r.id}`}><Archive className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(r.id)} data-testid={`button-delete-sights-rate-${r.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {filtered.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("no_sights_rates_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("sights_rate_label")}` : `${t("add_new")} ${t("sights_rate_label")}`}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>{t("country_code")}</Label><Input value={countryCode} onChange={(e) => setCountryCode(e.target.value)} data-testid="input-sights-country" /></div>
            <div><Label>{t("city_label")}</Label><Input value={city} onChange={(e) => setCity(e.target.value)} data-testid="input-sights-city" /></div>
            <div><Label>{t("attraction_name")} *</Label><Input value={attractionName} onChange={(e) => setAttractionName(e.target.value)} data-testid="input-sights-name" /></div>
            <div><Label>{t("attraction_code")}</Label><Input value={attractionCode} onChange={(e) => setAttractionCode(e.target.value)} data-testid="input-sights-code" /></div>
            <div>
              <Label>{t("ticket_type")}</Label>
              <Select value={ticketType} onValueChange={setTicketType}>
                <SelectTrigger data-testid="select-sights-ticket-type"><SelectValue placeholder={t("select_placeholder")} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ADULT">ADULT</SelectItem>
                  <SelectItem value="CHILD">CHILD</SelectItem>
                  <SelectItem value="SENIOR">SENIOR</SelectItem>
                  <SelectItem value="GROUP">GROUP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("currency")}</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger data-testid="select-sights-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="DOP">DOP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("price_per_person")}</Label><Input value={pricePerPerson} onChange={(e) => setPricePerPerson(e.target.value)} data-testid="input-sights-price" /></div>
            <div><Label>{t("valid_from")}</Label><Input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} data-testid="input-sights-valid-from" /></div>
            <div><Label>{t("valid_to")}</Label><Input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} data-testid="input-sights-valid-to" /></div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={requiresTimeslot} onCheckedChange={(v) => setRequiresTimeslot(!!v)} data-testid="checkbox-sights-timeslot" id="sights-timeslot" />
              <Label htmlFor="sights-timeslot">{t("requires_timeslot")}</Label>
            </div>
            <div className="md:col-span-2"><Label>{t("notes")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-sights-notes" /></div>
          </div>
          {!attractionName && <p className="text-xs text-muted-foreground text-right">{t("fill_required_fields")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-sights">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!attractionName || createMutation.isPending || updateMutation.isPending} data-testid="button-save-sights">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BulkUploadDialog
        open={showBulk} onOpenChange={setShowBulk}
        sheetName="SIGHTS_RATES" headerMapping={sightsHeaderMapping}
        nameField="attractionName" apiPath="/api/rates/sights" queryKey="/api/rates/sights"
      />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} />
    </div>
  );
}

export default function RateCardsPage() {
  const { t } = useLanguage();
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("rate_cards")}</h1>
        <p className="text-muted-foreground" data-testid="text-page-description">{t("rate_cards_subtitle")}</p>
      </div>
      <Tabs defaultValue="hotel" data-testid="tabs-rate-cards">
        <TabsList data-testid="tabs-list-rate-cards">
          <TabsTrigger value="hotel" data-testid="tab-hotel"><Hotel className="h-4 w-4 mr-2" />{t("hotel_label")}</TabsTrigger>
          <TabsTrigger value="transport" data-testid="tab-transport"><Bus className="h-4 w-4 mr-2" />{t("transport")}</TabsTrigger>
          <TabsTrigger value="guide" data-testid="tab-guide"><Users className="h-4 w-4 mr-2" />{t("guide_label")}</TabsTrigger>
          <TabsTrigger value="sights" data-testid="tab-sights"><Ticket className="h-4 w-4 mr-2" />{t("sights")}</TabsTrigger>
        </TabsList>
        <TabsContent value="hotel"><HotelRatesTab /></TabsContent>
        <TabsContent value="transport"><TransportRatesTab /></TabsContent>
        <TabsContent value="guide"><GuideRatesTab /></TabsContent>
        <TabsContent value="sights"><SightsRatesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
