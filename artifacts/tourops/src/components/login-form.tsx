import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import { LogIn, Loader2, AlertCircle, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Link } from "wouter";

function getRedirectUrl(role: string, portal: string): string {
  if (role === "admin" || role === "super_admin") return "/admin";
  const supplierRoles = ["airline_supplier", "hotel_manager", "guide_manager", "sights_manager", "supplier"];
  const opsRoleHomes: Record<string, string> = {
    country_manager: "/ops",
    transport_manager: "/ops/transport",
    city_manager: "/ops/city-manager",
    content_editor: "/ops/content-editor",
    flight_agent: "/ops/flight-agent",
    tour_builder: "/ops/tour-builder",
    tour_leader: "/ops/tour-leader",
    accounting: "/ops/accounting",
    operations_manager: "/ops",
    support_agent: "/ops/support",
  };
  if (supplierRoles.includes(role)) return "/supplier";
  if (role in opsRoleHomes) return opsRoleHomes[role];
  // customer or unknown
  return "/tours";
}

interface LoginFormProps {
  portal: "customer" | "admin" | "staff";
  title: string;
  subtitle?: string;
  onShowRegister?: () => void;
}

export function LoginForm({ portal, title, subtitle, onShowRegister }: LoginFormProps) {
  const { t } = useLanguage();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [twoFactorStep, setTwoFactorStep] = useState(false);
  const [totpCode, setTotpCode] = useState("");
  const { refetch } = useAuth();

  async function finishLogin(data: any) {
    await refetch();
    window.location.href = getRedirectUrl(data.role || "", portal);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password, portal }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("login_failed"));
        return;
      }
      if (data.requiresTwoFactor) {
        setTwoFactorStep(true);
        return;
      }
      await finishLogin(data);
    } catch {
      setError(t("network_error_try_again"));
    } finally {
      setLoading(false);
    }
  }

  async function handleTwoFactorSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login/2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: totpCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || t("login_failed"));
        return;
      }
      await finishLogin(data);
    } catch {
      setError(t("network_error_try_again"));
    } finally {
      setLoading(false);
    }
  }

  if (twoFactorStep) {
    return (
      <Card>
        <CardContent className="p-8 space-y-6">
          <div className="text-center">
            <ShieldCheck className="h-8 w-8 text-primary mx-auto mb-2" />
            <h2 className="text-xl font-semibold mb-1" data-testid="text-2fa-title">{t("two_factor_auth")}</h2>
            <p className="text-sm text-muted-foreground">{t("enter_2fa_code")}</p>
          </div>
          <form onSubmit={handleTwoFactorSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-2fa-error">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="totp-code">{t("two_factor_code")}</Label>
              <Input
                id="totp-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ""))}
                required
                autoFocus
                data-testid="input-2fa-code"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading || totpCode.length < 6} data-testid="button-2fa-submit">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
              {t("verify_code")}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-8 space-y-6">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-1" data-testid="text-login-title">{title}</h2>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-md bg-destructive/10 text-destructive text-sm" data-testid="text-login-error">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="username">{t("username")}</Label>
            <Input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              data-testid="input-username"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("password")}</Label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="pr-10"
                data-testid="input-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={loading} data-testid="button-login-submit">
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
            {t("sign_in")}
          </Button>
          <div className="text-center">
            <Link href="/forgot-password">
              <span className="text-sm text-primary hover:underline cursor-pointer" data-testid="link-forgot-password">
                {t("forgot_password_q")}
              </span>
            </Link>
          </div>
        </form>
        {portal === "customer" && onShowRegister && (
          <div className="mt-4 text-center text-sm">
            <span className="text-muted-foreground">{t("dont_have_account")} </span>
            <button
              type="button"
              className="text-primary hover:underline font-medium"
              onClick={onShowRegister}
            >
              {t("sign_up")}
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
