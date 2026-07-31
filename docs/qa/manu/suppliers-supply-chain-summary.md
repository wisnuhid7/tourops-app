# Suppliers & Supply Chain — Feature Summary

_QA sweep date: 2026-07-31 · Environment: Replit dev (api-server + tourops)_

## Feature overview
The Suppliers & Supply Chain domain covers the supplier portals (airline, hotel, guide, sights), the master catalogs they maintain (hotels, sights, transport companies, airline agencies), rate cards for each supplier type, the simulated airline flight-search/pricing engine, and the transport module (bus types, routes, route-pricing, bookings, invoices, payments).

## Supplier architecture
- **Auth/roles.** Roles live in `user_profiles.role` (not `users`). Staff log in through `POST /api/auth/login` with `portal: "staff"` (or `admin` for `admin`/`super_admin`); `customer` portal is separate. Portal authorization is enforced against `STAFF_ROLES` / `ADMIN_ROLES` — cross-portal logins are rejected (verified 403).
- **Role arrays** (`artifacts/api-server/src/routes/routes.ts` ~L111–170): `ALL_STAFF_ROLES`, `ADMIN_ROLES`, `CATALOG_BASE_ROLES` = `[super_admin, admin, country_manager]`, and per-supplier manage lists (`HOTEL_MANAGE_ROLES`, `GUIDE_MANAGE_ROLES`, `SIGHTS_MANAGE_ROLES`, `AIRLINE_MANAGE_ROLES`, `TRANSPORT_COMPANY_MANAGE_ROLES`).
- **Ownership scoping** via `ownerScope(req, scopedRoles)`: a supplier role in the scoped list is `own_only` (its `createdBy` is stamped on writes and filters reads); admins/country managers see all.

## Catalog architecture
| Catalog | Endpoint base | Write roles | Ownership |
|---|---|---|---|
| Hotels | `/api/hotels` | `HOTEL_REGISTER/EDIT_ROLES` | `hotel_manager` own_only (GET filtered, PATCH/DELETE owner-checked); approve is admin-only |
| Sights | `/api/master/sights` | `SIGHTS_MANAGE_ROLES` | shared/global (POST stamps `sights_manager` createdBy only) |
| Transport companies | `/api/master/transport-companies` | `TRANSPORT_COMPANY_MANAGE_ROLES` | shared/global; PATCH strips `createdBy` |
| Airline agencies | `/api/master/airline-agencies` | `AIRLINE_MANAGE_ROLES` | shared/global; PATCH strips `createdBy` |

Catalog GET is gated to staff roles; customers receive 403 across the board (verified).

## Rate Card architecture
Five rate tables (`hotel_rates`, `transport_rates`, `guide_rates`, `sights_rates`, `airline_rates`) exposed at `/api/rates/{hotel|transport|guide|sights|airline}` (GET/POST/bulk/PATCH/DELETE). Hotel & guide rates are `own_only`; sights/airline/transport are shared/global. Money columns are Drizzle `numeric()` and therefore **string-typed** in the insert schema — forms must submit strings, not numbers. All PATCHes pass through `sanitizeRateUpdate` (strips id/createdAt/createdBy, validates status). Insert schemas now validate money fields as non-negative numeric strings (see findings F-01).

## Airline search architecture
`GET /api/flights/search` (roles: admin, flight_agent, airline_supplier, country_manager). `airlineService.searchFlights` in `src/lib/airline.ts` produces **simulated** results: base fare scaled by distance/cabin, a ±10% random jitter, and random seat availability. Results are therefore non-deterministic per request by design.

## Transport architecture
All transport data is served from a single set of `/api/transport/*` endpoints (bus-types, routes, route-pricing, bookings, invoices, payments). The frontend exposes them at both `/admin/transport` and `/ops/transport`; **both routes call the same API**, so authorization is identical — enforced inside the handlers via `getTransportScope` (roles: admin, super_admin, country_manager, transport_manager). The `isAuthenticated`-only middleware is backed by in-handler role checks (verified: content_editor/tour_leader/support/customer all 403).

## User flows
Supplier logs in (staff portal) → lands on role dashboard → manages own catalog + rate cards → (airline/flight agent) runs flight search. Admin/country manager see and manage all suppliers' data.

## Business rules
- Suppliers only manage their own catalog/rates (own_only roles).
- Money fields are non-negative numeric strings.
- Simulated airline pricing is intentionally randomized.
- `/admin/transport` and `/ops/transport` must stay permission-identical.

## Dependencies
Postgres (Drizzle), express-session, the master-data tables, and the airline/AI simulation libs.

## Risks
- Wide-read list endpoints (`/api/bookings`) are visible to several ops roles; scoping is per-endpoint and easy to drift.
- Generic `catch → res.json({ message: e.message })` pattern can leak internal errors (see F-01).
- Shared/global catalogs (sights, airline agencies) are readable by every staff role.

## Assumptions
- Simulated pricing non-determinism is acceptable product behavior.
- Global visibility of shared catalogs to all staff is intended.

## Test coverage summary
Functional CRUD, role gating, ownership scoping, cross-portal isolation, transport parity, airline search validation/consistency, rate-card numeric validation, and security (IDOR/mass-assignment/injection/direct-access) were exercised via authenticated API tests across 16 roles. See the testing suite and report for details.
