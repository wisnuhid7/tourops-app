import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
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
import { useLanguage } from "@/hooks/use-language";
import {
  Building2, Bus, Route, CalendarCheck, FileText,
  Plus, Pencil, Trash2, Check, X, AlertTriangle,
} from "lucide-react";
import type {
  UserProfile, TransportCompany, BusType, TransportRoute, TransportRoutePricing,
  TransportBooking, TransportInvoice, Tour,
} from "@shared/schema";

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
          {t("confirm_delete_record_message")}
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-cancel-delete">{t("cancel")}</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending} data-testid="button-confirm-delete">
            {isPending ? t("deleting_ellipsis") : t("delete")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CompanyProfileTab({ companyId }: { companyId: string }) {
  const { t } = useLanguage();
  const { data: companies, isLoading } = useQuery<TransportCompany[]>({ queryKey: ["/api/master/transport-companies"] });
  const company = companies?.find((c) => c.id === companyId);

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}</div>;

  if (!company) return <p className="text-muted-foreground text-center py-8" data-testid="text-company-not-found">{t("company_profile_not_found")}</p>;

  return (
    <div className="space-y-4">
      <Card data-testid={`card-company-profile-${company.id}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />{company.name}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm font-medium">{t("contact_name")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-contact-name">{company.contactName || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{t("contact_phone")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-contact-phone">{company.contactPhone || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{t("contact_email")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-contact-email">{company.contactEmail || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{t("city_label")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-city">{company.city ? `${company.city}${company.state ? `, ${company.state}` : ""}` : "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{t("address_label")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-address">{company.addressLine1 || "-"}{company.addressLine2 ? `, ${company.addressLine2}` : ""}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{t("postal_code")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-postal-code">{company.postalCode || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{t("tax_id")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-tax-id">{company.taxId || "-"}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{t("bank_name")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-bank-name">{company.bankName || "-"}</p>
            </div>
          </div>
          {company.vehicleTypes && company.vehicleTypes.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-1">{t("vehicle_types")}</p>
              <div className="flex flex-wrap gap-1">
                {company.vehicleTypes.map((vt) => (
                  <Badge key={vt} variant="secondary" data-testid={`badge-vehicle-type-${vt}`}>{vt}</Badge>
                ))}
              </div>
            </div>
          )}
          {company.notes && (
            <div>
              <p className="text-sm font-medium">{t("notes")}</p>
              <p className="text-sm text-muted-foreground" data-testid="text-profile-notes">{company.notes}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BusTypesTab({ companyId }: { companyId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<BusType | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const [btName, setBtName] = useState("");
  const [seats, setSeats] = useState("");
  const [costPerDay, setCostPerDay] = useState("");
  const [costPerMile, setCostPerMile] = useState("");
  const [description, setDescription] = useState("");

  const { data: busTypes, isLoading } = useQuery<BusType[]>({
    queryKey: ["/api/transport/bus-types", `?companyId=${companyId}`],
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

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold flex items-center gap-2"><Bus className="h-5 w-5" />{t("bus_types_heading")}</h3>
        <Button onClick={openCreate} data-testid="button-add-bus-type"><Plus className="h-4 w-4 mr-2" />{t("add_bus_type")}</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("name_label")}</TableHead>
            <TableHead>{t("seats_label")}</TableHead>
            <TableHead>{t("cost_per_day")}</TableHead>
            <TableHead>{t("cost_per_mile")}</TableHead>
            <TableHead>{t("description_label")}</TableHead>
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

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? t("edit_bus_type") : t("add_bus_type")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("name_label")} *</Label><Input value={btName} onChange={(e) => setBtName(e.target.value)} data-testid="input-bustype-name" /></div>
            <div><Label>{t("seats_label")} *</Label><Input type="number" value={seats} onChange={(e) => setSeats(e.target.value)} data-testid="input-bustype-seats" /></div>
            <div><Label>{t("cost_per_day_label")}</Label><Input value={costPerDay} onChange={(e) => setCostPerDay(e.target.value)} data-testid="input-bustype-cost-day" /></div>
            <div><Label>{t("cost_per_mile_label")}</Label><Input value={costPerMile} onChange={(e) => setCostPerMile(e.target.value)} data-testid="input-bustype-cost-mile" /></div>
            <div><Label>{t("description_label")}</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} data-testid="input-bustype-description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-bus-type">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!btName || !seats || createMutation.isPending || updateMutation.isPending} data-testid="button-save-bus-type">
              {(createMutation.isPending || updateMutation.isPending) ? t("saving_ellipsis") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)} onConfirm={() => deleteId && deleteMutation.mutate(deleteId)} isPending={deleteMutation.isPending} entityName={t("bus_type_entity")} />
    </div>
  );
}

function RoutesAndPricingTab({ companyId }: { companyId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [editItem, setEditItem] = useState<TransportRoute | null>(null);
  const [showRouteForm, setShowRouteForm] = useState(false);
  const [deleteRouteId, setDeleteRouteId] = useState<string | null>(null);

  const [rtName, setRtName] = useState("");
  const [rtDescription, setRtDescription] = useState("");
  const [fromCity, setFromCity] = useState("");
  const [toCity, setToCity] = useState("");
  const [distanceMiles, setDistanceMiles] = useState("");

  const [selectedRouteId, setSelectedRouteId] = useState("");
  const [editPricingItem, setEditPricingItem] = useState<TransportRoutePricing | null>(null);
  const [showPricingForm, setShowPricingForm] = useState(false);
  const [deletePricingId, setDeletePricingId] = useState<string | null>(null);

  const [busTypeId, setBusTypeId] = useState("");
  const [costPerTrip, setCostPerTrip] = useState("");
  const [pricingNotes, setPricingNotes] = useState("");

  const { data: routes, isLoading: routesLoading } = useQuery<TransportRoute[]>({
    queryKey: ["/api/transport/routes", `?companyId=${companyId}`],
  });

  const { data: busTypes } = useQuery<BusType[]>({
    queryKey: ["/api/transport/bus-types", `?companyId=${companyId}`],
  });

  const { data: pricing, isLoading: pricingLoading } = useQuery<TransportRoutePricing[]>({
    queryKey: ["/api/transport/route-pricing", selectedRouteId ? `?routeId=${selectedRouteId}` : ""],
    enabled: !!selectedRouteId,
  });

  const resetRouteForm = () => { setRtName(""); setRtDescription(""); setFromCity(""); setToCity(""); setDistanceMiles(""); };

  const openCreateRoute = () => { setEditItem(null); resetRouteForm(); setShowRouteForm(true); };
  const openEditRoute = (item: TransportRoute) => {
    setEditItem(item); setRtName(item.name); setRtDescription(item.description || "");
    setFromCity(item.fromCity || ""); setToCity(item.toCity || "");
    setDistanceMiles(item.distanceMiles || ""); setShowRouteForm(true);
  };

  const createRouteMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/routes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/routes"] });
      setShowRouteForm(false); toast({ title: t("route_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateRouteMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/transport/routes/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/routes"] });
      setShowRouteForm(false); setEditItem(null); toast({ title: t("route_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteRouteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/transport/routes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/routes"] });
      setDeleteRouteId(null); toast({ title: t("route_deleted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleRouteSubmit = () => {
    const data = {
      companyId, name: rtName, description: rtDescription || undefined,
      fromCity: fromCity || undefined, toCity: toCity || undefined,
      distanceMiles: distanceMiles || undefined,
    };
    if (editItem) updateRouteMutation.mutate({ id: editItem.id, ...data });
    else createRouteMutation.mutate(data);
  };

  const resetPricingForm = () => { setBusTypeId(""); setCostPerTrip(""); setPricingNotes(""); };

  const openCreatePricing = () => { setEditPricingItem(null); resetPricingForm(); setShowPricingForm(true); };
  const openEditPricing = (item: TransportRoutePricing) => {
    setEditPricingItem(item); setBusTypeId(item.busTypeId); setCostPerTrip(item.costPerTrip);
    setPricingNotes(item.notes || ""); setShowPricingForm(true);
  };

  const createPricingMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/route-pricing", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/route-pricing"] });
      setShowPricingForm(false); toast({ title: t("pricing_entry_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updatePricingMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/transport/route-pricing/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/route-pricing"] });
      setShowPricingForm(false); setEditPricingItem(null); toast({ title: t("pricing_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deletePricingMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/transport/route-pricing/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/route-pricing"] });
      setDeletePricingId(null); toast({ title: t("pricing_deleted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handlePricingSubmit = () => {
    const data = { routeId: selectedRouteId, busTypeId, costPerTrip, notes: pricingNotes || undefined };
    if (editPricingItem) updatePricingMutation.mutate({ id: editPricingItem.id, ...data });
    else createPricingMutation.mutate(data);
  };

  const getBusTypeName = (id: string) => busTypes?.find((b) => b.id === id)?.name || id;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold flex items-center gap-2"><Route className="h-5 w-5" />{t("routes_heading")}</h3>
          <Button onClick={openCreateRoute} data-testid="button-add-route"><Plus className="h-4 w-4 mr-2" />{t("add_route")}</Button>
        </div>

        {routesLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

        {!routesLoading && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name_label")}</TableHead>
                <TableHead>{t("from_label")}</TableHead>
                <TableHead>{t("to_label")}</TableHead>
                <TableHead>{t("distance_mi")}</TableHead>
                <TableHead>{t("description_label")}</TableHead>
                <TableHead>{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes?.map((rt) => (
                <TableRow key={rt.id} data-testid={`row-route-${rt.id}`} className={selectedRouteId === rt.id ? "bg-muted/50" : ""}>
                  <TableCell className="font-medium" data-testid={`text-route-name-${rt.id}`}>
                    <Button variant="ghost" className="p-0 h-auto underline" onClick={() => setSelectedRouteId(rt.id === selectedRouteId ? "" : rt.id)} data-testid={`button-select-route-${rt.id}`}>
                      {rt.name}
                    </Button>
                  </TableCell>
                  <TableCell data-testid={`text-route-from-${rt.id}`}>{rt.fromCity || "-"}</TableCell>
                  <TableCell data-testid={`text-route-to-${rt.id}`}>{rt.toCity || "-"}</TableCell>
                  <TableCell className="text-muted-foreground">{rt.distanceMiles || "-"}</TableCell>
                  <TableCell className="text-muted-foreground max-w-[200px] truncate">{rt.description || "-"}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditRoute(rt)} data-testid={`button-edit-route-${rt.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteRouteId(rt.id)} data-testid={`button-delete-route-${rt.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
      </div>

      {selectedRouteId && (
        <div>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 className="text-lg font-semibold">{t("pricing_for_label")}: {routes?.find((r) => r.id === selectedRouteId)?.name}</h3>
            <Button onClick={openCreatePricing} data-testid="button-add-pricing"><Plus className="h-4 w-4 mr-2" />{t("add_pricing")}</Button>
          </div>

          {pricingLoading && <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>}

          {!pricingLoading && (
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
                        <Button size="icon" variant="ghost" onClick={() => openEditPricing(p)} data-testid={`button-edit-pricing-${p.id}`}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeletePricingId(p.id)} data-testid={`button-delete-pricing-${p.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
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
        </div>
      )}

      <Dialog open={showRouteForm} onOpenChange={(v) => { setShowRouteForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? t("edit_route") : t("add_route")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("name_label")} *</Label><Input value={rtName} onChange={(e) => setRtName(e.target.value)} data-testid="input-route-name" /></div>
            <div><Label>{t("from_city")}</Label><Input value={fromCity} onChange={(e) => setFromCity(e.target.value)} data-testid="input-route-from" /></div>
            <div><Label>{t("to_city")}</Label><Input value={toCity} onChange={(e) => setToCity(e.target.value)} data-testid="input-route-to" /></div>
            <div><Label>{t("distance_miles")}</Label><Input value={distanceMiles} onChange={(e) => setDistanceMiles(e.target.value)} data-testid="input-route-distance" /></div>
            <div><Label>{t("description_label")}</Label><Textarea value={rtDescription} onChange={(e) => setRtDescription(e.target.value)} data-testid="input-route-description" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRouteForm(false)} data-testid="button-cancel-route">{t("cancel")}</Button>
            <Button onClick={handleRouteSubmit} disabled={!rtName || createRouteMutation.isPending || updateRouteMutation.isPending} data-testid="button-save-route">
              {(createRouteMutation.isPending || updateRouteMutation.isPending) ? t("saving_ellipsis") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showPricingForm} onOpenChange={(v) => { setShowPricingForm(v); if (!v) setEditPricingItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editPricingItem ? t("edit_pricing") : t("add_pricing")}</DialogTitle></DialogHeader>
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
            <Button variant="outline" onClick={() => setShowPricingForm(false)} data-testid="button-cancel-pricing">{t("cancel")}</Button>
            <Button onClick={handlePricingSubmit} disabled={!busTypeId || !costPerTrip || createPricingMutation.isPending || updatePricingMutation.isPending} data-testid="button-save-pricing">
              {(createPricingMutation.isPending || updatePricingMutation.isPending) ? t("saving_ellipsis") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DeleteConfirmDialog open={!!deleteRouteId} onOpenChange={(v) => !v && setDeleteRouteId(null)} onConfirm={() => deleteRouteId && deleteRouteMutation.mutate(deleteRouteId)} isPending={deleteRouteMutation.isPending} entityName={t("route_entity")} />
      <DeleteConfirmDialog open={!!deletePricingId} onOpenChange={(v) => !v && setDeletePricingId(null)} onConfirm={() => deletePricingId && deletePricingMutation.mutate(deletePricingId)} isPending={deletePricingMutation.isPending} entityName={t("pricing_entry_entity")} />
    </div>
  );
}

function BookingsTab({ companyId }: { companyId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: bookings, isLoading } = useQuery<TransportBooking[]>({
    queryKey: ["/api/transport/bookings", `?companyId=${companyId}`],
  });

  const { data: tours } = useQuery<Tour[]>({ queryKey: ["/api/tours"] });

  const { data: routes } = useQuery<TransportRoute[]>({
    queryKey: ["/api/transport/routes", `?companyId=${companyId}`],
  });

  const { data: busTypesData } = useQuery<BusType[]>({
    queryKey: ["/api/transport/bus-types", `?companyId=${companyId}`],
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => apiRequest("PATCH", `/api/transport/bookings/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/bookings"] });
      toast({ title: t("booking_status_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const getTourTitle = (id: string | null) => tours?.find((t) => t.id === id)?.title || "-";
  const getRouteName = (id: string | null) => routes?.find((r) => r.id === id)?.name || "-";
  const getBusTypeName = (id: string | null) => busTypesData?.find((b) => b.id === id)?.name || "-";

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

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2"><CalendarCheck className="h-5 w-5" />{t("bookings")}</h3>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("tour_label")}</TableHead>
            <TableHead>{t("route_label")}</TableHead>
            <TableHead>{t("bus_type_label")}</TableHead>
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
              <TableCell data-testid={`text-booking-tour-${bk.id}`}>{getTourTitle(bk.tourId)}</TableCell>
              <TableCell data-testid={`text-booking-route-${bk.id}`}>{getRouteName(bk.routeId)}</TableCell>
              <TableCell data-testid={`text-booking-bustype-${bk.id}`}>{getBusTypeName(bk.busTypeId)}</TableCell>
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
            <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("no_bookings_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function InvoicesTab({ companyId }: { companyId: string }) {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invBookingId, setInvBookingId] = useState("");
  const [serviceDetails, setServiceDetails] = useState("");
  const [invAmount, setInvAmount] = useState("");
  const [invNotes, setInvNotes] = useState("");

  const { data: invoices, isLoading } = useQuery<TransportInvoice[]>({
    queryKey: ["/api/transport/invoices", `?companyId=${companyId}`],
  });

  const { data: bookings } = useQuery<TransportBooking[]>({
    queryKey: ["/api/transport/bookings", `?companyId=${companyId}`],
  });

  const resetForm = () => {
    setInvoiceNumber(""); setInvBookingId(""); setServiceDetails(""); setInvAmount(""); setInvNotes("");
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/transport/invoices", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/transport/invoices"] });
      setShowForm(false); resetForm(); toast({ title: t("invoice_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    createMutation.mutate({
      companyId, invoiceNumber,
      transportBookingId: invBookingId || undefined,
      serviceDetails: serviceDetails || undefined,
      amount: invAmount, notes: invNotes || undefined,
    });
  };

  const invoiceStatusVariant = (s: string | null): "default" | "secondary" | "outline" | "destructive" => {
    if (s === "approved") return "default";
    if (s === "paid") return "outline";
    if (s === "rejected") return "destructive";
    return "secondary";
  };

  if (isLoading) return <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold flex items-center gap-2"><FileText className="h-5 w-5" />{t("invoices_heading")}</h3>
        <Button onClick={() => { resetForm(); setShowForm(true); }} data-testid="button-add-invoice"><Plus className="h-4 w-4 mr-2" />{t("new_invoice")}</Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("invoice_number_label")}</TableHead>
            <TableHead>{t("service_details_label")}</TableHead>
            <TableHead>{t("amount_label")}</TableHead>
            <TableHead>{t("status")}</TableHead>
            <TableHead>{t("submitted_label")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invoices?.map((inv) => (
            <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
              <TableCell className="font-medium" data-testid={`text-invoice-number-${inv.id}`}>{inv.invoiceNumber}</TableCell>
              <TableCell className="text-muted-foreground max-w-[200px] truncate" data-testid={`text-invoice-details-${inv.id}`}>{inv.serviceDetails || "-"}</TableCell>
              <TableCell data-testid={`text-invoice-amount-${inv.id}`}>{inv.amount}</TableCell>
              <TableCell><Badge variant={invoiceStatusVariant(inv.status)} data-testid={`badge-invoice-status-${inv.id}`}>{inv.status}</Badge></TableCell>
              <TableCell className="text-muted-foreground">{inv.submittedAt ? new Date(inv.submittedAt).toLocaleDateString() : "-"}</TableCell>
            </TableRow>
          ))}
          {(!invoices || invoices.length === 0) && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("no_invoices_found")}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("new_invoice")}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>{t("invoice_number_label")} *</Label><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} data-testid="input-invoice-number" /></div>
            <div>
              <Label>{t("linked_booking")}</Label>
              <Select value={invBookingId} onValueChange={setInvBookingId}>
                <SelectTrigger data-testid="select-invoice-booking"><SelectValue placeholder={t("select_booking_optional")} /></SelectTrigger>
                <SelectContent>
                  {bookings?.map((b) => <SelectItem key={b.id} value={b.id}>{b.serviceDate || b.id} - {b.status}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>{t("service_details_label")}</Label><Textarea value={serviceDetails} onChange={(e) => setServiceDetails(e.target.value)} data-testid="input-invoice-service-details" /></div>
            <div><Label>{t("amount_label")} *</Label><Input value={invAmount} onChange={(e) => setInvAmount(e.target.value)} data-testid="input-invoice-amount" /></div>
            <div><Label>{t("notes")}</Label><Textarea value={invNotes} onChange={(e) => setInvNotes(e.target.value)} data-testid="input-invoice-notes" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-invoice">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!invoiceNumber || !invAmount || createMutation.isPending} data-testid="button-save-invoice">
              {createMutation.isPending ? t("creating_ellipsis") : t("create_invoice")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TransportDashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const companyId = profile?.transportCompanyId;

  if (profileLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6" data-testid="text-page-title">{t("transport_dashboard")}</h1>
        <Card>
          <CardContent className="flex items-center gap-3 py-8">
            <AlertTriangle className="h-5 w-5 text-muted-foreground" />
            <p className="text-muted-foreground" data-testid="text-no-company-message">
              {t("no_transport_company_message")}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-page-title">{t("transport_dashboard")}</h1>

      <Tabs defaultValue="profile">
        <TabsList data-testid="tabs-transport-dashboard">
          <TabsTrigger value="profile" data-testid="tab-company-profile">
            <Building2 className="h-4 w-4 mr-2" />{t("company_profile_tab")}
          </TabsTrigger>
          <TabsTrigger value="bus-types" data-testid="tab-bus-types">
            <Bus className="h-4 w-4 mr-2" />{t("bus_types_heading")}
          </TabsTrigger>
          <TabsTrigger value="routes" data-testid="tab-routes-pricing">
            <Route className="h-4 w-4 mr-2" />{t("routes_pricing_tab")}
          </TabsTrigger>
          <TabsTrigger value="bookings" data-testid="tab-bookings">
            <CalendarCheck className="h-4 w-4 mr-2" />{t("bookings")}
          </TabsTrigger>
          <TabsTrigger value="invoices" data-testid="tab-invoices">
            <FileText className="h-4 w-4 mr-2" />{t("invoices_heading")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <CompanyProfileTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="bus-types">
          <BusTypesTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="routes">
          <RoutesAndPricingTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="bookings">
          <BookingsTab companyId={companyId} />
        </TabsContent>
        <TabsContent value="invoices">
          <InvoicesTab companyId={companyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}