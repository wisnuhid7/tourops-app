// Single source of truth for role-derived UI behavior (AUTHZ-03).
//
// Role authorization is enforced authoritatively on the backend. The frontend
// only needs role metadata for presentation: the human-readable label and the
// "home" route each role lands on. Previously this was duplicated across
// App.tsx (opsRoleHome), app-sidebar.tsx (getRoleLabel + per-role dashboard
// URLs), and constants.ts (USER_ROLES), which silently drifted. Keep it here.

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  admin: "HQ Admin",
  customer: "Customer",
  airline_supplier: "Airline Supplier",
  country_manager: "Country Manager",
  city_manager: "City Manager",
  hotel_manager: "Hotel Manager",
  transport_manager: "Transport Manager",
  guide_manager: "Guide Manager",
  sights_manager: "Sights Manager",
  content_editor: "Content Editor",
  flight_agent: "Flight Agent",
  tour_builder: "Tour Builder",
  supplier: "Supplier",
  tour_leader: "Tour Leader",
  accounting: "Accounting",
  support_agent: "Support Agent",
  operations_manager: "Operations Manager",
};

// Where each role lands after login. Suppliers share the /supplier dashboard;
// admins go to /admin; customers to /tours; ops roles to their /ops/* page.
export const ROLE_HOME: Record<string, string> = {
  super_admin: "/admin",
  admin: "/admin",
  customer: "/tours",
  country_manager: "/ops",
  operations_manager: "/ops",
  transport_manager: "/ops/transport",
  tour_builder: "/ops/tour-builder",
  content_editor: "/ops/content-editor",
  flight_agent: "/ops/flight-agent",
  tour_leader: "/ops/tour-leader",
  city_manager: "/ops/city-manager",
  accounting: "/ops/accounting",
  support_agent: "/ops/support",
  hotel_manager: "/supplier",
  guide_manager: "/supplier",
  sights_manager: "/supplier",
  airline_supplier: "/supplier",
  supplier: "/supplier",
};

// Roles that use the shared /supplier dashboard.
export const SUPPLIER_ROLES = [
  "airline_supplier",
  "hotel_manager",
  "guide_manager",
  "sights_manager",
  "supplier",
];

export function getRoleLabel(role: string | undefined): string {
  return ROLE_LABELS[role || "customer"] || "Customer";
}

export function getRoleHome(role: string | undefined): string {
  return ROLE_HOME[role || ""] || "/ops/role";
}
