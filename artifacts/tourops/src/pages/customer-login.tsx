import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "@/components/login-form";
import { RegisterForm } from "@/components/register-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Globe, ArrowLeft, Shield, Compass, Sparkles, CheckCircle2 } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useLanguage } from "@/hooks/use-language";

export default function CustomerLoginPage() {
  const { t } = useLanguage();
  const [location] = useLocation();

  const [showRegister, setShowRegister] = useState(() => {
    if (typeof window !== "undefined") {
      const isRegisterPath = window.location.pathname === "/register";
      const params = new URLSearchParams(window.location.search);
      const isRegisterParam = params.get("mode") === "register";
      const isRegisterHash = window.location.hash === "#register";
      return isRegisterPath || isRegisterParam || isRegisterHash;
    }
    return false;
  });

  useEffect(() => {
    if (location === "/register") {
      setShowRegister(true);
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-background flex flex-col justify-between">
      {/* Top Navbar */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer group" data-testid="link-home">
                <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Globe className="h-5 w-5" />
                </div>
                <span className="font-bold text-lg font-serif tracking-tight">TourOps</span>
              </div>
            </Link>

            <div className="flex items-center gap-2 sm:gap-3">
              <LanguageSwitcher />
              <ThemeToggle />
              <Link href="/">
                <Button variant="ghost" size="sm" className="rounded-xl text-xs flex items-center gap-1.5 active:scale-[0.96] transition-transform" data-testid="button-back-to-main">
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>{t("back_to_main_site")}</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        {/* Subtle Ambient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-md relative z-10 space-y-6">
          {/* Header Description */}
          <div className="text-center space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20 backdrop-blur-sm mb-1">
              <Compass className="h-3.5 w-3.5" />
              <span>Customer Portal</span>
            </div>
            <h1 className="text-3xl font-extrabold font-serif tracking-tight text-foreground" data-testid="text-customer-auth-title">
              {showRegister ? t("create_account") : t("customer_sign_in")}
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-sm mx-auto">
              {showRegister ? t("register_subtitle") : t("login_to_browse")}
            </p>

            {/* Segmented Tab Switcher */}
            <div className="flex p-1 rounded-2xl bg-muted/60 border border-border/60 max-w-xs mx-auto mt-4">
              <button
                type="button"
                onClick={() => setShowRegister(false)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.96] ${
                  !showRegister
                    ? "bg-card text-foreground shadow-sm border border-border/40 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-sign-in"
              >
                {t("sign_in")}
              </button>
              <button
                type="button"
                onClick={() => setShowRegister(true)}
                className={`flex-1 py-1.5 rounded-xl text-xs font-semibold transition-all duration-200 active:scale-[0.96] ${
                  showRegister
                    ? "bg-card text-foreground shadow-sm border border-border/40 font-bold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                data-testid="tab-sign-up"
              >
                {t("sign_up")}
              </button>
            </div>
          </div>

          {/* Form Container */}
          <div className="rounded-2xl border border-border/70 bg-card/95 backdrop-blur-md shadow-xl overflow-hidden animate-in fade-in-50 duration-200">
            <div className="p-6">
              {showRegister ? (
                <RegisterForm onShowLogin={() => setShowRegister(false)} />
              ) : (
                <LoginForm
                  portal="customer"
                  title={t("sign_in_to_account")}
                  subtitle={t("enter_credentials")}
                  onShowRegister={() => setShowRegister(true)}
                />
              )}
            </div>
          </div>

          {/* Quick Portal Switcher Links */}
          <div className="pt-2 text-center space-y-1.5">
            <p className="text-xs text-muted-foreground">
              {t("staff_portal")}?{" "}
              <Link href="/staff/login">
                <span className="text-primary hover:underline font-medium cursor-pointer" data-testid="link-staff-login">
                  {t("staff_portal")} &rarr;
                </span>
              </Link>
            </p>
            <p className="text-xs text-muted-foreground">
              {t("admin_portal")}?{" "}
              <Link href="/admin/login">
                <span className="text-primary hover:underline font-medium cursor-pointer" data-testid="link-admin-login">
                  {t("admin_portal")} &rarr;
                </span>
              </Link>
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-border/40 bg-card/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">TourOps</span>
            <span>&bull;</span>
            <span>{t("all_rights_reserved")}</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/tours">
              <span className="hover:text-foreground cursor-pointer transition-colors">{t("explore_tours")}</span>
            </Link>
            <Link href="/staff/login">
              <span className="hover:text-foreground cursor-pointer transition-colors">{t("staff_portal")}</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
