import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Globe, Plus, Pencil, Trash2 } from "lucide-react";
import type { City, Country } from "@workspace/db";
import { CityFormFields, emptyCityFormValues, cityToFormValues, cityFormToPayload, type CityFormValues } from "@/components/city-form-fields";

export default function CityManagerDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: countries, isLoading: countriesLoading } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const { data: cities, isLoading: citiesLoading } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<City | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState<CityFormValues>(emptyCityFormValues);

  const resetForm = () => setForm(emptyCityFormValues);
  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (city: City) => {
    setEditItem(city);
    setForm(cityToFormValues(city));
    setShowForm(true);
  };

  const getCountryName = (cId: string) => countries?.find((c) => c.id === cId)?.name || cId;

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/cities", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      setShowForm(false);
      resetForm();
      toast({ title: t("city_created") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/cities/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      setShowForm(false);
      setEditItem(null);
      resetForm();
      toast({ title: t("city_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/cities/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      setDeleteId(null);
      toast({ title: t("city_deleted") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const data = cityFormToPayload(form);
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  const isLoading = countriesLoading || citiesLoading;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Globe className="h-6 w-6 text-primary" />{t("city_dashboard")}</h1>
          <p className="text-muted-foreground text-sm">
            Manage the shared global city catalog — used for tour destinations, hotels, and sights.
          </p>
        </div>
        <Button onClick={openCreate} data-testid="button-add-city">
          <Plus className="h-4 w-4 mr-2" />{t("add_new")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name_label")}</TableHead>
                <TableHead>{t("country")}</TableHead>
                <TableHead>{t("population_label")}</TableHead>
                <TableHead>{t("tourism_city_label")}</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(cities || []).map(city => (
                <TableRow key={city.id} data-testid={`row-city-${city.id}`}>
                  <TableCell className="font-medium" data-testid={`text-city-name-${city.id}`}>
                    {city.name} {city.isCapital && <Badge variant="outline" className="ml-2 text-[10px] uppercase">{t("capital_label")}</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{getCountryName(city.countryId)}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{city.population ? city.population.toLocaleString() : "-"}</TableCell>
                  <TableCell>{city.isTourismCity ? <Badge>{t("yes_label")}</Badge> : <span className="text-muted-foreground text-sm">{t("no_label")}</span>}</TableCell>
                  <TableCell><Badge variant={city.isActive ? "default" : "secondary"}>{city.isActive ? t("active_label") : t("inactive_label")}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(city)} data-testid={`button-edit-city-${city.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(city.id)} data-testid={`button-delete-city-${city.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(!cities || cities.length === 0) && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("no_cities_found")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0"><DialogTitle>{editItem ? `${t("edit")} ${t("city_label")}` : `${t("add_new")} ${t("city_label")}`}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <CityFormFields value={form} onChange={setForm} countries={countries} />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-city">{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!form.name || !form.countryId || createMutation.isPending || updateMutation.isPending} data-testid="button-save-city">
              {createMutation.isPending || updateMutation.isPending ? t("saving_ellipsis") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("delete")} {t("city_label")}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{t("delete_record_confirm")}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteId(null)}>{t("cancel")}</Button>
            <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? t("deleting") : t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
