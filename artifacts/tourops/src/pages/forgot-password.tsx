import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Globe, KeyRound, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [identifier, setIdentifier] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("network_error_try_again"));
        return;
      }
      setSent(true);
    } catch {
      setError(t("network_error_try_again"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <nav className="border-b">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">TourOps</span>
            </div>
          </Link>
        </div>
      </nav>
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="p-8 space-y-6">
            <div className="text-center">
              <KeyRound className="h-8 w-8 text-primary mx-auto mb-2" />
              <h1 className="text-xl font-semibold mb-1" data-testid="text-forgot-title">{t("forgot_password_title")}</h1>
              <p className="text-sm text-muted-foreground">{t("forgot_password_desc")}</p>
            </div>
            {sent ? (
              <div className="flex items-start gap-2 p-3 rounded-md bg-primary/10 text-sm" data-testid="text-reset-sent">
                <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
                <span>{t("reset_link_sent_msg")}</span>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-forgot-error">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="identifier">{t("username_or_email")}</Label>
                  <Input
                    id="identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    autoFocus
                    data-testid="input-identifier"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-send-reset">
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("send_reset_link")}
                </Button>
              </form>
            )}
            <div className="text-center text-sm">
              <Link href="/">
                <span className="text-primary hover:underline cursor-pointer">{t("back_to_login")}</span>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
