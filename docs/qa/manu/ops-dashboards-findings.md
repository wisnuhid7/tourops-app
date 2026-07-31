# Operations Dashboards (Staff Roles) — Findings

_QA sweep date: 2026-07-31. Roles tested via authenticated API._

---

## OD-01 — Wide-read `/api/bookings` exposes all bookings to several ops roles
- **Severity:** Low (Medium if bookings contain sensitive PII) · **Priority:** Medium
- **Component:** Bookings list endpoint / ops dashboards
- **Role:** `accounting`, `support_agent`, `flight_agent`
- **Endpoint/Page:** `GET /api/bookings`
- **Description:** `accounting`, `support_agent`, and `flight_agent` all receive the full set of 19 bookings, identical to super_admin. `tour_leader` is correctly filtered to assigned bookings (0). Whether flight_agent/support seeing every booking is appropriate depends on business intent; the endpoint applies a role allowlist but no per-role row scoping for these roles.
- **Steps to Reproduce:** Log in as each role; `GET /api/bookings`; compare counts (all = 19 except tour_leader = 0).
- **Expected Result:** Each ops role sees only bookings relevant to its function (or confirm broad read is intended).
- **Actual Result:** Full list for accounting/support/flight_agent.
- **Business/Security Impact:** Potential over-exposure of customer booking data across roles.
- **Root Cause:** Endpoint gated by role membership only; no row scoping for these roles.
- **Recommendation:** Confirm intended visibility; if narrower, add per-role scoping (e.g., support sees only bookings with open tickets, flight_agent sees only bookings needing flights). **No change made** — needs product decision.
- **Retest Status:** Open (needs product input).

---

## OD-02 — Role→dashboard defined in three separate maps that can drift
- **Severity:** Low · **Priority:** Low
- **Component:** Frontend routing / dashboard-config / sidebar maps
- **Role:** all staff
- **Endpoint/Page:** ops routing + sidebar
- **Description:** Routing, dashboard-config, and sidebar each independently map roles to dashboards/menu items. A change in one without the others causes silent drift (a role routed to a dashboard whose sidebar/config disagree). No live drift was observed for the tested roles, but the structure is fragile.
- **Steps to Reproduce:** Static review of the three maps.
- **Expected Result:** Single source of truth for role→dashboard.
- **Actual Result:** Three parallel maps.
- **Business/Security Impact:** Maintenance risk; possible future mis-routing.
- **Root Cause:** Duplicated role configuration.
- **Recommendation:** Consolidate into one role-config module. **No change made** (refactor beyond QA scope).
- **Retest Status:** Open (informational).

---

## OD-03 — Shared reference endpoints readable very broadly
- **Severity:** Info · **Priority:** Low
- **Component:** Master reference data
- **Role:** all authenticated (incl. customer for cities)
- **Endpoint/Page:** `GET /api/master/cities`, `GET /api/tours/public`
- **Description:** `/api/master/cities` and `/api/tours/public` return 200 for every authenticated role including customer. This is consistent with reference/public data but should be confirmed as intended.
- **Expected/Actual:** Broad read; presumed intentional.
- **Recommendation:** Confirm these are non-sensitive reference datasets. No change made.
- **Retest Status:** Open (confirm intent).

---

## Verified secure / no-issue (regression pass)
- **Dashboard endpoint gating:** `/api/payments` restricted to accounting + admin (support/flight/leader/city/customer 403); `/api/tours` restricted to content_editor + admin; `/api/flight-agent/workflows` restricted to flight_agent + admin; `/api/rates/airline` restricted to airline roles + admin.
- **Generic fallback:** roles without a dedicated dashboard fall through to generic; its data comes only from role-gated APIs, so no privileged data loads.
- **Direct URL / cross-dashboard access:** viewing another role's dashboard shell triggers 403s on its data calls — no leak.
- **Unauthorized/unauthenticated:** all dashboard APIs 401 without a session; customer 403 on staff endpoints.
- **tour_leader booking scoping:** filtered to assigned rows (0 of 19).
