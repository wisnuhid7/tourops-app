import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@workspace/db";
import { Link, useLocation, useSearch } from "wouter";
import { 
  LayoutDashboard, Globe, BookOpen, Users, 
  BarChart3, Settings, LogOut, Plane, 
  Hotel, Bus, UserCheck, Ticket, Database,
  UserPlus, ShieldCheck, Mail, CreditCard, UserCheck2, FileText, PieChart, Wand2, Percent, DollarSign, Building2, Flag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/hooks/use-language";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";

function getRoleIcon(role: string | undefined) {
  switch (role) {
    case "admin":
    case "super_admin": return Settings;
    case "airline_supplier": return Plane;
    case "country_manager": return Globe;
    case "hotel_manager": return Hotel;
    case "transport_manager": return Bus;
    case "guide_manager": return UserCheck;
    case "sights_manager": return Ticket;
    default: return Users;
  }
}

function getRoleLabel(role: string | undefined) {
  const labels: Record<string, string> = {
    super_admin: "Super Admin",
    admin: "HQ Admin",
    customer: "Customer",
    airline_supplier: "Airline Supplier",
    country_manager: "Country Manager",
    hotel_manager: "Hotel Manager",
    transport_manager: "Transport Manager",
    guide_manager: "Guide Manager",
    sights_manager: "Sights Manager",
  };
  return labels[role || "customer"] || "Customer";
}

export function AppSidebar() {
  const { user, logout, isLoggingOut } = useAuth();
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/user-profile"],
  });
  const [location] = useLocation();
  const search = useSearch();
  const currentUrl = search ? `${location}?${search}` : location;
  // Query-based items (e.g. /admin/master-data?tab=hotels) must match the full
  // URL so they only light up on their tab; plain items match on pathname so
  // they stay active even when the page has unrelated query params.
  const isItemActive = (url: string) => (url.includes("?") ? currentUrl === url : location === url);
  const { language, setLanguage, t } = useLanguage();

  const getNav = () => {
    const role = profile?.role;
    if (role === "admin" || role === "super_admin") {
      return [
        { title: t("dashboard"), url: "/admin", icon: LayoutDashboard },
        { title: t("tours"), url: "/admin/tours", icon: Globe },
        { title: t("bookings"), url: "/admin/bookings", icon: BookOpen },
        { title: t("reports"), url: "/admin/reports", icon: BarChart3 },
        { title: t("users"), url: "/admin/users", icon: Users },
        { title: t("transport"), url: "/admin/transport", icon: Bus },
        { title: t("tour_generator"), url: "/admin/tour-generator", icon: Wand2 },
        { title: t("airline_search"), url: "/admin/airline-search", icon: Plane },
        { title: t("rate_cards"), url: "/admin/rate-cards", icon: CreditCard },
        { title: t("pricing"), url: "/admin/pricing", icon: Percent },
        { title: t("master_data"), url: "/admin/master-data", icon: Database },
        { title: t("hotels"), url: "/admin/master-data?tab=hotels", icon: Hotel },
        { title: t("guides"), url: "/supplier?tab=guide_rates", icon: UserCheck2 },
        { title: t("entity_countries_plural"), url: "/admin/master-data?tab=countries", icon: Flag },
        { title: t("entity_cities_plural"), url: "/admin/master-data?tab=cities", icon: Building2 },
        { title: t("nav_documents"), url: "/admin/documents", icon: FileText },
        { title: t("nav_payments"), url: "/admin/payments", icon: DollarSign },
        { title: t("nav_messages"), url: "/admin/messages", icon: Mail },
        { title: t("nav_assignments"), url: "/admin/assignments", icon: UserCheck },
      ];
    }
    if (role === "country_manager") {
      return [
        { title: t("dashboard"), url: "/ops", icon: LayoutDashboard },
        { title: t("master_data"), url: "/admin/master-data", icon: Database },
      ];
    }
    if (role === "customer") {
      return [
        { title: t("browse_tours"), url: "/tours", icon: Globe },
        { title: t("join_groups"), url: "/join-groups", icon: Users },
        { title: t("my_bookings"), url: "/my-bookings", icon: BookOpen },
      ];
    }
    if (profile?.isTourLeader) return [{ title: t("leader_dashboard"), url: "/leader-dashboard", icon: ShieldCheck }];
    if (role === "transport_manager") return [{ title: t("transport_dashboard"), url: "/ops/transport", icon: Bus }];
    if (role === "hotel_manager") return [{ title: t("hotel_dashboard"), url: "/supplier", icon: Hotel }];
    if (role === "guide_manager") return [{ title: t("guide_dashboard"), url: "/supplier", icon: UserCheck2 }];
    if (role === "sights_manager") return [{ title: t("sights_dashboard"), url: "/supplier", icon: Ticket }];
    if (role === "airline_supplier") return [{ title: t("airline_dashboard"), url: "/supplier", icon: Plane }];
    if (role === "city_manager") return [{ title: t("city_dashboard"), url: "/ops/city-manager", icon: Globe }];
    if (role === "content_editor") return [{ title: t("editor_dashboard"), url: "/ops/content-editor", icon: FileText }];
    if (role === "flight_agent") return [{ title: t("flight_dashboard"), url: "/ops/flight-agent", icon: Plane }];
    if (role === "tour_builder") return [{ title: t("builder_dashboard"), url: "/ops/tour-builder", icon: Wand2 }];
    if (role === "supplier") return [{ title: t("supplier_dashboard"), url: "/supplier", icon: Database }];
    if (role === "travel_agent") return [{ title: t("agent_dashboard"), url: "/ops/travel-agent", icon: Users }];
    
    return [];
  };

  return (
    <Sidebar collapsible="icon" className="border-r shadow-lg bg-white dark:bg-slate-950">
      <SidebarHeader className="p-4 border-b bg-primary/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary p-2 rounded-xl shadow-lg shadow-primary/20 rotate-3">
              <Globe className="h-6 w-6 text-white" />
            </div>
            <span className="font-serif text-2xl font-black tracking-tighter text-slate-800 dark:text-slate-100 uppercase italic">TourOps</span>
          </div>
          <div className="flex items-center gap-1">
             <NotificationBell />
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className="px-3 text-[10px] uppercase tracking-widest font-bold text-muted-foreground mb-2">Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {getNav().map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isItemActive(item.url)}
                    tooltip={item.title} 
                    className="hover:bg-primary/5 active:scale-95 transition-all rounded-lg py-6 group"
                  >
                    <Link href={item.url} className="flex items-center gap-3">
                      <div className={`p-2 rounded-md transition-colors ${isItemActive(item.url) ? 'bg-primary text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <span className={`font-medium text-sm transition-colors ${isItemActive(item.url) ? 'text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                        {item.title}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t bg-slate-50/50 dark:bg-slate-900/50 space-y-4">
        <div className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-800 border shadow-sm">
           <span className="text-[10px] font-bold uppercase text-muted-foreground ml-1">{t("language")}</span>
           <div className="flex gap-1">
             <Button 
               variant={language === "en" ? "default" : "ghost"} 
               size="sm" 
               className="h-6 text-[10px] px-2 font-bold"
               onClick={() => setLanguage("en")}
             >EN</Button>
             <Button 
               variant={language === "es" ? "default" : "ghost"} 
               size="sm" 
               className="h-6 text-[10px] px-2 font-bold"
               onClick={() => setLanguage("es")}
             >ES</Button>
             <Button 
               variant={language === "id" ? "default" : "ghost"} 
               size="sm" 
               className="h-6 text-[10px] px-2 font-bold"
               onClick={() => setLanguage("id")}
             >ID</Button>
           </div>
        </div>

        <div className="flex items-center gap-3 p-2">
          <Avatar className="h-9 w-9 border-2 border-primary/20 shadow-sm">
            <AvatarImage src={undefined} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xs">
              {user?.username?.substring(0, 2)?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate text-slate-800 dark:text-slate-200">
              {user?.username}
            </p>
            <p className="text-[10px] text-muted-foreground truncate uppercase tracking-tighter">
              {profile?.role?.replace("_", " ")}
            </p>
          </div>
          <ThemeToggle />
        </div>

        <Button 
          variant="ghost" 
          className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg group h-11"
          onClick={() => logout()}
          disabled={isLoggingOut}
        >
          <div className="bg-red-50 dark:bg-red-950 p-2 rounded-md group-hover:bg-red-100 transition-colors mr-3">
            <LogOut className="h-4 w-4" />
          </div>
          <span className="font-bold text-sm">{t("logout")}</span>
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
