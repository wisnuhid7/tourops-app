import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/hooks/use-language";
import { useToast } from "@/hooks/use-toast";
import { ShieldCheck, Mail, Loader2 } from "lucide-react";

interface TwoFactorStatus {
  enabled: boolean;
  emailVerified: boolean;
  email: string | null;
}

async function postJson(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

export default function AccountSecurityPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: status, isLoading } = useQuery<TwoFactorStatus>({
    queryKey: ["/api/auth/2fa/status"],
  });

  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [disabling, setDisabling] = useState(false);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: ["/api/auth/2fa/status"] });
  }

  async function handleSetup() {
    setBusy(true);
    try {
      const data = await postJson("/api/auth/2fa/setup");
      setSetupData(data);
      setCode("");
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await postJson("/api/auth/2fa/enable", { code });
      toast({ title: t("two_factor_enabled_msg") });
      setSetupData(null);
      setCode("");
      await refresh();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await postJson("/api/auth/2fa/disable", { code });
      toast({ title: t("two_factor_disabled_msg") });
      setDisabling(false);
      setCode("");
      await refresh();
    } catch (err: any) {
      toast({ title: err.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  async function handleResendVerification() {
    setBusy(true);
    try {
      await postJson("/api/auth/send-verification");
      toast({ title: t("verification_email_sent") });
    } catch (e: any) {
      toast({ title: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold" data-testid="text-security-title">{t("security_settings")}</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="h-4 w-4 text-primary" />
            {t("email_status")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted-foreground">{status?.email || "—"}</span>
            {status?.emailVerified ? (
              <Badge data-testid="badge-email-verified">{t("verified")}</Badge>
            ) : (
              <Badge variant="secondary" data-testid="badge-email-unverified">{t("not_verified")}</Badge>
            )}
          </div>
          {status?.email && !status.emailVerified && (
            <Button variant="outline" size="sm" onClick={handleResendVerification} disabled={busy} data-testid="button-resend-verification">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("resend_verification")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4 text-primary" />
            {t("two_factor_auth")}
            {status?.enabled && <Badge data-testid="badge-2fa-enabled">{t("active")}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("two_factor_desc")}</p>

          {!status?.enabled && !setupData && (
            <Button onClick={handleSetup} disabled={busy} data-testid="button-2fa-setup">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t("enable_2fa")}
            </Button>
          )}

          {!status?.enabled && setupData && (
            <form onSubmit={handleEnable} className="space-y-4">
              <p className="text-sm">{t("scan_qr_desc")}</p>
              <img src={setupData.qrDataUrl} alt="TOTP QR" className="h-44 w-44 border rounded-md" data-testid="img-2fa-qr" />
              <p className="text-xs text-muted-foreground break-all">{setupData.secret}</p>
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="enable-code">{t("two_factor_code")}</Label>
                <Input
                  id="enable-code"
                  inputMode="numeric"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  data-testid="input-2fa-enable-code"
                />
              </div>
              <Button type="submit" disabled={busy || code.length < 6} data-testid="button-2fa-enable">
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {t("verify_code")}
              </Button>
            </form>
          )}

          {status?.enabled && !disabling && (
            <Button variant="destructive" onClick={() => { setDisabling(true); setCode(""); }} data-testid="button-2fa-disable-start">
              {t("disable_2fa")}
            </Button>
          )}

          {status?.enabled && disabling && (
            <form onSubmit={handleDisable} className="space-y-4 max-w-xs">
              <div className="space-y-2">
                <Label htmlFor="disable-code">{t("two_factor_code")}</Label>
                <Input
                  id="disable-code"
                  inputMode="numeric"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  required
                  data-testid="input-2fa-disable-code"
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={busy || code.length < 6} data-testid="button-2fa-disable-confirm">
                  {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("disable_2fa")}
                </Button>
                <Button type="button" variant="outline" onClick={() => setDisabling(false)}>
                  {t("cancel")}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
