import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/hooks/use-language";

// Single source of truth for the hotel create/edit form.
// Used by BOTH the admin master-data Hotels tab and the supplier (hotel manager)
// dashboard so both roles always see the identical form.

export interface HotelFormValues {
  name: string;
  cityId: string;
  starRating: string;
  basePrice: string;
  currency: string;
  address: string;
  googleMapsUrl: string;
  imageUrl: string;
  contactPhone: string;
  contactEmail: string;
  website: string;
  description: string;
  roomDescription: string;
  isActive: boolean;
}

export const emptyHotelFormValues: HotelFormValues = {
  name: "",
  cityId: "",
  starRating: "3",
  basePrice: "",
  currency: "USD",
  address: "",
  googleMapsUrl: "",
  imageUrl: "",
  contactPhone: "",
  contactEmail: "",
  website: "",
  description: "",
  roomDescription: "",
  isActive: true,
};

export function hotelToFormValues(h: any): HotelFormValues {
  return {
    name: h?.name || "",
    cityId: h?.cityId || "",
    starRating: String(h?.starRating || 3),
    basePrice: h?.basePrice || "",
    currency: h?.currency || "USD",
    address: h?.address || "",
    googleMapsUrl: h?.googleMapsUrl || "",
    imageUrl: h?.imageUrl || "",
    contactPhone: h?.contactPhone || "",
    contactEmail: h?.contactEmail || "",
    website: h?.website || "",
    description: h?.description || "",
    roomDescription: h?.roomTypes?.description || "",
    isActive: h?.isActive ?? true,
  };
}

export function hotelFormToPayload(f: HotelFormValues) {
  return {
    name: f.name,
    cityId: f.cityId,
    starRating: parseInt(f.starRating),
    basePrice: f.basePrice || undefined,
    currency: f.currency,
    address: f.address || undefined,
    googleMapsUrl: f.googleMapsUrl || null,
    imageUrl: f.imageUrl || undefined,
    contactPhone: f.contactPhone || undefined,
    contactEmail: f.contactEmail || undefined,
    website: f.website || undefined,
    description: f.description || undefined,
    roomTypes: f.roomDescription ? { description: f.roomDescription } : undefined,
    isActive: f.isActive,
  };
}

export function HotelFormFields({
  value,
  onChange,
  cities,
}: {
  value: HotelFormValues;
  onChange: (v: HotelFormValues) => void;
  cities?: { id: string; name: string }[];
}) {
  const { t } = useLanguage();
  const set = (patch: Partial<HotelFormValues>) => onChange({ ...value, ...patch });

  return (
    <>
      <div><Label>{t("name_required_label")}</Label><Input value={value.name} onChange={(e) => set({ name: e.target.value })} placeholder="Grand Plaza" data-testid="input-hotel-name" /></div>
      <div>
        <Label>{t("city_label")} *</Label>
        <Select value={value.cityId} onValueChange={(v) => set({ cityId: v })}>
          <SelectTrigger data-testid="select-hotel-city"><SelectValue placeholder={t("select_city_placeholder")} /></SelectTrigger>
          <SelectContent>
            {cities?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>{t("star_rating_label")}</Label>
        <Select value={value.starRating} onValueChange={(v) => set({ starRating: v })}>
          <SelectTrigger data-testid="select-hotel-stars"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[1, 2, 3, 4, 5].map((s) => <SelectItem key={s} value={String(s)}>{s} Stars</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("base_price_label")}</Label><Input type="number" step="0.01" value={value.basePrice} onChange={(e) => set({ basePrice: e.target.value })} placeholder="150.00" data-testid="input-hotel-price" /></div>
        <div><Label>{t("currency_label")}</Label><Input value={value.currency} onChange={(e) => set({ currency: e.target.value })} placeholder="USD" data-testid="input-hotel-currency" /></div>
      </div>
      <div><Label>{t("address_label")}</Label><Input value={value.address} onChange={(e) => set({ address: e.target.value })} placeholder="123 Street..." data-testid="input-hotel-address" /></div>
      <div><Label>{t("google_maps_url_label")}</Label><Input value={value.googleMapsUrl} onChange={(e) => set({ googleMapsUrl: e.target.value })} placeholder="https://maps.google.com/..." data-testid="input-hotel-maps-url" /></div>
      <div><Label>{t("image_url_label")}</Label><Input value={value.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://..." data-testid="input-hotel-image" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>{t("contact_phone_label")}</Label><Input value={value.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} placeholder="+1-555-0123" data-testid="input-hotel-phone" /></div>
        <div><Label>{t("contact_email_label")}</Label><Input type="email" value={value.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} placeholder="hotel@example.com" data-testid="input-hotel-email" /></div>
      </div>
      <div><Label>{t("website_label")}</Label><Input value={value.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://hotel.com" data-testid="input-hotel-website" /></div>
      <div><Label>{t("description_label")}</Label><Textarea value={value.description} onChange={(e) => set({ description: e.target.value })} rows={2} data-testid="input-hotel-description" /></div>
      <div><Label>{t("room_description_label")}</Label><Textarea value={value.roomDescription} onChange={(e) => set({ roomDescription: e.target.value })} rows={2} data-testid="input-hotel-room-description" /></div>
      <div className="flex items-center gap-2">
        <Switch checked={value.isActive} onCheckedChange={(v) => set({ isActive: v })} data-testid="switch-hotel-active" />
        <Label>{t("active_label")}</Label>
      </div>
    </>
  );
}
