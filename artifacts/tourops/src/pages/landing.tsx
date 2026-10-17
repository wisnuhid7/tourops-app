import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { LanguageSwitcher } from "@/components/language-switcher";
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
  CheckCircle2,
  Star,
  Sparkles,
  Compass,
  ChevronRight,
  ChevronLeft,
  Clock,
  Award,
  Eye,
  Play,
  Pause,
} from "lucide-react";

export default function LandingPage() {
  const { toast } = useToast();
  const { t } = useLanguage();

  // Popular destinations query
  const { data: popularDestinations, isLoading: isLoadingDestinations } = useQuery<{ name: string; tours: number; img: string }[]>({
    queryKey: ["/api/destinations/popular"],
  });

  // Public tours query for the interactive horizontal showcase
  const { data: publicTours, isLoading: isLoadingTours } = useQuery<any[]>({
    queryKey: ["/api/tours/public"],
  });

  const fallbackDestinations = [
    {
      name: "Greece",
      img: "/images/tour-greece.png",
      tours: 5,
      rating: 4.9,
      country: "Europe",
    },
    {
      name: "Peru",
      img: "/images/tour-peru.png",
      tours: 3,
      rating: 4.8,
      country: "South America",
    },
    {
      name: "Japan",
      img: "/images/tour-japan.png",
      tours: 4,
      rating: 5.0,
      country: "East Asia",
    },
    {
      name: "Kenya Safari",
      img: "/images/tour-safari.png",
      tours: 2,
      rating: 4.9,
      country: "Africa",
    },
  ];

  const quickPills = ["Japan", "Greece", "Peru", "Kenya", "Bali", "Iceland"];

  // Fallback curated tours in case database has few or placeholder records
  const fallbackTours = [
    {
      id: "fallback-japan",
      title: "Tokyo & Kyoto Classical Discovery",
      countries: ["Japan"],
      duration: 8,
      totalPrice: "1890",
      basePrice: "1890",
      priceDisplay: "1,890",
      imageUrl: "/images/tour-japan.png",
      category: "Cultural & Family",
      rating: 5.0,
      description: "Immerse in the historic shrines of Kyoto, neon-lit streets of Tokyo, high-speed bullet trains, and authentic tea ceremony traditions.",
    },
    {
      id: "fallback-greece",
      title: "Classical Greece & Aegean Islands",
      countries: ["Greece"],
      duration: 7,
      totalPrice: "1650",
      basePrice: "1650",
      priceDisplay: "1,650",
      imageUrl: "/images/tour-greece.png",
      category: "Historical & Coastal",
      rating: 4.9,
      description: "Walk the Acropolis of Athens, sail the azure waters of Santorini, and savor world-renowned Mediterranean sunset dining.",
    },
    {
      id: "fallback-peru",
      title: "Inca Trail & Sacred Valley Expedition",
      countries: ["Peru"],
      duration: 9,
      totalPrice: "2150",
      basePrice: "2150",
      priceDisplay: "2,150",
      imageUrl: "/images/tour-peru.png",
      category: "Adventure & Hiking",
      rating: 4.8,
      description: "Ascend to breathtaking Machu Picchu, uncover ancient Incan architecture in Cusco, and meet welcoming Andean artisan communities.",
    },
    {
      id: "fallback-kenya",
      title: "Masai Mara Great Migration Safari",
      countries: ["Kenya"],
      duration: 6,
      totalPrice: "2490",
      basePrice: "2490",
      priceDisplay: "2,490",
      imageUrl: "/images/tour-safari.png",
      category: "Wildlife & Safari",
      rating: 4.9,
      description: "Witness the Big Five in their natural savannah habitat with certified safari rangers, luxury tented camps, and sunrise balloon views.",
    },
    {
      id: "fallback-indonesia",
      title: "Bali Temples, Waterfalls & Komodo Islands",
      countries: ["Indonesia"],
      duration: 8,
      totalPrice: "1350",
      basePrice: "1350",
      priceDisplay: "1,350",
      imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=1200",
      category: "Tropical Island & Nature",
      rating: 4.9,
      description: "Discover emerald rice terraces, sacred sea temples in Uluwatu, and sail on a luxury phinisi yacht to meet wild Komodo dragons.",
    },
    {
      id: "fallback-egypt",
      title: "Secrets of Ancient Egypt & Nile Cruise",
      countries: ["Egypt"],
      duration: 7,
      totalPrice: "1590",
      basePrice: "1590",
      priceDisplay: "1,590",
      imageUrl: "https://images.unsplash.com/photo-1539650116574-8efeb43e2750?auto=format&fit=crop&q=80&w=1200",
      category: "Ancient Wonders",
      rating: 4.9,
      description: "Marvel at the Great Pyramids of Giza, explore the mysterious Valley of the Kings, and sail down the majestic Nile River.",
    },
  ];

  const getTourFallbackImage = (tour: any) => {
    if (tour.imageUrl && !tour.imageUrl.includes("example.com") && tour.imageUrl.startsWith("http")) {
      return tour.imageUrl;
    }
    if (tour.imageUrl && tour.imageUrl.startsWith("/images/")) {
      return tour.imageUrl;
    }
    const country = ((tour.countries?.[0] || "") + " " + (tour.title || "")).toLowerCase();
    if (country.includes("japan") || country.includes("tokyo")) {
      return "/images/tour-japan.png";
    }
    if (country.includes("greece") || country.includes("athens") || country.includes("santorini")) {
      return "/images/tour-greece.png";
    }
    if (country.includes("peru") || country.includes("inca") || country.includes("cusco")) {
      return "/images/tour-peru.png";
    }
    if (country.includes("kenya") || country.includes("safari") || country.includes("mara")) {
      return "/images/tour-safari.png";
    }
    if (country.includes("egypt") || country.includes("cairo") || country.includes("pyramid")) {
      return "https://images.unsplash.com/photo-1539650116574-8efeb43e2750?auto=format&fit=crop&q=80&w=1200";
    }
    if (country.includes("singapore")) {
      return "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&q=80&w=1200";
    }
    if (country.includes("indonesia") || country.includes("bali") || country.includes("lombok")) {
      return "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=1200";
    }
    return "/images/hero-tour.png";
  };

  // Harmonized tours list for horizontal showcase
  const showcaseTours = useMemo(() => {
    if (!publicTours || publicTours.length === 0) return fallbackTours;
    return publicTours.map((t, idx) => {
      const fb = fallbackTours[idx % fallbackTours.length];
      const priceNum = Number(t.totalPrice) > 0 ? Number(t.totalPrice) : Number(t.basePrice) > 0 ? Number(t.basePrice) : Number(fb.basePrice);
      return {
        id: t.id,
        title: t.title || fb.title,
        countries: t.countries && t.countries.length > 0 ? t.countries : fb.countries,
        duration: t.duration || fb.duration,
        priceDisplay: priceNum.toLocaleString(),
        imageUrl: getTourFallbackImage(t),
        category: t.category || fb.category,
        rating: t.rating || fb.rating,
        description: t.description || fb.description,
      };
    });
  }, [publicTours]);

  // Horizontal Tour Showcase State
  const [activeTourIndex, setActiveTourIndex] = useState(0);
  const [isAutoDrawDisabled, setIsAutoDrawDisabled] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const autoDrawTimerRef = useRef<NodeJS.Timeout | null>(null);

  const activeTour = showcaseTours[activeTourIndex] || showcaseTours[0];

  // Scroll to specific card
  const selectTour = (index: number, smoothScroll = true) => {
    if (index < 0 || index >= showcaseTours.length) return;
    setActiveTourIndex(index);
    const cardEl = cardRefs.current[index];
    const containerEl = scrollContainerRef.current;
    if (cardEl && containerEl) {
      const cardLeft = cardEl.offsetLeft;
      containerEl.scrollTo({
        left: Math.max(0, cardLeft - 24),
        behavior: smoothScroll ? "smooth" : "auto",
      });
    }
  };

  // Explicitly disable auto draw on any user manual interaction
  const disableAutoDraw = () => {
    setIsAutoDrawDisabled(true);
    if (autoDrawTimerRef.current) {
      clearInterval(autoDrawTimerRef.current);
      autoDrawTimerRef.current = null;
    }
  };

  // Auto-advance / draw tour every 1s until disabled by user interaction
  useEffect(() => {
    if (isAutoDrawDisabled) {
      if (autoDrawTimerRef.current) {
        clearInterval(autoDrawTimerRef.current);
        autoDrawTimerRef.current = null;
      }
      return;
    }

    if (showcaseTours.length > 1) {
      autoDrawTimerRef.current = setInterval(() => {
        setActiveTourIndex((prevIndex) => {
          const nextIndex = (prevIndex + 1) % showcaseTours.length;
          const cardEl = cardRefs.current[nextIndex];
          const containerEl = scrollContainerRef.current;
          if (cardEl && containerEl) {
            const cardLeft = cardEl.offsetLeft;
            containerEl.scrollTo({
              left: Math.max(0, cardLeft - 24),
              behavior: "smooth",
            });
          }
          return nextIndex;
        });
      }, 1000);
    }

    return () => {
      if (autoDrawTimerRef.current) {
        clearInterval(autoDrawTimerRef.current);
        autoDrawTimerRef.current = null;
      }
    };
  }, [showcaseTours.length, isAutoDrawDisabled]);

  const handlePrevTour = () => {
    disableAutoDraw();
    const prevIndex = (activeTourIndex - 1 + showcaseTours.length) % showcaseTours.length;
    selectTour(prevIndex);
  };

  const handleNextTour = () => {
    disableAutoDraw();
    const nextIndex = (activeTourIndex + 1) % showcaseTours.length;
    selectTour(nextIndex);
  };

  // Detect card in view as user scrolls horizontally with touch / trackpad / wheel
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const scrollPos = container.scrollLeft;

    let closestIndex = 0;
    let minDistance = Infinity;
    cardRefs.current.forEach((el, idx) => {
      if (!el) return;
      const distance = Math.abs(el.offsetLeft - scrollPos - 24);
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = idx;
      }
    });

    if (closestIndex !== activeTourIndex && closestIndex >= 0 && closestIndex < showcaseTours.length) {
      setActiveTourIndex(closestIndex);
      disableAutoDraw();
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-primary">
      {/* ── Fixed Modern Glass Navbar ───────────────────────── */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md bg-background/80 border-b border-border/50 transition-colors">
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

            {/* Nav Links */}
            <nav className="hidden md:flex items-center gap-1">
              <a
                href="#features"
                className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
              >
                {t("nav_features")}
              </a>
              <Link href="/tours">
                <span className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors cursor-pointer inline-block">
                  {t("tours")}
                </span>
              </Link>
              <a
                href="#tours-showcase"
                className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
              >
                {t("nav_showcase")}
              </a>
              <a
                href="#destinations"
                className="text-sm font-medium text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-full hover:bg-muted/60 transition-colors"
              >
                {t("nav_destinations")}
              </a>
              <a
                href="#how-it-works"
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
            </div>
          </div>
        </div>
      </header>

      {/* ── Hero Section ───────────────────────────────────── */}
      <section className="relative pt-24 pb-20 md:pt-32 md:pb-28 overflow-hidden bg-slate-950 text-white">
        {/* Cinematic Backdrop with Mesh Gradients */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <img
            src="/images/hero-tour.png"
            alt="Tour destinations"
            className="w-full h-full object-cover object-center filter brightness-[0.6] contrast-[1.05]"
          />
          {/* Deep dark layered gradients to make text crisp */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/80 to-slate-950/45" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/60" />
          {/* Ambient Glow Orbs */}
          <div className="absolute top-1/4 left-10 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-12 gap-12 items-center">
            {/* Left Column: Headline & Action */}
            <div className="lg:col-span-7 pt-4">


              {/* Main Headline */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white font-serif tracking-tight leading-[1.12] mb-6 text-balance">
                {t("hero_title_1")}{" "}
                <span className="bg-gradient-to-r from-amber-200 via-rose-100 to-white bg-clip-text text-transparent">
                  {t("hero_title_2")}
                </span>
              </h1>

              {/* Subtitle */}
              <p className="text-base sm:text-lg text-white/85 max-w-xl leading-relaxed font-normal mb-8 text-pretty">
                {t("hero_subtitle")}
              </p>

              {/* Interactive CTAs */}
              <div className="flex flex-wrap items-center gap-3.5 mb-8">
                <Link href="/login?mode=register">
                  <Button
                    size="lg"
                    className="rounded-xl px-7 h-12 text-base font-semibold shadow-lg shadow-primary/30 transition-transform active:scale-[0.96]"
                    data-testid="button-get-started"
                  >
                    {t("get_started")}
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                <a href="#tours-showcase">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-xl px-6 h-12 text-base font-medium text-white border-white/30 backdrop-blur-md bg-white/10 hover:bg-white/20 hover:text-white transition-transform active:scale-[0.96]"
                  >
                    <Compass className="mr-2 h-4 w-4 text-white" />
                    {t("explore_tours")}
                  </Button>
                </a>
              </div>

              {/* Quick Pills for Search */}
              <div className="flex items-center flex-wrap gap-2 pt-2">
                <span className="text-xs text-white/60 font-medium">Popular:</span>
                {quickPills.map((pill) => (
                  <Link key={pill} href={`/tours?search=${encodeURIComponent(pill)}`}>
                    <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-white/90 border border-white/15 transition-colors cursor-pointer active:scale-95">
                      {pill}
                    </span>
                  </Link>
                ))}
              </div>

              {/* Trust Value Badges */}
              <div className="flex flex-wrap items-center gap-5 mt-8 pt-6 border-t border-white/10">
                <div className="flex items-center gap-2 text-white/85 text-xs sm:text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{t("free_to_browse")}</span>
                </div>
                <div className="flex items-center gap-2 text-white/85 text-xs sm:text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{t("instant_booking")}</span>
                </div>
                <div className="flex items-center gap-2 text-white/85 text-xs sm:text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  <span>{t("full_trip_support")}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Floating Preview Showcase Card */}
            <div className="lg:col-span-5 hidden lg:block">
              <div className="relative">
                {/* Glow Backdrop */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary/50 to-emerald-500/40 rounded-3xl blur-xl opacity-60" />

                {/* Main Glass Card */}
                <div className="relative rounded-3xl bg-slate-900/80 backdrop-blur-xl border border-white/20 p-6 text-white shadow-2xl overflow-hidden">
                  <div className="relative rounded-2xl overflow-hidden aspect-[16/10] mb-5 ring-1 ring-inset ring-white/15">
                    <img
                      src="/images/tour-japan.png"
                      alt="Japan Discovery Tour"
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.src =
                          "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80";
                      }}
                    />
                    <div className="absolute top-3 left-3">
                      <Badge className="bg-emerald-500/90 text-white font-medium text-xs px-2.5 py-0.5 border-none shadow-sm backdrop-blur-md">
                        Guaranteed Departure
                      </Badge>
                    </div>
                    <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-xs font-semibold text-amber-300">
                      <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                      <span className="tabular-nums">5.0</span>
                    </div>
                    <div className="absolute bottom-3 left-3 right-3 bg-slate-950/75 backdrop-blur-md rounded-xl p-3 border border-white/10 flex items-center justify-between">
                      <div>
                        <p className="text-xs text-white/70">Tokyo & Kyoto Classical</p>
                        <p className="text-sm font-bold text-white">8 Days / 7 Nights</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-white/60">From</p>
                        <p className="text-base font-extrabold text-amber-300 tabular-nums">$1,890</p>
                      </div>
                    </div>
                  </div>

                  {/* Highlights Grid */}
                  <div className="grid grid-cols-2 gap-3 mb-5">
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2 text-white/70 text-xs mb-1">
                        <Users className="h-3.5 w-3.5 text-primary" />
                        <span>Group Size</span>
                      </div>
                      <p className="text-sm font-semibold text-white">Max 16 Travelers</p>
                    </div>
                    <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                      <div className="flex items-center gap-2 text-white/70 text-xs mb-1">
                        <Shield className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Security</span>
                      </div>
                      <p className="text-sm font-semibold text-white">Verified Operator</p>
                    </div>
                  </div>

                  {/* Booking CTA inside card */}
                  <a href="#tours-showcase">
                    <Button
                      variant="secondary"
                      className="w-full rounded-xl h-11 font-semibold text-sm transition-transform active:scale-[0.98] shadow-sm"
                    >
                      <span>Explore Featured Tours</span>
                      <ChevronRight className="ml-1.5 h-4 w-4" />
                    </Button>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Key Metrics / Social Proof Strip ───────────────── */}
      <section className="py-10 border-y border-border/60 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="space-y-1">
              <div className="text-3xl sm:text-4xl font-extrabold text-foreground tabular-nums tracking-tight">
                15,000+
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Happy Travelers</p>
            </div>
            <div className="space-y-1">
              <div className="text-3xl sm:text-4xl font-extrabold text-foreground tabular-nums tracking-tight">
                50+
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Global Destinations</p>
            </div>
            <div className="space-y-1">
              <div className="text-3xl sm:text-4xl font-extrabold text-foreground tabular-nums tracking-tight">
                99.4%
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Tour Satisfaction</p>
            </div>
            <div className="space-y-1">
              <div className="text-3xl sm:text-4xl font-extrabold text-foreground tabular-nums tracking-tight">
                24/7
              </div>
              <p className="text-xs sm:text-sm text-muted-foreground font-medium">Local Concierge Support</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Features Section ─────────────────────────────────── */}
      <section id="features" className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <Badge variant="outline" className="mb-3 rounded-full px-3 py-1 font-medium text-xs">
              <Sparkles className="h-3 w-3 mr-1 text-primary" /> Key Benefits
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold font-serif tracking-tight mb-4 text-balance">
              {t("why_choose")}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed text-pretty">
              {t("why_choose_subtitle")}
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {/* Feature 1 */}
            <Card
              className="rounded-2xl border-border/60 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group bg-card"
              onClick={() =>
                toast({
                  title: t("group_family_booking"),
                  description: t("group_family_desc"),
                })
              }
            >
              <CardContent className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-6 shadow-sm group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-300">
                  <Users className="h-7 w-7" />
                </div>
                <h3 className="font-bold text-xl mb-3 tracking-tight group-hover:text-primary transition-colors">
                  {t("group_family_booking")}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  {t("group_family_desc")}
                </p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <span>Explore group features</span>
                  <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>

            {/* Feature 2 */}
            <Card
              className="rounded-2xl border-border/60 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group bg-card"
              onClick={() =>
                toast({
                  title: t("end_to_end"),
                  description: t("end_to_end_desc"),
                })
              }
            >
              <CardContent className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-6 shadow-sm group-hover:bg-emerald-600 group-hover:text-white transition-colors duration-300">
                  <Shield className="h-7 w-7" />
                </div>
                <h3 className="font-bold text-xl mb-3 tracking-tight group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {t("end_to_end")}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  {t("end_to_end_desc")}
                </p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                  <span>Verified safety standard</span>
                  <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>

            {/* Feature 3 */}
            <Card
              className="rounded-2xl border-border/60 hover:border-primary/40 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 cursor-pointer group bg-card"
              onClick={() =>
                toast({
                  title: t("multi_country"),
                  description: t("multi_country_desc"),
                })
              }
            >
              <CardContent className="p-8">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-6 shadow-sm group-hover:bg-amber-600 group-hover:text-white transition-colors duration-300">
                  <MapPin className="h-7 w-7" />
                </div>
                <h3 className="font-bold text-xl mb-3 tracking-tight group-hover:text-amber-600 dark:group-hover:text-amber-400 transition-colors">
                  {t("multi_country")}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed mb-4">
                  {t("multi_country_desc")}
                </p>
                <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400">
                  <span>Custom itineraries</span>
                  <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-1 transition-transform" />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE HORIZONTAL TOUR SHOWCASE WITH DYNAMIC BACKGROUND ── */}
      <section
        id="tours-showcase"
        className="relative py-24 overflow-hidden bg-slate-950 text-white min-h-[720px] transition-colors"
      >
        {/* Dynamic Backgrounds with Smooth Cross-Fade */}
        <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
          {showcaseTours.map((t, idx) => {
            const isActive = idx === activeTourIndex;
            return (
              <div
                key={t.id || idx}
                className={`absolute inset-0 transition-opacity duration-500 ease-in-out ${
                  isActive ? "opacity-100 scale-100" : "opacity-0 scale-105"
                }`}
                style={{ willChange: "opacity, transform" }}
              >
                <img
                  src={t.imageUrl}
                  alt={t.title}
                  className="w-full h-full object-cover object-center filter brightness-[0.38] contrast-[1.12]"
                  onError={(e) => {
                    e.currentTarget.src = "/images/hero-tour.png";
                  }}
                />
              </div>
            );
          })}

          {/* Cinematic Dark Layered Gradients */}
          <div className="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/85 to-slate-950/40" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/70" />
          <div className="absolute top-1/3 -left-20 w-96 h-96 bg-primary/20 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-serif tracking-tight text-white mb-3 text-balance">
                Explore Signature Tours
              </h2>
              <p className="text-white/75 text-base sm:text-lg max-w-xl text-pretty">
                Scroll sideways to browse tours. The scenic background shifts as you discover each destination.
              </p>
            </div>

            {/* Navigation Buttons and Index Indicator */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-mono text-white/70 mr-1 tabular-nums">
                <span className="font-bold text-white text-base">
                  {String(activeTourIndex + 1).padStart(2, "0")}
                </span>{" "}
                / {String(showcaseTours.length).padStart(2, "0")}
              </span>

              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsAutoDrawDisabled((prev) => !prev)}
                className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-md transition-transform active:scale-90"
                title={isAutoDrawDisabled ? "Play Auto-Slide" : "Pause Auto-Slide"}
                aria-label={isAutoDrawDisabled ? "Play Auto-Slide" : "Pause Auto-Slide"}
              >
                {isAutoDrawDisabled ? (
                  <Play className="h-4 w-4 fill-white text-white ml-0.5" />
                ) : (
                  <Pause className="h-4 w-4 fill-white text-white" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handlePrevTour}
                disabled={showcaseTours.length <= 1}
                className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-md transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Previous tour"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={handleNextTour}
                disabled={showcaseTours.length <= 1}
                className="h-11 w-11 rounded-full bg-white/10 hover:bg-white/20 border-white/20 text-white backdrop-blur-md transition-transform active:scale-90 disabled:opacity-30 disabled:pointer-events-none"
                aria-label="Next tour"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>
          </div>

          {/* Main Grid: Left Active Details & Right Horizontal Scroll Cards */}
          <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
            {/* Left: Active Tour Spotlight Details */}
            <div className="lg:col-span-5 space-y-6">
              {/* Badge & Country */}
              <div className="flex items-center gap-2.5 flex-wrap">
                <Badge className="bg-primary text-primary-foreground font-semibold px-3 py-1 rounded-full text-xs shadow-sm">
                  {activeTour.category || "Curated Itinerary"}
                </Badge>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-white/90 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/15">
                  <MapPin className="h-3 w-3 text-rose-400" />
                  <span>{activeTour.countries?.join(", ") || "Global"}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-300 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                  <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                  <span className="tabular-nums">{activeTour.rating || "4.9"}</span>
                </span>
              </div>

              {/* Title */}
              <h3 className="text-3xl sm:text-4xl font-extrabold font-serif text-white tracking-tight leading-tight">
                {activeTour.title}
              </h3>

              {/* Description Snippet */}
              <p className="text-white/80 text-sm sm:text-base leading-relaxed line-clamp-3">
                {activeTour.description}
              </p>

              {/* Specs Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-white/60 mb-1">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    <span>Duration</span>
                  </div>
                  <p className="text-sm font-bold text-white tabular-nums">
                    {activeTour.duration} Days
                  </p>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center gap-1.5 text-xs text-white/60 mb-1">
                    <Users className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Capacity</span>
                  </div>
                  <p className="text-sm font-bold text-white">Max 16 Pax</p>
                </div>

                <div className="rounded-xl bg-white/5 border border-white/10 p-3 col-span-2 sm:col-span-1">
                  <div className="flex items-center gap-1.5 text-xs text-white/60 mb-1">
                    <Shield className="h-3.5 w-3.5 text-amber-300" />
                    <span>Operations</span>
                  </div>
                  <p className="text-sm font-bold text-white">Full Support</p>
                </div>
              </div>

              {/* Price & Actions */}
              <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-white/10">
                <div>
                  <span className="text-xs text-white/60 uppercase tracking-wider block font-medium">
                    Starting From
                  </span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-extrabold text-amber-300 tabular-nums">
                      ${activeTour.priceDisplay}
                    </span>
                    <span className="text-xs text-white/70">/ person</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  <Link href={activeTour.id.startsWith("fallback") ? "/tours" : `/tours/${activeTour.id}`}>
                    <Button
                      size="lg"
                      className="rounded-xl px-6 h-12 font-semibold shadow-xl shadow-primary/30 transition-transform active:scale-[0.96]"
                    >
                      <span>{t("view_details")}</span>
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </Link>

                  <Link href="/tours">
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-xl px-4 h-12 text-white border-white/20 bg-white/5 hover:bg-white/15 active:scale-[0.96]"
                    >
                      {t("tours")}
                    </Button>
                  </Link>
                </div>
              </div>

              {/* Tour indicator pills */}
              <div className="flex items-center gap-1.5 pt-2">
                {showcaseTours.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      disableAutoDraw();
                      selectTour(i);
                    }}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      i === activeTourIndex
                        ? "w-8 bg-primary"
                        : "w-2 bg-white/30 hover:bg-white/50"
                    }`}
                    aria-label={`Jump to tour ${i + 1}`}
                  />
                ))}
              </div>
            </div>

            {/* Right: Smooth Horizontal Scroll Cards Container */}
            <div className="lg:col-span-7">
              <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex gap-5 overflow-x-auto scroll-smooth snap-x snap-mandatory py-4 px-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                style={{ scrollbarWidth: "none" }}
              >
                {showcaseTours.map((tour, index) => {
                  const isActive = index === activeTourIndex;
                  return (
                    <div
                      key={tour.id || index}
                      ref={(el) => {
                        cardRefs.current[index] = el;
                      }}
                      onClick={() => {
                        disableAutoDraw();
                        selectTour(index);
                      }}
                      className={`w-[270px] sm:w-[310px] shrink-0 snap-start select-none cursor-pointer group transition-all duration-300 rounded-3xl p-2.5 ${
                        isActive
                          ? "bg-slate-900/90 border-2 border-primary/90 shadow-2xl scale-[1.02]"
                          : "bg-slate-950/60 border border-white/10 hover:border-white/30 hover:bg-slate-900/70 opacity-80 hover:opacity-100"
                      }`}
                    >
                      {/* Image Thumbnail with Overlay */}
                      <div className="relative aspect-[4/5] rounded-2xl overflow-hidden ring-1 ring-inset ring-white/15 mb-3 bg-slate-900">
                        <img
                          src={tour.imageUrl}
                          alt={tour.title}
                          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
                          onError={(e) => {
                            e.currentTarget.src = "/images/hero-tour.png";
                          }}
                        />

                        {/* Top In-Image Badges */}
                        <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-white/95 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                            {tour.countries?.[0] || "Global"}
                          </span>
                          <span className="flex items-center gap-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-full text-xs font-semibold text-amber-300">
                            <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                            <span className="tabular-nums">{tour.rating || "4.9"}</span>
                          </span>
                        </div>

                        {/* Bottom Gradient Overlay on Image */}
                        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />

                        {/* Bottom Info inside Image */}
                        <div className="absolute bottom-3 left-3 right-3">
                          <p className="text-xs text-white/70 font-medium mb-1">
                            {tour.duration} Days Tour
                          </p>
                          <h4 className="text-white font-bold text-base line-clamp-2 group-hover:text-amber-200 transition-colors">
                            {tour.title}
                          </h4>
                        </div>
                      </div>

                      {/* Card Bottom Meta Bar */}
                      <div className="px-2 py-1 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] uppercase text-white/50 block">From</span>
                          <span className="text-base font-extrabold text-amber-300 tabular-nums">
                            ${tour.priceDisplay}
                          </span>
                        </div>

                        <div
                          className={`h-9 px-3 rounded-xl flex items-center gap-1 text-xs font-semibold transition-all ${
                            isActive
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "bg-white/10 text-white group-hover:bg-white/20"
                          }`}
                        >
                          <span>{isActive ? "Viewing" : "Explore"}</span>
                          <ChevronRight className="h-3.5 w-3.5" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Popular Destinations ─────────────────────────────── */}
      <section id="destinations" className="py-24 bg-muted/20 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-14">
            <div>
              <Badge variant="outline" className="mb-3 rounded-full px-3 py-1 font-medium text-xs">
                <Award className="h-3 w-3 mr-1 text-primary" /> Handpicked Locations
              </Badge>
              <h2 className="text-3xl sm:text-4xl font-bold font-serif tracking-tight mb-3">
                {t("popular_destinations")}
              </h2>
              <p className="text-muted-foreground text-base max-w-xl">
                {t("popular_destinations_subtitle")}
              </p>
            </div>

            <Link href="/tours">
              <Button
                variant="outline"
                className="rounded-xl font-medium shrink-0 group active:scale-[0.96]"
              >
                <span>{t("explore_all_destinations")}</span>
                <ArrowRight className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
              </Button>
            </Link>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {isLoadingDestinations ? (
              Array(4)
                .fill(0)
                .map((_, i) => (
                  <div
                    key={i}
                    className="rounded-2xl overflow-hidden aspect-[4/5] bg-muted animate-pulse"
                  />
                ))
            ) : (popularDestinations && popularDestinations.length > 0
                ? popularDestinations
                : fallbackDestinations
              ).map((dest: any) => (
              <Link
                key={dest.name}
                href={`/tours?search=${encodeURIComponent(dest.name)}`}
              >
                <div className="group relative rounded-2xl overflow-hidden aspect-[4/5] block cursor-pointer ring-1 ring-inset ring-black/10 dark:ring-white/10 shadow-md hover:shadow-2xl transition-all duration-300">
                  <img
                    src={dest.img}
                    alt={dest.name}
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-108"
                    onError={(e) => {
                      e.currentTarget.src =
                        "https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&q=80";
                    }}
                  />
                  {/* Subtle Top & Bottom Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />

                  {/* Top Badges */}
                  <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-white/90 bg-black/40 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
                      {dest.country || "Explore"}
                    </span>
                    <span className="flex items-center gap-1 bg-black/50 backdrop-blur-md px-2 py-0.5 rounded-full text-xs font-semibold text-amber-300">
                      <Star className="h-3 w-3 fill-amber-300 text-amber-300" />
                      <span className="tabular-nums">{dest.rating || "4.9"}</span>
                    </span>
                  </div>

                  {/* Bottom Information */}
                  <div className="absolute bottom-0 left-0 right-0 p-5 transform transition-transform duration-300">
                    <h3 className="text-white font-bold text-xl mb-1 group-hover:text-amber-200 transition-colors">
                      {dest.name}
                    </h3>
                    <div className="flex items-center justify-between">
                      <p className="text-white/75 text-xs font-medium">
                        <span className="tabular-nums font-semibold text-white">
                          {dest.tours}
                        </span>{" "}
                        {t("tours_available")}
                      </p>
                      <span className="text-xs font-semibold text-white/90 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all duration-200 flex items-center">
                        Book now <ArrowRight className="ml-1 h-3 w-3" />
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works Section ─────────────────────────────── */}
      <section id="how-it-works" className="py-24 bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <Badge variant="outline" className="mb-3 rounded-full px-3 py-1 font-medium text-xs">
              <Clock className="h-3 w-3 mr-1 text-primary" /> Seamless Experience
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-bold font-serif tracking-tight mb-4">
              {t("how_it_works")}
            </h2>
            <p className="text-muted-foreground text-base sm:text-lg leading-relaxed">
              {t("how_it_works_subtitle")}
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 relative">
            {[
              {
                step: "01",
                icon: Globe,
                title: t("step_browse"),
                desc: t("step_browse_desc"),
              },
              {
                step: "02",
                icon: Calendar,
                title: t("step_pick_date"),
                desc: t("step_pick_date_desc"),
              },
              {
                step: "03",
                icon: Users,
                title: t("step_book_invite"),
                desc: t("step_book_invite_desc"),
              },
              {
                step: "04",
                icon: Plane,
                title: t("step_travel"),
                desc: t("step_travel_desc"),
              },
            ].map((item) => (
              <div
                key={item.step}
                className="relative rounded-2xl border border-border/60 p-6 bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-300 group"
              >
                <div className="flex items-center justify-between mb-5">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center font-bold text-lg shadow-sm shadow-primary/20">
                    <item.icon className="h-6 w-6" />
                  </div>
                  <span className="text-3xl font-black text-muted/50 tabular-nums">
                    {item.step}
                  </span>
                </div>
                <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors">
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── High-Converting Dedicated CTA Section ───────────── */}
      <section className="py-20 relative overflow-hidden bg-muted/30 border-t border-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative rounded-3xl overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-primary/90 text-white p-8 sm:p-12 lg:p-16 shadow-2xl ring-1 ring-inset ring-white/10">
            {/* Ambient Background Blur Rings */}
            <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/30 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />

            <div className="relative max-w-3xl mx-auto text-center space-y-6">
              <Badge className="bg-white/15 text-white border-white/20 text-xs px-3 py-1 font-medium backdrop-blur-md">
                <Sparkles className="h-3.5 w-3.5 mr-1.5 text-amber-300" /> Start Your Journey Today
              </Badge>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold font-serif tracking-tight text-white leading-tight text-balance">
                Ready for your next unforgettable adventure?
              </h2>

              <p className="text-base sm:text-lg text-white/80 max-w-xl mx-auto leading-relaxed text-pretty">
                Create your free customer account to book curated group tours, manage passenger details, and split payments effortlessly.
              </p>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
                <Link href="/login?mode=register">
                  <Button
                    size="lg"
                    className="rounded-xl px-8 h-12 text-base font-semibold shadow-xl shadow-primary/30 transition-transform active:scale-[0.96]"
                  >
                    <span>{t("create_account")}</span>
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                <Link href="/login">
                  <Button
                    size="lg"
                    variant="outline"
                    className="rounded-xl px-7 h-12 text-base font-medium text-white border-white/30 backdrop-blur-md bg-white/10 hover:bg-white/20 hover:text-white transition-transform active:scale-[0.96]"
                  >
                    <span>{t("customer_sign_in")}</span>
                  </Button>
                </Link>

                <Link href="/tours">
                  <Button
                    size="lg"
                    variant="ghost"
                    className="rounded-xl px-6 h-12 text-base font-medium text-white/90 hover:text-white hover:bg-white/10 active:scale-[0.96]"
                  >
                    <Compass className="mr-2 h-4 w-4" />
                    {t("explore_tours")}
                  </Button>
                </Link>
              </div>

              {/* Guarantees */}
              <div className="flex flex-wrap items-center justify-center gap-6 pt-6 text-xs sm:text-sm text-white/70">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>No upfront booking fees</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Transparent installment schedules</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span>Official licensed operators</span>
                </div>
              </div>

              {/* Portal Links (Staff & Admin) */}
              <div className="pt-6 border-t border-white/10 flex flex-wrap items-center justify-center gap-6 text-xs text-white/60">
                <span>Are you a tour partner or operator?</span>
                <Link href="/staff/login">
                  <span
                    className="text-white hover:underline cursor-pointer font-medium"
                    data-testid="link-staff-login"
                  >
                    {t("staff_portal")}
                  </span>
                </Link>
                <span>•</span>
                <Link href="/admin/login">
                  <span
                    className="text-white hover:underline cursor-pointer font-medium"
                    data-testid="link-admin-login"
                  >
                    {t("admin_portal")}
                  </span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Refined Modern Footer ───────────────────────────── */}
      <footer className="py-16 border-t border-border/60 bg-card text-card-foreground">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-10">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground shadow-sm">
                <Globe className="h-4 w-4" />
              </div>
              <span className="font-bold text-lg">TourOps</span>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("footer_tagline")}
            </p>
          </div>

          <div>
            <h4 className="font-semibold text-sm tracking-tight mb-4">{t("company")}</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  {t("about_us")}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  {t("careers")}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  {t("contact_support")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm tracking-tight mb-4">{t("legal")}</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  {t("terms_of_service")}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  {t("privacy_policy")}
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  {t("cookie_policy")}
                </a>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold text-sm tracking-tight mb-4">{t("connect")}</h4>
            <ul className="space-y-2.5 text-sm text-muted-foreground">
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Twitter / X
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  Instagram
                </a>
              </li>
              <li>
                <a href="#" className="hover:text-primary transition-colors">
                  LinkedIn
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 pt-8 border-t border-border/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-muted-foreground">
          <p>&copy; 2026 TourOps Inc. {t("all_rights_reserved")}</p>
          <div className="flex items-center gap-4">
            <Link href="/staff/login">
              <span className="hover:text-foreground cursor-pointer transition-colors">Staff Portal</span>
            </Link>
            <span>•</span>
            <Link href="/admin/login">
              <span className="hover:text-foreground cursor-pointer transition-colors">Admin Portal</span>
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
