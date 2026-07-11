import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "@/components/login-form";
import { Button } from "@/components/ui/button";
import { Globe, Shield } from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/hooks/use-language";

export default function AdminLoginPage() {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            <Link href="/">
              <div className="flex items-center gap-2 cursor-pointer" data-testid="link-home">
                <Globe className="h-6 w-6 text-primary" />
                <span className="font-bold text-lg">TourOps</span>
              </div>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link href="/">
                <Button variant="outline" data-testid="button-back-to-main">
                  {t("back_to_main_site")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-20">
        <div className="max-w-md mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl font-bold font-serif mb-3" data-testid="text-admin-title">
              {t("admin_portal")}
            </h1>
            <p className="text-muted-foreground leading-relaxed">
              {t("secure_access_admin_desc")}
            </p>
          </div>

          <LoginForm
            portal="admin"
            title={t("admin_sign_in_title")}
            subtitle={t("admin_credentials_subtitle")}
          />

          <div className="mt-8 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("staff_or_operations")}{" "}
              <Link href="/staff/login">
                <span className="text-primary underline cursor-pointer" data-testid="link-staff-login">
                  {t("staff_portal")}
                </span>
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("looking_to_book_tour")}{" "}
              <Link href="/">
                <span className="text-primary underline cursor-pointer" data-testid="link-customer-login">
                  {t("customer_site")}
                </span>
              </Link>
            </p>
          </div>
        </div>
      </div>

      <footer className="py-8 border-t bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <span className="font-bold">TourOps</span>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; 2026 TourOps. {t("all_rights_reserved")}
          </p>
        </div>
      </footer>
    </div>
  );
}
