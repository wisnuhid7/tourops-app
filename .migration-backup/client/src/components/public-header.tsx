import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Link } from "wouter";
import { Globe } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/hooks/use-language";

export function PublicHeader() {
  const { isAuthenticated } = useAuth();
  const { t } = useLanguage();

  // Don't show public header if user is authenticated (they'll have the sidebar)
  if (isAuthenticated) return null;

  return (
    <nav className="sticky top-0 z-50 backdrop-blur-md bg-background/80 border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-4 h-14">
          <Link href="/">
            <div className="flex items-center gap-2 cursor-pointer">
              <Globe className="h-5 w-5 text-primary" />
              <span className="font-bold text-lg">TourOps</span>
            </div>
          </Link>
          <div className="hidden md:flex items-center gap-4">
            <Link href="/tours">
              <span className="text-sm text-muted-foreground hover:text-foreground cursor-pointer">{t("tours")}</span>
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
            <Link href="/#login">
              <Button variant="outline" size="sm">{t("sign_in")}</Button>
            </Link>
            <Link href="/#register">
              <Button size="sm">{t("sign_up")}</Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}
