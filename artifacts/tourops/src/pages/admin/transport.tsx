import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Bus, Route, DollarSign, CalendarCheck, FileText,
  Plus, Pencil, Trash2, Check, X, CreditCard, ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import type {
  TransportCompany, BusType, TransportRoute, TransportRoutePricing,
  TransportBooking, TransportInvoice, TransportPayment, Tour, Country,
} from "@workspace/db";
import { useLanguage } from "@/hooks/use-language";
import type { ColDef, GetRowIdParams, ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { agGridDefaultColDef, agGridTheme } from "@/lib/ag-grid-config";

interface PaginatedTransportResponse<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

const surfaceShadow = "border-transparent shadow-[0px_0px_0px_1px_oklch(0_0_0_/_0.06),0px_1px_2px_-1px_oklch(0_0_0_/_0.06),0px_2px_4px_0px_oklch(0_0_0_/_0.04)] dark:shadow-[0_0_0_1px_oklch(1_0_0_/_0.08)]";
const pressFeedback = "transition-[scale] duration-150 ease-out active:scale-[0.96]";
const allCompaniesValue = "__all_companies__";
const allRoutesValue = "__all_routes__";
const allCountriesValue = "__all_countries__";
const toGridDate = (value: string | null | undefined) => value ? new Date(`${value}T00:00:00`) : null;

function CompanySelector({
  value,
  onChange,
  testId,
  allowAll = false,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
  allowAll?: boolean;
}) {
  const { t } = useLanguage();
  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  return (
    <Select
      value={allowAll && !value ? allCompaniesValue : value}
      onValueChange={(nextValue) => onChange(allowAll && nextValue === allCompaniesValue ? "" : nextValue)}
    >
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={t("select_company_placeholder")} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={allCompaniesValue}>{t("all_companies")}</SelectItem>}
        {companies?.map((c) => (
          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
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
      <DialogContent className={surfaceShadow}>
        <DialogHeader>
          <DialogTitle>{t("delete")} {entityName}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("delete_record_confirm")}
        </p>
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

function CompaniesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<TransportCompany | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [countryFilter, setCountryFilter] = useState("");
  const [search, setSearch] = useState("");

  const [name, setName] = useState("");
  const [countryId, setCountryId] = useState("");
  const [vehicleTypes, setVehicleTypes] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [bankName, setBankName] = useState("");
  const [bankAccountNumber, setBankAccountNumber] = useState("");
  const [bankSwift, setBankSwift] = useState("");
  const [bankIban, setBankIban] = useState("");
  const [taxId, setTaxId] = useState("");
  const [notes, setNotes] = useState("");

  const { data: companies, isLoading } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const { data: countriesList } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });

  const resetForm = () => {
    setName(""); setCountryId(""); setVehicleTypes(""); setContactName(""); setContactPhone("");
    setContactEmail(""); setAddressLine1(""); setAddressLine2(""); setCity(""); setState("");
    setPostalCode(""); setBankName(""); setBankAccountNumber(""); setBankSwift(""); setBankIban("");
    setTaxId(""); setNotes("");
  };

  const openEdit = (item: TransportCompany) => {
    setEditItem(item);
    setName(item.name); setCountryId(item.countryId || "");
    setVehicleTypes(item.vehicleTypes?.join(", ") || "");
    setContactName(item.contactName || ""); setContactPhone(item.contactPhone || "");
    setContactEmail(item.contactEmail || ""); setAddressLine1(item.addressLine1 || "");
    setAddressLine2(item.addressLine2 || ""); setCity(item.city || ""); setState(item.state || "");
    setPostalCode(item.postalCode || ""); setBankName(item.bankName || "");
    setBankAccountNumber(item.bankAccountNumber || ""); setBankSwift(item.bankSwift || "");
    setBankIban(item.bankIban || ""); setTaxId(item.taxId || ""); setNotes(item.notes || "");
    setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/transport-companies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] });
      setShowForm(false);
      toast({ title: t("company_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/transport-companies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] });
      setShowForm(false); setEditItem(null);
      toast({ title: t("company_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/transport-companies/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/transport-companies"] });
      setDeleteId(null);
      toast({ title: t("company_deleted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const vt = vehicleTypes.split(",").map((s) => s.trim()).filter(Boolean);
    const data = {
      name, countryId: countryId || undefined,
      vehicleTypes: vt.length > 0 ? vt : undefined,
      contactName: contactName || undefined, contactPhone: contactPhone || undefined,
      contactEmail: contactEmail || undefined, addressLine1: addressLine1 || undefined,
      addressLine2: addressLine2 || undefined, city: city || undefined, state: state || undefined,
      postalCode: postalCode || undefined, bankName: bankName || undefined,
      bankAccountNumber: bankAccountNumber || undefined, bankSwift: bankSwift || undefined,
      bankIban: bankIban || undefined, taxId: taxId || undefined, notes: notes || undefined,
    };
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const getCountryName = (cId: string | null) => countriesList?.find((c) => c.id === cId)?.name || "-";

  const normalizedSearch = search.trim().toLowerCase();
  const filteredCompanies = companies?.filter((company) => {
    const matchesCountry = !countryFilter || company.countryId === countryFilter;
    const haystack = [
      company.name,
      company.contactName,
      company.contactEmail,
      company.contactPhone,
      company.city,
      company.state,
      getCountryName(company.countryId),
      ...(company.vehicleTypes || []),
    ].filter(Boolean).join(" ").toLowerCase();
    return matchesCountry && (!normalizedSearch || haystack.includes(normalizedSearch));
  }) ?? [];
  const filtersActive = Boolean(normalizedSearch) || Boolean(countryFilter);

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<TransportCompany>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<TransportCompany>[]>(() => [
    {
      headerName: t("name_label"),
      field: "name",
      minWidth: 220,
      flex: 1,
      filter: "agTextColumnFilter",
      cellRenderer: (params: ICellRendererParams<TransportCompany>) => params.data ? <span className="font-medium" data-testid={`text-company-name-${params.data.id}`}>{params.data.name}</span> : null,
    },
    {
      headerName: t("country_label"),
      minWidth: 160,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => countriesList?.find((country) => country.id === params.data?.countryId)?.name || "-",
      cellRenderer: (params: ICellRendererParams<TransportCompany>) => params.data ? <span className="text-muted-foreground" data-testid={`text-company-country-${params.data.id}`}>{countriesList?.find((country) => country.id === params.data?.countryId)?.name || "-"}</span> : null,
    },
    {
      headerName: t("contact_name_label"),
      minWidth: 150,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.contactName || "-",
    },
    {
      headerName: t("contact_phone_label"),
      width: 150,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.contactPhone || "-",
    },
    {
      headerName: t("contact_email_label"),
      minWidth: 190,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.contactEmail || "-",
    },
    {
      headerName: t("city_label"),
      minWidth: 150,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.city ? `${params.data.city}${params.data.state ? `, ${params.data.state}` : ""}` : "-",
    },
    {
      headerName: t("vehicle_types_label"),
      minWidth: 170,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.vehicleTypes?.join(" ") || "-",
      cellRenderer: (params: ICellRendererParams<TransportCompany>) => params.data?.vehicleTypes?.length ? (
        <div className="flex flex-wrap gap-1">
          {params.data.vehicleTypes.map((vehicleType) => <Badge key={vehicleType} variant="secondary">{vehicleType}</Badge>)}
        </div>
      ) : "-",
    },
    {
      headerName: t("actions"),
      width: 100,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<TransportCompany>) => {
        if (!params.data) return null;
        const company = params.data;
        return (
          <div className="flex items-center gap-1">
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => openEdit(company)} data-testid={`button-edit-company-${company.id}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => setDeleteId(company.id)} data-testid={`button-delete-company-${company.id}`}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        );
      },
    },
  ], [countriesList, openEdit, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("country_label")}</Label>
          <Select value={countryFilter || allCountriesValue} onValueChange={(v) => setCountryFilter(v === allCountriesValue ? "" : v)}>
            <SelectTrigger data-testid="select-company-country-filter"><SelectValue placeholder={t("country_label")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={allCountriesValue}>{t("all_countries")}</SelectItem>
              {countriesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search_companies_placeholder")} className="pl-9" data-testid="input-search-companies" />
        </div>
        <Button className={pressFeedback} onClick={() => { setEditItem(null); resetForm(); setShowForm(true); }} data-testid="button-add-company">
          <Plus className="h-4 w-4" />{t("add_company")}
        </Button>
      </div>
      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}
      {!isLoading && (filteredCompanies.length > 0 ? (
        <div data-testid="grid-transport-companies" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
          <AgGridReact<TransportCompany>
            theme={gridTheme}
            rowData={filteredCompanies}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params: GetRowIdParams<TransportCompany>) => params.data.id}
            suppressCellFocus
          />
        </div>
      ) : (
        <Table><TableBody><TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_transport_companies_found")}</TableCell></TableRow></TableBody></Table>
      ))}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) { setEditItem(null); resetForm(); } }}>
        <DialogContent className={`${surfaceShadow} max-w-2xl max-h-[85vh] overflow-y-auto`}>
          <DialogHeader><DialogTitle>{editItem ? t("edit_company_profile") : t("add_company")}</DialogTitle></DialogHeader>
          <div className="grid gap-4 md:grid-cols-2">
            <div><Label>{t("name_label")} *</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-company-name" /></div>
            <div>
              <Label>{t("country")}</Label>
              <Select value={countryId} onValueChange={setCountryId}>
                <SelectTrigger data-testid="select-company-country"><SelectValue placeholder={t("select_country_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {countriesList?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2"><Label>{t("vehicle_types_label")}</Label><Input value={vehicleTypes} onChange={(e) => setVehicleTypes(e.target.value)} placeholder={t("vehicle_types_placeholder")} data-testid="input-company-vehicle-types" /></div>
            <div><Label>{t("contact_name_label")}</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} data-testid="input-company-contact-name" /></div>
            <div><Label>{t("contact_phone_label")}</Label><Input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} data-testid="input-company-contact-phone" /></div>
            <div className="md:col-span-2"><Label>{t("contact_email_label")}</Label><Input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} data-testid="input-company-contact-email" /></div>
            <div><Label>{t("address_line1")}</Label><Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} data-testid="input-company-address1" /></div>
            <div><Label>{t("address_line2")}</Label><Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} data-testid="input-company-address2" /></div>
            <div><Label>{t("city_label")}</Label><Input value={city} onChange={(e) => setCity(e.target.value)} data-testid="input-company-city" /></div>
            <div><Label>{t("state_label")}</Label><Input value={state} onChange={(e) => setState(e.target.value)} data-testid="input-company-state" /></div>
            <div><Label>{t("postal_code")}</Label><Input value={postalCode} onChange={(e) => setPostalCode(e.target.value)} data-testid="input-company-postal-code" /></div>
            <div><Label>{t("tax_id")}</Label><Input value={taxId} onChange={(e) => setTaxId(e.target.value)} data-testid="input-company-tax-id" /></div>
            <div><Label>{t("bank_name")}</Label><Input value={bankName} onChange={(e) => setBankName(e.target.value)} data-testid="input-company-bank-name" /></div>
            <div><Label>{t("account_number")}</Label><Input value={bankAccountNumber} onChange={(e) => setBankAccountNumber(e.target.value)} data-testid="input-company-bank-account" /></div>
            <div><Label>{t("swift_label")}</Label><Input value={bankSwift} onChange={(e) => setBankSwift(e.target.value)} data-testid="input-company-bank-swift" /></div>
            <div><Label>{t("iban_label")}</Label><Input value={bankIban} onChange={(e) => setBankIban(e.target.value)} data-testid="input-company-bank-iban" /></div>
            <div className="md:col-span-2"><Label>{t("notes")}</Label><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} data-testid="input-company-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-company">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!name || updateMutation.isPending || createMutation.isPending} data-testid="button-save-company">
              {(updateMutation.isPending || createMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("company_label")} />
    </div>
  );
}

function BusTypesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<BusType | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formCompanyId, setFormCompanyId] = useState("");
  const [btName, setBtName] = useState("");
  const [seats, setSeats] = useState("");
  const [costPerDay, setCostPerDay] = useState("");
  const [costPerMile, setCostPerMile] = useState("");
  const [description, setDescription] = useState("");

  const { data: busTypes, isLoading } = useQuery<BusType[]>({
    queryKey: ["/api/transport/bus-types"],
  });
  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });

  const resetForm = () => {
    setFormCompanyId(""); setBtName(""); setSeats(""); setCostPerDay(""); setCostPerMile(""); setDescription("");
  };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: BusType) => {
    setEditItem(item); setFormCompanyId(item.companyId); setBtName(item.name); setSeats(String(item.seats));
    setCostPerDay(item.costPerDay || ""); setCostPerMile(item.costPerMile || "");
    setDescription(item.description || ""); setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/bus-types", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/bus-types"] });
      setShowForm(false); toast({ title: t("bus_type_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/transport/bus-types/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/bus-types"] });
      setShowForm(false); setEditItem(null); toast({ title: t("bus_type_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/transport/bus-types/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/bus-types"] });
      setDeleteId(null); toast({ title: t("bus_type_deleted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = {
      companyId: formCompanyId, name: btName, seats: parseInt(seats) || 0,
      costPerDay: costPerDay || undefined, costPerMile: costPerMile || undefined,
      description: description || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredBusTypes = busTypes?.filter((bt) =>
    (!companyId || bt.companyId === companyId) &&
    (!normalizedSearch || bt.name.toLowerCase().includes(normalizedSearch))
  ) ?? [];
  const filtersActive = Boolean(normalizedSearch) || Boolean(companyId);

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<BusType>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<BusType>[]>(() => [
    {
      headerName: t("name_label"),
      field: "name",
      minWidth: 220,
      flex: 1,
      filter: "agTextColumnFilter",
      cellRenderer: (params: ICellRendererParams<BusType>) => params.data ? <span className="font-medium" data-testid={`text-bustype-name-${params.data.id}`}>{params.data.name}</span> : null,
    },
    {
      headerName: t("company_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => companies?.find((company) => company.id === params.data?.companyId)?.name || params.data?.companyId || "-",
      cellRenderer: (params: ICellRendererParams<BusType>) => params.data ? <span data-testid={`text-bustype-company-${params.data.id}`}>{companies?.find((company) => company.id === params.data?.companyId)?.name || params.data.companyId}</span> : null,
    },
    {
      headerName: t("seats_label"),
      field: "seats",
      width: 100,
      filter: "agNumberColumnFilter",
      cellRenderer: (params: ICellRendererParams<BusType>) => params.data ? <span data-testid={`text-bustype-seats-${params.data.id}`}>{params.data.seats}</span> : null,
    },
    {
      headerName: t("cost_per_day_header"),
      width: 140,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.costPerDay != null ? Number(params.data.costPerDay) : null,
      valueFormatter: (params) => params.data?.costPerDay || "-",
    },
    {
      headerName: t("cost_per_mile_header"),
      width: 140,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.costPerMile != null ? Number(params.data.costPerMile) : null,
      valueFormatter: (params) => params.data?.costPerMile || "-",
    },
    {
      headerName: t("description"),
      minWidth: 220,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.description || "-",
      cellRenderer: (params: ICellRendererParams<BusType>) => params.data?.description || "-",
    },
    {
      headerName: t("actions"),
      width: 100,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<BusType>) => {
        if (!params.data) return null;
        const busType = params.data;
        return (
          <div className="flex items-center gap-1">
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => openEdit(busType)} data-testid={`button-edit-bus-type-${busType.id}`}><Pencil className="h-4 w-4" /></Button>
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => setDeleteId(busType.id)} data-testid={`button-delete-bus-type-${busType.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        );
      },
    },
  ], [companies, openEdit, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("filter_by_company")}</Label>
          <CompanySelector value={companyId} onChange={setCompanyId} allowAll testId="select-bustype-company" />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder={t("search_bus_types_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-bus-types" />
        </div>
        <Button className={pressFeedback} onClick={openCreate} data-testid="button-add-bus-type"><Plus className="h-4 w-4" />{t("add_bus_type")}</Button>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {!isLoading && (filteredBusTypes.length > 0 ? (
        <div data-testid="grid-transport-bus-types" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
          <AgGridReact<BusType>
            theme={gridTheme}
            rowData={filteredBusTypes}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params: GetRowIdParams<BusType>) => params.data.id}
            suppressCellFocus
          />
        </div>
      ) : (
        <Table><TableBody><TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_bus_types_found")}</TableCell></TableRow></TableBody></Table>
      ))}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className={`${surfaceShadow} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader><DialogTitle>{editItem ? t("edit_bus_type") : t("add_bus_type")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("company_label")} *</Label><CompanySelector value={formCompanyId} onChange={setFormCompanyId} testId="select-bustype-form-company" /></div>
            <div><Label>{t("name_label")} *</Label><Input value={btName} onChange={(e) => setBtName(e.target.value)} data-testid="input-bustype-name" /></div>
            <div><Label>{t("seats_label")} *</Label><Input type="number" value={seats} onChange={(e) => setSeats(e.target.value)} data-testid="input-bustype-seats" /></div>
            <div><Label>{t("cost_per_day_label")}</Label><Input value={costPerDay} onChange={(e) => setCostPerDay(e.target.value)} data-testid="input-bustype-cost-day" /></div>
            <div><Label>{t("cost_per_mile_label")}</Label><Input value={costPerMile} onChange={(e) => setCostPerMile(e.target.value)} data-testid="input-bustype-cost-mile" /></div>
            <div><Label>{t("description")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-bustype-description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-bus-type">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!btName || !seats || createMutation.isPending || updateMutation.isPending || (!editItem && !formCompanyId)} data-testid="button-save-bus-type">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("bus_type_label")} />
    </div>
  );
}

function RoutesTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [formCompanyId, setFormCompanyId] = useState("");
  const [editItem, setEditItem] = useState<TransportRoute | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [rtName, setRtName] = useState("");
  const [rtDescription, setRtDescription] = useState("");
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");

  const { data: routes, isLoading } = useQuery<TransportRoute[]>({
    queryKey: ["/api/transport/routes"],
  });

  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });

  const resetForm = () => { setRtName(""); setRtDescription(""); setFromCity(""); setToCity(""); setDistanceMiles(""); setFormCompanyId(""); };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: TransportRoute) => {
    setEditItem(item); setRtName(item.name); setRtDescription(item.description || "");
    setFromCity(item.fromCity || ""); setToCity(item.toCity || "");
    setDistanceMiles(item.distanceMiles || ""); setFormCompanyId(item.companyId); setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/routes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/routes"] });
      setShowForm(false); toast({ title: t("route_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/transport/routes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/routes"] });
      setShowForm(false); setEditItem(null); toast({ title: t("route_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/transport/routes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/routes"] });
      setDeleteId(null); toast({ title: t("route_deleted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = {
      companyId: formCompanyId, name: rtName, description: rtDescription || undefined,
      fromCity: fromCity || undefined, toCity: toCity || undefined,
      distanceMiles: distanceMiles || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredRoutes = routes?.filter((rt) =>
    (!companyId || rt.companyId === companyId) &&
    (!normalizedSearch || rt.name.toLowerCase().includes(normalizedSearch) || (rt.fromCity || "").toLowerCase().includes(normalizedSearch) || (rt.toCity || "").toLowerCase().includes(normalizedSearch) || (rt.description || "").toLowerCase().includes(normalizedSearch))
  ) ?? [];
  const filtersActive = Boolean(normalizedSearch) || Boolean(companyId);

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<TransportRoute>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<TransportRoute>[]>(() => [
    {
      headerName: t("company_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => companies?.find((company) => company.id === params.data?.companyId)?.name || params.data?.companyId || "-",
      cellRenderer: (params: ICellRendererParams<TransportRoute>) => params.data ? <span data-testid={`text-route-company-${params.data.id}`}>{companies?.find((company) => company.id === params.data?.companyId)?.name || params.data.companyId}</span> : null,
    },
    {
      headerName: t("name_label"),
      field: "name",
      minWidth: 220,
      flex: 1,
      filter: "agTextColumnFilter",
      cellRenderer: (params: ICellRendererParams<TransportRoute>) => params.data ? <span className="font-medium" data-testid={`text-route-name-${params.data.id}`}>{params.data.name}</span> : null,
    },
    {
      headerName: t("from_label"),
      minWidth: 150,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.fromCity || "-",
      cellRenderer: (params: ICellRendererParams<TransportRoute>) => params.data ? <span data-testid={`text-route-from-${params.data.id}`}>{params.data.fromCity || "-"}</span> : null,
    },
    {
      headerName: t("to_label"),
      minWidth: 150,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.toCity || "-",
      cellRenderer: (params: ICellRendererParams<TransportRoute>) => params.data ? <span data-testid={`text-route-to-${params.data.id}`}>{params.data.toCity || "-"}</span> : null,
    },
    {
      headerName: t("distance_mi"),
      width: 120,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.distanceMiles != null ? Number(params.data.distanceMiles) : null,
      valueFormatter: (params) => params.data?.distanceMiles || "-",
    },
    {
      headerName: t("description"),
      minWidth: 220,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.description || "-",
      cellRenderer: (params: ICellRendererParams<TransportRoute>) => params.data?.description || "-",
    },
    {
      headerName: t("actions"),
      width: 100,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<TransportRoute>) => {
        if (!params.data) return null;
        const route = params.data;
        return (
          <div className="flex items-center gap-1">
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => openEdit(route)} data-testid={`button-edit-route-${route.id}`}><Pencil className="h-4 w-4" /></Button>
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => setDeleteId(route.id)} data-testid={`button-delete-route-${route.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        );
      },
    },
  ], [companies, openEdit, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("filter_by_company")}</Label>
          <CompanySelector value={companyId} onChange={setCompanyId} allowAll testId="select-route-company" />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search_routes_placeholder")} className="pl-9" data-testid="input-search-routes" />
        </div>
        <Button className={pressFeedback} onClick={openCreate} data-testid="button-add-route"><Plus className="h-4 w-4" />{t("add_route")}</Button>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {!isLoading && (filteredRoutes.length > 0 ? (
        <div data-testid="grid-transport-routes" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
          <AgGridReact<TransportRoute>
            theme={gridTheme}
            rowData={filteredRoutes}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params: GetRowIdParams<TransportRoute>) => params.data.id}
            suppressCellFocus
          />
        </div>
      ) : (
        <Table><TableBody><TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_routes_found")}</TableCell></TableRow></TableBody></Table>
      ))}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className={`${surfaceShadow} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader><DialogTitle>{editItem ? t("edit_route") : t("add_route")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("company_label")} *</Label>
              <CompanySelector value={formCompanyId} onChange={setFormCompanyId} testId="select-route-form-company" />
            </div>
            <div><Label>{t("name_label")} *</Label><Input value={rtName} onChange={(e) => setRtName(e.target.value)} data-testid="input-route-name" /></div>
            <div><Label>{t("from_city")}</Label><Input value={fromCity} onChange={(e) => setFromCity(e.target.value)} data-testid="input-route-from" /></div>
            <div><Label>{t("to_city")}</Label><Input value={toCity} onChange={(e) => setToCity(e.target.value)} data-testid="input-route-to" /></div>
            <div><Label>{t("distance_miles")}</Label><Input value={distanceMiles} onChange={(e) => setDistanceMiles(e.target.value)} data-testid="input-route-distance" /></div>
            <div><Label>{t("description")}</Label><Textarea value={rtDescription} onChange={(e) => setRtDescription(e.target.value)} data-testid="input-route-description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-route">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!formCompanyId || !rtName || createMutation.isPending || updateMutation.isPending} data-testid="button-save-route">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("route_label")} />
    </div>
  );
}

function RoutePricingTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState("");
  const [routeId, setRouteId] = useState("");
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<TransportRoutePricing | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [formCompanyId, setFormCompanyId] = useState("");
  const [formRouteId, setFormRouteId] = useState("");
  const [busTypeId, setBusTypeId] = useState("");
  const [costPerTrip, setCostPerTrip] = useState("");
  const [pricingNotes, setPricingNotes] = useState("");

  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const { data: routes } = useQuery<TransportRoute[]>({ queryKey: ["/api/transport/routes"] });
  const { data: busTypes } = useQuery<BusType[]>({ queryKey: ["/api/transport/bus-types"] });

  const { data: pricing, isLoading } = useQuery<TransportRoutePricing[]>({
    queryKey: ["/api/transport/route-pricing"],
  });

  const routeOf = (id: string) => routes?.find((r) => r.id === id);
  const getCompanyName = (id?: string) => (id ? companies?.find((c) => c.id === id)?.name || id : "-");
  const getRouteName = (id: string) => routeOf(id)?.name || id;
  const getBusTypeName = (id: string) => busTypes?.find((b) => b.id === id)?.name || id;

  const formRoutes = routes?.filter((r) => r.companyId === formCompanyId);
  const formBusTypes = busTypes?.filter((b) => b.companyId === formCompanyId);
  const filterRoutes = routes?.filter((r) => !companyId || r.companyId === companyId);

  const normalizedSearch = search.trim().toLowerCase();
  const filtersActive = Boolean(normalizedSearch) || Boolean(companyId) || Boolean(routeId);
  const filteredPricingRows = pricing?.filter((p) =>
    (!companyId || routeOf(p.routeId)?.companyId === companyId) &&
    (!routeId || p.routeId === routeId) &&
    (!normalizedSearch || getRouteName(p.routeId).toLowerCase().includes(normalizedSearch) || getBusTypeName(p.busTypeId).toLowerCase().includes(normalizedSearch) || String(p.costPerTrip || "").toLowerCase().includes(normalizedSearch) || (p.notes || "").toLowerCase().includes(normalizedSearch))
  ) ?? [];

  const resetForm = () => { setFormCompanyId(""); setFormRouteId(""); setBusTypeId(""); setCostPerTrip(""); setPricingNotes(""); };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: TransportRoutePricing) => {
    setEditItem(item); setFormCompanyId(routeOf(item.routeId)?.companyId || ""); setFormRouteId(item.routeId);
    setBusTypeId(item.busTypeId); setCostPerTrip(item.costPerTrip);
    setPricingNotes(item.notes || ""); setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/route-pricing", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/route-pricing"] });
      setShowForm(false); toast({ title: t("pricing_entry_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/transport/route-pricing/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/route-pricing"] });
      setShowForm(false); setEditItem(null); toast({ title: t("pricing_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/transport/route-pricing/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/route-pricing"] });
      setDeleteId(null); toast({ title: t("pricing_deleted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = { routeId: formRouteId, busTypeId, costPerTrip, notes: pricingNotes || undefined };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<TransportRoutePricing>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<TransportRoutePricing>[]>(() => [
    {
      headerName: t("company_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => {
        const data = params.data;
        return data?.routeId ? companies?.find((company) => company.id === routeOf(data.routeId)?.companyId)?.name || "-" : "-";
      },
      cellRenderer: (params: ICellRendererParams<TransportRoutePricing>) => {
        if (!params.data) return null;
        const pricingEntry = params.data;
        return <span data-testid={`text-pricing-company-${pricingEntry.id}`}>{companies?.find((company) => company.id === routeOf(pricingEntry.routeId)?.companyId)?.name || "-"}</span>;
      },
    },
    {
      headerName: t("route_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.routeId ? routeOf(params.data.routeId)?.name || params.data.routeId : "-",
      cellRenderer: (params: ICellRendererParams<TransportRoutePricing>) => params.data ? <span data-testid={`text-pricing-route-${params.data.id}`}>{routeOf(params.data.routeId)?.name || params.data.routeId}</span> : null,
    },
    {
      headerName: t("bus_type_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => {
        const data = params.data;
        return data?.busTypeId ? busTypes?.find((busType) => busType.id === data.busTypeId)?.name || data.busTypeId : "-";
      },
      cellRenderer: (params: ICellRendererParams<TransportRoutePricing>) => {
        if (!params.data) return null;
        const pricingEntry = params.data;
        return <span className="font-medium" data-testid={`text-pricing-bustype-${pricingEntry.id}`}>{busTypes?.find((busType) => busType.id === pricingEntry.busTypeId)?.name || pricingEntry.busTypeId}</span>;
      },
    },
    {
      headerName: t("cost_per_trip"),
      width: 140,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.costPerTrip != null ? Number(params.data.costPerTrip) : null,
      valueFormatter: (params) => params.data?.costPerTrip ?? "",
      cellRenderer: (params: ICellRendererParams<TransportRoutePricing>) => params.data ? <span data-testid={`text-pricing-cost-${params.data.id}`}>{params.data.costPerTrip}</span> : null,
    },
    {
      headerName: t("notes"),
      minWidth: 220,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.notes || "-",
      cellRenderer: (params: ICellRendererParams<TransportRoutePricing>) => params.data?.notes || "-",
    },
    {
      headerName: t("actions"),
      width: 100,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<TransportRoutePricing>) => {
        if (!params.data) return null;
        const pricingEntry = params.data;
        return (
          <div className="flex items-center gap-1">
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => openEdit(pricingEntry)} data-testid={`button-edit-pricing-${pricingEntry.id}`}><Pencil className="h-4 w-4" /></Button>
            <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => setDeleteId(pricingEntry.id)} data-testid={`button-delete-pricing-${pricingEntry.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        );
      },
    },
  ], [busTypes, companies, openEdit, routes, t]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Label>{t("filter_by_company")}</Label>
          <CompanySelector value={companyId} onChange={(v) => { setCompanyId(v); setRouteId(""); }} allowAll testId="select-pricing-company" />
        </div>
        <div className="w-56">
          <Label>{t("route_label")}</Label>
          <Select value={routeId || allRoutesValue} onValueChange={(v) => setRouteId(v === allRoutesValue ? "" : v)}>
            <SelectTrigger data-testid="select-pricing-route"><SelectValue placeholder={t("route_label")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value={allRoutesValue}>{t("all_routes")}</SelectItem>
              {filterRoutes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search_pricing_placeholder")} className="pl-9" data-testid="input-search-pricing" />
        </div>
        <Button className={pressFeedback} onClick={openCreate} data-testid="button-add-pricing"><Plus className="h-4 w-4" />{t("add_pricing")}</Button>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {!isLoading && (filteredPricingRows.length > 0 ? (
        <div data-testid="grid-transport-pricing" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
          <AgGridReact<TransportRoutePricing>
            theme={gridTheme}
            rowData={filteredPricingRows}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params: GetRowIdParams<TransportRoutePricing>) => params.data.id}
            suppressCellFocus
          />
        </div>
      ) : (
        <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_pricing_entries_found")}</TableCell></TableRow></TableBody></Table>
      ))}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className={`${surfaceShadow} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader><DialogTitle>{editItem ? t("edit_pricing") : t("add_pricing")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("company_label")} *</Label>
              <CompanySelector value={formCompanyId} onChange={(v) => { setFormCompanyId(v); setFormRouteId(""); setBusTypeId(""); }} testId="select-pricing-form-company" />
            </div>
            <div>
              <Label>{t("route_label")} *</Label>
              <Select value={formRouteId} onValueChange={setFormRouteId}>
                <SelectTrigger data-testid="select-pricing-form-route"><SelectValue placeholder={t("select_route_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {formRoutes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("bus_type_label")} *</Label>
              <Select value={busTypeId} onValueChange={setBusTypeId}>
                <SelectTrigger data-testid="select-pricing-bus-type"><SelectValue placeholder={t("select_bus_type_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {formBusTypes?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.seats} {t("seats_label")})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("cost_per_trip")} *</Label><Input value={costPerTrip} onChange={(e) => setCostPerTrip(e.target.value)} data-testid="input-pricing-cost" /></div>
            <div><Label>{t("notes")}</Label><Textarea value={pricingNotes} onChange={(e) => setPricingNotes(e.target.value)} data-testid="input-pricing-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-pricing">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!formCompanyId || !formRouteId || !busTypeId || !costPerTrip || createMutation.isPending || updateMutation.isPending} data-testid="button-save-pricing">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("pricing_entry_label")} />
    </div>
  );
}

function BookingsTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;
  const [showForm, setShowForm] = useState(false);

  const [bkTourId, setBkTourId] = useState("");
  const [bkCompanyId, setBkCompanyId] = useState("");
  const [bkRouteId, setBkRouteId] = useState("");
  const [bkBusTypeId, setBkBusTypeId] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceEndDate, setServiceEndDate] = useState("");
  const [costQuoted, setCostQuoted] = useState("");
  const [bkNotes, setBkNotes] = useState("");

  const { data: bookings, isLoading } = useQuery<PaginatedTransportResponse<TransportBooking>>({
    queryKey: ["/api/transport/bookings", `?page=${page}&pageSize=${pageSize}${companyId ? `&companyId=${companyId}` : ""}`],
  });

  const totalPages = Math.max(1, Math.ceil((bookings?.total ?? 0) / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });

  const { data: companyRoutes } = useQuery<TransportRoute[]>({
    queryKey: ["/api/transport/routes", bkCompanyId ? `?companyId=${bkCompanyId}` : ""],
    enabled: !!bkCompanyId,
  });

  const { data: companyBusTypes } = useQuery<BusType[]>({
    queryKey: ["/api/transport/bus-types", bkCompanyId ? `?companyId=${bkCompanyId}` : ""],
    enabled: !!bkCompanyId,
  });

  const resetForm = () => {
    setBkTourId(""); setBkCompanyId(""); setBkRouteId(""); setBkBusTypeId("");
    setServiceDate(""); setServiceEndDate(""); setCostQuoted(""); setBkNotes("");
  };

  const openCreate = () => { resetForm(); setShowForm(true); };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/bookings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/bookings"] });
      setShowForm(false); toast({ title: t("booking_created_toast") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/transport/bookings/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/bookings"] });
      toast({ title: t("booking_status_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    createMutation.mutate({
      companyId: bkCompanyId, tourId: bkTourId || undefined,
      routeId: bkRouteId || undefined, busTypeId: bkBusTypeId || undefined,
      serviceDate: serviceDate || undefined, serviceEndDate: serviceEndDate || undefined,
      costQuoted: costQuoted || undefined, notes: bkNotes || undefined,
    });
  };

  const getCompanyName = (id: string) => companies?.find((c) => c.id === id)?.name || id;
  const getTourTitle = (id: string | null) => tours?.find((t) => t.id === id)?.title || "-";

  const statusVariant = (s: string | null): "default" | "secondary" | "outline" | "destructive" => {
    if (s === "confirmed") return "default";
    if (s === "completed") return "outline";
    if (s === "cancelled") return "destructive";
    return "secondary";
  };

  const nextStatus = (current: string | null): string | null => {
    if (current === "requested") return "confirmed";
    if (current === "confirmed") return "completed";
    return null;
  };

  const normalizedSearch = search.trim().toLowerCase();
  const filteredBookings = bookings?.rows.filter((bk) =>
    !normalizedSearch ||
    getCompanyName(bk.companyId).toLowerCase().includes(normalizedSearch) ||
    getTourTitle(bk.tourId).toLowerCase().includes(normalizedSearch) ||
    (bk.serviceDate || "").toLowerCase().includes(normalizedSearch) ||
    (bk.serviceEndDate || "").toLowerCase().includes(normalizedSearch) ||
    String(bk.costQuoted || "").toLowerCase().includes(normalizedSearch) ||
    (t(`booking_status_${bk.status || "requested"}` as any) || "").toLowerCase().includes(normalizedSearch)
  ) ?? [];
  const filtersActive = Boolean(normalizedSearch) || Boolean(companyId);

  const gridTheme = useMemo(() => agGridTheme, []);
  const defaultColDef = useMemo<ColDef<TransportBooking>>(() => agGridDefaultColDef, []);
  const columnDefs = useMemo<ColDef<TransportBooking>[]>(() => [
    {
      headerName: t("company_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => companies?.find((company) => company.id === params.data?.companyId)?.name || params.data?.companyId || "-",
      cellRenderer: (params: ICellRendererParams<TransportBooking>) => params.data ? <span className="font-medium" data-testid={`text-booking-company-${params.data.id}`}>{companies?.find((company) => company.id === params.data?.companyId)?.name || params.data.companyId}</span> : null,
    },
    {
      headerName: t("tour_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => tours?.find((tour) => tour.id === params.data?.tourId)?.title || "-",
      cellRenderer: (params: ICellRendererParams<TransportBooking>) => params.data ? <span data-testid={`text-booking-tour-${params.data.id}`}>{tours?.find((tour) => tour.id === params.data?.tourId)?.title || "-"}</span> : null,
    },
    {
      headerName: t("service_date"),
      minWidth: 150,
      flex: 1,
      filter: "agDateColumnFilter",
      valueGetter: (params) => params.data?.serviceDate || "-",
      filterValueGetter: (params) => toGridDate(params.data?.serviceDate),
    },
    {
      headerName: t("end_date"),
      minWidth: 150,
      flex: 1,
      filter: "agDateColumnFilter",
      valueGetter: (params) => params.data?.serviceEndDate || "-",
      filterValueGetter: (params) => toGridDate(params.data?.serviceEndDate),
    },
    {
      headerName: t("cost_label"),
      width: 140,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.costQuoted != null ? Number(params.data.costQuoted) : null,
      valueFormatter: (params) => params.data?.costQuoted || "-",
      cellRenderer: (params: ICellRendererParams<TransportBooking>) => params.data ? <span data-testid={`text-booking-cost-${params.data.id}`}>{params.data.costQuoted || "-"}</span> : null,
    },
    {
      headerName: t("status"),
      width: 140,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.status || "requested",
      filterValueGetter: (params) => t(`booking_status_${params.data?.status || "requested"}` as any),
      cellRenderer: (params: ICellRendererParams<TransportBooking>) => {
        if (!params.data) return null;
        const booking = params.data;
        const status = booking.status || "requested";
        return <Badge variant={statusVariant(booking.status)} data-testid={`badge-booking-status-${booking.id}`}>{t(`booking_status_${status}` as any)}</Badge>;
      },
    },
    {
      headerName: t("actions"),
      width: 180,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<TransportBooking>) => {
        if (!params.data) return null;
        const booking = params.data;
        const next = nextStatus(booking.status);
        return (
          <div className="flex items-center gap-1">
            {next && (
              <Button className={pressFeedback} size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: booking.id, status: next })} disabled={statusMutation.isPending} data-testid={`button-advance-booking-${booking.id}`}>
                <Check className="h-4 w-4" />{t(`booking_status_${next}` as any)}
              </Button>
            )}
            {booking.status === "requested" && (
              <Button className={pressFeedback} size="icon" variant="ghost" onClick={() => statusMutation.mutate({ id: booking.id, status: "cancelled" })} disabled={statusMutation.isPending} data-testid={`button-cancel-booking-${booking.id}`}>
                <X className="h-4 w-4 text-destructive" />
              </Button>
            )}
          </div>
        );
      },
    },
  ], [companies, statusMutation, t, tours]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("filter_by_company")}</Label>
          <CompanySelector value={companyId} onChange={(value) => { setCompanyId(value); setPage(1); }} allowAll testId="select-booking-company-filter" />
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("search_transport_bookings_placeholder")} className="pl-9" data-testid="input-search-bookings" />
        </div>
        <Button className={pressFeedback} onClick={openCreate} data-testid="button-add-booking"><Plus className="h-4 w-4" />{t("new_booking")}</Button>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {!isLoading && (filteredBookings.length > 0 ? (
        <div data-testid="grid-transport-bookings" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
          <AgGridReact<TransportBooking>
            theme={gridTheme}
            rowData={filteredBookings}
            columnDefs={columnDefs}
            defaultColDef={defaultColDef}
            getRowId={(params: GetRowIdParams<TransportBooking>) => params.data.id}
            suppressCellFocus
          />
        </div>
      ) : (
        <Table><TableBody><TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{filtersActive ? t("no_results") : t("no_bookings_found")}</TableCell></TableRow></TableBody></Table>
      ))}

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span data-testid="text-bookings-pagination-info">{t("total_label")}: {bookings?.total ?? 0}</span>
        <div className="flex items-center gap-2">
          <Button className={pressFeedback} variant="outline" size="sm" aria-label={t("previous_page")} disabled={page <= 1} onClick={() => setPage(page - 1)} data-testid="button-prev-bookings-page"><ChevronLeft className="h-4 w-4" /></Button>
          <span>{page} / {totalPages}</span>
          <Button className={pressFeedback} variant="outline" size="sm" aria-label={t("next_page")} disabled={page >= totalPages} onClick={() => setPage(page + 1)} data-testid="button-next-bookings-page"><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className={`${surfaceShadow} max-w-lg max-h-[85vh] overflow-y-auto`}>
          <DialogHeader><DialogTitle>{t("new_transport_booking")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("company_label")} *</Label>
              <CompanySelector value={bkCompanyId} onChange={(v) => { setBkCompanyId(v); setBkRouteId(""); setBkBusTypeId(""); }} testId="select-booking-company" />
            </div>
            <div>
              <Label>{t("tour_label")}</Label>
              <Select value={bkTourId} onValueChange={setBkTourId}>
                <SelectTrigger data-testid="select-booking-tour"><SelectValue placeholder={t("select_tour_optional")} /></SelectTrigger>
                <SelectContent>
                  {tours?.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {bkCompanyId && (
              <>
                <div>
                  <Label>{t("route_label")}</Label>
                  <Select value={bkRouteId} onValueChange={setBkRouteId}>
                    <SelectTrigger data-testid="select-booking-route"><SelectValue placeholder={t("select_route_optional")} /></SelectTrigger>
                    <SelectContent>
                      {companyRoutes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{t("bus_type_label")}</Label>
                  <Select value={bkBusTypeId} onValueChange={setBkBusTypeId}>
                    <SelectTrigger data-testid="select-booking-bus-type"><SelectValue placeholder={t("select_bus_type_optional")} /></SelectTrigger>
                    <SelectContent>
                      {companyBusTypes?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.seats} {t("seats_label")})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
            <div><Label>{t("service_date")}</Label><Input type="date" value={serviceDate} onChange={(e) => setServiceDate(e.target.value)} data-testid="input-booking-service-date" /></div>
            <div><Label>{t("service_end_date")}</Label><Input type="date" value={serviceEndDate} onChange={(e) => setServiceEndDate(e.target.value)} data-testid="input-booking-end-date" /></div>
            <div><Label>{t("cost_quoted")}</Label><Input value={costQuoted} onChange={(e) => setCostQuoted(e.target.value)} data-testid="input-booking-cost" /></div>
            <div><Label>{t("notes")}</Label><Textarea value={bkNotes} onChange={(e) => setBkNotes(e.target.value)} data-testid="input-booking-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-new-booking">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!bkCompanyId || createMutation.isPending} data-testid="button-save-booking">
              {createMutation.isPending ? t("creating") : t("create_booking")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InvoicesPaymentsTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);

  const [invCompanyId, setInvCompanyId] = useState("");
  const [invBookingId, setInvBookingId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [serviceDetails, setServiceDetails] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invNotes, setInvNotes] = useState("");

  const [payCompanyId, setPayCompanyId] = useState("");
  const [payInvoiceId, setPayInvoiceId] = useState("");
  const [payTourId, setPayTourId] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [payReference, setPayReference] = useState("");
  const [payNotes, setPayNotes] = useState("");

  const [invoicePage, setInvoicePage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const pageSize = 50;

  const { data: invoices, isLoading: invoicesLoading } = useQuery<PaginatedTransportResponse<TransportInvoice>>({
    queryKey: ["/api/transport/invoices", `?page=${invoicePage}&pageSize=${pageSize}`],
  });
  const { data: payments, isLoading: paymentsLoading } = useQuery<PaginatedTransportResponse<TransportPayment>>({
    queryKey: ["/api/transport/payments", `?page=${paymentPage}&pageSize=${pageSize}`],
  });
  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });

  const invoiceTotalPages = Math.max(1, Math.ceil((invoices?.total ?? 0) / pageSize));
  const paymentTotalPages = Math.max(1, Math.ceil((payments?.total ?? 0) / pageSize));

  useEffect(() => {
    if (invoicePage > invoiceTotalPages) setInvoicePage(invoiceTotalPages);
  }, [invoicePage, invoiceTotalPages]);

  useEffect(() => {
    if (paymentPage > paymentTotalPages) setPaymentPage(paymentTotalPages);
  }, [paymentPage, paymentTotalPages]);

  const createInvoiceMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/invoices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/invoices"] });
      setShowInvoiceForm(false); toast({ title: t("invoice_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateInvoiceMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/transport/invoices/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/invoices"] });
      toast({ title: t("invoice_status_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const createPaymentMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/payments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/payments"] });
      setShowPaymentForm(false); toast({ title: t("payment_recorded") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleInvoiceSubmit = () => {
    createInvoiceMutation.mutate({
      companyId: invCompanyId, invoiceNumber,
      transportBookingId: invBookingId || undefined,
      serviceDetails: serviceDetails || undefined,
      amount: invAmount, notes: invNotes || undefined,
    });
  };

  const handlePaymentSubmit = () => {
    createPaymentMutation.mutate({
      companyId: payCompanyId, invoiceId: payInvoiceId || undefined,
      tourId: payTourId || undefined, amount: payAmount,
      paymentDate: paymentDate || undefined, paymentMethod: paymentMethod || undefined,
      reference: payReference || undefined, notes: payNotes || undefined,
    });
  };

  const gridTheme = useMemo(() => agGridTheme, []);
  const invoiceDefaultColDef = useMemo<ColDef<TransportInvoice>>(() => agGridDefaultColDef, []);
  const invoiceColumnDefs = useMemo<ColDef<TransportInvoice>[]>(() => [
    {
      headerName: t("invoice_number_header"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      field: "invoiceNumber",
      cellRenderer: (params: ICellRendererParams<TransportInvoice>) => params.data ? <span className="font-medium" data-testid={`text-invoice-number-${params.data.id}`}>{params.data.invoiceNumber}</span> : null,
    },
    {
      headerName: t("company_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => companies?.find((company) => company.id === params.data?.companyId)?.name || params.data?.companyId || "-",
      cellRenderer: (params: ICellRendererParams<TransportInvoice>) => params.data ? <span data-testid={`text-invoice-company-${params.data.id}`}>{companies?.find((company) => company.id === params.data?.companyId)?.name || params.data.companyId}</span> : null,
    },
    {
      headerName: t("service_details"),
      minWidth: 220,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.serviceDetails || "-",
      cellRenderer: (params: ICellRendererParams<TransportInvoice>) => params.data?.serviceDetails || "-",
    },
    {
      headerName: t("amount_label"),
      width: 140,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.amount != null ? Number(params.data.amount) : null,
      valueFormatter: (params) => params.data?.amount ?? "",
      cellRenderer: (params: ICellRendererParams<TransportInvoice>) => params.data ? <span data-testid={`text-invoice-amount-${params.data.id}`}>{params.data.amount}</span> : null,
    },
    {
      headerName: t("status"),
      width: 140,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.status || "submitted",
      filterValueGetter: (params) => t(`transport_invoice_status_${params.data?.status || "submitted"}` as any),
      cellRenderer: (params: ICellRendererParams<TransportInvoice>) => {
        if (!params.data) return null;
        const status = params.data.status || "submitted";
        const variant = status === "approved" ? "default" : status === "paid" ? "outline" : status === "rejected" ? "destructive" : "secondary";
        return <Badge variant={variant} data-testid={`badge-invoice-status-${params.data.id}`}>{t(`transport_invoice_status_${status}` as any)}</Badge>;
      },
    },
    {
      headerName: t("actions"),
      width: 180,
      pinned: "right",
      sortable: false,
      filter: false,
      resizable: false,
      cellRenderer: (params: ICellRendererParams<TransportInvoice>) => {
        if (!params.data) return null;
        const invoice = params.data;
        return invoice.status === "submitted" ? (
          <div className="flex items-center gap-1">
            <Button className={pressFeedback} size="sm" variant="outline" onClick={() => updateInvoiceMutation.mutate({ id: invoice.id, status: "approved" })} disabled={updateInvoiceMutation.isPending} data-testid={`button-approve-invoice-${invoice.id}`}>
              <Check className="h-4 w-4" />{t("approve")}
            </Button>
            <Button className={pressFeedback} size="sm" variant="ghost" onClick={() => updateInvoiceMutation.mutate({ id: invoice.id, status: "rejected" })} disabled={updateInvoiceMutation.isPending} data-testid={`button-reject-invoice-${invoice.id}`}>
              <X className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ) : null;
      },
    },
  ], [companies, t, updateInvoiceMutation]);

  const paymentDefaultColDef = useMemo<ColDef<TransportPayment>>(() => agGridDefaultColDef, []);
  const paymentColumnDefs = useMemo<ColDef<TransportPayment>[]>(() => [
    {
      headerName: t("company_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => companies?.find((company) => company.id === params.data?.companyId)?.name || params.data?.companyId || "-",
      cellRenderer: (params: ICellRendererParams<TransportPayment>) => params.data ? <span className="font-medium" data-testid={`text-payment-company-${params.data.id}`}>{companies?.find((company) => company.id === params.data?.companyId)?.name || params.data.companyId}</span> : null,
    },
    {
      headerName: t("tour_label"),
      minWidth: 180,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => tours?.find((tour) => tour.id === params.data?.tourId)?.title || "-",
      cellRenderer: (params: ICellRendererParams<TransportPayment>) => params.data ? <span data-testid={`text-payment-tour-${params.data.id}`}>{tours?.find((tour) => tour.id === params.data?.tourId)?.title || "-"}</span> : null,
    },
    {
      headerName: t("amount_label"),
      width: 140,
      filter: "agNumberColumnFilter",
      valueGetter: (params) => params.data?.amount != null ? Number(params.data.amount) : null,
      valueFormatter: (params) => params.data?.amount ?? "",
      cellRenderer: (params: ICellRendererParams<TransportPayment>) => params.data ? <span data-testid={`text-payment-amount-${params.data.id}`}>{params.data.amount}</span> : null,
    },
    {
      headerName: t("date"),
      width: 140,
      filter: "agDateColumnFilter",
      valueGetter: (params) => params.data?.paymentDate || "-",
      filterValueGetter: (params) => toGridDate(params.data?.paymentDate),
    },
    {
      headerName: t("method_label"),
      minWidth: 150,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.paymentMethod || "-",
    },
    {
      headerName: t("reference_label"),
      minWidth: 170,
      flex: 1,
      filter: "agTextColumnFilter",
      valueGetter: (params) => params.data?.reference || "-",
    },
  ], [companies, t, tours]);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><FileText className="h-5 w-5" />{t("invoices_label")}</h3>
          <Button className={pressFeedback} onClick={() => { setInvCompanyId(""); setInvBookingId(""); setInvoiceNumber(""); setServiceDetails(""); setInvAmount(""); setInvNotes(""); setShowInvoiceForm(true); }} data-testid="button-add-invoice">
            <Plus className="h-4 w-4" />{t("new_invoice")}
          </Button>
        </div>

        {invoicesLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

        {!invoicesLoading && ((invoices?.rows?.length ?? 0) > 0 ? (
          <div data-testid="grid-transport-invoices" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
            <AgGridReact<TransportInvoice>
              theme={gridTheme}
              rowData={invoices?.rows ?? []}
              columnDefs={invoiceColumnDefs}
              defaultColDef={invoiceDefaultColDef}
              getRowId={(params: GetRowIdParams<TransportInvoice>) => params.data.id}
              suppressCellFocus
            />
          </div>
        ) : (
          <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("no_invoices_found")}</TableCell></TableRow></TableBody></Table>
        ))}

        <div className="flex items-center justify-between text-sm text-muted-foreground mt-3">
          <span data-testid="text-invoices-pagination-info">{t("total_label")}: {invoices?.total ?? 0}</span>
          <div className="flex items-center gap-2">
            <Button className={pressFeedback} variant="outline" size="sm" aria-label={t("previous_page")} disabled={invoicePage <= 1} onClick={() => setInvoicePage(invoicePage - 1)} data-testid="button-prev-invoices-page"><ChevronLeft className="h-4 w-4" /></Button>
            <span>{invoicePage} / {invoiceTotalPages}</span>
            <Button className={pressFeedback} variant="outline" size="sm" aria-label={t("next_page")} disabled={invoicePage >= invoiceTotalPages} onClick={() => setInvoicePage(invoicePage + 1)} data-testid="button-next-invoices-page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><CreditCard className="h-5 w-5" />{t("payments")}</h3>
          <Button className={pressFeedback} onClick={() => { setPayCompanyId(""); setPayInvoiceId(""); setPayTourId(""); setPayAmount(""); setPaymentDate(""); setPaymentMethod(""); setPayReference(""); setPayNotes(""); setShowPaymentForm(true); }} data-testid="button-add-payment">
            <Plus className="h-4 w-4" />{t("record_payment")}
          </Button>
        </div>

        {paymentsLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

        {!paymentsLoading && ((payments?.rows?.length ?? 0) > 0 ? (
          <div data-testid="grid-transport-payments" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
            <AgGridReact<TransportPayment>
              theme={gridTheme}
              rowData={payments?.rows ?? []}
              columnDefs={paymentColumnDefs}
              defaultColDef={paymentDefaultColDef}
              getRowId={(params: GetRowIdParams<TransportPayment>) => params.data.id}
              suppressCellFocus
            />
          </div>
        ) : (
          <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("no_payments_found")}</TableCell></TableRow></TableBody></Table>
        ))}

        <div className="flex items-center justify-between text-sm text-muted-foreground mt-3">
          <span data-testid="text-payments-pagination-info">{t("total_label")}: {payments?.total ?? 0}</span>
          <div className="flex items-center gap-2">
            <Button className={pressFeedback} variant="outline" size="sm" aria-label={t("previous_page")} disabled={paymentPage <= 1} onClick={() => setPaymentPage(paymentPage - 1)} data-testid="button-prev-payments-page"><ChevronLeft className="h-4 w-4" /></Button>
            <span>{paymentPage} / {paymentTotalPages}</span>
            <Button className={pressFeedback} variant="outline" size="sm" aria-label={t("next_page")} disabled={paymentPage >= paymentTotalPages} onClick={() => setPaymentPage(paymentPage + 1)} data-testid="button-next-payments-page"><ChevronRight className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>

      <Dialog open={showInvoiceForm} onOpenChange={setShowInvoiceForm}>
        <DialogContent className={`${surfaceShadow} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader><DialogTitle>{t("create_invoice")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("company_label")} *</Label>
              <CompanySelector value={invCompanyId} onChange={setInvCompanyId} testId="select-invoice-company" />
            </div>
            <div><Label>{t("invoice_number_label")} *</Label><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} data-testid="input-invoice-number" /></div>
            <div><Label>{t("service_details")}</Label><Textarea value={serviceDetails} onChange={(e) => setServiceDetails(e.target.value)} data-testid="input-invoice-details" /></div>
            <div><Label>{t("amount_label")} *</Label><Input value={invAmount} onChange={(e) => setInvAmount(e.target.value)} data-testid="input-invoice-amount" /></div>
            <div><Label>{t("notes")}</Label><Textarea value={invNotes} onChange={(e) => setInvNotes(e.target.value)} data-testid="input-invoice-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvoiceForm(false)} data-testid="button-cancel-invoice">{t("cancel")}</Button>
            <Button onClick={handleInvoiceSubmit} disabled={!invCompanyId || !invoiceNumber || !invAmount || createInvoiceMutation.isPending} data-testid="button-save-invoice">
              {createInvoiceMutation.isPending ? t("creating") : t("create_invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPaymentForm} onOpenChange={setShowPaymentForm}>
        <DialogContent className={`${surfaceShadow} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader><DialogTitle>{t("record_payment")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("company_label")} *</Label>
              <CompanySelector value={payCompanyId} onChange={setPayCompanyId} testId="select-payment-company" />
            </div>
            <div>
              <Label>{t("tour_label")}</Label>
              <Select value={payTourId} onValueChange={setPayTourId}>
                <SelectTrigger data-testid="select-payment-tour"><SelectValue placeholder={t("select_tour_optional")} /></SelectTrigger>
                <SelectContent>
                  {tours?.map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("invoice_label")}</Label>
              <Select value={payInvoiceId} onValueChange={setPayInvoiceId}>
                <SelectTrigger data-testid="select-payment-invoice"><SelectValue placeholder={t("select_invoice_optional")} /></SelectTrigger>
                <SelectContent>
                  {invoices?.rows.filter((i) => !payCompanyId || i.companyId === payCompanyId).map((i) => (
                    <SelectItem key={i.id} value={i.id}>{i.invoiceNumber} - {i.amount}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("amount_label")} *</Label><Input value={payAmount} onChange={(e) => setPayAmount(e.target.value)} data-testid="input-payment-amount" /></div>
            <div><Label>{t("payment_date_label")}</Label><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} data-testid="input-payment-date" /></div>
            <div><Label>{t("payment_method_label")}</Label><Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder={t("payment_method_placeholder")} data-testid="input-payment-method" /></div>
            <div><Label>{t("reference_label")}</Label><Input value={payReference} onChange={(e) => setPayReference(e.target.value)} data-testid="input-payment-reference" /></div>
            <div><Label>{t("notes")}</Label><Textarea value={payNotes} onChange={(e) => setPayNotes(e.target.value)} data-testid="input-payment-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPaymentForm(false)} data-testid="button-cancel-payment">{t("cancel")}</Button>
            <Button onClick={handlePaymentSubmit} disabled={!payCompanyId || !payAmount || createPaymentMutation.isPending} data-testid="button-save-payment">
              {createPaymentMutation.isPending ? t("recording") : t("record_payment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TransportManagement() {
  const { t } = useLanguage();
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("transportation_management")}</h1>

      <Tabs defaultValue="companies">
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="companies" data-testid="tab-companies" className="flex items-center gap-1">
            <Building2 className="h-4 w-4" />{t("companies_label")}
          </TabsTrigger>
          <TabsTrigger value="bus-types" data-testid="tab-bus-types" className="flex items-center gap-1">
            <Bus className="h-4 w-4" />{t("bus_types_label")}
          </TabsTrigger>
          <TabsTrigger value="routes" data-testid="tab-routes" className="flex items-center gap-1">
            <Route className="h-4 w-4" />{t("routes_label")}
          </TabsTrigger>
          <TabsTrigger value="pricing" data-testid="tab-pricing" className="flex items-center gap-1">
            <DollarSign className="h-4 w-4" />{t("route_pricing_label")}
          </TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tab-bookings" className="flex items-center gap-1">
            <CalendarCheck className="h-4 w-4" />{t("bookings")}
          </TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />{t("invoices_payments_label")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="companies"><CompaniesTab /></TabsContent>
        <TabsContent value="bus-types"><BusTypesTab /></TabsContent>
        <TabsContent value="routes"><RoutesTab /></TabsContent>
        <TabsContent value="pricing"><RoutePricingTab /></TabsContent>
        <TabsContent value="bookings"><BookingsTab /></TabsContent>
        <TabsContent value="invoices"><InvoicesPaymentsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
