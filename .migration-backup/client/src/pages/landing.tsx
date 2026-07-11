import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
import { LoginForm } from "@/components/login-form";
import { RegisterForm } from "@/components/register-form";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/hooks/use-language";
import {
  Globe,
  Shield,
  Users,
  Plane,
  MapPin,
  Calendar,
  ArrowRight,
  CheckCircle,
} from "lucide-react";

export default function LandingPage() {
  const { toast } = useToast();
  const { t } = useLanguage();

  const { data: popularDestinations, isLoading: isLoadingDestinations } = useQuery<{name: string, tours: number, img: string}[]>({
    queryKey: ["/api/destinations/popular"],
  });
  // Check URL hash to determine initial tab
  const initialShowRegister = typeof window !== 'undefined' && window.location.hash === '#register';
  const [showRegister, setShowRegister] = useState(initialShowRegister);
  return (
    <div className="min-h-screen bg-background">
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-16">
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg" data-testid="text-brand-name">TourOps</span>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <a href="#features" className="text-sm text-muted-foreground hover-elevate px-2 py-1 rounded-md">{t("nav_features")}</a>
              <a href="#destinations" className="text-sm text-muted-foreground hover-elevate px-2 py-1 rounded-md">{t("nav_destinations")}</a>
              <a href="#how-it-works" className="text-sm text-muted-foreground hover-elevate px-2 py-1 rounded-md">{t("nav_how_it_works")}</a>
            </div>
            <div className="flex items-center gap-2">
              <LanguageSwitcher />
              <ThemeToggle />
              <Link href="/staff/login">
                <Button variant="outline" data-testid="button-staff-portal">{t("staff_portal")}</Button>
              </Link>
              <a href="#login" onClick={() => setShowRegister(false)}>
                <Button variant="outline" data-testid="button-login">{t("sign_in")}</Button>
              </a>
              <a href="#register" onClick={() => setShowRegister(true)}>
                <Button data-testid="button-register">{t("sign_up")}</Button>
              </a>
            </div>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0">
          <img
            src="/images/hero-tour.png"
            alt="Tour destinations"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="max-w-2xl">
            <Badge variant="secondary" className="mb-4 bg-white/10 text-white border-white/20">
              <Plane className="h-3 w-3 mr-1" /> {t("professional_tour_operations_badge")}
            </Badge>
            <h1 className="text-4xl md:text-6xl font-bold text-white mb-6 font-serif leading-tight">
              {t("hero_title_1")}
              <br />
              <span className="text-primary-foreground/90">{t("hero_title_2")}</span>
            </h1>
            <p className="text-lg text-white/80 mb-8 max-w-lg leading-relaxed">
              {t("hero_subtitle")}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <a href="#login">
                <Button size="lg" data-testid="button-get-started">
                  {t("get_started")}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
              <a href="/tours">
                <Button size="lg" variant="outline" className="text-white border-white/30 backdrop-blur-sm bg-white/10">
                  {t("explore_tours")}
                </Button>
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-4 mt-8">
              <div className="flex items-center gap-1 text-white/70 text-sm">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span>{t("free_to_browse")}</span>
              </div>
              <div className="flex items-center gap-1 text-white/70 text-sm">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span>{t("instant_booking")}</span>
              </div>
              <div className="flex items-center gap-1 text-white/70 text-sm">
                <CheckCircle className="h-4 w-4 text-green-400" />
                <span>{t("full_trip_support")}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-serif mb-4">{t("why_choose")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("why_choose_subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <Card 
              className="hover-elevate cursor-pointer transition-all hover:border-primary/50"
              onClick={() => toast({ title: t("group_family_booking"), description: t("group_family_desc") })}
            >
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("group_family_booking")}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t("group_family_desc")}
                </p>
              </CardContent>
            </Card>

            <Card 
              className="hover-elevate cursor-pointer transition-all hover:border-primary/50"
              onClick={() => toast({ title: t("end_to_end"), description: t("end_to_end_desc") })}
            >
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("end_to_end")}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t("end_to_end_desc")}
                </p>
              </CardContent>
            </Card>

            <Card 
              className="hover-elevate cursor-pointer transition-all hover:border-primary/50"
              onClick={() => toast({ title: t("multi_country"), description: t("multi_country_desc") })}
            >
              <CardContent className="p-6">
                <div className="w-12 h-12 rounded-md bg-primary/10 flex items-center justify-center mb-4">
                  <MapPin className="h-6 w-6 text-primary" />
                </div>
                <h3 className="font-semibold text-lg mb-2">{t("multi_country")}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {t("multi_country_desc")}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="destinations" className="py-20 bg-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-serif mb-4">{t("popular_destinations")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("popular_destinations_subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isLoadingDestinations ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="rounded-md overflow-hidden aspect-[4/3] bg-muted animate-pulse" />
              ))
            ) : popularDestinations && popularDestinations.length > 0 ? (
              popularDestinations.map((dest) => (
                <a
                  key={dest.name}
                  href={`/tours?search=${encodeURIComponent(dest.name)}`}
                  className="group relative rounded-md overflow-hidden aspect-[4/3] block cursor-pointer"
                >
                  <img
                    src={dest.img}
                    alt={dest.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&q=80";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold text-lg">{dest.name}</h3>
                    <p className="text-white/70 text-sm">{dest.tours} {t("tours_available")}</p>
                  </div>
                </a>
              ))
            ) : (
              [
                { name: "Greece", img: "/images/tour-greece.png", tours: 5 },
                { name: "Peru", img: "/images/tour-peru.png", tours: 3 },
                { name: "Japan", img: "/images/tour-japan.png", tours: 4 },
                { name: "Kenya Safari", img: "/images/tour-safari.png", tours: 2 },
              ].map((dest) => (
                <a
                  key={dest.name}
                  href={`/tours?search=${encodeURIComponent(dest.name)}`}
                  className="group relative rounded-md overflow-hidden aspect-[4/3] block cursor-pointer"
                >
                  <img
                    src={dest.img}
                    alt={dest.name}
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    onError={(e) => {
                      e.currentTarget.src = "https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&q=80";
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-4">
                    <h3 className="text-white font-semibold text-lg">{dest.name}</h3>
                    <p className="text-white/70 text-sm">{dest.tours} {t("tours_available")}</p>
                  </div>
                </a>
              ))
            )}
          </div>

          <div className="mt-12 text-center">
            <a href="/tours">
              <Button variant="outline" size="lg" className="rounded-full px-8 hover:bg-primary hover:text-primary-foreground transition-colors">
                {t("explore_all_destinations")} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="py-20 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold font-serif mb-4">{t("how_it_works")}</h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {t("how_it_works_subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: "1", icon: Globe, title: t("step_browse"), desc: t("step_browse_desc") },
              { step: "2", icon: Calendar, title: t("step_pick_date"), desc: t("step_pick_date_desc") },
              { step: "3", icon: Users, title: t("step_book_invite"), desc: t("step_book_invite_desc") },
              { step: "4", icon: Plane, title: t("step_travel"), desc: t("step_travel_desc") },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-14 h-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-4 text-xl font-bold">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-muted-foreground text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="login" className="py-20 bg-card">
        <span id="register" />
        <div className="max-w-md mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold font-serif mb-3">
              {showRegister ? t("create_account") : t("customer_sign_in")}
            </h2>
            <p className="text-muted-foreground">
              {showRegister
                ? t("register_subtitle")
                : t("login_to_browse")}
            </p>
            {/* Tab switcher */}
            <div className="flex rounded-lg border p-1 mt-4 bg-background">
              <button
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  !showRegister ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setShowRegister(false)}
              >
                {t("sign_in")}
              </button>
              <button
                className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  showRegister ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                onClick={() => setShowRegister(true)}
              >
                {t("sign_up")}
              </button>
            </div>
          </div>
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
          <div className="mt-6 text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {t("admin_portal")}?{" "}
              <Link href="/admin/login">
                <span className="text-primary underline cursor-pointer" data-testid="link-admin-login">
                  {t("admin_portal")}
                </span>
              </Link>
            </p>
            <p className="text-sm text-muted-foreground">
              {t("staff_portal")}?{" "}
              <Link href="/staff/login">
                <span className="text-primary underline cursor-pointer" data-testid="link-staff-login">
                  {t("staff_portal")}
                </span>
              </Link>
            </p>
          </div>
        </div>
      </section>

      <footer className="py-12 border-t bg-card text-card-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-6 w-6 text-primary" />
              <span className="font-bold text-lg">TourOps</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("footer_tagline")}
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t("company")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">{t("about_us")}</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">{t("careers")}</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">{t("contact_support")}</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t("legal")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">{t("terms_of_service")}</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">{t("privacy_policy")}</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">{t("cookie_policy")}</a></li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-4">{t("connect")}</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li><a href="#" className="hover:text-primary transition-colors">Twitter</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">Instagram</a></li>
              <li><a href="#" className="hover:text-primary transition-colors">LinkedIn</a></li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t text-center text-sm text-muted-foreground">
          &copy; 2026 TourOps Inc. {t("all_rights_reserved")}
        </div>
      </footer>
    </div>
  );
}
