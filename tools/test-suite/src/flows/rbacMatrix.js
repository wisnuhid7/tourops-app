/**
 * Flow 12: RBAC Matrix Security Auditor
 * Exhaustive role-by-role security access matrix across 17 roles
 */
import { ACCOUNTS } from "../accounts.js";

// Matrix of Endpoints to test with role permissions definition
const MATRIX_ENDPOINTS = [
  {
    path: "/api/test-data/status",
    method: "GET",
    description: "System Test Data Control (Super Admin only)",
    allowedRoles: ["super_admin"],
  },
  {
    path: "/api/admin/payments",
    method: "GET",
    description: "Enterprise Payments Ledger",
    allowedRoles: ["super_admin", "admin", "accounting"],
  },
  {
    path: "/api/workflows",
    method: "GET",
    description: "Operations Service Workflows (Platform-wide roles)",
    allowedRoles: ["super_admin", "admin", "operations_manager", "country_manager", "tour_builder", "flight_agent"],
  },
  {
    path: "/api/hotels",
    method: "GET",
    description: "Hotel Catalog & Room Rates",
    allowedRoles: ["super_admin", "admin", "operations_manager", "country_manager", "tour_builder", "flight_agent", "hotel_manager"],
  },
  {
    path: "/api/pricing/rules",
    method: "GET",
    description: "Pricing Margins & Adjustment Rules",
    allowedRoles: ["super_admin", "admin", "operations_manager"],
  },
  {
    path: "/api/tours",
    method: "GET",
    description: "Tours Backoffice Management (Restricted to builders & managers)",
    allowedRoles: ["super_admin", "admin", "country_manager", "tour_builder", "content_editor", "operations_manager"],
  },
  {
    path: "/api/master/countries",
    method: "GET",
    description: "Countries Master Dataset (All Staff Roles)",
    allowedRoles: [
      "super_admin", "admin", "country_manager", "city_manager", "hotel_manager", 
      "transport_manager", "guide_manager", "sights_manager", "airline_supplier", 
      "supplier", "tour_leader", "accounting", "support_agent", "content_editor", 
      "flight_agent", "tour_builder", "operations_manager"
    ],
  },
];

export async function runRbacMatrix(client) {
  const matrixResults = [];
  const steps = [];

  for (const account of ACCOUNTS) {
    try {
      await client.ensureLoggedIn(account.username);
    } catch (err) {
      // Login failed, mark all as error
      for (const ep of MATRIX_ENDPOINTS) {
        matrixResults.push({
          role: account.role,
          username: account.username,
          endpoint: ep.path,
          method: ep.method,
          status: 0,
          expectedAllowed: ep.allowedRoles.includes(account.role),
          outcome: "error",
          details: `Login failed: ${err.message}`,
        });
      }
      continue;
    }

    for (const ep of MATRIX_ENDPOINTS) {
      const expectedAllowed = ep.allowedRoles.includes(account.role);
      const res = await client.request(account.username, ep.method, ep.path);
      const is2xx = res.status >= 200 && res.status < 300;
      const isBlocked = res.status === 401 || res.status === 403 || res.status === 404;

      let outcome;
      if (expectedAllowed) {
        outcome = is2xx ? "allowed_as_expected" : "unexpected_denial";
      } else {
        outcome = isBlocked ? "protected_as_expected" : "security_violation";
      }

      const passed = outcome === "allowed_as_expected" || outcome === "protected_as_expected";

      matrixResults.push({
        role: account.role,
        username: account.username,
        endpoint: ep.path,
        method: ep.method,
        status: res.status,
        durationMs: res.durationMs,
        expectedAllowed,
        outcome,
        passed,
      });
    }
  }

  const violations = matrixResults.filter((m) => m.outcome === "security_violation");
  const unexpectedDenials = matrixResults.filter((m) => m.outcome === "unexpected_denial");

  steps.push({
    name: "12.1 RBAC Matrix Security Audit (All 17 Roles Evaluated)",
    passed: violations.length === 0,
    details: `Evaluated ${matrixResults.length} matrix checks. Violations: ${violations.length}, Unexpected Denials: ${unexpectedDenials.length}`,
  });

  return {
    flowId: "rbacMatrix",
    name: "RBAC Security Matrix",
    matrix: matrixResults,
    steps,
    passed: violations.length === 0,
  };
}
