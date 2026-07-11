import { useQuery, useMutation } from "@tanstack/react-query";
import { AdminLayout } from "@/components/admin/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Save, Percent, Settings2, Globe } from "lucide-react";
import { useState, useEffect } from "react";
import { MarkupRule, Country } from "@shared/schema";
import { useLanguage } from "@/hooks/use-language";

export default function PricingSettings() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [newRule, setNewRule] = useState<Partial<MarkupRule>>({
    countryId: undefined,
    serviceType: "all",
    markupPercentage: "10",
    isActive: true
  });

  const [serviceFee, setServiceFee] = useState("0");
  const [taxRate, setTaxRate] = useState("0");

  const { data: countries } = useQuery<Country[]>({ queryKey: ["/api/master/countries"] });
  const { data: rules } = useQuery<MarkupRule[]>({ queryKey: ["/api/admin/pricing/markup-rules"] });
  const { data: settings } = useQuery<any[]>({ queryKey: ["/api/admin/pricing/settings"] });

  useEffect(() => {
    if (settings) {
      setServiceFee(settings.find(s => s.key === 'default_service_fee')?.value || "0");
      setTaxRate(settings.find(s => s.key === 'tax_rate')?.value || "0");
    }
  }, [settings]);

  const createRuleMutation = useMutation({
    mutationFn: (rule: Partial<MarkupRule>) => apiRequest("POST", "/api/admin/pricing/markup-rules", rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing/markup-rules"] });
      toast({ title: t("success"), description: t("markup_rule_created") });
    }
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/admin/pricing/markup-rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing/markup-rules"] });
      toast({ title: t("deleted"), description: t("markup_rule_removed") });
    }
  });

  const updateSettingMutation = useMutation({
    mutationFn: (setting: { key: string; value: string }) => apiRequest("POST", "/api/admin/pricing/settings", setting),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing/settings"] });
      toast({ title: t("updated"), description: t("global_setting_saved") });
    }
  });

  const updateRuleMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => apiRequest("PATCH", `/api/admin/pricing/markup-rules/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/pricing/markup-rules"] });
    }
  });

  return (
    <AdminLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("pricing_markup_settings")}</h1>
          <p className="text-muted-foreground">{t("pricing_settings_subtitle")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Global Settings */}
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary" />
                {t("global_constants")}
              </CardTitle>
              <CardDescription>{t("global_constants_desc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("default_service_fee")}</label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={serviceFee}
                    onChange={(e) => setServiceFee(e.target.value)}
                    onBlur={(e) => updateSettingMutation.mutate({ key: 'default_service_fee', value: e.target.value })}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">{t("tax_rate")}</label>
                <Input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  onBlur={(e) => updateSettingMutation.mutate({ key: 'tax_rate', value: e.target.value })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Markup Rules */}
          <Card className="md:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-primary" />
                  {t("markup_rules")}
                </CardTitle>
                <CardDescription>{t("markup_rules_desc")}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-6 grid grid-cols-4 gap-4 p-4 border rounded-lg bg-muted/30">
                <Select onValueChange={(v) => setNewRule({ ...newRule, countryId: v === "global" ? undefined : v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("country")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">{t("global_all_countries")}</SelectItem>
                    {countries?.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select onValueChange={(v) => setNewRule({ ...newRule, serviceType: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder={t("service_type")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("all_services")}</SelectItem>
                    <SelectItem value="hotel">{t("hotels")}</SelectItem>
                    <SelectItem value="flight">{t("flights")}</SelectItem>
                    <SelectItem value="transport">{t("transport")}</SelectItem>
                    <SelectItem value="sight">{t("sights")}</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Input
                    type="number"
                    placeholder="10"
                    className="pr-8"
                    value={newRule.markupPercentage ?? ""}
                    onChange={(e) => setNewRule({ ...newRule, markupPercentage: e.target.value })}
                  />
                  <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                </div>

                <Button onClick={() => createRuleMutation.mutate(newRule)}>
                  <Plus className="w-4 h-4 mr-2" /> {t("add_rule")}
                </Button>
              </div>

              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("scope")}</TableHead>
                    <TableHead>{t("service")}</TableHead>
                    <TableHead>{t("markup_label")}</TableHead>
                    <TableHead>{t("status")}</TableHead>
                    <TableHead className="text-right">{t("actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules?.map(rule => (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">
                        {rule.countryId ? (
                          <div className="flex items-center gap-2">
                            <Globe className="w-4 h-4 text-muted-foreground" />
                            {countries?.find(c => c.id === rule.countryId)?.name}
                          </div>
                        ) : t("global_scope")}
                      </TableCell>
                      <TableCell className="capitalize">{rule.serviceType}</TableCell>
                      <TableCell>{rule.markupPercentage}%</TableCell>
                      <TableCell>
                        <Switch
                          checked={rule.isActive ?? false}
                          onCheckedChange={(checked) => updateRuleMutation.mutate({ id: rule.id, isActive: checked })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => deleteRuleMutation.mutate(rule.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {(!rules || rules.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                        {t("no_markup_rules")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
