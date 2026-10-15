import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { AgGridReact } from "ag-grid-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { agGridTheme, agGridDefaultColDef } from "@/lib/ag-grid-config";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Pencil, Search, Trash2 } from "lucide-react";
import type { ColDef, GetRowIdParams, ICellRendererParams } from "ag-grid-community";

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

  const { data: items } = useQuery<AirlineAgency[]>({ queryKey: ["/api/master/airline-agencies"] });
  const [search, setSearch] = useState("");
  const normalizedSearch = search.trim().toLowerCase();

  const filteredItems = (items || []).filter((item) => {
    const searchableText = [
      item.name,
      item.contactEmail,
      item.website,
      item.contactPhone,
      item.isActive !== false ? t("active") : t("inactive"),
    ].filter(Boolean).join(" ").toLowerCase();
    return searchableText.includes(normalizedSearch);
  });

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

  const columnDefs = useMemo<ColDef<AirlineAgency>[]>(() => [
    {
      headerName: t("airline_name"),
      field: "name",
      filter: "agTextColumnFilter",
      width: 220,
      cellRenderer: (params: ICellRendererParams<AirlineAgency>) => params.data ? (
        <span className="font-medium" data-testid={`text-airline-name-${params.data.id}`}>
          {params.data.name}
        </span>
      ) : null,
    },
    {
      headerName: t("guide_email"),
      valueGetter: (p) => p.data?.contactEmail || "—",
      filter: "agTextColumnFilter",
      flex: 1,
    },
    {
      headerName: t("website_label"),
      filterValueGetter: (p) => p.data?.website || "—",
      filter: "agTextColumnFilter",
      flex: 1,
      cellRenderer: (p: ICellRendererParams<AirlineAgency>) => {
        if (!p.data) return null;
        const r = p.data;
        return r.website ? (
          <a href={r.website.startsWith("http") ? r.website : `https://${r.website}`} target="_blank" rel="noreferrer" className="text-primary underline underline-offset-2">
            {r.website}
          </a>
        ) : "—";
      },
    },
    {
      headerName: t("guide_phone"),
      valueGetter: (p) => p.data?.contactPhone || "—",
      filter: "agTextColumnFilter",
      width: 160,
    },
    {
      headerName: t("status"),
      valueGetter: (p) => p.data?.isActive !== false,
      filterValueGetter: (p) => p.data?.isActive !== false ? t("active") : t("inactive"),
      filter: "agTextColumnFilter",
      width: 120,
      cellRenderer: (p: ICellRendererParams<AirlineAgency>) => p.data ? (
        <Badge variant={p.data.isActive !== false ? "default" : "outline"} className="capitalize">
          {p.data.isActive !== false ? t("active") : t("inactive")}
        </Badge>
      ) : null,
    },
    {
      headerName: t("actions"),
      headerClass: "ag-right-aligned-header",
      filter: false,
      sortable: false,
      resizable: false,
      pinned: "right" as const,
      width: 110,
      cellRenderer: (params: ICellRendererParams<AirlineAgency>) => {
        if (!params.data) return null;
        const airline = params.data;
        return (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="icon" onClick={() => openEdit(airline)} data-testid={`button-edit-airline-${airline.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="text-destructive" data-testid={`button-delete-airline-${airline.id}`} onClick={() => {
            if (confirm(t("confirm_delete_airline"))) deleteMutation.mutate(airline.id);
          }}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        );
      },
    },
  ], [deleteMutation, openEdit, t]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="relative max-w-sm mb-3"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder={t("search_airline_agencies_placeholder")} value={search} onChange={(e) => setSearch(e.target.value)} data-testid="input-search-airlines-catalog" /></div>
        <Button size="sm" onClick={openCreate} data-testid="button-add-airline">
          <Plus className="h-4 w-4 mr-2" /> {t("add_airline")}
        </Button>
      </div>
      {filteredItems.length > 0 ? (
        <div data-testid="grid-supplier-airlines-catalog" style={{ width: "100%", height: "calc(100vh - 320px)", minHeight: 320 }}>
          <AgGridReact<AirlineAgency> theme={agGridTheme} rowData={filteredItems} columnDefs={columnDefs} defaultColDef={agGridDefaultColDef} getRowId={(params: GetRowIdParams<AirlineAgency>) => params.data.id} suppressCellFocus />
        </div>
      ) : (
        <Table><TableBody><TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{normalizedSearch ? t("no_results") : t("no_airlines_in_catalog")}</TableCell></TableRow></TableBody></Table>
      )}

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
