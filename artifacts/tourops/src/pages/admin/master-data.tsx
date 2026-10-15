import { useMemo, useState } from "react";
import { useSearch } from "wouter";
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
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Plus, Upload, Pencil, Trash2, Wand2, Sparkles, Search, FileDown } from "lucide-react";
import type {
  Country, City, Airport, Sight, Hotel, TransportCompany, AirlineAgency, UserProfile,
} from "@workspace/db";
import { CheckCircle } from "lucide-react";
import { useLanguage } from "@/hooks/use-language";
import { HotelFormFields, emptyHotelFormValues, hotelToFormValues, hotelFormToPayload, type HotelFormValues } from "@/components/hotel-form-fields";
import { CityFormFields, emptyCityFormValues, cityToFormValues, cityFormToPayload, type CityFormValues } from "@/components/city-form-fields";
import type { ColDef, GetRowIdParams, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { agGridDefaultColDef, agGridTheme } from "@/lib/ag-grid-config";

const SIGHT_CATEGORIES = ["museum", "landmark", "park", "religious", "entertainment", "nature", "historical", "other"];
const allCountriesFilter = "__all_countries__";
const allCitiesFilter = "__all_cities__";

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

const CSV_TEMPLATE_COLUMNS: Record<string, string[]> = {
  "/api/master/countries": ["code", "iso3", "name", "capitalCity", "continent", "region", "subregion", "currencyCode", "currencyName", "phoneCode", "flagUrl", "latitude", "longitude", "status"],
  "/api/master/cities": ["name", "country", "asciiName", "timezone", "geonameId", "osmId", "latitude", "longitude", "is_airport_city", "status"],
  "/api/master/airports": ["code", "name", "city", "status"],
  "/api/master/sights": ["name", "city", "category", "description", "longDescription", "estimatedDuration", "address", "phone", "email", "officialWebsite", "latitude", "longitude", "individualTicketCost", "groupTicketCost", "ticketCurrency", "ticket_required", "status"],
  "/api/master/transport-companies": ["name", "contactName", "contactPhone", "contactEmail", "city", "addressLine1", "addressLine2", "state", "postalCode", "bankName", "bankAccountNumber", "bankSwift", "bankIban", "taxId", "notes", "status"],
  "/api/master/airline-agencies": ["name", "contactName", "contactPhone", "contactEmail", "website", "status"],
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
  const templateColumns = CSV_TEMPLATE_COLUMNS[apiPath];

  function downloadTemplate() {
    if (!templateColumns) return;
    const csv = "\uFEFF" + templateColumns.join(",") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${apiPath.split("/").pop()}-template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

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
            {templateColumns && (
              <Button
                variant="outline"
                className="w-full"
                onClick={downloadTemplate}
                data-testid="button-download-template"
              >
                <FileDown className="h-4 w-4 mr-2" />{t("download_template")}
              </Button>
            )}
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
  const [search, setSearch] = useState("");

  const [code, setCode] = useState("");
  const [iso3, setIso3] = useState("");
  const [name, setName] = useState("");
  const [capitalCity, setCapitalCity] = useState("");
  const [continent, setContinent] = useState("");
  const [region, setRegion] = useState("");
  const [subregion, setSubregion] = useState("");
  const [phoneCode, setPhoneCode] = useState("");
  const [population, setPopulation] = useState("");
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (items || []).filter((item) =>
    !normalizedSearch || [item.name, item.code, item.iso3, item.capitalCity, item.continent]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch)
  );
  const filtersActive = Boolean(normalizedSearch);

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<Country>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<Country>[]>(() => [
    {
      headerName: t("flag_label"),
      width: 80,
      filter: false,
      cellRenderer: (params: ICellRendererParams<Country>) => params.data ? (
        params.data.flagUrl ? <img src={`/api/images/proxy?url=${encodeURIComponent(params.data.flagUrl)}&width=64`} alt={params.data.name} className="w-8 h-5 object-cover rounded shadow-sm" /> : <div className="w-8 h-5 bg-muted rounded flex items-center justify-center text-[10px] text-muted-foreground">??</div>
      ) : null,
    },
    {
      headerName: t("code_label"),
      minWidth: 130,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data ? `${params.data.code} ${params.data.iso3 || ""}` : "",
      cellRenderer: (params: ICellRendererParams<Country>) => params.data ? <span className="font-medium" data-testid={`text-country-code-${params.data.id}`}>{params.data.code} <span className="text-xs text-muted-foreground ml-1">({params.data.iso3 || ""})</span></span> : null,
    },
    {
      headerName: t("name_label"),
      minWidth: 200,
      flex: 1,
      filter: "agTextColumnFilter",
      field: "name",
      cellRenderer: (params: ICellRendererParams<Country>) => params.data ? <span data-testid={`text-country-name-${params.data.id}`}>{params.data.name}</span> : null,
    },
    { headerName: t("capital_label"), minWidth: 160, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.capitalCity || "-" },
    { headerName: t("continent_label"), minWidth: 140, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.continent || "-" },
    {
      headerName: t("population_label"),
      width: 130,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.population ?? null,
      valueFormatter: (params) => params.data?.population ? params.data.population.toLocaleString() : "-",
    },
    {
      headerName: t("status"),
      width: 120,
      filter: "agTextColumnFilter",
      valueGetter: (params) => !!params.data?.isActive,
      filterValueGetter: (params) => params.data?.isActive ? t("active_label") : t("inactive_label"),
      cellRenderer: (params: ICellRendererParams<Country>) => params.data ? <Badge variant={params.data.isActive ? "default" : "secondary"}>{params.data.isActive ? t("active_label") : t("inactive_label")}</Badge> : null,
    },
    {
      headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false,
      cellRenderer: (params: ICellRendererParams<Country>) => params.data ? <div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(params.data!)} data-testid={`button-edit-country-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteId(params.data!.id)} data-testid={`button-delete-country-${params.data.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null,
    },
  ], [openEdit, t]);

  const resetForm = () => { 
    setCode(""); setIso3(""); setName(""); setCapitalCity(""); setContinent(""); 
    setRegion(""); setSubregion(""); 
    setPhoneCode(""); setPopulation(""); setLatitude(""); setLongitude(""); setIsActive(true); 
  };

  function openEdit(item: Country) {
    setEditItem(item);
    setCode(item.code); setIso3(item.iso3 || ""); setName(item.name); 
    setCapitalCity(item.capitalCity || ""); setContinent(item.continent || "");
    setRegion(item.region || ""); setSubregion(item.subregion || "");
    setPhoneCode(item.phoneCode || ""); setPopulation(String(item.population || ""));
    setLatitude(String(item.latitude || "")); setLongitude(String(item.longitude || ""));
    setIsActive(item.isActive ?? true);
    setShowForm(true);
  }

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
      phoneCode, 
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
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_countries_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-countries" />
        </div>
      </div>

      {filtered.length > 0 ? <div data-testid="grid-master-countries" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<Country> theme={gridTheme} rowData={filtered} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(params: GetRowIdParams<Country>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_countries_found")}</TableCell></TableRow></TableBody></Table>}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0"><DialogTitle>{editItem ? `${t("edit")} ${t("country")}` : `${t("add_new")} ${t("country")}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
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
          <DialogFooter className="shrink-0">
            {(!code || !name) && <p className="text-xs text-muted-foreground self-center mr-auto">{t("fill_required_fields")}</p>}
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
  const [countryFilter, setCountryFilter] = useState(allCountriesFilter);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<CityFormValues>(emptyCityFormValues);

  const { data: items, isLoading } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });
  const { data: countriesList } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const getCountryName = (cId: string) => countriesList?.find((c) => c.id === cId)?.name || cId;
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (items || []).filter((item) =>
    (countryFilter === allCountriesFilter || item.countryId === countryFilter) &&
    (!normalizedSearch || [item.name, getCountryName(item.countryId)]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch))
  );
  const filtersActive = Boolean(normalizedSearch) || countryFilter !== allCountriesFilter;

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<City>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<City>[]>(() => [
    {
      headerName: t("name_label"), field: "name", minWidth: 220, flex: 1, filter: "agTextColumnFilter",
      cellRenderer: (params: ICellRendererParams<City>) => params.data ? <span className="font-medium" data-testid={`text-city-name-${params.data.id}`}>{params.data.name} {params.data.isCapital && <Badge variant="outline" className="ml-2 text-[10px] uppercase">{t("capital_label")}</Badge>}</span> : null,
    },
    { headerName: t("country"), minWidth: 180, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data ? getCountryName(params.data.countryId) : "-" },
    { headerName: t("population_label"), width: 130, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.population ?? null, valueFormatter: (params) => params.data?.population ? params.data.population.toLocaleString() : "-" },
    { headerName: t("coordinates_label"), minWidth: 180, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.latitude && params.data?.longitude ? `${parseFloat(params.data.latitude).toFixed(4)}, ${parseFloat(params.data.longitude).toFixed(4)}` : "-" },
    { headerName: t("rank_label"), width: 100, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.cityRank ?? 0 },
    {
      headerName: t("status"), width: 120, filter: "agTextColumnFilter",
      valueGetter: (params) => !!params.data?.isActive,
      filterValueGetter: (params) => params.data?.isActive ? t("active_label") : t("inactive_label"),
      cellRenderer: (params: ICellRendererParams<City>) => params.data ? <Badge variant={params.data.isActive ? "default" : "secondary"}>{params.data.isActive ? t("active_label") : t("inactive_label")}</Badge> : null,
    },
    {
      headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false,
      cellRenderer: (params: ICellRendererParams<City>) => params.data ? <div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(params.data!)} data-testid={`button-edit-city-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteId(params.data!.id)} data-testid={`button-delete-city-${params.data.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null,
    },
  ], [countriesList, openEdit, t]);

  const resetForm = () => setForm(emptyCityFormValues);

  function openEdit(item: City) {
    setEditItem(item);
    setForm(cityToFormValues(item));
    setShowForm(true);
  }

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

  const handleSubmit = () => {
    const data = cityFormToPayload(form);
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-city"><Plus className="h-4 w-4 mr-2" />{t("add_new")}</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-cities"><Upload className="h-4 w-4 mr-2" />{t("import_csv")}</Button>
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          <Select value={countryFilter} onValueChange={setCountryFilter}>
            <SelectTrigger className="w-[200px] h-9" data-testid="select-cities-country-filter">
              <SelectValue placeholder={t("select_country_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allCountriesFilter}>{t("all_countries")}</SelectItem>
              {countriesList?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_cities_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-cities" />
        </div>
      </div>

      {filtered.length > 0 ? <div data-testid="grid-master-cities" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<City> theme={gridTheme} rowData={filtered} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(params: GetRowIdParams<City>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_cities_found")}</TableCell></TableRow></TableBody></Table>}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0"><DialogTitle>{editItem ? `${t("edit")} ${t("city_label")}` : `${t("add_new")} ${t("city_label")}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <CityFormFields value={form} onChange={setForm} countries={countriesList} />
          </div>
          <DialogFooter className="shrink-0">
            {(!form.name || !form.countryId) && <p className="text-xs text-muted-foreground self-center mr-auto">{t("fill_required_fields")}</p>}
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-city">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.countryId || createMutation.isPending || updateMutation.isPending} data-testid="button-save-city">
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
  const [search, setSearch] = useState("");

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [cityId, setCityId] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<Airport[]>({ queryKey: ["/api/master/airports"] });
  const { data: citiesList } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });
  const getCityName = (cId: string) => citiesList?.find((c) => c.id === cId)?.name || cId;
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (items || []).filter((item) =>
    !normalizedSearch || [item.code, item.name, getCityName(item.cityId)]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch)
  );
  const filtersActive = Boolean(normalizedSearch);

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<Airport>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<Airport>[]>(() => [
    { headerName: t("iata_code_label"), minWidth: 120, filter: "agTextColumnFilter", field: "code", cellRenderer: (params: ICellRendererParams<Airport>) => params.data ? <span className="font-medium" data-testid={`text-airport-code-${params.data.id}`}>{params.data.code}</span> : null },
    { headerName: t("name_label"), minWidth: 240, flex: 1, filter: "agTextColumnFilter", field: "name", cellRenderer: (params: ICellRendererParams<Airport>) => params.data ? <span data-testid={`text-airport-name-${params.data.id}`}>{params.data.name}</span> : null },
    { headerName: t("city_label"), minWidth: 180, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data ? getCityName(params.data.cityId) : "-" },
    {
      headerName: t("status"), width: 120, filter: "agTextColumnFilter",
      valueGetter: (params) => !!params.data?.isActive,
      filterValueGetter: (params) => params.data?.isActive ? t("active_label") : t("inactive_label"),
      cellRenderer: (params: ICellRendererParams<Airport>) => params.data ? <Badge variant={params.data.isActive ? "default" : "secondary"}>{params.data.isActive ? t("active_label") : t("inactive_label")}</Badge> : null,
    },
    { headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<Airport>) => params.data ? <div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(params.data!)} data-testid={`button-edit-airport-${params.data.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteId(params.data!.id)} data-testid={`button-delete-airport-${params.data.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div> : null },
  ], [citiesList, openEdit, t]);

  const resetForm = () => { setCode(""); setName(""); setCityId(""); setIsActive(true); };

  function openEdit(item: Airport) {
    setEditItem(item); setCode(item.code); setName(item.name); setCityId(item.cityId); setIsActive(item.isActive ?? true); setShowForm(true);
  }

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

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-airport"><Plus className="h-4 w-4 mr-2" />{t("add_new")}</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-airports"><Upload className="h-4 w-4 mr-2" />{t("import_csv")}</Button>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_airports_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-airports" />
        </div>
      </div>

      {filtered.length > 0 ? <div data-testid="grid-master-airports" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<Airport> theme={gridTheme} rowData={filtered} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(params: GetRowIdParams<Airport>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_airports_found")}</TableCell></TableRow></TableBody></Table>}

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

export function SightsTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<Sight | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState(allCitiesFilter);
  const [search, setSearch] = useState("");

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
  const getCityName = (cId: string) => citiesList?.find((c) => c.id === cId)?.name || cId;
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (items || []).filter((item) =>
    (cityFilter === allCitiesFilter || item.cityId === cityFilter) &&
    (!normalizedSearch || [item.name, getCityName(item.cityId), item.category, item.longDescription]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch))
  );

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] }); setShowForm(false); toast({ title: t("sight_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/sights/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] }); setShowForm(false); setEditItem(null); toast({ title: t("sight_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/sights/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] }); setDeleteId(null); toast({ title: t("sight_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const enrichMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/admin/ai/enrich-sight/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/sights"] });
      toast({ title: t("sight_enriched_by_ai") });
    },
    onError: (e: Error) => toast({ title: t("enrichment_failed"), description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = { name, cityId, description: description || undefined, longDescription: longDescription || undefined, category, ticketRequired, individualTicketCost: individualTicketCost || undefined, groupTicketCost: groupTicketCost || undefined, estimatedDuration: estimatedDuration || undefined, isActive };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const filtersActive = Boolean(normalizedSearch) || cityFilter !== allCitiesFilter;
  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<Sight>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<Sight>[]>(() => [
    { headerName: t("name_label"), field: "name", minWidth: 220, flex: 1, filter: "agTextColumnFilter", cellRenderer: (params: ICellRendererParams<Sight>) => params.data ? <span className="font-medium" data-testid={`text-sight-name-${params.data.id}`}>{params.data.name}</span> : null },
    { headerName: t("city_label"), minWidth: 170, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data ? getCityName(params.data.cityId) : "-" },
    { headerName: t("category"), width: 130, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.category || "other", cellRenderer: (params: ICellRendererParams<Sight>) => params.data ? <Badge variant="outline">{params.data.category || "other"}</Badge> : null },
    { headerName: "Detailed Description", minWidth: 240, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.longDescription || "—", cellRenderer: (params: ICellRendererParams<Sight>) => params.data ? <span className="text-muted-foreground text-sm" data-testid={`text-sight-long-desc-${params.data.id}`}>{params.data.longDescription ? (params.data.longDescription.length > 100 ? params.data.longDescription.slice(0, 100) + "..." : params.data.longDescription) : <span className="text-muted-foreground/50">—</span>}</span> : null },
    { headerName: t("ticket_head_label"), width: 120, filter: "agTextColumnFilter", valueGetter: (params) => !!params.data?.ticketRequired, filterValueGetter: (params) => params.data?.ticketRequired ? "Yes" : "No", cellRenderer: (params: ICellRendererParams<Sight>) => params.data?.ticketRequired ? "Yes" : "No" },
    { headerName: t("individual_cost"), width: 140, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.individualTicketCost != null ? Number(params.data.individualTicketCost) : null, valueFormatter: (params) => params.data?.individualTicketCost || "-", cellRenderer: (params: ICellRendererParams<Sight>) => params.data ? <span className="text-muted-foreground" data-testid={`text-sight-individual-cost-${params.data.id}`}>{params.data.individualTicketCost || "-"}</span> : null },
    { headerName: t("group_cost"), width: 140, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.groupTicketCost != null ? Number(params.data.groupTicketCost) : null, valueFormatter: (params) => params.data?.groupTicketCost || "-", cellRenderer: (params: ICellRendererParams<Sight>) => params.data ? <span className="text-muted-foreground" data-testid={`text-sight-group-cost-${params.data.id}`}>{params.data.groupTicketCost || "-"}</span> : null },
    { headerName: t("duration"), minWidth: 130, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.estimatedDuration || "-" },
    { headerName: t("status"), width: 120, filter: "agTextColumnFilter", valueGetter: (params) => !!params.data?.isActive, filterValueGetter: (params) => params.data?.isActive ? "Active" : "Inactive", cellRenderer: (params: ICellRendererParams<Sight>) => params.data?.isActive ? "Active" : "Inactive" },
    { headerName: t("actions"), width: 120, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<Sight>) => { if (!params.data) return null; const sight = params.data; return <div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(sight)} data-testid={`button-edit-sight-${sight.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => enrichMutation.mutate(sight.id)} disabled={enrichMutation.isPending} title="Enrich with AI"><Sparkles className={`h-4 w-4 ${enrichMutation.isPending ? "animate-pulse" : "text-primary"}`} /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteId(sight.id)} data-testid={`button-delete-sight-${sight.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>; } },
  ], [citiesList, enrichMutation, openEdit, t]);

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-sight"><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-sights"><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[200px] h-9" data-testid="select-sights-city-filter">
              <SelectValue placeholder={t("select_city_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allCitiesFilter}>{t("all_cities")}</SelectItem>
              {citiesList?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_sights_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-sights" />
        </div>
      </div>

      {filtered.length > 0 ? <div data-testid="grid-master-sights" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<Sight> theme={gridTheme} rowData={filtered} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(params: GetRowIdParams<Sight>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : "No sights found"}</TableCell></TableRow></TableBody></Table>}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader><DialogTitle>{editItem ? "Edit Sight" : "Add Sight"}</DialogTitle></DialogHeader>
          <div className="space-y-4 flex-1 overflow-y-auto pr-2">
            <div><Label>{t("name_required_label")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acropolis" data-testid="input-sight-name" /></div>
            <div>
              <Label>{t("city_label")} *</Label>
              <Select value={cityId} onValueChange={setCityId}>
                <SelectTrigger data-testid="select-sight-city"><SelectValue placeholder="Select city" /></SelectTrigger>
                <SelectContent>
                  {citiesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("short_description_label")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("brief_description_placeholder")} rows={2} data-testid="input-sight-description" /></div>
            <div><Label>{t("detailed_description_label")}</Label><Textarea value={longDescription} onChange={(e) => setLongDescription(e.target.value)} placeholder={t("detailed_description_placeholder")} rows={5} data-testid="input-sight-long-description" />{longDescription && longDescription.trim().split(/\s+/).length < 60 && <p className="text-sm text-destructive mt-1">{longDescription.trim().split(/\s+/).length}/60 {t("words_need_60_suffix")}</p>}</div>
            <div>
              <Label>{t("category")}</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger data-testid="select-sight-category"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SIGHT_CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={ticketRequired} onCheckedChange={setTicketRequired} data-testid="switch-sight-ticket" />
              <Label>{t("ticket_required_label")}</Label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("individual_ticket_cost_label")}</Label><Input type="number" step="0.01" value={individualTicketCost} onChange={(e) => setIndividualTicketCost(e.target.value)} placeholder="25.00" data-testid="input-sight-individual-cost" /></div>
              <div><Label>{t("group_ticket_cost_label")}</Label><Input type="number" step="0.01" value={groupTicketCost} onChange={(e) => setGroupTicketCost(e.target.value)} placeholder="18.00" data-testid="input-sight-group-cost" /></div>
            </div>
            <div><Label>{t("estimated_duration_label")}</Label><Input value={estimatedDuration} onChange={(e) => setEstimatedDuration(e.target.value)} placeholder="2 hours" data-testid="input-sight-duration" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-sight-active" />
              <Label>{t("active_label")}</Label>
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
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<TransportCompany | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [vehicleTypes, setVehicleTypes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const { data: countriesList } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const getCountryName = (cId: string) => countriesList?.find((c) => c.id === cId)?.name || cId;
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (items || []).filter((item) =>
    !normalizedSearch || [item.name, item.countryId ? getCountryName(item.countryId) : "", ...(item.vehicleTypes || []), item.contactName]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch)
  );

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] }); setShowForm(false); toast({ title: t("transport_company_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/transport-companies/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] }); setShowForm(false); setEditItem(null); toast({ title: t("transport_company_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/transport-companies/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] }); setDeleteId(null); toast({ title: t("transport_company_deleted") }); },
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

  const filtersActive = Boolean(normalizedSearch);
  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<TransportCompany>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<TransportCompany>[]>(() => [
    { headerName: t("name_label"), field: "name", minWidth: 220, flex: 1, filter: "agTextColumnFilter", cellRenderer: (params: ICellRendererParams<TransportCompany>) => params.data ? <span className="font-medium" data-testid={`text-transport-name-${params.data.id}`}>{params.data.name}</span> : null },
    { headerName: t("country_label"), minWidth: 170, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.countryId ? getCountryName(params.data.countryId) : "-" },
    { headerName: t("vehicle_types_label"), minWidth: 190, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.vehicleTypes?.join(" ") || "-", cellRenderer: (params: ICellRendererParams<TransportCompany>) => params.data?.vehicleTypes?.length ? <div className="flex flex-wrap gap-1">{params.data.vehicleTypes.map((vehicleType) => <Badge key={vehicleType} variant="outline" className="text-xs">{vehicleType}</Badge>)}</div> : <span className="text-muted-foreground">-</span> },
    { headerName: t("contact_label"), minWidth: 170, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.contactName || "-" },
    { headerName: t("status"), width: 120, filter: "agTextColumnFilter", valueGetter: (params) => !!params.data?.isActive, filterValueGetter: (params) => params.data?.isActive ? "Active" : "Inactive", cellRenderer: (params: ICellRendererParams<TransportCompany>) => params.data?.isActive ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
    { headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<TransportCompany>) => { if (!params.data) return null; const company = params.data; return <div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(company)} data-testid={`button-edit-transport-${company.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteId(company.id)} data-testid={`button-delete-transport-${company.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>; } },
  ], [countriesList, openEdit, t]);

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-transport"><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-transport"><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_transport_companies_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-transport-companies" />
        </div>
      </div>

      {filtered.length > 0 ? <div data-testid="grid-master-transport-companies" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<TransportCompany> theme={gridTheme} rowData={filtered} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(params: GetRowIdParams<TransportCompany>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : "No transport companies found"}</TableCell></TableRow></TableBody></Table>}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? "Edit Transport Company" : "Add Transport Company"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>{t("name_required_label")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" data-testid="input-transport-name" /></div>
            <div>
              <Label>{t("country_label")}</Label>
              <Select value={countryId} onValueChange={setCountryId}>
                <SelectTrigger data-testid="select-transport-country"><SelectValue placeholder="Select country (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("none_label")}</SelectItem>
                  {countriesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.code})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("vehicle_types_comma_label")}</Label><Input value={vehicleTypes} onChange={(e) => setVehicleTypes(e.target.value)} placeholder="bus, van, minibus" data-testid="input-transport-vehicles" /></div>
            <div><Label>{t("contact_name_label")}</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" data-testid="input-transport-contact-name" /></div>
            <div><Label>{t("contact_phone_label")}</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1-555-0123" data-testid="input-transport-contact-phone" /></div>
            <div><Label>{t("contact_email_label")}</Label><Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@company.com" data-testid="input-transport-contact-email" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-transport-active" />
              <Label>{t("active_label")}</Label>
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
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<AirlineAgency | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [countryIds, setCountryIds] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [specializations, setSpecializations] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<AirlineAgency[]>({ queryKey: ["/api/master/airline-agencies"] });
  const { data: countriesList } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const getCountryName = (cId: string) => countriesList?.find((c) => c.id === cId)?.name || cId;
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (items || []).filter((item) =>
    !normalizedSearch || [
      item.name,
      ...(item.countryIds || []).map((cId) => getCountryName(cId)),
      item.contactName,
      ...(item.specializations || []),
    ].filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch)
  );

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
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airline-agencies"] }); setShowForm(false); toast({ title: t("airline_agency_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/airline-agencies/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airline-agencies"] }); setShowForm(false); setEditItem(null); toast({ title: t("airline_agency_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/airline-agencies/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/master/airline-agencies"] }); setDeleteId(null); toast({ title: t("airline_agency_deleted") }); },
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

  const filtersActive = Boolean(normalizedSearch);
  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<AirlineAgency>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<AirlineAgency>[]>(() => [
    { headerName: t("name_label"), field: "name", minWidth: 220, flex: 1, filter: "agTextColumnFilter", cellRenderer: (params: ICellRendererParams<AirlineAgency>) => params.data ? <span className="font-medium" data-testid={`text-airline-agency-name-${params.data.id}`}>{params.data.name}</span> : null },
    { headerName: t("countries_label"), minWidth: 190, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.countryIds?.join(" ") || "-", cellRenderer: (params: ICellRendererParams<AirlineAgency>) => params.data?.countryIds?.length ? <div className="flex flex-wrap gap-1">{params.data.countryIds.map((countryId) => <Badge key={countryId} variant="outline" className="text-xs">{countryId}</Badge>)}</div> : <span className="text-muted-foreground">-</span> },
    { headerName: t("contact_label"), minWidth: 170, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.contactName || "-" },
    { headerName: t("specializations_label"), minWidth: 200, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data?.specializations?.join(" ") || "-", cellRenderer: (params: ICellRendererParams<AirlineAgency>) => params.data?.specializations?.length ? <div className="flex flex-wrap gap-1">{params.data.specializations.map((specialization) => <Badge key={specialization} variant="outline" className="text-xs">{specialization}</Badge>)}</div> : <span className="text-muted-foreground">-</span> },
    { headerName: t("status"), width: 120, filter: "agTextColumnFilter", valueGetter: (params) => !!params.data?.isActive, filterValueGetter: (params) => params.data?.isActive ? "Active" : "Inactive", cellRenderer: (params: ICellRendererParams<AirlineAgency>) => params.data?.isActive ? <Badge variant="default">Active</Badge> : <Badge variant="secondary">Inactive</Badge> },
    { headerName: t("actions"), width: 100, pinned: "right", sortable: false, filter: false, resizable: false, cellRenderer: (params: ICellRendererParams<AirlineAgency>) => { if (!params.data) return null; const agency = params.data; return <div className="flex items-center gap-1"><Button size="icon" variant="ghost" onClick={() => openEdit(agency)} data-testid={`button-edit-airline-agency-${agency.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteId(agency.id)} data-testid={`button-delete-airline-agency-${agency.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>; } },
  ], [openEdit, t]);

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate} data-testid="button-add-airline-agency"><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <Button variant="outline" onClick={() => setShowImport(true)} data-testid="button-import-airline-agencies"><Upload className="h-4 w-4 mr-2" />Import CSV</Button>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_airline_agencies_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-airline-agencies" />
        </div>
      </div>

      {filtered.length > 0 ? <div data-testid="grid-master-airline-agencies" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<AirlineAgency> theme={gridTheme} rowData={filtered} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(params: GetRowIdParams<AirlineAgency>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : "No airline agencies found"}</TableCell></TableRow></TableBody></Table>}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editItem ? "Edit Airline Agency" : "Add Airline Agency"}</DialogTitle></DialogHeader>
          <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
            <div><Label>{t("name_required_label")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agency name" data-testid="input-airline-agency-name" /></div>
            <div><Label>{t("country_codes_comma_label")}</Label><Input value={countryIds} onChange={(e) => setCountryIds(e.target.value)} placeholder="US, IL, GR" data-testid="input-airline-agency-countries" /></div>
            <div><Label>{t("contact_name_label")}</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="John Doe" data-testid="input-airline-agency-contact-name" /></div>
            <div><Label>{t("contact_phone_label")}</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+1-555-0123" data-testid="input-airline-agency-contact-phone" /></div>
            <div><Label>{t("contact_email_label")}</Label><Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@agency.com" data-testid="input-airline-agency-contact-email" /></div>
            <div><Label>{t("specializations_comma_label")}</Label><Input value={specializations} onChange={(e) => setSpecializations(e.target.value)} placeholder="group travel, charter" data-testid="input-airline-agency-specializations" /></div>
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-airline-agency-active" />
              <Label>{t("active_label")}</Label>
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
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<Hotel | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cityFilter, setCityFilter] = useState(allCitiesFilter);
  const [search, setSearch] = useState("");

  const [form, setForm] = useState<HotelFormValues>(emptyHotelFormValues);

  const { data: items, isLoading } = useQuery<Hotel[]>({ queryKey: ["/api/hotels"] });
  const { data: citiesList } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });
  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const getCityName = (cId: string) => citiesList?.find((c) => c.id === cId)?.name || cId;
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = (items || []).filter((item) =>
    (cityFilter === allCitiesFilter || item.cityId === cityFilter) &&
    (!normalizedSearch || [item.name, getCityName(item.cityId), String(item.starRating), (item as any).googleMapsUrl]
      .filter(Boolean).join(" ").toLowerCase().includes(normalizedSearch))
  );
  const canApprove = profile?.role === "admin" || profile?.role === "super_admin";

  const approveMutation = useMutation({
    mutationFn: (id: string) => apiRequest("PATCH", `/api/hotels/${id}/approve`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hotels"] }); toast({ title: t("approved_status") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const resetForm = () => setForm(emptyHotelFormValues);

  const openEdit = (item: Hotel) => {
    setEditItem(item);
    setForm(hotelToFormValues(item));
    setShowForm(true);
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/hotels", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hotels"] }); setShowForm(false); resetForm(); toast({ title: t("hotel_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/hotels/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hotels"] }); setShowForm(false); setEditItem(null); resetForm(); toast({ title: t("hotel_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/hotels/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/hotels"] }); setDeleteId(null); toast({ title: t("hotel_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = hotelFormToPayload(form);
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const filtersActive = Boolean(normalizedSearch) || cityFilter !== allCitiesFilter;
  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<Hotel>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<Hotel>[]>(() => [
    { headerName: t("name_label"), field: "name", minWidth: 220, flex: 1, filter: "agTextColumnFilter" },
    { headerName: t("city_label"), minWidth: 180, flex: 1, filter: "agTextColumnFilter", valueGetter: (params) => params.data ? getCityName(params.data.cityId) : "-" },
    { headerName: t("stars_label"), width: 110, filter: "agNumberColumnFilter", valueGetter: (params) => params.data?.starRating ?? null, valueFormatter: (params) => `${params.value ?? ""} ⭐` },
    {
      headerName: t("base_price_label"), minWidth: 260, flex: 1, filter: "agTextColumnFilter",
      valueGetter: (params) => {
        const item = params.data;
        if (!item) return "—";
        return [item.roomRateMatrimonial, item.roomRateDouble, item.roomRateTriple].some((rate: any) => rate)
          ? `M ${item.roomRateMatrimonial ?? "—"} / D ${item.roomRateDouble ?? "—"} / T ${item.roomRateTriple ?? "—"} ${item.currency}`
          : item.basePrice ? `${item.basePrice} ${item.currency}` : "—";
      },
    },
    {
      headerName: t("google_maps_url_label"), minWidth: 150, flex: 1, filter: "agTextColumnFilter",
      valueGetter: (params) => (params.data as any)?.googleMapsUrl || "-",
      cellRenderer: (params: ICellRendererParams<Hotel>) => params.data ? ((params.data as any).googleMapsUrl ? <a href={(params.data as any).googleMapsUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" data-testid={`link-hotel-map-${params.data.id}`}>{t("view_map")}</a> : "-") : null,
    },
    {
      headerName: t("status"), minWidth: 150, flex: 1, filter: "agTextColumnFilter",
      valueGetter: (params) => {
        const status = params.data?.status;
        return status === "approved" ? t("approved_status") : status === "draft" ? t("pending_approval") : status || "";
      },
      filterValueGetter: (params) => {
        const status = params.data?.status;
        return status === "approved" ? t("approved_status") : status === "draft" ? t("pending_approval") : status || "";
      },
      cellRenderer: (params: ICellRendererParams<Hotel>) => {
        if (!params.data) return null;
        const status = params.data.status;
        return <Badge variant={status === "approved" || status === "published" ? "default" : "secondary"} className="capitalize">{status === "approved" ? t("approved_status") : status === "draft" ? t("pending_approval") : status}</Badge>;
      },
    },
    {
      headerName: t("actions"), width: 150, pinned: "right", sortable: false, filter: false, resizable: false,
      cellRenderer: (params: ICellRendererParams<Hotel>) => {
        if (!params.data) return null;
        const hotel = params.data;
        return <div className="flex items-center gap-1">{canApprove && hotel.status === "draft" && <Button size="icon" variant="ghost" className="text-emerald-600" onClick={() => approveMutation.mutate(hotel.id)} data-testid={`button-approve-hotel-${hotel.id}`}><CheckCircle className="h-4 w-4" /></Button>}<Button size="icon" variant="ghost" onClick={() => openEdit(hotel)} data-testid={`button-edit-hotel-${hotel.id}`}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => setDeleteId(hotel.id)} data-testid={`button-delete-hotel-${hotel.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>;
      },
    },
  ], [approveMutation, canApprove, citiesList, openEdit, t]);

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" />Add New</Button>
        <div className="flex items-center gap-2 border-l pl-3 ml-1">
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[200px] h-9" data-testid="select-hotels-city-filter">
              <SelectValue placeholder={t("select_city_placeholder")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allCitiesFilter}>{t("all_cities")}</SelectItem>
              {citiesList?.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative w-56">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_hotels_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-hotels" />
        </div>
      </div>

      {filtered.length > 0 ? <div data-testid="grid-master-hotels" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}><AgGridReact<Hotel> theme={gridTheme} rowData={filtered} columnDefs={columnDefs} defaultColDef={defaultColDef} getRowId={(params: GetRowIdParams<Hotel>) => params.data.id} suppressCellFocus /></div> : <Table><TableBody><TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : "No hotels found"}</TableCell></TableRow></TableBody></Table>}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0"><DialogTitle>{editItem ? "Edit Hotel" : "Add Hotel"}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <HotelFormFields value={form} onChange={setForm} cities={citiesList} />
          </div>
          {(!form.name || !form.cityId) && <p className="text-xs text-muted-foreground text-right shrink-0">Fill in the required fields (*) to save</p>}
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.cityId || createMutation.isPending || updateMutation.isPending}>
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("hotel")} />
    </div>
  );
}

const MASTER_DATA_TABS = ["countries", "cities", "airports", "sights", "transport", "airlines", "hotels"];

export default function AdminMasterData() {
  const search = useSearch();
  const tabParam = new URLSearchParams(search).get("tab");
  const activeTab = tabParam && MASTER_DATA_TABS.includes(tabParam) ? tabParam : "countries";

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-serif" data-testid="text-master-data-title">Master Data</h1>
        <p className="text-muted-foreground text-sm">Manage reference data for countries, cities, airports, sights, and service providers</p>
      </div>

      <Tabs value={activeTab}>
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
