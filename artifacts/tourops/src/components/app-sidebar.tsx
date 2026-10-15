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
  SidebarMenuAction,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import type { UserProfile } from "@workspace/db";
import { Link, useLocation, useSearch } from "wouter";
import { useEffect, useState } from "react";
import { 
  LayoutDashboard, Globe, BookOpen, Users, 
  BarChart3, Settings, LogOut, Plane, 
  Hotel, Bus, UserCheck, Ticket, Truck, TicketCheck, Database, Headset,
  UserPlus, ShieldCheck, Mail, CreditCard, UserCheck2, FileText, PieChart, Wand2, Percent, DollarSign, Building2, Flag, Landmark, CalendarDays, Calculator, Sparkles, ChevronDown
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useLanguage } from "@/hooks/use-language";
import { ThemeToggle } from "@/components/theme-toggle";
import { NotificationBell } from "@/components/layout/notification-bell";
import { getRoleHome } from "@/lib/roles";

type NavItem = {
  title: string;
  url: string;
  icon: LucideIcon;
};

type NavGroup = NavItem & {
  type: "group";
  children: NavItem[];
};

type NavEntry = NavItem | NavGroup;

function isNavGroup(item: NavEntry): item is NavGroup {
  return "children" in item;
}

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

export function AppSidebar() {
  const { user, logout, isLoggingOut } = useAuth();
  const { data: profile } = useQuery<UserProfile>({
    queryKey: ["/api/user-profile"],
  });
  const [location] = useLocation();
  const search = useSearch();
  const currentUrl = search ? `${location}?${search}` : location;
  const { isMobile, setOpenMobile, state, setOpen } = useSidebar();
  const { language, setLanguage, t } = useLanguage();

  const getNav = (): NavEntry[] => {
    const role = profile?.role;
    if (role === "admin" || role === "super_admin") {
      const masterDataChildren: NavItem[] = [
        { title: t("entity_countries_plural"), url: "/admin/master-data?tab=countries", icon: Flag },
        { title: t("entity_cities_plural"), url: "/admin/master-data?tab=cities", icon: Building2 },
        { title: t("entity_airports_plural"), url: "/admin/master-data?tab=airports", icon: Plane },
        { title: t("nav_sights"), url: "/admin/master-data?tab=sights", icon: Landmark },
        { title: t("entity_transport_companies_plural"), url: "/admin/master-data?tab=transport", icon: Truck },
        { title: t("entity_airline_agencies_plural"), url: "/admin/master-data?tab=airlines", icon: TicketCheck },
        { title: t("hotels"), url: "/admin/master-data?tab=hotels", icon: Hotel },
      ];

      const items: NavEntry[] = [
        { title: t("dashboard"), url: "/admin", icon: LayoutDashboard },
        { title: t("tours"), url: "/admin/tours", icon: Globe },
        { title: t("departures"), url: "/admin/departures", icon: CalendarDays },
        { title: t("bookings"), url: "/admin/bookings", icon: BookOpen },
        { title: t("reports"), url: "/admin/reports", icon: BarChart3 },
        { title: t("users"), url: "/admin/users", icon: Users },
        { title: t("transport"), url: "/admin/transport", icon: Bus },
        { title: t("tour_generator"), url: "/admin/tour-generator", icon: Wand2 },
        { title: t("rate_cards"), url: "/admin/rate-cards", icon: CreditCard },
        { title: t("pricing"), url: "/admin/pricing", icon: Percent },
        { title: t("pe_tab_quotes"), url: "/admin/pricing-engine", icon: Calculator },
        { type: "group", title: t("master_data"), url: "/admin/master-data", icon: Database, children: masterDataChildren },
        { title: t("guides"), url: "/supplier?tab=guide_rates", icon: UserCheck2 },
        { title: t("nav_sights"), url: "/supplier?tab=sights_catalog", icon: Landmark },
        { title: t("nav_airlines"), url: "/supplier?tab=airlines_catalog", icon: Plane },
        { title: t("nav_documents"), url: "/admin/documents", icon: FileText },
        { title: t("nav_payments"), url: "/admin/payments", icon: DollarSign },
        { title: t("nav_messages"), url: "/admin/messages", icon: Mail },
        { title: t("nav_assignments"), url: "/admin/assignments", icon: UserCheck },
      ];
      if (role === "super_admin") items.push({ title: t("nav_test_data"), url: "/admin/test-data", icon: Database });
      return items;
    }
    // Each role's dashboard URL is derived from the single source of truth in
    // lib/roles.ts (getRoleHome) so the sidebar link can never drift from the
    // login redirect / routing. Sidebar owns only presentation (label + icon).
    const home = getRoleHome(role);
    if (role === "country_manager") {
      return [
        { title: t("dashboard"), url: home, icon: LayoutDashboard },
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
    if (role === "transport_manager") return [{ title: t("transport_dashboard"), url: home, icon: Bus }];
    if (role === "hotel_manager") return [{ title: t("hotel_dashboard"), url: home, icon: Hotel }];
    if (role === "guide_manager") return [{ title: t("guide_dashboard"), url: home, icon: UserCheck2 }];
    if (role === "sights_manager") return [
      { title: t("sights_dashboard"), url: home, icon: Ticket },
      { title: t("nav_sights"), url: "/supplier?tab=sights_catalog", icon: Landmark },
    ];
    if (role === "airline_supplier") return [{ title: t("airline_dashboard"), url: home, icon: Plane }];
    if (role === "city_manager") return [{ title: t("city_dashboard"), url: home, icon: Globe }];
    if (role === "content_editor") return [{ title: t("editor_dashboard"), url: home, icon: FileText }];
    if (role === "flight_agent") return [{ title: t("flight_dashboard"), url: home, icon: Plane }];
    if (role === "tour_builder") return [
      { title: t("builder_dashboard"), url: home, icon: LayoutDashboard },
      { title: t("tour_generator"), url: "/admin/tour-generator", icon: Wand2 },
    ];
    if (role === "supplier") return [{ title: t("supplier_dashboard"), url: home, icon: Database }];
    if (role === "tour_leader") return [{ title: t("agent_dashboard"), url: home, icon: Users }];
    if (role === "accounting") return [{ title: t("finance_dashboard"), url: home, icon: DollarSign }];
    if (role === "support_agent") return [{ title: t("support_dashboard"), url: home, icon: Headset }];
    if (role === "operations_manager") return [
      { title: t("dashboard"), url: home, icon: LayoutDashboard },
      { title: t("nav_assignments"), url: "/ops/assignments", icon: UserCheck },
      { title: t("pe_tab_quotes"), url: "/admin/pricing-engine", icon: Calculator },
    ];
    
    return [];
  };

  const navItems = getNav();
  // Query-based items (e.g. /admin/master-data?tab=hotels) must match the full
  // URL so they only light up on their tab; plain items match on pathname so
  // they stay active with unrelated query params — but they yield when a
  // query-based sibling item is the exact match (prevents double-active state).
  const queryNavItems = navItems.flatMap((item) => isNavGroup(item) ? item.children : [item]);
  const isItemActive = (url: string) =>
    url.includes("?")
      ? currentUrl === url
      : location === url && !queryNavItems.some((i) => i.url.includes("?") && currentUrl === i.url);

  const masterDataGroup = navItems.find((item): item is NavGroup => isNavGroup(item) && item.url === "/admin/master-data");
  const masterDataChildActive = Boolean(masterDataGroup?.children.some((child) => isItemActive(child.url)));
  const [masterDataOpen, setMasterDataOpen] = useState(masterDataChildActive);

  useEffect(() => {
    if (masterDataChildActive) setMasterDataOpen(true);
  }, [masterDataChildActive]);

  const closeMobileAfterNavigation = () => {
    if (isMobile) setOpenMobile(false);
  };

  const openSidebarForMasterData = () => {
    if (!isMobile && state === "collapsed") setOpen(true);
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
              {navItems.map((item) => {
                if (isNavGroup(item)) {
                  const groupActive = location === item.url || masterDataChildActive;
                  const groupOpen = masterDataOpen || masterDataChildActive;
                  return (
                    <Collapsible key={item.title} open={groupOpen} onOpenChange={setMasterDataOpen} asChild>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={groupActive}
                          tooltip={item.title}
                          className="hover:bg-primary/5 active:scale-95 transition-all rounded-lg py-6 pr-12 group"
                        >
                          <Link
                            href={item.url}
                            className="flex items-center gap-3"
                            onClick={() => {
                              openSidebarForMasterData();
                              closeMobileAfterNavigation();
                            }}
                          >
                            <div className={`p-2 rounded-md transition-colors ${groupActive ? 'bg-primary text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                              <item.icon className="h-4 w-4" />
                            </div>
                            <span className={`font-medium text-sm transition-colors ${groupActive ? 'text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                              {item.title}
                            </span>
                          </Link>
                        </SidebarMenuButton>
                        <CollapsibleTrigger asChild>
                          <SidebarMenuAction
                            aria-label={`${groupOpen ? "Collapse" : "Expand"} ${item.title}`}
                            aria-expanded={groupOpen}
                            className="right-1.5 top-1/2 h-9 w-9 -translate-y-1/2 rounded-md p-0 flex items-center justify-center text-muted-foreground transition-colors duration-200 hover:bg-primary/10 hover:text-primary active:bg-primary/15 focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1"
                          >
                            <ChevronDown className={`h-4 w-4 transition-transform duration-200 ease-out ${groupOpen ? "rotate-180" : ""}`} />
                          </SidebarMenuAction>
                        </CollapsibleTrigger>
                        <CollapsibleContent asChild>
                          <SidebarMenuSub>
                            {item.children.map((child) => {
                              const childActive = isItemActive(child.url);
                              return (
                                <SidebarMenuSubItem key={child.url}>
                                  <SidebarMenuSubButton
                                    asChild
                                    isActive={childActive}
                                    aria-current={childActive ? "page" : undefined}
                                    className="ml-1 h-auto min-h-8 gap-3 rounded-lg py-2 hover:bg-primary/5 active:scale-95 transition-all data-[active=true]:bg-primary/5 group"
                                  >
                                    <Link href={child.url} onClick={closeMobileAfterNavigation}>
                                      <div className={`p-2 rounded-md transition-colors ${childActive ? 'bg-primary text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                                        <child.icon className="h-4 w-4" />
                                      </div>
                                      <span className={`font-medium text-sm transition-colors ${childActive ? 'text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                                        {child.title}
                                      </span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              );
                            })}
                          </SidebarMenuSub>
                        </CollapsibleContent>
                      </SidebarMenuItem>
                    </Collapsible>
                  );
                }

                const itemActive = isItemActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={itemActive}
                      tooltip={item.title}
                      className="hover:bg-primary/5 active:scale-95 transition-all rounded-lg py-6 group"
                    >
                      <Link href={item.url} className="flex items-center gap-3" onClick={closeMobileAfterNavigation}>
                        <div className={`p-2 rounded-md transition-colors ${itemActive ? 'bg-primary text-white shadow-md' : 'bg-slate-100 dark:bg-slate-900 group-hover:bg-primary/10 group-hover:text-primary'}`}>
                          <item.icon className="h-4 w-4" />
                        </div>
                        <span className={`font-medium text-sm transition-colors ${itemActive ? 'text-primary font-bold' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'}`}>
                          {item.title}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
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
