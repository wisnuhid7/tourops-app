import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import { useState } from "react";
import { AlertTriangle } from "lucide-react";

interface InvitePreview {
  email: string;
  firstName: string;
  lastName: string;
  bookingCode: string | null;
  tourName: string | null;
  expiresAt: string;
}

export default function AcceptInvitePage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");

  const { data: preview, isLoading, isError } = useQuery<InvitePreview>({
    queryKey: [`/api/passenger-invitations/${token}`],
    enabled: !!token,
    retry: false,
  });

  const accept = useMutation({
    mutationFn: () => apiRequest("POST", `/api/passenger-invitations/${token}/accept`, { password }),
    onSuccess: () => {
      toast({ title: t("lc_profile_saved") });
      window.location.href = "/passenger";
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const invalid = !token || isError || (!isLoading && !preview);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <Card className="w-full max-w-md" data-testid="page-accept-invite">
        <CardHeader>
          <CardTitle>{t("lc_accept_invite_title")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("lc_accept_invite_subtitle")}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="space-y-3"><Skeleton className="h-6 w-3/4" /><Skeleton className="h-10 w-full" /></div>
          ) : invalid ? (
            <div className="flex items-center gap-2 text-destructive text-sm" data-testid="text-invite-invalid">
              <AlertTriangle className="h-4 w-4" /> {t("lc_invite_invalid")}
            </div>
          ) : (
            <>
              <div className="rounded-md border p-3 space-y-1 text-sm">
                <p className="font-medium">{preview!.firstName} {preview!.lastName}</p>
                <p className="text-muted-foreground">{preview!.email}</p>
                {preview!.tourName && <p><span className="text-muted-foreground">{t("lc_invited_to")}:</span> {preview!.tourName}</p>}
                {preview!.bookingCode && <p><span className="text-muted-foreground">{t("lc_booking_code")}:</span> {preview!.bookingCode}</p>}
              </div>
              <div className="space-y-1">
                <Label>{t("lc_set_password")}</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("lc_password_min")}
                  data-testid="input-invite-password"
                />
              </div>
              <Button
                className="w-full"
                onClick={() => accept.mutate()}
                disabled={password.length < 8 || accept.isPending}
                data-testid="button-accept-invite"
              >
                {accept.isPending ? t("lc_creating") : t("lc_create_account")}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
