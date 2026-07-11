import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Globe, Plus, Pencil, Trash2 } from "lucide-react";
import type { City, Country, UserProfile } from "@workspace/db";

export default function CityManagerDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: profile } = useQuery<UserProfile>({ queryKey: ["/api/user-profile"] });
  const { data: countries, isLoading: countriesLoading } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const { data: cities, isLoading: citiesLoading } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const myCountry = countries?.find(c => c.code?.toUpperCase() === profile?.countryCode?.toUpperCase());
  const myCities = cities?.filter(c => myCountry && c.countryId === myCountry.id) || [];

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<City | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [population, setPopulation] = useState("");
  const [isTourismCity, setIsTourismCity] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const resetForm = () => { setName(""); setPopulation(""); setIsTourismCity(false); setIsActive(true); };
  const openCreate = () => { setEditItem(null); resetForm(); setShowForm(true); };
  const openEdit = (city: City) => {
    setEditItem(city);
    setName(city.name);
    setPopulation(String(city.population || ""));
    setIsTourismCity(city.isTourismCity ?? false);
    setIsActive(city.isActive ?? true);
    setShowForm(true);
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/cities", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      setShowForm(false);
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
    const data = {
      name,
      population: population ? parseInt(population) : undefined,
      isTourismCity,
      isActive,
    };
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

  if (!myCountry) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Globe className="h-6 w-6 text-primary" />{t("city_dashboard")}</h1>
        <p className="text-muted-foreground text-sm mt-2">
          No country is assigned to your account yet. Contact an administrator to link this account to a country before managing cities.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Globe className="h-6 w-6 text-primary" />{t("city_dashboard")}</h1>
          <p className="text-muted-foreground text-sm">
            Manage cities in <Badge variant="outline">{myCountry.name}</Badge> — used for tour destinations, hotels, and sights.
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
                <TableHead>{t("population_label")}</TableHead>
                <TableHead>Tourism city</TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead>{t("actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {myCities.map(city => (
                <TableRow key={city.id} data-testid={`row-city-${city.id}`}>
                  <TableCell className="font-medium" data-testid={`text-city-name-${city.id}`}>
                    {city.name} {city.isCapital && <Badge variant="outline" className="ml-2 text-[10px] uppercase">{t("capital_label")}</Badge>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{city.population ? city.population.toLocaleString() : "-"}</TableCell>
                  <TableCell>{city.isTourismCity ? <Badge>Yes</Badge> : <span className="text-muted-foreground text-sm">No</span>}</TableCell>
                  <TableCell><Badge variant={city.isActive ? "default" : "secondary"}>{city.isActive ? t("active_label") : t("inactive_label")}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(city)} data-testid={`button-edit-city-${city.id}`}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDeleteId(city.id)} data-testid={`button-delete-city-${city.id}`}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {myCities.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("no_cities_found")}</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editItem ? `${t("edit")} ${t("city_label")}` : `${t("add_new")} ${t("city_label")}`}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t("name_label")} *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ubud" data-testid="input-city-name" />
            </div>
            <div>
              <Label>{t("population_label")}</Label>
              <Input type="number" value={population} onChange={(e) => setPopulation(e.target.value)} data-testid="input-city-population" />
            </div>
            <div className="flex items-center justify-between">
              <Label>Tourism city</Label>
              <Switch checked={isTourismCity} onCheckedChange={setIsTourismCity} data-testid="switch-city-tourism" />
            </div>
            <div className="flex items-center justify-between">
              <Label>{t("active_label")}</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-city-active" />
            </div>
            <p className="text-xs text-muted-foreground">Country is fixed to {myCountry.name} for your account.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!name || createMutation.isPending || updateMutation.isPending} data-testid="button-save-city">
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
