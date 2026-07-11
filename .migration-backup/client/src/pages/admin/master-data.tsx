import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Upload, Pencil, Trash2, Globe, Building2, Plane, Landmark, Truck, TicketCheck, Wand2, Sparkles } from "lucide-react";
import type {
  Country, City, Airport, Sight, Hotel, TransportCompany, AirlineAgency,
} from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

const SIGHT_CATEGORIES = ["museum", "landmark", "park", "religious", "entertainment", "nature", "historical", "other"];

function detectDelimiter(headerLine: string): string {
  const tab = (headerLine.match(/\t/g) || []).length;
  const semi = (headerLine.match(/;/g) || []).length;
  const comma = (headerLine.match(/,/g) || []).length;
  if (tab >= semi && tab >= comma && tab > 0) return "\t";
  if (semi >= comma && semi > 0) return ";";
  return ",";
}

function splitCSVLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const HEADER_ALIASES: Record<string, string> = {
  "code": "code", "name": "name", "region": "region", "currency": "currency",
  "timezone": "timezone", "status": "status", "actions": "_skip",
  "isactive": "isActive", "is_active": "isActive", "active": "isActive",
  "countryid": "countryId", "country_id": "countryId", "country": "countryName",
  "isairportcity": "isAirportCity", "is_airport_city": "isAirportCity",
  "iatacode": "code", "iata_code": "code", "iata": "code",
  "cityid": "cityId", "city_id": "cityId", "city": "cityName",
  "category": "category", "description": "description", "type": "category",
  "entryfee": "entryFee", "entry_fee": "entryFee",
  "ticketrequired": "ticketRequired", "ticket_required": "ticketRequired",
  "individualticketcost": "individualTicketCost", "individual_ticket_cost": "individualTicketCost",
  "groupticketcost": "groupTicketCost", "group_ticket_cost": "groupTicketCost",
  "estimatedduration": "estimatedDuration", "estimated_duration": "estimatedDuration", "duration": "estimatedDuration",
  "longdescription": "longDescription", "long_description": "longDescription", "detaileddescription": "longDescription", "detailed_description": "longDescription",
  "phone": "phone", "website": "website", "address": "address",
  "contactemail": "contactEmail", "contact_email": "contactEmail",
  "contactphone": "contactPhone", "contact_phone": "contactPhone",
  "licensenumber": "licenseNumber", "license_number": "licenseNumber",
  "fleetsize": "fleetSize", "fleet_size": "fleetSize",
};

function normalizeRow(row: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(row)) {
    if (key === "_skip") continue;
    if (key === "status") {
      result["isActive"] = (val.toLowerCase() === "active" || val.toLowerCase() === "true" || val === "1") ? "true" : "false";
    } else {
      result[key] = val;
    }
  }
  return result;
}

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = detectDelimiter(lines[0]);
  const rawHeaders = splitCSVLine(lines[0], delimiter);
  const headers = rawHeaders.map(h => {
    const lower = h.toLowerCase().replace(/\s+/g, "");
    return HEADER_ALIASES[lower] || h;
  });
  return lines.slice(1).map((line) => {
    const values = splitCSVLine(line, delimiter);
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { if (h !== "_skip") obj[h] = values[i] || ""; });
    return normalizeRow(obj);
  }).filter(row => Object.values(row).some(v => v && v.length > 0));
}

function CsvImportDialog({
  open,
  onOpenChange,
  apiPath,
  entityName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  apiPath: string;
  entityName: string;
}) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [parsed, setParsed] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState("");

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setParsed(rows);
      if (rows.length === 0) {
        toast({ title: t("csv_no_valid_rows"), variant: "destructive" });
      }
    };
    reader.readAsText(file);
  }

  const BATCH_SIZE = 200;

  const importMutation = useMutation({
    mutationFn: async (data: Record<string, string>[]) => {
      let totalImported = 0;
      let totalSkipped = 0;
      const skippedSamples: string[] = [];
      for (let i = 0; i < data.length; i += BATCH_SIZE) {
        const batch = data.slice(i, i + BATCH_SIZE);
        const res = await apiRequest("POST", `${apiPath}/import`, batch);
        const body = await res.json();
        if (body && body.imported !== undefined) {
          totalImported += body.imported;
          totalSkipped += body.skipped || 0;
          if (body.skippedSample) skippedSamples.push(...body.skippedSample);
        } else if (Array.isArray(body)) {
          totalImported += body.length;
        }
      }
      return { totalImported, totalSkipped, skippedSamples };
    },
    onSuccess: (result: any) => {
      queryClient.invalidateQueries({ queryKey: [apiPath] });
      setParsed([]);
      setFileName("");
      onOpenChange(false);
      let msg = `${entityName} ${t("imported_successfully_suffix")}`;
      if (result?.totalImported) msg = `${result.totalImported} ${entityName.toLowerCase()} ${t("imported_suffix")}`;
      if (result?.totalSkipped > 0) msg += `, ${result.totalSkipped} ${t("skipped_unmatched_suffix")}`;
      toast({ title: msg });
    },
    onError: (err: Error) =>
      toast({ title: `${t("import_failed_prefix")} ${err.message}`, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setParsed([]); setFileName(""); } onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("import_prefix")} {entityName} {t("from_csv_suffix")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>{t("choose_csv_file")}</Label>
            <Input
              type="file"
              accept=".csv,.txt"
              onChange={handleFileChange}
              data-testid="input-csv-file"
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-1">
              {t("csv_header_hint")}
            </p>
          </div>
          {fileName && (
            <p className="text-sm text-muted-foreground" data-testid="text-csv-file-name">
              {t("file_label")} {fileName}
            </p>
          )}
          {parsed.length > 0 && (
            <p className="text-sm text-muted-foreground" data-testid="text-csv-row-count">
              {parsed.length} {t("rows_parsed")}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel-import"
          >
            {t("cancel")}
          </Button>
          <Button
            onClick={() => importMutation.mutate(parsed)}
            disabled={parsed.length === 0 || importMutation.isPending}
            data-testid="button-submit-import"
          >
            {importMutation.isPending ? t("importing") : `${t("import_action")} ${parsed.length} ${t("rows_label")}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  isPending,
  entityName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: () => void;
  isPending: boolean;
  entityName: string;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("delete")} {entityName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("delete_record_confirm")}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-delete">
            {t("cancel")}
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending} data-testid="button-confirm-delete">
            {isPending ? t("deleting") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CountriesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<Country | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [iso3, setIso3] = useState("");
  const [name, setName] = useState("");
  const [capitalCity, setCapitalCity] = useState("");
  const [continent, setContinent] = useState("");
  const [region, setRegion] = useState("");
  const [subregion, setSubregion] = useState("");
  const [currencyCode, setCurrencyCode] = useState("");
  const [currencyName, setCurrencyName] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [population, setPopulation] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });

  const resetForm = () => { 
    setCode(""); setIso3(""); setName(""); setCapitalCity(""); setContinent(""); 
    setRegion(""); setSubregion(""); setCurrencyCode(""); setCurrencyName(""); 
    setPhoneCode(""); setPopulation(""); setLatitude(""); setLongitude(""); setIsActive(true); 
  };

  const openEdit = (item: Country) => {
    setEditItem(item);
    setCode(item.code); setIso3(item.iso3 || ""); setName(item.name); 
    setCapitalCity(item.capitalCity || ""); setContinent(item.continent || "");
    setRegion(item.region || ""); setSubregion(item.subregion || "");
    setCurrencyCode(item.currencyCode || ""); setCurrencyName(item.currencyName || "");
    setPhoneCode(item.phoneCode || ""); setPopulation(String(item.population || ""));
    setLatitude(String(item.latitude || "")); setLongitude(String(item.longitude || ""));
    setIsActive(item.isActive ?? true);
    setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/countries", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/countries"] }); setShowForm(false); toast({ title: t("country_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/countries/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/countries"] }); setShowForm(false); setEditItem(null); toast({ title: t("country_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/countries/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/countries"] }); setDeleteId(null); toast({ title: t("country_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const scrapeCountriesMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/admin/scrape/countries"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/countries"] });
      toast({ title: t("countries_scraped_successfully") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = { 
      code, iso3, name, capitalCity, continent, region, subregion, 
      currencyCode, currencyName, phoneCode, 
      population: population ? parseInt(population) : undefined,
      latitude: latitude || undefined, longitude: longitude || undefined, isActive
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-country"><Plus className="h-4 w-4 mr-2" />{t("add_new")}</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-countries"><Upload className="h-4 w-4 mr-2" />{t("import_csv")}</Button>
        <Button variant="secondary" onClick={() => scrapeCountriesMutation.mutate()} disabled={scrapeCountriesMutation.isPending} data-testid="button-scrape-countries">
          <Wand2 className="h-4 w-4 mr-2" />
          {scrapeCountriesMutation.isPending ? t("scraping") : t("scrape_all_countries")}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-16">{t("flag_label")}</TableHead>
            <TableHead>{t("code_label")}</TableHead>
            <TableHead>{t("name_label")}</TableHead>
            <TableHead>{t("capital_label")}</TableHead>
            <TableHead>{t("continent_label")}</TableHead>
            <TableHead>{t("population_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((item) => (
            <TableRow key={item.id} data-testid={`row-country-${item.id}`}>
              <TableCell>
                {item.flagUrl ? (
                  <img src={`/api/images/proxy?url=${encodeURIComponent(item.flagUrl)}&width=64`} alt={item.name} className="w-8 h-5 object-cover rounded shadow-sm" />
                ) : (
                  <div className="w-8 h-5 bg-muted rounded flex items-center justify-center text-[10px] text-muted-foreground">??</div>
                )}
              </TableCell>
              <TableCell className="font-medium" data-testid={`text-country-code-${item.id}`}>
                {item.code} <span className="text-xs text-muted-foreground ml-1">({item.iso3 || ""})</span>
              </TableCell>
              <TableCell data-testid={`text-country-name-${item.id}`}>{item.name}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{item.capitalCity || "-"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{item.continent || "-"}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {item.population ? item.population.toLocaleString() : "-"}
              </TableCell>
              <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? t("active_label") : t("inactive_label")}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} data-testid={`button-edit-country-${item.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-country-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!items || items.length === 0) && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("no_countries_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("country")}` : `${t("add_new")} ${t("country")}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("iso2_code")} *</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="US" data-testid="input-country-code" /></div>
              <div><Label>{t("iso3_code")}</Label><Input value={iso3} onChange={(e) => setIso3(e.target.value)} placeholder="USA" data-testid="input-country-iso3" /></div>
            </div>
            <div><Label>{t("name_label")} *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="United States" data-testid="input-country-name" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("capital_city_label")}</Label><Input value={capitalCity} onChange={(e) => setCapitalCity(e.target.value)} placeholder="Washington D.C." data-testid="input-country-capital" /></div>
              <div><Label>{t("continent_label")}</Label><Input value={continent} onChange={(e) => setContinent(e.target.value)} placeholder="North America" data-testid="input-country-continent" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("region_label")}</Label><Input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Americas" data-testid="input-country-region" /></div>
              <div><Label>{t("subregion_label")}</Label><Input value={subregion} onChange={(e) => setSubregion(e.target.value)} placeholder="Northern America" data-testid="input-country-subregion" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("currency_code_label")}</Label><Input value={currencyCode} onChange={(e) => setCurrencyCode(e.target.value)} placeholder="USD" data-testid="input-country-currency-code" /></div>
              <div><Label>{t("currency_name_label")}</Label><Input value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} placeholder="US Dollar" data-testid="input-country-currency-name" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("phone_code_label")}</Label><Input value={phoneCode} onChange={(e) => setPhoneCode(e.target.value)} placeholder="+1" data-testid="input-country-phone" /></div>
              <div><Label>{t("population_label")}</Label><Input type="number" value={population} onChange={(e) => setPopulation(e.target.value)} placeholder="331000000" data-testid="input-country-population" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("latitude_label")}</Label><Input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="38.8951" data-testid="input-country-lat" /></div>
              <div><Label>{t("longitude_label")}</Label><Input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="-77.0364" data-testid="input-country-lng" /></div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-country-active" />
              <Label>{t("active_label")}</Label>
            </div>
          </div>
          {(!code || !name) && <p className="text-xs text-muted-foreground text-right">{t("fill_required_fields")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-country">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!code || !name || createMutation.isPending || updateMutation.isPending} data-testid="button-save-country">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog open={showImport} onOpenChange={setShowImport} apiPath="/api/master/countries" entityName={t("entity_countries_plural")} />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("country")} />
    </div>
  );
}

function CitiesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<City | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [asciiName, setAsciiName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [population, setPopulation] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [isCapital, setIsCapital] = useState(false);
  const [isTourismCity, setIsTourismCity] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });
  const { data: countriesList } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });

  const resetForm = () => { 
    setName(""); setAsciiName(""); setCountryId(""); setPopulation(""); 
    setLatitude(""); setLongitude(""); setIsCapital(false); setIsTourismCity(false); setIsActive(true); 
  };

  const openEdit = (item: City) => {
    setEditItem(item); setName(item.name); setAsciiName(item.asciiName || ""); setCountryId(item.countryId);
    setPopulation(String(item.population || "")); setLatitude(String(item.latitude || "")); setLongitude(String(item.longitude || ""));
    setIsCapital(item.isCapital ?? false); setIsTourismCity(item.isTourismCity ?? false);
    setIsActive(item.isActive ?? true); setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/cities", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] }); setShowForm(false); toast({ title: t("city_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/cities/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] }); setShowForm(false); setEditItem(null); toast({ title: t("city_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/cities/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] }); setDeleteId(null); toast({ title: t("city_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const scrapeCitiesMutation = useMutation({
    mutationFn: (countryId: string) => {
      const country = countriesList?.find(c => c.id === countryId);
      return apiRequest("POST", `/api/admin/scrape/cities/${country?.code}`, { countryId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      toast({ title: t("cities_scraped_for_country") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = { 
      name, asciiName, countryId, 
      population: population ? parseInt(population) : undefined,
      latitude: latitude || undefined, longitude: longitude || undefined, isCapital, isTourismCity, isActive
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const getCountryName = (cId: string) => countriesList?.find((c) => c.id === cId)?.name || cId;

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-city"><Plus className="h-4 w-4 mr-2" />{t("add_new")}</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-cities"><Upload className="h-4 w-4 mr-2" />{t("import_csv")}</Button>
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          <Select onValueChange={(v) => scrapeCitiesMutation.mutate(v)}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder={t("scrape_cities_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              {countriesList?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name_label")}</TableHead>
            <TableHead>{t("country")}</TableHead>
            <TableHead>{t("population_label")}</TableHead>
            <TableHead>{t("coordinates_label")}</TableHead>
            <TableHead>{t("rank_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((item) => (
            <TableRow key={item.id} data-testid={`row-city-${item.id}`}>
              <TableCell className="font-medium" data-testid={`text-city-name-${item.id}`}>
                {item.name} {item.isCapital && <Badge variant="outline" className="ml-2 text-[10px] uppercase">{t("capital_label")}</Badge>}
              </TableCell>
              <TableCell className="text-muted-foreground">{getCountryName(item.countryId)}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {item.population ? item.population.toLocaleString() : "-"}
              </TableCell>
              <TableCell className="text-muted-foreground text-[10px] font-mono">
                {item.latitude && item.longitude ? `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}` : "-"}
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{item.cityRank || 0}</TableCell>
              <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? t("active_label") : t("inactive_label")}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} data-testid={`button-edit-city-${item.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-city-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!items || items.length === 0) && (
            <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("no_cities_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("city_label")}` : `${t("add_new")} ${t("city_label")}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>{t("name_label")} *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jakarta" data-testid="input-city-name" /></div>
            <div><Label>{t("ascii_name_label")}</Label><Input value={asciiName} onChange={(e) => setAsciiName(e.target.value)} placeholder="Jakarta" data-testid="input-city-ascii" /></div>
            <div>
              <Label>{t("country")} *</Label>
              <Select value={countryId} onValueChange={setCountryId}>
                <SelectTrigger data-testid="select-city-country"><SelectValue placeholder={t("select_country_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {countriesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("population_label")}</Label><Input type="number" value={population} onChange={(e) => setPopulation(e.target.value)} placeholder="10000000" data-testid="input-city-population" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("latitude_label")}</Label><Input value={latitude} onChange={(e) => setLatitude(e.target.value)} placeholder="-6.2088" data-testid="input-city-lat" /></div>
              <div><Label>{t("longitude_label")}</Label><Input value={longitude} onChange={(e) => setLongitude(e.target.value)} placeholder="106.8456" data-testid="input-city-lng" /></div>
            </div>
            <div className="flex items-center gap-4 py-2">
              <div className="flex items-center gap-2">
                <Switch checked={isCapital} onCheckedChange={setIsCapital} data-testid="switch-city-capital" />
                <Label>{t("capital_city_label")}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={isTourismCity} onCheckedChange={setIsTourismCity} data-testid="switch-city-tourism" />
                <Label>{t("tourism_city_label")}</Label>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-city-active" />
              <Label>{t("active_label")}</Label>
            </div>
          </div>
          {(!name || !countryId) && <p className="text-xs text-muted-foreground text-right">{t("fill_required_fields")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-city">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!name || !countryId || createMutation.isPending || updateMutation.isPending} data-testid="button-save-city">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog open={showImport} onOpenChange={setShowImport} apiPath="/api/master/cities" entityName={t("entity_cities_plural")} />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("city_label")} />
    </div>
  );
}

function AirportsTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<Airport | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<Airport[]>({ queryKey: ["/api/master/airports"] });
  const { data: citiesList } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const resetForm = () => { setCode(""); setName(""); setCityId(""); setIsActive(true); };

  const openEdit = (item: Airport) => {
    setEditItem(item); setCode(item.code); setName(item.name); setCityId(item.cityId); setIsActive(item.isActive ?? true); setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/airports", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airports"] }); setShowForm(false); toast({ title: t("airport_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/airports/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airports"] }); setShowForm(false); setEditItem(null); toast({ title: t("airport_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/airports/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airports"] }); setDeleteId(null); toast({ title: t("airport_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = { code, name, cityId, isActive };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const getCityName = (cId: string) => citiesList?.find((c) => c.id === cId)?.name || cId;

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-airport"><Plus className="h-4 w-4 mr-2" />{t("add_new")}</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-airports"><Upload className="h-4 w-4 mr-2" />{t("import_csv")}</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("iata_code_label")}</TableHead>
            <TableHead>{t("name_label")}</TableHead>
            <TableHead>{t("city_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((item) => (
            <TableRow key={item.id} data-testid={`row-airport-${item.id}`}>
              <TableCell className="font-medium" data-testid={`text-airport-code-${item.id}`}>{item.code}</TableCell>
              <TableCell data-testid={`text-airport-name-${item.id}`}>{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{getCityName(item.cityId)}</TableCell>
              <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? t("active_label") : t("inactive_label")}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} data-testid={`button-edit-airport-${item.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-airport-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!items || items.length === 0) && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("no_airports_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("airport_label")}` : `${t("add_new")} ${t("airport_label")}`}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("iata_code_label")} *</Label><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="JFK" data-testid="input-airport-code" /></div>
            <div><Label>{t("name_label")} *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="John F. Kennedy International" data-testid="input-airport-name" /></div>
            <div>
              <Label>{t("city_label")} *</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger data-testid="select-airport-city"><SelectValue placeholder={t("select_city_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {citiesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-airport-active" />
              <Label>{t("active_label")}</Label>
            </div>
          </div>
          {(!code || !name || !cityId) && <p className="text-xs text-muted-foreground text-right">{t("fill_required_fields")}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-airport">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!code || !name || !cityId || createMutation.isPending || updateMutation.isPending} data-testid="button-save-airport">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog open={showImport} onOpenChange={setShowImport} apiPath="/api/master/airports" entityName={t("entity_airports_plural")} />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("airport_label")} />
    </div>
  );
}

function SightsTab() {
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<Sight | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [description, setDescription] = useState("");
  const [longDescription, setLongDescription] = useState("");
  const [category, setCategory] = useState("other");
  const [ticketRequired, setTicketRequired] = useState(false);
  const [individualTicketCost, setIndividualTicketCost] = useState("");
  const [groupTicketCost, setGroupTicketCost] = useState("");
  const [estimatedDuration, setEstimatedDuration] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<Sight[]>({ queryKey: ["/api/master/sights"] });
  const { data: citiesList } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const resetForm = () => { setName(""); setCityId(""); setDescription(""); setLongDescription(""); setCategory("other"); setTicketRequired(false); setIndividualTicketCost(""); setGroupTicketCost(""); setEstimatedDuration(""); setIsActive(true); };

  const openEdit = (item: Sight) => {
    setEditItem(item); setName(item.name); setCityId(item.cityId); setDescription(item.description || "");
    setLongDescription(item.longDescription || "");
    setCategory(item.category || "other"); setTicketRequired(item.ticketRequired ?? false);
    setIndividualTicketCost(item.individualTicketCost || ""); setGroupTicketCost(item.groupTicketCost || "");
    setEstimatedDuration(item.estimatedDuration || ""); setIsActive(item.isActive ?? true); setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/sights", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] }); setShowForm(false); toast({ title: "Sight created" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/sights/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] }); setShowForm(false); setEditItem(null); toast({ title: "Sight updated" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/sights/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] }); setDeleteId(null); toast({ title: "Sight deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const scrapeSightsMutation = useMutation({
    mutationFn: (cityId: string) => apiRequest("POST", `/api/admin/scrape/sights/${cityId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] });
      toast({ title: "Sights scraped for selected city" });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const enrichMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/ai/enrich-sight/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] });
      toast({ title: "Sight description enriched by AI!" });
    },
    onError: (e: Error) => toast({ title: "Enrichment failed", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = { name, cityId, description: description || undefined, longDescription: longDescription || undefined, category, ticketRequired, individualTicketCost: individualTicketCost || undefined, groupTicketCost: groupTicketCost || undefined, estimatedDuration: estimatedDuration || undefined, isActive };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const getCityName = (cId: string) => citiesList?.find((c) => c.id === cId)?.name || cId;

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-sight"><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-sights"><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          <Select onValueChange={(v) => scrapeSightsMutation.mutate(v)}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Scrape Sights for..." />
            </SelectTrigger>
            <SelectContent>
              {citiesList?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="min-w-[200px]">Detailed Description</TableHead>
            <TableHead>Ticket</TableHead>
            <TableHead>Individual Cost</TableHead>
            <TableHead>Group Cost</TableHead>
            <TableHead>Duration</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((item) => (
            <TableRow key={item.id} data-testid={`row-sight-${item.id}`}>
              <TableCell className="font-medium" data-testid={`text-sight-name-${item.id}`}>{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{getCityName(item.cityId)}</TableCell>
              <TableCell><Badge variant="outline">{item.category || "other"}</Badge></TableCell>
              <TableCell className="text-muted-foreground text-sm max-w-[300px]" data-testid={`text-sight-long-desc-${item.id}`}>{item.longDescription ? (item.longDescription.length > 100 ? item.longDescription.slice(0, 100) + "..." : item.longDescription) : <span className="text-muted-foreground/50">—</span>}</TableCell>
              <TableCell>{item.ticketRequired ? "Yes" : "No"}</TableCell>
              <TableCell className="text-muted-foreground" data-testid={`text-sight-individual-cost-${item.id}`}>{item.individualTicketCost || "-"}</TableCell>
              <TableCell className="text-muted-foreground" data-testid={`text-sight-group-cost-${item.id}`}>{item.groupTicketCost || "-"}</TableCell>
              <TableCell className="text-muted-foreground">{item.estimatedDuration || "-"}</TableCell>
              <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} data-testid={`button-edit-sight-${item.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => enrichMutation.mutate(item.id)} 
                    disabled={enrichMutation.isPending}
                    title="Enrich with AI"
                  >
                    <Sparkles className={`h-4 w-4 ${enrichMutation.isPending ? "animate-pulse" : "text-primary"}`} />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-sight-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!items || items.length === 0) && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">No sights found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? "Edit Sight" : "Add Sight"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acropolis" data-testid="input-sight-name" /></div>
            <div>
              <Label>City *</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger data-testid="select-sight-city"><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {citiesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Short Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief description..." rows={2} data-testid="input-sight-description" /></div>
            <div><Label>Detailed Description (min 60 words)</Label><Textarea value={longDescription} onChange={(e) => setLongDescription(e.target.value)} placeholder="Provide a detailed description of at least 60 words..." rows={5} data-testid="input-sight-long-description" />{longDescription && longDescription.trim().split(/\s+/).length < 60 && <p className="text-sm text-destructive mt-1">{longDescription.trim().split(/\s+/).length}/60 words — need at least 60</p>}</div>
            <div>
              <Label>Category</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-sight-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIGHT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ticketRequired} onCheckedChange={setTicketRequired} data-testid="switch-sight-ticket" />
              <Label>Ticket Required</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Individual Ticket Cost</Label><Input type="number" step="0.01" value={individualTicketCost} onChange={(e) => setIndividualTicketCost(e.target.value)} placeholder="25.00" data-testid="input-sight-individual-cost" /></div>
              <div><Label>Group Ticket Cost</Label><Input type="number" step="0.01" value={groupTicketCost} onChange={(e) => setGroupTicketCost(e.target.value)} placeholder="18.00" data-testid="input-sight-group-cost" /></div>
            </div>
            <div><Label>Estimated Duration</Label><Input value={estimatedDuration} onChange={(e) => setEstimatedDuration(e.target.value)} placeholder="2 hours" data-testid="input-sight-duration" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-sight-active" />
              <Label>Active</Label>
            </div>
          </div>
          {(!name || !cityId) && <p className="text-xs text-muted-foreground text-right">Fill in the required fields (*) to save</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-sight">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!name || !cityId || createMutation.isPending || updateMutation.isPending} data-testid="button-save-sight">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog open={showImport} onOpenChange={setShowImport} apiPath="/api/master/sights" entityName="Sights" />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName="Sight" />
    </div>
  );
}

function TransportCompaniesTab() {
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<TransportCompany | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [vehicleTypes, setVehicleTypes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const { data: countriesList } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });

  const resetForm = () => { setName(""); setCountryId(""); setVehicleTypes(""); setContactName(""); setContactPhone(""); setContactEmail(""); setIsActive(true); };

  const openEdit = (item: TransportCompany) => {
    setEditItem(item); setName(item.name); setCountryId(item.countryId || "");
    setVehicleTypes((item.vehicleTypes || []).join(", ")); setContactName(item.contactName || "");
    setContactPhone(item.contactPhone || ""); setContactEmail(item.contactEmail || "");
    setIsActive(item.isActive ?? true); setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/transport-companies", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] }); setShowForm(false); toast({ title: "Transport company created" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/transport-companies/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] }); setShowForm(false); setEditItem(null); toast({ title: "Transport company updated" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/transport-companies/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] }); setDeleteId(null); toast({ title: "Transport company deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = {
      name,
      countryId: countryId || undefined,
      vehicleTypes: vehicleTypes ? vehicleTypes.split(",").map((v) => v.trim()).filter(Boolean) : [],
      contactName: contactName || undefined,
      contactPhone: contactPhone || undefined,
      contactEmail: contactEmail || undefined,
      isActive,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const getCountryName = (cId: string) => countriesList?.find((c) => c.id === cId)?.name || cId;

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-transport"><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-transport"><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Country</TableHead>
            <TableHead>Vehicle Types</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((item) => (
            <TableRow key={item.id} data-testid={`row-transport-${item.id}`}>
              <TableCell className="font-medium" data-testid={`text-transport-name-${item.id}`}>{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{item.countryId ? getCountryName(item.countryId) : "-"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(item.vehicleTypes || []).map((v) => <Badge key={v} variant="outline" className="text-xs">{v}</Badge>)}
                  {(!item.vehicleTypes || item.vehicleTypes.length === 0) && <span className="text-muted-foreground">-</span>}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{item.contactName || "-"}</TableCell>
              <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} data-testid={`button-edit-transport-${item.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-transport-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!items || items.length === 0) && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No transport companies found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? "Edit Transport Company" : "Add Transport Company"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" data-testid="input-transport-name" /></div>
            <div>
              <Label>Country</Label>
              <Select value={countryId} onValueChange={setCountryId}>
                <SelectTrigger data-testid="select-transport-country"><SelectValue placeholder="Select country (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {countriesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Vehicle Types (comma-separated)</Label><Input value={vehicleTypes} onChange={(e) => setVehicleTypes(e.target.value)} placeholder="bus, van, minibus" data-testid="input-transport-vehicles" /></div>
            <div><Label>Contact Name</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" data-testid="input-transport-contact-name" /></div>
            <div><Label>Contact Phone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1-555-0123" data-testid="input-transport-contact-phone" /></div>
            <div><Label>Contact Email</Label><Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@company.com" data-testid="input-transport-contact-email" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-transport-active" />
              <Label>Active</Label>
            </div>
          </div>
          {!name && <p className="text-xs text-muted-foreground text-right">Fill in the required fields (*) to save</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-transport">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!name || createMutation.isPending || updateMutation.isPending} data-testid="button-save-transport">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog open={showImport} onOpenChange={setShowImport} apiPath="/api/master/transport-companies" entityName="Transport Companies" />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName="Transport Company" />
    </div>
  );
}

function AirlineAgenciesTab() {
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<AirlineAgency | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [countryIds, setCountryIds] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [specializations, setSpecializations] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<AirlineAgency[]>({ queryKey: ["/api/master/airline-agencies"] });

  const resetForm = () => { setName(""); setCountryIds(""); setContactName(""); setContactPhone(""); setContactEmail(""); setSpecializations(""); setIsActive(true); };

  const openEdit = (item: AirlineAgency) => {
    setEditItem(item); setName(item.name); setCountryIds((item.countryIds || []).join(", "));
    setContactName(item.contactName || ""); setContactPhone(item.contactPhone || "");
    setContactEmail(item.contactEmail || ""); setSpecializations((item.specializations || []).join(", "));
    setIsActive(item.isActive ?? true); setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/airline-agencies", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airline-agencies"] }); setShowForm(false); toast({ title: "Airline agency created" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/airline-agencies/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airline-agencies"] }); setShowForm(false); setEditItem(null); toast({ title: "Airline agency updated" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/airline-agencies/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airline-agencies"] }); setDeleteId(null); toast({ title: "Airline agency deleted" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = {
      name,
      countryIds: countryIds ? countryIds.split(",").map((v) => v.trim()).filter(Boolean) : [],
      contactName: contactName || undefined,
      contactPhone: contactPhone || undefined,
      contactEmail: contactEmail || undefined,
      specializations: specializations ? specializations.split(",").map((v) => v.trim()).filter(Boolean) : [],
      isActive,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-airline-agency"><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-airline-agencies"><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Countries</TableHead>
            <TableHead>Contact</TableHead>
            <TableHead>Specializations</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((item) => (
            <TableRow key={item.id} data-testid={`row-airline-agency-${item.id}`}>
              <TableCell className="font-medium" data-testid={`text-airline-agency-name-${item.id}`}>{item.name}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(item.countryIds || []).map((c) => <Badge key={c} variant="outline" className="text-xs">{c}</Badge>)}
                  {(!item.countryIds || item.countryIds.length === 0) && <span className="text-muted-foreground">-</span>}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">{item.contactName || "-"}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {(item.specializations || []).map((s) => <Badge key={s} variant="outline" className="text-xs">{s}</Badge>)}
                  {(!item.specializations || item.specializations.length === 0) && <span className="text-muted-foreground">-</span>}
                </div>
              </TableCell>
              <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)} data-testid={`button-edit-airline-agency-${item.id}`}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => setDeleteId(item.id)} data-testid={`button-delete-airline-agency-${item.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!items || items.length === 0) && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No airline agencies found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? "Edit Airline Agency" : "Add Airline Agency"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agency name" data-testid="input-airline-agency-name" /></div>
            <div><Label>Country Codes (comma-separated)</Label><Input value={countryIds} onChange={(e) => setCountryIds(e.target.value)} placeholder="US, IL, GR" data-testid="input-airline-agency-countries" /></div>
            <div><Label>Contact Name</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" data-testid="input-airline-agency-contact-name" /></div>
            <div><Label>Contact Phone</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1-555-0123" data-testid="input-airline-agency-contact-phone" /></div>
            <div><Label>Contact Email</Label><Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@agency.com" data-testid="input-airline-agency-contact-email" /></div>
            <div><Label>Specializations (comma-separated)</Label><Input value={specializations} onChange={(e) => setSpecializations(e.target.value)} placeholder="group travel, charter" data-testid="input-airline-agency-specializations" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-airline-agency-active" />
              <Label>Active</Label>
            </div>
          </div>
          {!name && <p className="text-xs text-muted-foreground text-right">Fill in the required fields (*) to save</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-airline-agency">Cancel</Button>
            <Button onClick={handleSubmit} disabled={!name || createMutation.isPending || updateMutation.isPending} data-testid="button-save-airline-agency">
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CsvImportDialog open={showImport} onOpenChange={setShowImport} apiPath="/api/master/airline-agencies" entityName="Airline Agencies" />
      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName="Airline Agency" />
    </div>
  );
}

function HotelsTab() {
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<Hotel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [starRating, setStarRating] = useState("3");
  const [basePrice, setBasePrice] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<Hotel[]>({ queryKey: ["/api/hotels"] });
  const { data: citiesList } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const resetForm = () => { setName(""); setCityId(""); setStarRating("3"); setBasePrice(""); setCurrency("USD"); setAddress(""); setDescription(""); setIsActive(true); };

  const openEdit = (item: Hotel) => {
    setEditItem(item); setName(item.name); setCityId(item.cityId); setStarRating(String(item.starRating || 3));
    setBasePrice(item.basePrice || ""); setCurrency(item.currency || "USD");
    setAddress(item.address || ""); setDescription(item.description || ""); setIsActive(item.isActive ?? true); setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/hotels", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hotels"] }); setShowForm(false); resetForm(); toast({ title: "Hotel created" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/hotels/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hotels"] }); setShowForm(false); setEditItem(null); resetForm(); toast({ title: "Hotel updated" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const scrapeHotelsMutation = useMutation({
    mutationFn: (cId: string) => apiRequest("POST", `/api/admin/scrape/hotels/${cId}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hotels"] }); toast({ title: "Hotels scraped for selected city" }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = { name, cityId, starRating: parseInt(starRating), basePrice: basePrice || undefined, currency, address, description, isActive };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const getCityName = (cId: string) => citiesList?.find((c) => c.id === cId)?.name || cId;

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          <Select onValueChange={(v) => scrapeHotelsMutation.mutate(v)}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Scrape Hotels for..." />
            </SelectTrigger>
            <SelectContent>
              {citiesList?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Stars</TableHead>
            <TableHead>Base Price</TableHead>
            <TableHead>Address</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items?.map((item) => (
            <TableRow key={item.id}>
              <TableCell className="font-medium">{item.name}</TableCell>
              <TableCell className="text-muted-foreground">{getCityName(item.cityId)}</TableCell>
              <TableCell>{item.starRating} ⭐</TableCell>
              <TableCell className="font-mono text-xs">{item.basePrice} {item.currency}</TableCell>
              <TableCell className="text-muted-foreground text-sm">{item.address || "-"}</TableCell>
              <TableCell><Badge variant={item.isActive ? "default" : "secondary"}>{item.isActive ? "Active" : "Inactive"}</Badge></TableCell>
              <TableCell>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(item)}><Pencil className="h-4 w-4" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {(!items || items.length === 0) && (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">No hotels found</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? "Edit Hotel" : "Add Hotel"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Grand Plaza" /></div>
            <div>
              <Label>City *</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {citiesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Star Rating</Label>
              <Select value={starRating} onValueChange={setStarRating}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1,2,3,4,5].map(s => <SelectItem key={s} value={String(s)}>{s} Stars</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Base Price</Label><Input type="number" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} placeholder="150.00" /></div>
              <div><Label>Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} placeholder="USD" /></div>
            </div>
            <div><Label>Address</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="123 Street..." /></div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>Active</Label>
            </div>
          </div>
          {(!name || !cityId) && <p className="text-xs text-muted-foreground text-right">Fill in the required fields (*) to save</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!name || !cityId || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminMasterData() {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-master-data-title">Master Data</h1>
        <p className="text-muted-foreground text-sm">Manage reference data for countries, cities, airports, sights, and service providers</p>
      </div>

      <Tabs defaultValue="countries">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="countries" data-testid="tab-countries" className="gap-1.5"><Globe className="h-4 w-4" />Countries</TabsTrigger>
          <TabsTrigger value="cities" data-testid="tab-cities" className="gap-1.5"><Building2 className="h-4 w-4" />Cities</TabsTrigger>
          <TabsTrigger value="airports" data-testid="tab-airports" className="gap-1.5"><Plane className="h-4 w-4" />Airports</TabsTrigger>
          <TabsTrigger value="sights" data-testid="tab-sights" className="gap-1.5"><Landmark className="h-4 w-4" />Sights</TabsTrigger>
          <TabsTrigger value="transport" data-testid="tab-transport" className="gap-1.5"><Truck className="h-4 w-4" />Transport Companies</TabsTrigger>
          <TabsTrigger value="airlines" data-testid="tab-airlines" className="gap-1.5"><TicketCheck className="h-4 w-4" />Airline Agencies</TabsTrigger>
          <TabsTrigger value="hotels" data-testid="tab-hotels" className="gap-1.5"><Building2 className="h-4 w-4" />Hotels</TabsTrigger>
        </TabsList>

        <TabsContent value="countries"><CountriesTab /></TabsContent>
        <TabsContent value="cities"><CitiesTab /></TabsContent>
        <TabsContent value="airports"><AirportsTab /></TabsContent>
        <TabsContent value="sights"><SightsTab /></TabsContent>
        <TabsContent value="transport"><TransportCompaniesTab /></TabsContent>
        <TabsContent value="airlines"><AirlineAgenciesTab /></TabsContent>
        <TabsContent value="hotels"><HotelsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
