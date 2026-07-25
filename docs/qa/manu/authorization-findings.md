# Authorization, Roles & Access Control — Findings

**Date:** 2026-07-25
**Assessment:** Functional + authorization + row/field-level + security test of RBAC.

Summary: **1 High, 1 Low, 1 Info — all now remediated (2026-07-25).** No Critical. Core RBAC
(vertical/horizontal escalation, IDOR, field allowlists, row scoping, import gating, customer
isolation) all passed.

---

## ~~AUTHZ-01 — Unpublished tour details exposed to anonymous & customer users~~ ✅ Fixed

- **Severity:** High
- **Priority:** High
- **Component:** Tour detail endpoints (`routes.ts`)
- **Role affected:** Anonymous, `customer` (any non-privileged caller)
- **Endpoint:** `GET /api/tours/:id`, `GET /api/tours/:id/departures`, `GET /api/tours/:id/days`,
  `GET /api/tours/:id/day-items`, `GET /api/tours/:id/guides`, `GET /api/tours/:id/hotels`
- **Description:** These endpoints have **no authentication and no `isPublished` check**. Any
  caller who knows or guesses a tour ID can read a draft/unpublished tour's full details
  (title, itinerary, pricing, departures). The public listing (`/api/tours/public`) correctly
  hides unpublished tours, but the detail-by-ID routes do not. This is the open concern from
  project task #4.
- **Reproduction steps:**
  1. As admin, create a tour with `isPublished:false`.
  2. Without any session, `GET /api/tours/<id>`.
- **Expected result:** `404` (or `403`) — unpublished tours must not be readable by anonymous/customer callers.
- **Actual result:** `200` with the full unpublished tour body (`isPublished:false`, title, etc.);
  `/:id/departures` also `200`.
- **Security impact:** Leakage of unreleased products, pricing, and itinerary planning to the
  public; enables scraping/enumeration of draft inventory before launch.
- **Root cause:** Detail routes were made public for the customer-facing tour page without a
  published-state guard; only the list endpoint filters on `isPublished`.
- **Recommendation:** In `GET /api/tours/:id` (and its sub-resources), return `404` when the
  tour is not published **unless** the caller is authenticated staff (`ALL_STAFF_ROLES`) or the
  tour owner. Apply the same guard to `/days`, `/day-items`, `/departures`, `/guides`, `/hotels`.
- **Retest status:** ✅ Fixed & Retested (2026-07-25) — added `isStaffViewer()` / `ensureTourViewable()`
  guards. Draft tours now return `404` to anonymous and customer callers on `/api/tours/:id`,
  `/days`, `/day-items`, `/departures`, `/guides`, `/hotels`; staff still get `200`; published
  tours remain publicly readable (regression verified).

---

## ~~AUTHZ-02 — `getOrCreateProfile` silently assigns `customer` to unknown users~~ ✅ Fixed

- **Severity:** Low
- **Priority:** Low
- **Component:** `getOrCreateProfile` / `requireRole`
- **Role affected:** Any authenticated user without a profile row
- **Endpoint:** All role-gated routes (indirectly)
- **Description:** A user without a `user_profiles` row is lazily assigned role `customer`.
  This is safe for authorization (least privilege), but it can **mask provisioning errors** — a
  staff member whose profile failed to seed silently becomes a customer and is denied access with
  a generic 403, making misconfiguration hard to diagnose.
- **Reproduction steps:** Authenticate a user with no profile row → hits a staff route → 403.
- **Expected result:** Correct role, or a clear "profile missing" signal for staff.
- **Actual result:** Defaults to `customer`; no distinction from a genuine customer.
- **Security impact:** None directly (fails closed to least privilege) — operational/diagnostic risk only.
- **Root cause:** Lazy default in `getOrCreateProfile`.
- **Recommendation:** Keep the least-privilege default but log/alert when a profile is auto-created
  for a user who authenticated through a staff/admin portal.
- **Retest status:** ✅ Fixed (2026-07-25) — `getOrCreateProfile` now emits a
  `[authz] auto-created <role> profile for user <id>` warning whenever it falls back to creating a
  profile, making silent provisioning gaps diagnosable. Least-privilege default retained.

---

## ~~AUTHZ-03 — RBAC logic duplicated across backend and three frontend role maps~~ ✅ Fixed

- **Severity:** Informational
- **Priority:** Low
- **Component:** Backend role constants + frontend routing/sidebar/dashboard maps
- **Role affected:** All
- **Description:** Role behavior is defined in ~4 places (backend allowlists, and three frontend
  maps: routing, dashboard config, sidebar). These can drift, causing a role to see a nav item it
  cannot use or vice versa. Backend remains authoritative (no privilege gained), but UX/consistency
  bugs are likely over time.
- **Security impact:** None (backend enforces); consistency risk.
- **Recommendation:** Derive the frontend maps from a single shared role-capability source.
- **Retest status:** ✅ Fixed (2026-07-25) — introduced `src/lib/roles.ts` as the single source of
  truth (`ROLE_LABELS`, `ROLE_HOME`, `SUPPLIER_ROLES`, `getRoleLabel`, `getRoleHome`). `App.tsx`
  (`opsRoleHome`, supplier redirect) and `app-sidebar.tsx` now consume it, removing the duplicated
  per-role home-route and label maps. Typecheck clean.

---

## Verified-secure behaviors (no finding)

| Test | Role(s) | Result |
|------|---------|--------|
| Create tour restricted to builders | content_editor, customer | PASS — 403 |
| Create/PATCH departures admin-only | content_editor, tour_builder | PASS — 403 |
| Content editor cannot change `basePrice` / `isPublished` (task #12) | content_editor | PASS — fields unchanged, only content edited |
| Master-data create/import gated by `requireRole` (regression) | hotel_manager, airline_supplier | PASS — 403 |
| Country create is admin-only; country_manager read-only on create | country_manager | PASS — GET 200, POST 403 |
| External supplier blocked from hotels | airline_supplier | PASS — 403 |
| Customer cannot read supplier/master catalog (task #10) | customer | PASS — 403 |
| Customer cannot read staff tour list / user directory | customer | PASS — 403 |
| Supplier workflow/booking isolation + IDOR | supplier | PASS — scoped list; unknown booking 404 |
| Finance/support role gating | accounting, support_agent | PASS — 403 on out-of-scope reads |
| Anonymous forced browsing (POST /api/tours, GET /api/user-profiles) | anonymous | PASS — 401 |
| Hotel approval is admin-only | hotel_manager | PASS — non-admin blocked |

## Regression check against project tasks

| Task | Concern | Result |
|------|---------|--------|
| #4 | Hide unpublished tour details from anonymous visitors | ✅ **Fixed & retested (AUTHZ-01)** |
| #10 | Keep supplier catalog data out of customer accounts | ✅ Pass |
| #12 | Content editors can't change tour prices or publish status | ✅ Pass |
| #19 | Specific pages hidden behind catch-all URL patterns | ✅ No API-level catch-all leak found (frontend routing only; verify SPA route guards separately) |
| `/api/master/*/import` enforce `requireRole` | ✅ Pass — all import routes gated |
