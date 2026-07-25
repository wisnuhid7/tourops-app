# Authorization, Roles & Access Control — Testing Report

**Date:** 2026-07-25
**Prepared by:** Senior QA / Application Security Engineer
**Feature:** Authorization, Roles & Access Control (RBAC)

---

## Executive Summary

The TourOps RBAC implementation is **strong and consistent** at the backend boundary.
Vertical and horizontal privilege escalation, IDOR, mass assignment, field-level
restrictions, row-level scoping, master-data import gating, and customer↔supplier
isolation all behaved correctly under direct API testing.

One **High-severity defect (AUTHZ-01)** was found: tour *detail* endpoints
(`GET /api/tours/:id` and its sub-resources) are fully anonymous and do not check
`isPublished`, so unpublished/draft tours are readable by ID by anonymous and customer
users. This is the open concern tracked as project task #4. Two lower-severity items
(least-privilege default masking misconfiguration; RBAC logic duplicated across
frontend maps) are noted as operational/tech-debt.

**Final assessment: GOOD (post one required fix).** Remediate AUTHZ-01 before treating
the feature as production-ready.

## Scope

Backend RBAC for `/api/*`: `requireRole` middleware, `ADMIN_ROLES` / `ALL_STAFF_ROLES` /
`PLATFORM_WIDE_READ_ROLES` and catalog allowlists, tour/departure field allowlists,
supplier/hotel/country/city row scoping, master-data import routes, anonymous access, and
regression against project tasks #4/#10/#12/#19. Frontend authorization was assessed as
defense-in-depth only.

## Environment

- API base: `http://localhost:80` (workflow `artifacts/api-server: API Server`, running).
- Seeded demo accounts, one per role (username = role without underscores + `1`), password `password123`.
- Method: authenticated `curl` sessions per role; live request/response assertion.

## Roles Tested

super_admin, admin, country_manager, city_manager (via scope logic), hotel_manager,
airline_supplier, supplier, accounting, support_agent, tour_builder, content_editor,
tour_leader (scope logic), customer, anonymous. (14 documented roles + anonymous;
remaining enum roles share the same gate constants and were covered by matrix equivalence.)

## APIs Tested

`/api/tours`, `/api/tours/public`, `/api/tours/:id` (+ `/days`, `/day-items`,
`/departures`, `/guides`, `/hotels`), `/api/departures`, `/api/master/*` (countries,
cities, airports, sights, transport-companies, airline-agencies + their `/import`),
`/api/hotels` (+ `/:id/approve`), `/api/supplier/*`, `/api/user-profiles`, `/api/auth/*`.

## Pages Tested (via API + role maps)

Admin dashboard, staff dashboards, supplier dashboards, customer portal, public tour pages.

## Test Case Totals

| Metric | Count |
|--------|-------|
| Total test cases | 55 |
| Passed | 52 |
| Failed | 3 (all AUTHZ-01: RG-04, SEC-01, SEC-02) |
| Blocked | 0 |
| Not Applicable | 0 |

## Authorization Findings

- **AUTHZ-01 (High):** Unpublished tour details exposed to anonymous/customer via
  `GET /api/tours/:id` and sub-resources — no auth, no `isPublished` guard. (Task #4 open.)
- **AUTHZ-02 (Low):** `getOrCreateProfile` defaults unknown users to `customer`, masking
  provisioning errors (fails closed — no privilege gain).
- **AUTHZ-03 (Info):** RBAC logic duplicated across backend + three frontend role maps (drift risk).

## Security Findings

No authentication bypass, authorization bypass, vertical/horizontal escalation, IDOR,
mass-assignment, parameter-tampering, or frontend-only-restriction bypass succeeded, except
the anonymous-read exposure captured in AUTHZ-01.

## Coverage Analysis

| Area | Coverage | Result |
|------|----------|--------|
| Vertical escalation | Full | Pass |
| Horizontal escalation / IDOR | Full | Pass |
| Field-level (tours, departures) | Full | Pass |
| Row-level (supplier, hotel, country, city) | Full | Pass |
| Import route gating (regression) | Full | Pass |
| Customer↔supplier isolation (task #10) | Full | Pass |
| Content-editor price/publish lock (task #12) | Full | Pass |
| Anonymous forced browsing | Full | Pass |
| Unpublished tour exposure (task #4) | Full | **Fail** |
| Catch-all page hiding (task #19) | API-level | Pass (verify SPA guards) |

## Remaining Risks

- AUTHZ-01 unremediated = pre-launch inventory/pricing leakage.
- Frontend/backend role-map drift over time.
- Task #19 verified only at the API layer; SPA route guards should be confirmed in the client.

## Recommendations

1. **Fix AUTHZ-01:** guard `GET /api/tours/:id` and sub-resources to return `404` for
   unpublished tours unless the caller is staff or the owner. (Priority: High.)
2. Log/alert on auto-created `customer` profiles for staff-portal logins (AUTHZ-02).
3. Derive frontend role maps from one shared capability source (AUTHZ-03).
4. Add a client-side route-guard check for task #19 catch-all patterns.

## Final Authorization Assessment

**GOOD** — robust, defense-in-depth RBAC with correct field- and row-level enforcement.
Ship-ready once **AUTHZ-01** is remediated and retested.
