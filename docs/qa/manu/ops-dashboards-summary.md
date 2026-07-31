# Operations Dashboards (Staff Roles) — Feature Summary

_QA sweep date: 2026-07-31 · Environment: Replit dev (api-server + tourops)_

## Feature overview
Each staff role is routed to a role-specific operations dashboard, or to a generic fallback when no dedicated dashboard exists. Dashboards read from role-gated API endpoints and render widgets/tables scoped to that role's responsibilities.

## Dashboard architecture
Dashboards live in `artifacts/tourops/src/pages/ops/`: `content-editor.tsx`, `transport-dashboard.tsx`, `flight-agent.tsx`, `tour-leader.tsx`, `city-manager.tsx`, `accounting.tsx`, `support.tsx`, and `generic-dashboard.tsx` (fallback).

## Dashboard routing flow
Role → dashboard is resolved through three separate frontend maps (routing, dashboard-config, sidebar). **These can drift** (documented lesson): a role can be routed to a dashboard while its sidebar/config disagree. Roles without a dedicated mapping fall through to `generic-dashboard.tsx`.

## Role → dashboard (observed)
| Role | Dashboard | Primary APIs |
|---|---|---|
| content_editor | content-editor | `/api/tours`, `/api/ai/translate-tour/*`, `/api/upload` |
| transport_manager | transport-dashboard | `/api/transport/*`, `/api/master/transport-companies` |
| flight_agent | flight-agent | `/api/flight-agent/workflows`, `/api/rates/airline`, `/api/flights/search` |
| tour_leader | tour-leader | `/api/bookings` (assigned only), `/api/tours/public` |
| city_manager | city-manager | `/api/master/cities`, `/api/master/countries`, `/api/user-profile` |
| accounting | accounting | `/api/bookings`, `/api/payments` |
| support_agent | support | `/api/bookings` |
| others (operations_manager, etc.) | generic | `/api/user-profile`, `/api/tours/public` |

## Role hierarchy
`ADMIN_ROLES` (admin, super_admin) ⊃ everything. `STAFF_ROLES` covers all operational roles. Ownership/scoping roles (`city_manager`, `tour_leader`) are further row-scoped.

## Permission model
API middleware is uniformly `isAuthenticated`; **actual role enforcement is inside each handler** via `requireRole(...)` / scope helpers. Verified endpoint gating (200 = allowed, 403 = denied):

| Endpoint | sa | acct | support | content | flight | leader | city | customer |
|---|---|---|---|---|---|---|---|---|
| /api/bookings | 200 | 200 | 200 | 403 | 200 | 200* | 403 | 403 |
| /api/payments | 200 | 200 | 403 | 403 | 403 | 403 | 403 | 403 |
| /api/tours | 200 | 403 | 403 | 200 | 403 | 403 | 403 | 403 |
| /api/master/cities | 200 | 200 | 200 | 200 | 200 | 200 | 200 | 200 |
| /api/flight-agent/workflows | 200 | 403 | 403 | 403 | 200 | 403 | 403 | 403 |
| /api/rates/airline | 200 | 403 | 403 | 403 | 403 | 403 | 403 | 403 |

\* `tour_leader` receives `/api/bookings` but the result set is filtered to assigned bookings (0 of 19 seed rows), so no cross-role data is exposed.

## Navigation model
Sidebar items are role-filtered on the frontend; route protection is enforced server-side per API. Direct URL access to another role's dashboard renders the page shell but its API calls return 403, so no privileged data loads.

## User flows
Login (staff portal) → role detection via `/api/user-profile` → dashboard selection → widgets fetch role-gated data.

## Dependencies
`/api/user-profile` (role source), the booking/payment/tours/transport/master APIs, express-session.

## Risks
- Three-map drift (routing vs config vs sidebar).
- Wide-read `/api/bookings` reaches accounting, support, flight_agent, tour_leader — scoping is per-endpoint.
- `/api/master/cities` and `/api/tours/public` are intentionally readable by all authenticated users (and cities by customers too) — confirm this is intended shared reference data.

## Assumptions
- Generic dashboard is the intended fallback and exposes no privileged data.
- Shared reference endpoints (cities, public tours) are safe to expose broadly.

## Test coverage summary
Dashboard routing, role→endpoint gating, cross-role exposure, generic fallback, and unauthorized/direct-access were exercised for all staff roles via authenticated API tests. See suite and report.
