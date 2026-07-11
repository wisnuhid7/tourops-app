import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import type { UserProfile, MasterRecord } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Edit, Save, Loader2 } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/hooks/use-language";

export default function GenericRoleDashboard() {
  const { t } = useLanguage();
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/user-profile"],
  });
  const { toast } = useToast();

  const role = profile?.role || "customer";

  const dashboardMap: Record<string, { title: string, subtitle: string, entity: string }> = {
    city_manager: { title: t("city_dashboard"), subtitle: t("manage_city_tours"), entity: t("city_record") },
    content_editor: { title: t("editor_dashboard"), subtitle: t("manage_platform_content"), entity: t("content_article") },
    flight_agent: { title: t("flight_dashboard"), subtitle: t("manage_flight_routes"), entity: t("flight_route_entity") },
    tour_builder: { title: t("builder_dashboard"), subtitle: t("manage_tour_itineraries"), entity: t("itinerary") },
    supplier: { title: t("supplier_dashboard"), subtitle: t("manage_general_supply"), entity: t("supply_item") },
    travel_agent: { title: t("agent_dashboard"), subtitle: t("manage_client_bookings"), entity: t("agent_client_entity") },
  };

  const config = dashboardMap[role] || { title: t("dashboard"), subtitle: t("welcome_to_portal"), entity: t("item_entity") };

  const { data: items, isLoading } = useQuery<MasterRecord[]>({
    queryKey: [`/api/master-records`, { type: role }],
    queryFn: async () => {
      const res = await fetch(`/api/master-records?type=${role}`);
      if (!res.ok) throw new Error("Failed to fetch records");
      return res.json();
    }
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MasterRecord | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      if (editingItem) return apiRequest("PATCH", `/api/master-records/${editingItem.id}`, data);
      return apiRequest("POST", `/api/master-records`, { ...data, recordType: role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/master-records`, { type: role }] });
      toast({ title: t("success"), description: `${config.entity} saved successfully.` });
      setDialogOpen(false);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/master-records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/master-records`, { type: role }] });
      toast({ title: t("deleted"), description: `${config.entity} deleted successfully.`, variant: "destructive" });
    }
  });

  const handleCreate = () => {
    setEditingItem(null);
    setDialogOpen(true);
  };

  const handleEdit = (item: MasterRecord) => {
    setEditingItem(item);
    setDialogOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm(`Are you sure you want to delete this ${config.entity}?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-serif">{config.title}</h1>
          <p className="text-muted-foreground text-sm">{config.subtitle}</p>
        </div>
        <Button onClick={handleCreate} className="gap-2">
          <Plus className="h-4 w-4" /> {t("create")} {config.entity}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("recent_label")} {config.entity}s</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
          ) : !items || items.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t("no_records_click_create")}</div>
          ) : (
            <div className="space-y-4">
              {items.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg bg-card">
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full capitalize">{item.status}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={() => handleEdit(item)}><Edit className="h-4 w-4" /></Button>
                    <Button variant="destructive" size="icon" onClick={() => handleDelete(item.id)} disabled={deleteMutation.isPending}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? `${t("edit")} ${config.entity}` : `${t("create_new")} ${config.entity}`}</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            saveMutation.mutate({
              title: fd.get("title"),
              status: fd.get("status") || "active",
            });
          }} className="space-y-4">
            <div className="space-y-2">
              <Label>{t("title_name_label")}</Label>
              <Input name="title" defaultValue={editingItem?.title} required placeholder={`Enter ${config.entity} name...`} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? t("saving_ellipsis") : t("save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
