import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Globe, LockKeyhole, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") || "" : "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError(t("passwords_do_not_match"));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("invalid_or_expired_link"));
        return;
      }
      setDone(true);
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
              <LockKeyhole className="h-8 w-8 text-primary mx-auto mb-2" />
              <h1 className="text-xl font-semibold mb-1" data-testid="text-reset-title">{t("set_new_password")}</h1>
            </div>
            {!token ? (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{t("invalid_or_expired_link")}</span>
              </div>
            ) : done ? (
              <div className="space-y-4">
                <div className="flex items-start gap-2 p-3 rounded-md bg-primary/10 text-sm" data-testid="text-reset-done">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 mt-0.5 text-primary" />
                  <span>{t("password_reset_successfully")}</span>
                </div>
                <Link href="/">
                  <Button className="w-full" data-testid="button-back-to-login">{t("back_to_login")}</Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-reset-error">
                    <AlertCircle className="h-4 w-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="new-password">{t("new_password")}</Label>
                  <Input
                    id="new-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    data-testid="input-new-password"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirm-password">{t("confirm_password")}</Label>
                  <Input
                    id="confirm-password"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    data-testid="input-confirm-password"
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading} data-testid="button-reset-submit">
                  {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  {t("reset_password")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
