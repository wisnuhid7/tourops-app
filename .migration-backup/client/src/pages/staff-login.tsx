import { ThemeToggle } from "@/components/theme-toggle";
import { LoginForm } from "@/components/login-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Globe,
  Shield,
  Plane,
  Hotel,
  Bus,
  UserCheck,
  Ticket,
  MapPin,
} from "lucide-react";
import { Link } from "wouter";
import { useLanguage } from "@/hooks/use-language";

export default function StaffLoginPage() {
  const { t } = useLanguage();

  const staffRoles = [
    {
      icon: Shield,
      title: t("role_admin_title"),
      desc: t("role_admin_desc"),
    },
    {
      icon: MapPin,
      title: t("role_country_manager_title"),
      desc: t("role_country_manager_desc"),
    },
    {
      icon: Plane,
      title: t("role_airline_agency_title"),
      desc: t("role_airline_agency_desc"),
    },
    {
      icon: Hotel,
      title: t("role_hotel_manager_title"),
      desc: t("role_hotel_manager_desc"),
    },
    {
      icon: Bus,
      title: t("role_transport_company_title"),
      desc: t("role_transport_company_desc"),
    },
    {
      icon: UserCheck,
      title: t("role_guide_manager_title"),
      desc: t("role_guide_manager_desc"),
    },
    {
      icon: Ticket,
      title: t("role_sights_manager_title"),
      desc: t("role_sights_manager_desc"),
    },
  ];

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
                  {t("customer_login")}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      <div className="pt-24 pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-6">
              <Shield className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-bold font-serif mb-3" data-testid="text-staff-title">
              {t("staff_operations_portal")}
            </h1>
            <p className="text-muted-foreground max-w-lg mx-auto leading-relaxed">
              {t("staff_login_desc")}
            </p>
          </div>

          <div className="max-w-md mx-auto mb-12">
            <LoginForm
              portal="staff"
              title={t("staff_sign_in_title")}
              subtitle={t("staff_credentials_subtitle")}
            />
          </div>

          <div>
            <h3 className="text-lg font-semibold text-center mb-6">{t("supported_roles")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {staffRoles.map((role) => (
                <Card key={role.title} data-testid={`card-role-${role.title.toLowerCase().replace(/\s/g, '-')}`}>
                  <CardContent className="p-5">
                    <div className="flex items-start gap-3">
                      <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <role.icon className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="font-medium text-sm mb-1">{role.title}</h4>
                        <p className="text-xs text-muted-foreground leading-relaxed">{role.desc}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="text-sm text-muted-foreground">
              {t("traveler_or_leader_question")}{" "}
              <Link href="/">
                <span className="text-primary underline cursor-pointer" data-testid="link-customer-login">
                  {t("go_to_main_site")}
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
