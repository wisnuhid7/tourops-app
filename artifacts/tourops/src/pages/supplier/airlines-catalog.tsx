import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";

export interface AirlineAgency {
  id: string;
  name: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  website: string | null;
  isActive: boolean | null;
}

export function AirlinesCatalogTab() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<AirlineAgency | null>(null);
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [isActive, setIsActive] = useState(true);

  const { data: items, isLoading } = useQuery<AirlineAgency[]>({ queryKey: ["/api/master/airline-agencies"] });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["/api/master/airline-agencies"] });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/master/airline-agencies", data),
    onSuccess: () => { invalidate(); setShowForm(false); toast({ title: t("airline_created") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/master/airline-agencies/${id}`, data),
    onSuccess: () => { invalidate(); setShowForm(false); setEditItem(null); toast({ title: t("airline_updated") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master/airline-agencies/${id}`),
    onSuccess: () => { invalidate(); toast({ title: t("airline_deleted") }); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const openCreate = () => {
    setEditItem(null);
    setName(""); setContactName(""); setEmail(""); setPhone(""); setWebsite(""); setIsActive(true);
    setShowForm(true);
  };
  const openEdit = (item: AirlineAgency) => {
    setEditItem(item);
    setName(item.name); setContactName(item.contactName || ""); setEmail(item.contactEmail || "");
    setPhone(item.contactPhone || ""); setWebsite(item.website || ""); setIsActive(item.isActive !== false);
    setShowForm(true);
  };
  const handleSubmit = () => {
    const data = {
      name,
      contactName: contactName || null,
      contactEmail: email || null,
      contactPhone: phone || null,
      website: website || null,
      isActive,
    };
    if (editItem) updateMutation.mutate({ id: editItem.id, ...data });
    else createMutation.mutate(data);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={openCreate} data-testid="button-add-airline">
          <Plus className="h-4 w-4 mr-2" /> {t("add_airline")}
        </Button>
      </div>
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("airline_name")}</TableHead>
              <TableHead>{t("guide_email")}</TableHead>
              <TableHead>{t("website_label")}</TableHead>
              <TableHead>{t("guide_phone")}</TableHead>
              <TableHead>{t("status")}</TableHead>
              <TableHead className="text-right">{t("actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items?.map((r) => (
              <TableRow key={r.id} data-testid={`row-airline-${r.id}`}>
                <TableCell className="font-medium" data-testid={`text-airline-name-${r.id}`}>{r.name}</TableCell>
                <TableCell>{r.contactEmail || "—"}</TableCell>
                <TableCell>
                  {r.website ? (
                    <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
                      {r.website}
                    </a>
                  ) : "—"}
                </TableCell>
                <TableCell>{r.contactPhone || "—"}</TableCell>
                <TableCell>
                  <Badge variant={r.isActive !== false ? "default" : "outline"} className="capitalize">
                    {r.isActive !== false ? t("active") : t("inactive")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(r)} data-testid={`button-edit-airline-${r.id}`}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-airline-${r.id}`} onClick={() => {
                      if (confirm(t("confirm_delete_airline"))) deleteMutation.mutate(r.id);
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {!isLoading && (!items || items.length === 0) && (
              <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t("no_airlines_in_catalog")}</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={showForm} onOpenChange={(v) => { setShowForm(v); if (!v) setEditItem(null); }}>
        <DialogContent className="max-w-lg flex flex-col max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{editItem ? t("edit_airline") : t("add_airline")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto flex-1 pr-1 -mr-1">
            <div className="space-y-2"><Label>{t("airline_name")} *</Label><Input value={name} onChange={(e) => setName(e.target.value)} data-testid="input-airline-name" /></div>
            <div className="space-y-2"><Label>{t("contact_name_label")}</Label><Input value={contactName} onChange={(e) => setContactName(e.target.value)} data-testid="input-airline-contact-name" /></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2"><Label>{t("guide_email")}</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="input-airline-email" /></div>
              <div className="space-y-2"><Label>{t("guide_phone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} data-testid="input-airline-phone" /></div>
            </div>
            <div className="space-y-2"><Label>{t("website_label")}</Label><Input placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} data-testid="input-airline-website" /></div>
            <div className="flex items-center gap-3 pt-1">
              <Switch checked={isActive} onCheckedChange={setIsActive} data-testid="switch-airline-active" />
              <Label>{t("active")}</Label>
            </div>
          </div>
          <DialogFooter className="pt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>{t("cancel")}</Button>
            <Button onClick={handleSubmit} disabled={!name.trim() || createMutation.isPending || updateMutation.isPending} data-testid="button-save-airline">
              {t("save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
