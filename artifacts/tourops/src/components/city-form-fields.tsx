import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";

// Single source of truth for the city create/edit form.
// Used by BOTH the admin master-data Cities tab and the city manager
// dashboard so both roles always see the identical form.

export interface CityFormValues {
  name: string;
  asciiName: string;
  countryId: string;
  population: string;
  latitude: string;
  longitude: string;
  isCapital: boolean;
  isTourismCity: boolean;
  isActive: boolean;
}

export const emptyCityFormValues: CityFormValues = {
  name: "",
  asciiName: "",
  countryId: "",
  population: "",
  latitude: "",
  longitude: "",
  isCapital: false,
  isTourismCity: false,
  isActive: true,
};

export function cityToFormValues(c: any): CityFormValues {
  return {
    name: c?.name || "",
    asciiName: c?.asciiName || "",
    countryId: c?.countryId || "",
    population: c?.population != null ? String(c.population) : "",
    latitude: c?.latitude != null ? String(c.latitude) : "",
    longitude: c?.longitude != null ? String(c.longitude) : "",
    isCapital: c?.isCapital ?? false,
    isTourismCity: c?.isTourismCity ?? false,
    isActive: c?.isActive ?? true,
  };
}

export function cityFormToPayload(f: CityFormValues) {
  return {
    name: f.name,
    asciiName: f.asciiName || undefined,
    countryId: f.countryId,
    population: f.population ? parseInt(f.population) : undefined,
    latitude: f.latitude || undefined,
    longitude: f.longitude || undefined,
    isCapital: f.isCapital,
    isTourismCity: f.isTourismCity,
    isActive: f.isActive,
  };
}

export function CityFormFields({
  value,
  onChange,
  countries,
}: {
  value: CityFormValues;
  onChange: (v: CityFormValues) => void;
  countries?: { id: string; name: string; code?: string | null }[];
}) {
  const { t } = useLanguage();
  const set = (patch: Partial<CityFormValues>) => onChange({ ...value, ...patch });

  return (
    <>
      <div><Label>{t("name_label")} *</Label><Input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Jakarta" data-testid="input-city-name" /></div>
      <div><Label>{t("ascii_name_label")}</Label><Input value={value.asciiName} onChange={(e) => set({ asciiName: e.target.value })} placeholder="Jakarta" data-testid="input-city-ascii" /></div>
      <div>
        <Label>{t("country")} *</Label>
        <Select value={value.countryId} onValueChange={(v) => set({ countryId: v })}>
          <SelectTrigger data-testid="select-city-country"><SelectValue placeholder={t("select_country_placeholder")} /></SelectTrigger>
          <SelectContent>
            {countries?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.code ? ` (${c.code})` : ""}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div><Label>{t("population_label")}</Label><Input type="number" value={value.population} onChange={(e) => set({ population: e.target.value })} placeholder="10000000" data-testid="input-city-population" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("latitude_label")}</Label><Input value={value.latitude} onChange={(e) => set({ latitude: e.target.value })} placeholder="-6.2088" data-testid="input-city-lat" /></div>
        <div><Label>{t("longitude_label")}</Label><Input value={value.longitude} onChange={(e) => set({ longitude: e.target.value })} placeholder="106.8456" data-testid="input-city-lng" /></div>
      </div>
      <div className="flex items-center gap-4 py-2">
        <div className="flex items-center gap-2">
          <Switch checked={value.isCapital} onCheckedChange={(v) => set({ isCapital: v })} data-testid="switch-city-capital" />
          <Label>{t("capital_city_label")}</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={value.isTourismCity} onCheckedChange={(v) => set({ isTourismCity: v })} data-testid="switch-city-tourism" />
          <Label>{t("tourism_city_label")}</Label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={value.isActive} onCheckedChange={(v) => set({ isActive: v })} data-testid="switch-city-active" />
        <Label>{t("active_label")}</Label>
      </div>
    </>
  );
}
