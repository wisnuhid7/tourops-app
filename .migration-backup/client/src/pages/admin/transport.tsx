import { useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import {
  Building2, Bus, Route, DollarSign, CalendarCheck, FileText,
  Plus, Pencil, Trash2, Check, X, CreditCard,
} from "lucide-react";
import type {
  TransportCompany, BusType, TransportRoute, TransportRoutePricing,
  TransportBooking, TransportInvoice, TransportPayment, Tour, Country,
} from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

function CompanySelector({
  value,
  onChange,
  testId,
}: {
  value: string;
  onChange: (v: string) => void;
  testId: string;
}) {
  const { t } = useLanguage();
  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue placeholder={t("select_company_placeholder")} />
      </SelectTrigger>
      <SelectContent>
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
      <DialogContent>
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

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditItem(null); resetForm(); setShowForm(true); }} data-testid="button-add-company">
          <Plus className="h-4 w-4 mr-2" />{t("add_company")}
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {companies?.map((company) => (
          <Card key={company.id} data-testid={`card-company-${company.id}`}>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">{company.name}</CardTitle>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" onClick={() => openEdit(company)} data-testid={`button-edit-company-${company.id}`}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setDeleteId(company.id)} data-testid={`button-delete-company-${company.id}`}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="text-muted-foreground" data-testid={`text-company-country-${company.id}`}>
                {t("country_prefix")} {getCountryName(company.countryId)}
              </p>
              {company.contactName && <p className="text-muted-foreground">{t("contact_prefix")} {company.contactName}</p>}
              {company.contactPhone && <p className="text-muted-foreground">{t("phone_prefix")} {company.contactPhone}</p>}
              {company.contactEmail && <p className="text-muted-foreground">{t("email_prefix")} {company.contactEmail}</p>}
              {company.city && <p className="text-muted-foreground">{t("city_prefix")} {company.city}{company.state ? `, ${company.state}` : ""}</p>}
              {company.vehicleTypes && company.vehicleTypes.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {company.vehicleTypes.map((vt) => (
                    <Badge key={vt} variant="secondary">{vt}</Badge>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
        {(!companies || companies.length === 0) && (
          <p className="text-muted-foreground col-span-full text-center py-8">{t("no_transport_companies_found")}</p>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) { setEditItem(null); resetForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
  const [editItem, setEditItem] = useState<BusType | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [btName, setBtName] = useState("");
  const [seats, setSeats] = useState("");
  const [costPerDay, setCostPerDay] = useState("");
  const [costPerMile, setCostPerMile] = useState("");
  const [description, setDescription] = useState("");

  const { data: busTypes, isLoading } = useQuery<BusType[]>({
    queryKey: ["/api/transport/bus-types", companyId ? `?companyId=${companyId}` : ""],
    enabled: !!companyId,
  });

  const resetForm = () => { setBtName(""); setSeats(""); setCostPerDay(""); setCostPerMile(""); setDescription(""); };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: BusType) => {
    setEditItem(item); setBtName(item.name); setSeats(String(item.seats));
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
      companyId, name: btName, seats: parseInt(seats) || 0,
      costPerDay: costPerDay || undefined, costPerMile: costPerMile || undefined,
      description: description || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("filter_by_company")}</Label>
          <CompanySelector value={companyId} onChange={setCompanyId} testId="select-bustype-company" />
        </div>
        {companyId && (
          <Button onClick={openCreate} data-testid="button-add-bus-type"><Plus className="h-4 w-4 mr-2" />{t("add_bus_type")}</Button>
        )}
      </div>

      {!companyId && <p className="text-muted-foreground text-center py-8">{t("select_company_to_view_bus_types")}</p>}

      {companyId && isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {companyId && !isLoading && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name_label")}</TableHead>
              <TableHead>{t("seats_label")}</TableHead>
              <TableHead>{t("cost_per_day_header")}</TableHead>
              <TableHead>{t("cost_per_mile_header")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {busTypes?.map((bt) => (
              <TableRow key={bt.id} data-testid={`row-bus-type-${bt.id}`}>
                <TableCell className="font-medium" data-testid={`text-bustype-name-${bt.id}`}>{bt.name}</TableCell>
                <TableCell data-testid={`text-bustype-seats-${bt.id}`}>{bt.seats}</TableCell>
                <TableCell className="text-muted-foreground">{bt.costPerDay || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{bt.costPerMile || "-"}</TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">{bt.description || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(bt)} data-testid={`button-edit-bus-type-${bt.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(bt.id)} data-testid={`button-delete-bus-type-${bt.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!busTypes || busTypes.length === 0) && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("no_bus_types_found")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? t("edit_bus_type") : t("add_bus_type")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("name_label")} *</Label><Input value={btName} onChange={(e) => setBtName(e.target.value)} data-testid="input-bustype-name" /></div>
            <div><Label>{t("seats_label")} *</Label><Input type="number" value={seats} onChange={(e) => setSeats(e.target.value)} data-testid="input-bustype-seats" /></div>
            <div><Label>{t("cost_per_day_label")}</Label><Input value={costPerDay} onChange={(e) => setCostPerDay(e.target.value)} data-testid="input-bustype-cost-day" /></div>
            <div><Label>{t("cost_per_mile_label")}</Label><Input value={costPerMile} onChange={(e) => setCostPerMile(e.target.value)} data-testid="input-bustype-cost-mile" /></div>
            <div><Label>{t("description")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-bustype-description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-bus-type">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!btName || !seats || createMutation.isPending || updateMutation.isPending} data-testid="button-save-bus-type">
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
  const [editItem, setEditItem] = useState<TransportRoute | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [rtName, setRtName] = useState("");
  const [rtDescription, setRtDescription] = useState("");
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");

  const { data: routes, isLoading } = useQuery<TransportRoute[]>({
    queryKey: ["/api/transport/routes", companyId ? `?companyId=${companyId}` : ""],
    enabled: !!companyId,
  });

  const resetForm = () => { setRtName(""); setRtDescription(""); setFromCity(""); setToCity(""); setDistanceMiles(""); };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: TransportRoute) => {
    setEditItem(item); setRtName(item.name); setRtDescription(item.description || "");
    setFromCity(item.fromCity || ""); setToCity(item.toCity || "");
    setDistanceMiles(item.distanceMiles || ""); setShowForm(true);
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
      companyId, name: rtName, description: rtDescription || undefined,
      fromCity: fromCity || undefined, toCity: toCity || undefined,
      distanceMiles: distanceMiles || undefined,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("filter_by_company")}</Label>
          <CompanySelector value={companyId} onChange={setCompanyId} testId="select-route-company" />
        </div>
        {companyId && (
          <Button onClick={openCreate} data-testid="button-add-route"><Plus className="h-4 w-4 mr-2" />{t("add_route")}</Button>
        )}
      </div>

      {!companyId && <p className="text-muted-foreground text-center py-8">{t("select_company_to_view_routes")}</p>}

      {companyId && isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {companyId && !isLoading && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("name_label")}</TableHead>
              <TableHead>{t("from_label")}</TableHead>
              <TableHead>{t("to_label")}</TableHead>
              <TableHead>{t("distance_mi")}</TableHead>
              <TableHead>{t("description")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes?.map((rt) => (
              <TableRow key={rt.id} data-testid={`row-route-${rt.id}`}>
                <TableCell className="font-medium" data-testid={`text-route-name-${rt.id}`}>{rt.name}</TableCell>
                <TableCell data-testid={`text-route-from-${rt.id}`}>{rt.fromCity || "-"}</TableCell>
                <TableCell data-testid={`text-route-to-${rt.id}`}>{rt.toCity || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{rt.distanceMiles || "-"}</TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">{rt.description || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(rt)} data-testid={`button-edit-route-${rt.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(rt.id)} data-testid={`button-delete-route-${rt.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!routes || routes.length === 0) && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("no_routes_found")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? t("edit_route") : t("add_route")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("name_label")} *</Label><Input value={rtName} onChange={(e) => setRtName(e.target.value)} data-testid="input-route-name" /></div>
            <div><Label>{t("from_city")}</Label><Input value={fromCity} onChange={(e) => setFromCity(e.target.value)} data-testid="input-route-from" /></div>
            <div><Label>{t("to_city")}</Label><Input value={toCity} onChange={(e) => setToCity(e.target.value)} data-testid="input-route-to" /></div>
            <div><Label>{t("distance_miles")}</Label><Input value={distanceMiles} onChange={(e) => setDistanceMiles(e.target.value)} data-testid="input-route-distance" /></div>
            <div><Label>{t("description")}</Label><Textarea value={rtDescription} onChange={(e) => setRtDescription(e.target.value)} data-testid="input-route-description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-route">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!rtName || createMutation.isPending || updateMutation.isPending} data-testid="button-save-route">
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
  const [editItem, setEditItem] = useState<TransportRoutePricing | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [busTypeId, setBusTypeId] = useState("");
  const [costPerTrip, setCostPerTrip] = useState("");
  const [pricingNotes, setPricingNotes] = useState("");

  const { data: routes } = useQuery<TransportRoute[]>({
    queryKey: ["/api/transport/routes", companyId ? `?companyId=${companyId}` : ""],
    enabled: !!companyId,
  });

  const { data: busTypes } = useQuery<BusType[]>({
    queryKey: ["/api/transport/bus-types", companyId ? `?companyId=${companyId}` : ""],
    enabled: !!companyId,
  });

  const { data: pricing, isLoading } = useQuery<TransportRoutePricing[]>({
    queryKey: ["/api/transport/route-pricing", routeId ? `?routeId=${routeId}` : ""],
    enabled: !!routeId,
  });

  const resetForm = () => { setBusTypeId(""); setCostPerTrip(""); setPricingNotes(""); };

  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (item: TransportRoutePricing) => {
    setEditItem(item); setBusTypeId(item.busTypeId); setCostPerTrip(item.costPerTrip);
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
    const data = { routeId, busTypeId, costPerTrip, notes: pricingNotes || undefined };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const getBusTypeName = (id: string) => busTypes?.find((b) => b.id === id)?.name || id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("company_label")}</Label>
          <CompanySelector value={companyId} onChange={(v) => { setCompanyId(v); setRouteId(""); }} testId="select-pricing-company" />
        </div>
        {companyId && (
          <div className="w-64">
            <Label>{t("route_label")}</Label>
            <Select value={routeId} onValueChange={setRouteId}>
              <SelectTrigger data-testid="select-pricing-route"><SelectValue placeholder={t("select_route_placeholder")} /></SelectTrigger>
              <SelectContent>
                {routes?.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {routeId && (
          <Button onClick={openCreate} data-testid="button-add-pricing"><Plus className="h-4 w-4 mr-2" />{t("add_pricing")}</Button>
        )}
      </div>

      {!routeId && <p className="text-muted-foreground text-center py-8">{t("select_company_and_route")}</p>}

      {routeId && isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {routeId && !isLoading && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("bus_type_label")}</TableHead>
              <TableHead>{t("cost_per_trip")}</TableHead>
              <TableHead>{t("notes")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pricing?.map((p) => (
              <TableRow key={p.id} data-testid={`row-pricing-${p.id}`}>
                <TableCell className="font-medium" data-testid={`text-pricing-bustype-${p.id}`}>{getBusTypeName(p.busTypeId)}</TableCell>
                <TableCell data-testid={`text-pricing-cost-${p.id}`}>{p.costPerTrip}</TableCell>
                <TableCell className="text-muted-foreground max-w-[200px] truncate">{p.notes || "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(p)} data-testid={`button-edit-pricing-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDeleteId(p.id)} data-testid={`button-delete-pricing-${p.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!pricing || pricing.length === 0) && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">{t("no_pricing_entries_found")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? t("edit_pricing") : t("add_pricing")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("bus_type_label")} *</Label>
              <Select value={busTypeId} onValueChange={setBusTypeId}>
                <SelectTrigger data-testid="select-pricing-bus-type"><SelectValue placeholder={t("select_bus_type_placeholder")} /></SelectTrigger>
                <SelectContent>
                  {busTypes?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.seats} seats)</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("cost_per_trip")} *</Label><Input value={costPerTrip} onChange={(e) => setCostPerTrip(e.target.value)} data-testid="input-pricing-cost" /></div>
            <div><Label>{t("notes")}</Label><Textarea value={pricingNotes} onChange={(e) => setPricingNotes(e.target.value)} data-testid="input-pricing-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-pricing">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!busTypeId || !costPerTrip || createMutation.isPending || updateMutation.isPending} data-testid="button-save-pricing">
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
  const [showForm, setShowForm] = useState(false);

  const [bkTourId, setBkTourId] = useState("");
  const [bkCompanyId, setBkCompanyId] = useState("");
  const [bkRouteId, setBkRouteId] = useState("");
  const [bkBusTypeId, setBkBusTypeId] = useState("");
  const [serviceDate, setServiceDate] = useState("");
  const [serviceEndDate, setServiceEndDate] = useState("");
  const [costQuoted, setCostQuoted] = useState("");
  const [bkNotes, setBkNotes] = useState("");

  const { data: bookings, isLoading } = useQuery<TransportBooking[]>({
    queryKey: ["/api/transport/bookings", companyId ? `?companyId=${companyId}` : ""],
  });

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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-64">
          <Label>{t("filter_by_company")}</Label>
          <CompanySelector value={companyId} onChange={setCompanyId} testId="select-booking-company-filter" />
        </div>
        <Button onClick={openCreate} data-testid="button-add-booking"><Plus className="h-4 w-4 mr-2" />{t("new_booking")}</Button>
      </div>

      {isLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

      {!isLoading && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("company_label")}</TableHead>
              <TableHead>{t("tour_label")}</TableHead>
              <TableHead>{t("service_date")}</TableHead>
              <TableHead>{t("end_date")}</TableHead>
              <TableHead>{t("cost_label")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead>{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {bookings?.map((bk) => (
              <TableRow key={bk.id} data-testid={`row-booking-${bk.id}`}>
                <TableCell className="font-medium" data-testid={`text-booking-company-${bk.id}`}>{getCompanyName(bk.companyId)}</TableCell>
                <TableCell data-testid={`text-booking-tour-${bk.id}`}>{getTourTitle(bk.tourId)}</TableCell>
                <TableCell className="text-muted-foreground">{bk.serviceDate || "-"}</TableCell>
                <TableCell className="text-muted-foreground">{bk.serviceEndDate || "-"}</TableCell>
                <TableCell data-testid={`text-booking-cost-${bk.id}`}>{bk.costQuoted || "-"}</TableCell>
                <TableCell><Badge variant={statusVariant(bk.status)} data-testid={`badge-booking-status-${bk.id}`}>{bk.status}</Badge></TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    {nextStatus(bk.status) && (
                      <Button size="sm" variant="outline" onClick={() => statusMutation.mutate({ id: bk.id, status: nextStatus(bk.status)! })} disabled={statusMutation.isPending} data-testid={`button-advance-booking-${bk.id}`}>
                        <Check className="h-4 w-4 mr-1" />{nextStatus(bk.status)}
                      </Button>
                    )}
                    {bk.status === "requested" && (
                      <Button size="icon" variant="ghost" onClick={() => statusMutation.mutate({ id: bk.id, status: "cancelled" })} disabled={statusMutation.isPending} data-testid={`button-cancel-booking-${bk.id}`}>
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!bookings || bookings.length === 0) && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">{t("no_bookings_found")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-lg">
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
                      {companyBusTypes?.map((b) => <SelectItem key={b.id} value={b.id}>{b.name} ({b.seats} seats)</SelectItem>)}
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

  const { data: invoices, isLoading: invoicesLoading } = useQuery<TransportInvoice[]>({ queryKey: ["/api/transport/invoices"] });
  const { data: payments, isLoading: paymentsLoading } = useQuery<TransportPayment[]>({ queryKey: ["/api/transport/payments"] });
  const { data: companies } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });

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

  const getCompanyName = (id: string) => companies?.find((c) => c.id === id)?.name || id;
  const getTourTitle = (id: string | null) => tours?.find((t) => t.id === id)?.title || "-";

  const invoiceStatusVariant = (s: string | null): "default" | "secondary" | "outline" | "destructive" => {
    if (s === "approved") return "default";
    if (s === "paid") return "outline";
    if (s === "rejected") return "destructive";
    return "secondary";
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><FileText className="h-5 w-5" />{t("invoices_label")}</h3>
          <Button onClick={() => { setInvCompanyId(""); setInvBookingId(""); setInvoiceNumber(""); setServiceDetails(""); setInvAmount(""); setInvNotes(""); setShowInvoiceForm(true); }} data-testid="button-add-invoice">
            <Plus className="h-4 w-4 mr-2" />{t("new_invoice")}
          </Button>
        </div>

        {invoicesLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

        {!invoicesLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("invoice_number_header")}</TableHead>
                <TableHead>{t("company_label")}</TableHead>
                <TableHead>{t("service_details")}</TableHead>
                <TableHead>{t("amount_label")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices?.map((inv) => (
                <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                  <TableCell className="font-medium" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber}</TableCell>
                  <TableCell data-testid={`text-invoice-company-${inv.id}`}>{getCompanyName(inv.companyId)}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{inv.serviceDetails || "-"}</TableCell>
                  <TableCell data-testid={`text-invoice-amount-${inv.id}`}>{inv.amount}</TableCell>
                  <TableCell><Badge variant={invoiceStatusVariant(inv.status)} data-testid={`badge-invoice-status-${inv.id}`}>{inv.status}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {inv.status === "submitted" && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => updateInvoiceMutation.mutate({ id: inv.id, status: "approved" })} disabled={updateInvoiceMutation.isPending} data-testid={`button-approve-invoice-${inv.id}`}>
                            <Check className="h-4 w-4 mr-1" />{t("approve")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => updateInvoiceMutation.mutate({ id: inv.id, status: "rejected" })} disabled={updateInvoiceMutation.isPending} data-testid={`button-reject-invoice-${inv.id}`}>
                            <X className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!invoices || invoices.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("no_invoices_found")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><CreditCard className="h-5 w-5" />{t("payments")}</h3>
          <Button onClick={() => { setPayCompanyId(""); setPayInvoiceId(""); setPayTourId(""); setPayAmount(""); setPaymentDate(""); setPaymentMethod(""); setPayReference(""); setPayNotes(""); setShowPaymentForm(true); }} data-testid="button-add-payment">
            <Plus className="h-4 w-4 mr-2" />{t("record_payment")}
          </Button>
        </div>

        {paymentsLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

        {!paymentsLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("company_label")}</TableHead>
                <TableHead>{t("tour_label")}</TableHead>
                <TableHead>{t("amount_label")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead>{t("method_label")}</TableHead>
                <TableHead>{t("reference_label")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments?.map((pay) => (
                <TableRow key={pay.id} data-testid={`row-payment-${pay.id}`}>
                  <TableCell className="font-medium" data-testid={`text-payment-company-${pay.id}`}>{getCompanyName(pay.companyId)}</TableCell>
                  <TableCell data-testid={`text-payment-tour-${pay.id}`}>{getTourTitle(pay.tourId)}</TableCell>
                  <TableCell data-testid={`text-payment-amount-${pay.id}`}>{pay.amount}</TableCell>
                  <TableCell className="text-muted-foreground">{pay.paymentDate || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{pay.paymentMethod || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{pay.reference || "-"}</TableCell>
                </TableRow>
              ))}
              {(!payments || payments.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("no_payments_found")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </div>

      <Dialog open={showInvoiceForm} onOpenChange={setShowInvoiceForm}>
        <DialogContent>
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
        <DialogContent>
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
                  {invoices?.filter((i) => !payCompanyId || i.companyId === payCompanyId).map((i) => (
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
