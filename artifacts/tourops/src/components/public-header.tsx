import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link, useLocation } from "wouter";
import { Globe, Menu, Sparkles, Compass, MapPin, HelpCircle } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

interface PublicHeaderProps {
  className?: string;
  fixed?: boolean;
}

export function PublicHeader({ className = "", fixed = false }: PublicHeaderProps) {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const isToursActive = location === "/tours" || location.startsWith("/tours/");

  if (isAuthenticated) {
    return null;
  }

  return (
    <header
      className={`${
        fixed ? "fixed top-0 left-0 right-0" : "sticky top-0"
      } z-50 backdrop-blur-md bg-background/85 border-b border-border/50 transition-colors ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-16">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer group">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center text-primary-foreground shadow-sm shadow-primary/25 transition-transform group-hover:scale-105 active:scale-95">
                <Globe className="h-5 w-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-lg leading-tight tracking-tight" data-testid="text-brand-name">
                  TourOps
                </span>
                <span className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground">
                  Tour Operations
                </span>
              </div>
            </div>
          </Link>

          {/* Nav Links Desktop */}
          <nav className="hidden md:flex items-center gap-1">
            <a
              href="/#features"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
            >
              {t("nav_features")}
            </a>
            <Link href="/tours">
              <span
                className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors cursor-pointer inline-block ${
                  isToursActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                }`}
              >
                {t("tours")}
              </span>
            </Link>
            <a
              href="/#tours-showcase"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
            >
              {t("nav_showcase")}
            </a>
            <a
              href="/#destinations"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
            >
              {t("nav_destinations")}
            </a>
            <a
              href="/#how-it-works"
              className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
            >
              {t("nav_how_it_works")}
            </a>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />

            <Link href="/staff/login">
              <Button
                variant="ghost"
                size="sm"
                className="hidden lg:inline-flex text-xs font-medium text-muted-foreground hover:text-foreground active:scale-[0.96]"
                data-testid="button-staff-portal"
              >
                {t("staff_portal")}
              </Button>
            </Link>

            {isAuthenticated ? (
              <Link href="/my-bookings">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg font-medium transition-transform active:scale-[0.96]"
                >
                  {t("my_bookings")}
                </Button>
              </Link>
            ) : (
              <>
                <Link href="/login">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg font-medium transition-transform active:scale-[0.96]"
                    data-testid="button-login"
                  >
                    {t("sign_in")}
                  </Button>
                </Link>

                <Link href="/login?mode=register">
                  <Button
                    size="sm"
                    className="rounded-lg font-semibold shadow-sm shadow-primary/20 transition-transform active:scale-[0.96]"
                    data-testid="button-register"
                  >
                    {t("sign_up")}
                  </Button>
                </Link>
              </>
            )}

            {/* Mobile Menu Trigger */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden rounded-lg h-9 w-9 text-muted-foreground hover:text-foreground"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[280px] sm:w-[320px] p-6">
                <SheetHeader className="text-left mb-6">
                  <SheetTitle className="flex items-center gap-2.5">
                    <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
                      <Globe className="h-4 w-4" />
                    </div>
                    <span className="font-bold text-base">TourOps</span>
                  </SheetTitle>
                </SheetHeader>

                <div className="flex flex-col gap-2">
                  <a
                    href="/#features"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Sparkles className="h-4 w-4 text-primary" />
                    <span>{t("nav_features")}</span>
                  </a>

                  <Link href="/tours">
                    <div
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                        isToursActive
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      <Compass className="h-4 w-4 text-primary" />
                      <span>{t("tours")}</span>
                    </div>
                  </Link>

                  <a
                    href="/#tours-showcase"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Compass className="h-4 w-4 text-amber-500" />
                    <span>{t("nav_showcase")}</span>
                  </a>

                  <a
                    href="/#destinations"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <MapPin className="h-4 w-4 text-rose-500" />
                    <span>{t("nav_destinations")}</span>
                  </a>

                  <a
                    href="/#how-it-works"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <HelpCircle className="h-4 w-4 text-sky-500" />
                    <span>{t("nav_how_it_works")}</span>
                  </a>

                  <div className="my-3 border-t border-border/60" />

                  <Link href="/staff/login">
                    <Button
                      variant="ghost"
                      onClick={() => setMobileMenuOpen(false)}
                      className="w-full justify-start text-xs font-medium text-muted-foreground hover:text-foreground"
                    >
                      {t("staff_portal")}
                    </Button>
                  </Link>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
