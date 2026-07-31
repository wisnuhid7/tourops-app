# Suppliers & Supply Chain — Testing Report

_Date: 2026-07-31 · Tester: Senior QA / AppSec (agent) · Method: authenticated API testing across all roles_

## Executive Summary
The Suppliers & Supply Chain feature set is **functionally sound and well authorized**. Role gating, cross-portal isolation, and supplier ownership scoping all behave correctly. One medium-severity issue was found and fixed (invalid rate-card prices returned a 500 leaking SQL, and negative prices were accepted). Two low-severity issues remain open: intentionally randomized airline pricing (by design) and a noisy 500 on empty allowlist-filtered updates. **Overall assessment: READY**, with the fixed validation change.

## Scope
Supplier portals (airline/hotel/guide/sights), master catalogs, five rate-card families, simulated airline flight search, and the transport module (`/admin/transport` vs `/ops/transport`).

## Environment
Replit dev; `artifacts/api-server` (Express) + `artifacts/tourops` (React); Postgres via Drizzle; base `http://localhost:80`.

## Roles Tested
super_admin, hotel_manager, guide_manager, sights_manager, airline_supplier, transport_manager, content_editor, flight_agent, tour_leader, city_manager, country_manager, accounting, support_agent, operations_manager, customer (15). `admin`/`admin123` bootstrap login returned 401 in dev — super_admin used for admin coverage.

## Features Tested
Catalog CRUD & read gating, ownership scoping, rate-card create/validate, airline search + pricing consistency, transport parity, cross-portal isolation.

## APIs Tested
`/api/auth/login`, `/api/hotels`, `/api/master/{sights,transport-companies,airline-agencies,cities}`, `/api/rates/{hotel,guide,sights,airline,transport}`, `/api/flights/search`, `/api/transport/{bus-types,routes,bookings,invoices,payments}`, `/api/tours`.

## Pages Tested (behavioral, via API)
`admin/rate-cards.tsx`, supplier catalog tabs, `supplier/airline-search.tsx`, `/admin/transport`, `/ops/transport`.

## Results
- **Total test cases:** 40
- **Passed:** 34
- **Fixed & re-verified:** 4 (SSC-R02, SSC-R03, SSC-S02, SSC-RG03)
- **By design (open):** 1 (SSC-A04 pricing determinism)
- **Info/low (open):** 1 (F-03 empty-update 500)
- **Blocked:** 0 · **N/A:** 0

## Functional Findings
- Rate cards previously accepted invalid/negative prices (F-01) — fixed.
- Empty allowlist-filtered tour PATCH returns 500 "No values to set" (F-03) — open, low.

## Security Findings
- Info disclosure: invalid numeric input surfaced raw SQL + params in the 500 body (F-01) — fixed.
- No auth bypass, no cross-portal leak, no ownership bypass, no successful mass-assignment (content_editor price/publish correctly stripped), no SQL injection (parameterized + now numeric-validated).

## Performance Findings
Catalog and rate reads respond promptly at seed volume (≤ a few hundred rows). No pagination stress was applied; large-catalog performance not measured (see Remaining Risks).

## Coverage Analysis
All supplier roles, all five rate families, both transport route surfaces, and the airline search path were exercised at the API/authorization level. Frontend rendering (loading/empty states, responsive layout, browser refresh/deep-linking for `supplier/airline-search.tsx`) was not exercised in a real browser in this pass.

## Remaining Risks
- Airline pricing non-determinism if used in binding quotes (F-02).
- Wide-read `/api/bookings` visible to several ops roles (see ops report).
- Large-catalog / pagination performance unmeasured.
- Global `catch → e.message` pattern may leak internals on other endpoints.

## Recommendations
1. Keep the numeric-string money validation (done) and consider a global 500 handler that hides `e.message` in production.
2. Decide on deterministic vs. simulated airline pricing (F-02).
3. Add an early no-op guard for empty allowlist-filtered updates (F-03).

## Final Feature Assessment
**READY** — no critical/high defects; the one medium issue is fixed and re-verified.
