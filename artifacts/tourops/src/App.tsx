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
import AdminDashboard from "@/pages/admin/dashboard";
import AdminTours from "@/pages/admin/tours";
import AdminDepartures from "@/pages/admin/departures";
import AdminBookings from "@/pages/admin/bookings";
import AdminBookingDetail from "@/pages/admin/booking-detail";
import AdminWorkflowDetail from "@/pages/admin/workflow-detail";
import AdminUsers from "@/pages/admin/users";
import AdminMasterData from "@/pages/admin/master-data";
import AdminPricingSettings from "@/pages/admin/pricing-settings";
import AdminPricingEngine from "@/pages/admin/pricing-engine";
import AdminTransport from "@/pages/admin/transport";
import AdminRateCards from "@/pages/admin/rate-cards";
import AdminReports from "@/pages/admin/reports";
import AdminAffiliates from "@/pages/admin/affiliates";
import AdminDocuments from "@/pages/admin/documents";
import AdminPayments from "@/pages/admin/payments";
import AdminMessages from "@/pages/admin/messages";
import AdminAssignments from "@/pages/admin/assignments";
import AdminGroupQuotes from "@/pages/admin/group-quotes";
import CustomerQuoteView from "@/pages/customer/quote-view";
import { QuoteViewById, QuoteViewByToken } from "@/pages/customer/quote-view";
import BrowseTours from "@/pages/customer/browse-tours";
import TourDetail from "@/pages/customer/tour-detail";
import MyBookings from "@/pages/customer/my-bookings";
import CustomerBookingDetail from "@/pages/customer/booking-detail";
import Checkout from "@/pages/customer/checkout";
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
import TourLeaderDashboard from "@/pages/ops/tour-leader";
import AccountingDashboard from "@/pages/ops/accounting";
import SupportDashboard from "@/pages/ops/support";
import ForgotPasswordPage from "@/pages/forgot-password";
import ResetPasswordPage from "@/pages/reset-password";
import VerifyEmailPage from "@/pages/verify-email";
import AccountSecurityPage from "@/pages/account-security";
import AdminTestData from "@/pages/admin/test-data";
import AcceptInvitePage from "@/pages/passenger/accept-invite";
import PassengerPortal from "@/pages/passenger/portal";
import BookingOperations from "@/pages/ops/booking-operations";
import { TestEnvironmentBanner } from "@/components/test-environment-banner";
import { Skeleton } from "@/components/ui/skeleton";

import { getRoleHome, SUPPLIER_ROLES } from "@/lib/roles";

const opsRoleHome = getRoleHome;

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
  const isOpsManager = role === "operations_manager";

  // Task #19: staff-only SPA sections must not render their shells for
  // customers (APIs are already server-gated; this closes the UI side).
  const isCustomer = !role || role === "customer";
  if (isCustomer && (location.startsWith("/ops") || location.startsWith("/supplier") || location.startsWith("/admin"))) {
    return <Redirect to="/tours" />;
  }

  // Supplier Isolation: Supplier roles are strictly confined to /supplier (blocked from /ops and /admin)
  const isSupplierRole = SUPPLIER_ROLES.includes(role || "");
  if (isSupplierRole && (location.startsWith("/ops") || location.startsWith("/admin"))) {
    return <Redirect to="/supplier" />;
  }

  // Financial Privacy Wall: Tour Leader and other non-finance staff blocked from /ops/accounting
  if (location.startsWith("/ops/accounting") && role !== "accounting" && !isAdmin && !isOpsManager) {
    return <Redirect to={opsRoleHome(role)} />;
  }

  if (!isAdmin && location.startsWith("/admin")) {
    if (isCountryManager && location === "/admin/master-data") {
      // Allowed — country_manager can access master data
    } else if (isOpsManager && (location === "/admin/pricing-engine" || location === "/admin/group-quotes")) {
      // Allowed — operations_manager is part of the internal pricing roles
    } else {
      if (isSupplierRole) {
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
            <Route path="/admin/master-data" component={AdminMasterData} />
            <Route path="/admin/pricing" component={AdminPricingSettings} />
            <Route path="/admin/pricing-engine" component={AdminPricingEngine} />
            <Route path="/admin/group-quotes" component={AdminGroupQuotes} />
            <Route path="/admin/transport" component={AdminTransport} />
            <Route path="/admin/rate-cards" component={AdminRateCards} />
            <Route path="/admin/documents" component={AdminDocuments} />
            <Route path="/admin/payments" component={AdminPayments} />
            <Route path="/admin/messages" component={AdminMessages} />
            <Route path="/admin/assignments" component={AdminAssignments} />
            <Route path="/admin/test-data" component={AdminTestData} />

            {/* Account security (all authenticated roles) */}
            <Route path="/account/security" component={AccountSecurityPage} />
            <Route path="/verify-email" component={VerifyEmailPage} />
            <Route path="/reset-password" component={ResetPasswordPage} />

            {/* Customer Routes */}
            <Route path="/tours" component={BrowseTours} />
            <Route path="/tours/:id" component={TourDetail} />
            <Route path="/tours/:id/brochure" component={TourBrochure} />
            <Route path="/leader-dashboard" component={LeaderDashboard} />
            <Route path="/leader-payments" component={LeaderPayments} />
            <Route path="/manage-passengers" component={ManagePassengers} />
            <Route path="/my-bookings" component={MyBookings} />
            <Route path="/my-bookings/:id" component={CustomerBookingDetail} />
            <Route path="/checkout/:bookingId" component={Checkout} />
            <Route path="/join-groups" component={JoinGroups} />
            <Route path="/passenger" component={PassengerPortal} />
            <Route path="/passenger/accept-invite" component={AcceptInvitePage} />
            <Route path="/quotes/shared/:token" component={CustomerQuoteView} />
            <Route path="/quotes/:id" component={CustomerQuoteView} />

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
            <Route path="/ops/tour-leader" component={TourLeaderDashboard} />
            <Route path="/ops/accounting" component={AccountingDashboard} />
            <Route path="/ops/assignments" component={AdminAssignments} />
            <Route path="/ops/support" component={SupportDashboard} />
            <Route path="/ops/workflows/:id" component={AdminWorkflowDetail} />
            <Route path="/ops/booking-operations/:bookingId" component={BookingOperations} />

            {/* Redirects */}
            <Route path="/admin/airline-search">
              {() => <Redirect to="/supplier?tab=airline_search" />}
            </Route>
            <Route path="/admin/login">
              {() => <Redirect to="/admin" />}
            </Route>
            <Route path="/staff/login">
              {() => {
                const supplierRoles = ["airline_supplier", "hotel_manager", "guide_manager", "sights_manager", "supplier"];
                const opsRoles = ["country_manager", "transport_manager", "city_manager", "content_editor", "flight_agent", "tour_builder", "tour_leader", "accounting", "operations_manager", "support_agent"];
                if (supplierRoles.includes(role || "")) return <Redirect to="/supplier" />;
                if (opsRoles.includes(role || "")) return <Redirect to={opsRoleHome(role)} />;
                return <Redirect to="/admin" />;
              }}
            </Route>

            <Route path="/">
              {() => {
                if (role === "admin" || role === "super_admin") return <Redirect to="/admin" />;
                const supplierRoles = ["airline_supplier", "hotel_manager", "guide_manager", "sights_manager", "supplier"];
                const opsRoles = ["country_manager", "transport_manager", "city_manager", "content_editor", "flight_agent", "tour_builder", "tour_leader", "accounting", "operations_manager", "support_agent"];
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
          <Route path="/forgot-password" component={ForgotPasswordPage} />
          <Route path="/reset-password" component={ResetPasswordPage} />
          <Route path="/verify-email" component={VerifyEmailPage} />
          <Route path="/passenger/accept-invite" component={AcceptInvitePage} />
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
            <TestEnvironmentBanner />
            <AppRouter />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}

export default App;
