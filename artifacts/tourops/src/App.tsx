import { Switch, Route, Redirect, useLocation } from "wouter";
import { queryClient, getQueryFn } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { LanguageProvider } from "@/hooks/use-language";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import TourGenerator from "./pages/admin/tour-generator";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ErrorBoundary } from "@/components/error-boundary";
import type { UserProfile } from "@workspace/db";
import NotFound from "@/pages/not-found";
import LandingPage from "@/pages/landing";
import StaffLoginPage from "@/pages/staff-login";
import AdminLoginPage from "@/pages/admin-login";
import AirlineSearch from "./pages/admin/airline-search";
import AdminDashboard from "@/pages/admin/dashboard";
import AdminTours from "@/pages/admin/tours";
import AdminDepartures from "@/pages/admin/departures";
import AdminBookings from "@/pages/admin/bookings";
import AdminBookingDetail from "@/pages/admin/booking-detail";
import AdminWorkflowDetail from "@/pages/admin/workflow-detail";
import AdminUsers from "@/pages/admin/users";
import AdminMasterData from "@/pages/admin/master-data";
import AdminPricingSettings from "@/pages/admin/pricing-settings";
import AdminTransport from "@/pages/admin/transport";
import AdminRateCards from "@/pages/admin/rate-cards";
import AdminReports from "@/pages/admin/reports";
import AdminAffiliates from "@/pages/admin/affiliates";
import AdminDocuments from "@/pages/admin/documents";
import AdminPayments from "@/pages/admin/payments";
import AdminMessages from "@/pages/admin/messages";
import AdminAssignments from "@/pages/admin/assignments";
import BrowseTours from "@/pages/customer/browse-tours";
import TourDetail from "@/pages/customer/tour-detail";
import MyBookings from "@/pages/customer/my-bookings";
import CustomerBookingDetail from "@/pages/customer/booking-detail";
import JoinGroups from "@/pages/customer/join-groups";
import LeaderDashboard from "@/pages/customer/leader-dashboard";
import LeaderPayments from "@/pages/customer/leader-payments";
import TourBrochure from "@/pages/customer/tour-brochure";
import ManagePassengers from "@/pages/customer/manage-passengers";
import SupplierDashboard from "@/pages/supplier/dashboard";
import OpsDashboard from "@/pages/ops/dashboard";
import GenericRoleDashboard from "@/pages/ops/generic-dashboard";
import TourBuilderDashboard from "@/pages/ops/tour-builder";
import CityManagerDashboard from "@/pages/ops/city-manager";
import ContentEditorDashboard from "@/pages/ops/content-editor";
import FlightAgentDashboard from "@/pages/ops/flight-agent";
import TravelAgentDashboard from "@/pages/ops/travel-agent";
import { Skeleton } from "@/components/ui/skeleton";

function opsRoleHome(role: string | undefined): string {
  if (role === "country_manager" || role === "transport_manager") return "/ops";
  if (role === "tour_builder") return "/ops/tour-builder";
  if (role === "content_editor") return "/ops/content-editor";
  if (role === "flight_agent") return "/ops/flight-agent";
  if (role === "travel_agent") return "/ops/travel-agent";
  if (role === "city_manager") return "/ops/city-manager";
  return "/ops/role";
}

function AuthenticatedLayout() {
  const { data: profile, isLoading: profileLoading, isError: profileError } = useQuery<UserProfile | null>({
    queryKey: ["/api/user-profile"],
    queryFn: getQueryFn({ on401: "returnNull" }),
    retry: false,
  });
  const [location] = useLocation();

  const role = profile?.role;

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  if (profileLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="space-y-4 w-64">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </div>
    );
  }

  // If profile fetch failed (e.g. session lost), redirect to login
  if (profileError || profile === null) {
    return <Redirect to="/" />;
  }

  const isAdmin = role === "admin" || role === "super_admin";
  const isCountryManager = role === "country_manager";

  if (!isAdmin && location.startsWith("/admin")) {
    if (isCountryManager && location === "/admin/master-data") {
      // Allowed — country_manager can access master data
    } else {
      const supplierRoles = ["airline_supplier", "hotel_manager", "guide_manager", "sights_manager", "supplier"];
      if (supplierRoles.includes(role || "")) {
        return <Redirect to="/supplier" />;
      }
      return <Redirect to={opsRoleHome(role)} />;
    }
  }

  return (
    <SidebarProvider style={style as React.CSSProperties}>
      <div className="flex h-screen w-full overflow-hidden">
        <AppSidebar />
        <main className="flex-1 overflow-auto bg-slate-50/30">
          <ErrorBoundary>
          <Switch>
            {/* Admin Routes */}
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/admin/tours" component={AdminTours} />
            <Route path="/admin/departures" component={AdminDepartures} />
            <Route path="/admin/bookings" component={AdminBookings} />
            <Route path="/admin/bookings/:id" component={AdminBookingDetail} />
            <Route path="/admin/workflows/:id" component={AdminWorkflowDetail} />
            <Route path="/admin/users" component={AdminUsers} />
            <Route path="/admin/reports" component={AdminReports} />
            <Route path="/admin/affiliates" component={AdminAffiliates} />
            <Route path="/admin/tour-generator" component={TourGenerator} />
            <Route path="/admin/tours/:id" component={TourDetail} />
            <Route path="/admin/airline-search" component={AirlineSearch} />
            <Route path="/admin/master-data" component={AdminMasterData} />
            <Route path="/admin/pricing" component={AdminPricingSettings} />
            <Route path="/admin/transport" component={AdminTransport} />
            <Route path="/admin/rate-cards" component={AdminRateCards} />
            <Route path="/admin/documents" component={AdminDocuments} />
            <Route path="/admin/payments" component={AdminPayments} />
            <Route path="/admin/messages" component={AdminMessages} />
            <Route path="/admin/assignments" component={AdminAssignments} />

            {/* Customer Routes */}
            <Route path="/tours" component={BrowseTours} />
            <Route path="/tours/:id" component={TourDetail} />
            <Route path="/tours/:id/brochure" component={TourBrochure} />
            <Route path="/leader-dashboard" component={LeaderDashboard} />
            <Route path="/leader-payments" component={LeaderPayments} />
            <Route path="/manage-passengers" component={ManagePassengers} />
            <Route path="/my-bookings" component={MyBookings} />
            <Route path="/my-bookings/:id" component={CustomerBookingDetail} />
            <Route path="/join-groups" component={JoinGroups} />

            {/* Supplier Routes */}
            <Route path="/supplier" component={SupplierDashboard} />

            {/* Ops Routes */}
            <Route path="/ops" component={OpsDashboard} />
            <Route path="/ops/transport" component={AdminTransport} />
            <Route path="/ops/role" component={GenericRoleDashboard} />
            <Route path="/ops/tour-builder" component={TourBuilderDashboard} />
            <Route path="/ops/content-editor" component={ContentEditorDashboard} />
            <Route path="/ops/city-manager" component={CityManagerDashboard} />
            <Route path="/ops/flight-agent" component={FlightAgentDashboard} />
            <Route path="/ops/travel-agent" component={TravelAgentDashboard} />
            <Route path="/ops/workflows/:id" component={AdminWorkflowDetail} />

            {/* Redirects */}
            <Route path="/admin/login">
              {() => <Redirect to="/admin" />}
            </Route>
            <Route path="/staff/login">
              {() => {
                const supplierRoles = ["airline_supplier", "hotel_manager", "guide_manager", "sights_manager", "supplier"];
                const opsRoles = ["country_manager", "transport_manager", "city_manager", "content_editor", "flight_agent", "tour_builder", "travel_agent"];
                if (supplierRoles.includes(role || "")) return <Redirect to="/supplier" />;
                if (opsRoles.includes(role || "")) return <Redirect to={opsRoleHome(role)} />;
                return <Redirect to="/admin" />;
              }}
            </Route>

            <Route path="/">
              {() => {
                if (role === "admin" || role === "super_admin") return <Redirect to="/admin" />;
                const supplierRoles = ["airline_supplier", "hotel_manager", "guide_manager", "sights_manager", "supplier"];
                const opsRoles = ["country_manager", "transport_manager", "city_manager", "content_editor", "flight_agent", "tour_builder", "travel_agent"];
                if (supplierRoles.includes(role || "")) return <Redirect to="/supplier" />;
                if (opsRoles.includes(role || "")) return <Redirect to={opsRoleHome(role)} />;
                return <Redirect to="/tours" />;
              }}
            </Route>

            <Route component={NotFound} />
          </Switch>
          </ErrorBoundary>
        </main>
      </div>
    </SidebarProvider>
  );
}

function AppRouter() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Skeleton className="h-12 w-12 rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <Switch>
          <Route path="/staff/login" component={StaffLoginPage} />
          <Route path="/admin/login" component={AdminLoginPage} />
          <Route path="/tours/:id/brochure" component={TourBrochure} />
          <Route path="/tours/:id" component={TourDetail} />
          <Route path="/tours" component={BrowseTours} />
          <Route component={LandingPage} />
        </Switch>
      </ErrorBoundary>
    );
  }

  return <AuthenticatedLayout />;
}


function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <ThemeProvider>
          <TooltipProvider>
            <AppRouter />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
