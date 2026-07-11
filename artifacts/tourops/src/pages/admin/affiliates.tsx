import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { Users, Plus, DollarSign, ExternalLink, Mail, Code } from "lucide-react";
import type { Affiliate, AffiliatePayout } from "@workspace/db";

export default function AffiliatesPage() {
  const { toast } = useToast();
  const { t } = useLanguage();
  const [showCreate, setShowCreate] = useState(false);
  
  const { data: affiliates, isLoading } = useQuery<Affiliate[]>({ 
    queryKey: ["/api/admin/affiliates"] 
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/admin/affiliates", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/affiliates"] });
      setShowCreate(false);
      toast({ title: t("affiliate_added_successfully") });
    },
  });

  if (isLoading) return <div className="p-6 space-y-6"><Skeleton className="h-10 w-48" /><Skeleton className="h-64 w-full" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold font-serif">{t("affiliate_partners")}</h1>
          <p className="text-muted-foreground text-sm">{t("manage_referral_network_desc")}</p>
        </div>
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="h-4 w-4" /> {t("add_partner")}</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>{t("new_affiliate_partner")}</DialogTitle></DialogHeader>
            <AffiliateForm onSubmit={(data) => createMutation.mutate(data)} isPending={createMutation.isPending} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {affiliates?.map((aff) => (
          <Card key={aff.id} className="hover:border-primary/50 transition-colors">
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <CardTitle className="text-lg">{aff.name}</CardTitle>
                <Badge variant={aff.isActive ? "default" : "secondary"}>
                  {aff.isActive ? t("active") : t("inactive")}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Code className="h-4 w-4" />
                <span className="font-mono bg-muted px-2 py-0.5 rounded text-primary font-bold">{aff.code}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{aff.email || t("no_email_provided")}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <DollarSign className="h-4 w-4 text-green-600" />
                <span>{t("commission_rate")} <strong>{aff.commissionRate}%</strong></span>
              </div>
              <div className="pt-2 border-t">
                <Button variant="outline" size="sm" className="w-full gap-2" onClick={() => toast({ title: t("performance_module_title"), description: t("performance_module_desc") })}>
                  <ExternalLink className="h-4 w-4" /> {t("view_performance")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {affiliates?.length === 0 && (
          <div className="col-span-full py-12 text-center bg-muted/20 rounded-lg border border-dashed">
            <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground">{t("no_affiliate_partners")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function AffiliateForm({ onSubmit, isPending }: { onSubmit: (data: any) => void; isPending: boolean }) {
  const { t } = useLanguage();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [rate, setRate] = useState("10");

  return (
    <div className="space-y-4">
      <div>
        <Label>{t("partner_name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("partner_name_placeholder")} />
      </div>
      <div>
        <Label>{t("unique_referral_code")}</Label>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder={t("referral_code_placeholder")} />
      </div>
      <div>
        <Label>{t("contact_email")}</Label>
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("contact_email_placeholder")} />
      </div>
      <div>
        <Label>{t("commission_percentage")}</Label>
        <Input type="number" value={rate} onChange={(e) => setRate(e.target.value)} />
      </div>
      <Button className="w-full" onClick={() => onSubmit({ name, code, email, commissionRate: rate })} disabled={isPending || !name || !code}>
        {isPending ? t("creating") : t("save_partner")}
      </Button>
    </div>
  );
}
