import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/hooks/use-language";
import { Link } from "wouter";
import { Globe, MailCheck, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function VerifyEmailPage() {
  const { t } = useLanguage();
  const [status, setStatus] = useState<"pending" | "ok" | "error">("pending");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setStatus("error");
      setMessage(t("invalid_or_expired_link"));
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ token }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("ok");
        } else {
          setStatus("error");
          setMessage(data.message || t("email_verification_failed"));
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage(t("network_error_try_again"));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          <CardContent className="p-8 space-y-6 text-center">
            <MailCheck className="h-8 w-8 text-primary mx-auto" />
            <h1 className="text-xl font-semibold" data-testid="text-verify-title">{t("verify_email_title")}</h1>
            {status === "pending" && (
              <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" data-testid="text-verify-pending">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{t("verifying_email")}</span>
              </div>
            )}
            {status === "ok" && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-md bg-primary/10 text-sm" data-testid="text-verify-ok">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{t("email_verified_msg")}</span>
              </div>
            )}
            {status === "error" && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-verify-error">
                <AlertCircle className="h-4 w-4" />
                <span>{message}</span>
              </div>
            )}
            <Link href="/">
              <Button variant="outline" className="w-full" data-testid="button-verify-home">{t("back_to_login")}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
