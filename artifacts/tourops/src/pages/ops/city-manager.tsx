import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Globe, Pencil, MapPin } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { City, Country } from "@workspace/db";
import { CityFormFields, cityToFormValues, cityFormToPayload, emptyCityFormValues, type CityFormValues } from "@/components/city-form-fields";

/**
 * City Manager dashboard — scoped to the manager's single assigned city
 * (user_profiles.city_id). The city manager can view and edit that city's
 * information only; creating or deleting cities is not permitted for this role.
 */
export default function CityManagerDashboard() {
  const { t } = useLanguage();
  const { toast } = useToast();

  const { data: profile, isLoading: profileLoading } = useQuery<any>({ queryKey: ["/api/user-profile"] });
  const { data: countries, isLoading: countriesLoading } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const { data: cities, isLoading: citiesLoading } = useQuery<City[]>({ queryKey: ["/api/master/cities"] });

  const assignedCity = cities?.find((c) => c.id === profile?.cityId) || null;
  const countryName = countries?.find((c) => c.id === assignedCity?.countryId)?.name || "";

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<CityFormValues>(emptyCityFormValues);

  useEffect(() => {
    if (assignedCity && showForm) setForm(cityToFormValues(assignedCity));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showForm]);

  const updateMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PATCH", `/api/master/cities/${assignedCity!.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/master/cities"] });
      setShowForm(false);
      toast({ title: t("city_updated") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (profileLoading || countriesLoading || citiesLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (!assignedCity) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Globe className="h-6 w-6 text-primary" />{t("city_dashboard")}</h1>
        <Card className="mt-6">
          <CardContent className="pt-6 text-muted-foreground" data-testid="text-no-assigned-city">
            No city has been assigned to your account yet. Please contact your Country Manager or an administrator to be assigned a city.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-serif flex items-center gap-2"><Globe className="h-6 w-6 text-primary" />{t("city_dashboard")}</h1>
          <p className="text-muted-foreground text-sm">Manage your assigned city's tourism information.</p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-edit-assigned-city">
          <Pencil className="h-4 w-4 mr-2" />{t("edit")}
        </Button>
      </div>

      <Card data-testid="card-assigned-city">
        <CardContent className="pt-6 space-y-4">
          <div className="flex items-center gap-3">
            <MapPin className="h-8 w-8 text-primary" />
            <div>
              <div className="text-xl font-semibold" data-testid="text-city-name">
                {assignedCity.name}
                {assignedCity.isCapital && <Badge variant="outline" className="ml-2 text-[10px] uppercase">{t("capital_label")}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">{countryName}</div>
            </div>
            <div className="ml-auto">
              <Badge variant={assignedCity.isActive ? "default" : "secondary"}>{assignedCity.isActive ? t("active_label") : t("inactive_label")}</Badge>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-muted-foreground">{t("population_label")}</div>
              <div className="font-medium">{assignedCity.population ? assignedCity.population.toLocaleString() : "-"}</div>
            </div>
            <div>
              <div className="text-muted-foreground">{t("tourism_city_label")}</div>
              <div className="font-medium">{assignedCity.isTourismCity ? t("yes_label") : t("no_label")}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="flex flex-col max-h-[85vh]">
          <DialogHeader className="shrink-0"><DialogTitle>{t("edit")} {t("city_label")} — {assignedCity.name}</DialogTitle></DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <CityFormFields value={form} onChange={setForm} countries={countries} />
          </div>
          <DialogFooter className="shrink-0">
            <Button variant="outline" onClick={() => setShowForm(false)} data-testid="button-cancel-city">{t("cancel")}</Button>
            <Button onClick={() => updateMutation.mutate(cityFormToPayload(form))} disabled={!form.name || updateMutation.isPending} data-testid="button-save-city">
              {updateMutation.isPending ? t("saving_ellipsis") : t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
