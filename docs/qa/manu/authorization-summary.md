# Authorization, Roles & Access Control — Feature Summary

**Date:** 2026-07-25
**Prepared by:** Senior QA / Application Security Engineer
**Component under test:** Authorization / RBAC (TourOps API server + frontend)

---

## 1. Feature Overview

TourOps enforces role-based access control (RBAC) across a 19-value `user_role` enum.
A user's role lives in `user_profiles.role` (not on `users`). The backend gates every
protected route through an `isAuthenticated` session check plus a `requireRole()` role
check and, where needed, **field-level allowlists** and **row-level scoping**
(`createdBy` / `country_id` / `city_id` ownership). The frontend mirrors this with
role-aware sidebar rendering and role-based dashboard routing, but the backend is the
authoritative boundary.

## 2. Authorization Architecture

| Layer | Mechanism |
|-------|-----------|
| Authentication | `isAuthenticated` — session `userId` required (401 otherwise) |
| Coarse authorization | `requireRole(req, res, roles[])` → 403 on role mismatch |
| Field-level | Per-role field allowlists (e.g. tour `CONTENT_FIELDS` vs `STRUCTURE_FIELDS`; `DEPARTURE_PATCH_FIELDS`) |
| Row-level | `ownerScope()` (supplier `createdBy`), country/city assignment filters |
| Frontend | Role maps → sidebar + dashboard routing (defense-in-depth only) |

## 3. Role Hierarchy (19 roles)

- **Oversight/Admin:** `super_admin`, `admin` (full access — `ADMIN_ROLES`).
- **Management:** `country_manager`, `city_manager`, `operations_manager`, `accounting`.
- **Domain/Catalog suppliers:** `hotel_manager`, `transport_manager`, `guide_manager`,
  `sights_manager`, `airline_supplier`, `supplier`, `flight_agent`.
- **Product assembly:** `tour_builder`, `content_editor`.
- **Operations:** `tour_leader`, `support_agent`.
- **Consumer:** `customer`.

### Key role sets (backend constants)
- `ADMIN_ROLES` = super_admin, admin.
- `ALL_STAFF_ROLES` = every non-customer role.
- `INTERNAL_STAFF_ROLES` = staff minus `airline_supplier` (external).
- `PLATFORM_WIDE_READ_ROLES` = internal staff minus single-domain/scoped roles.
- `TOUR_BUILDER_ROLES` = admins + tour_builder; `TOUR_CONTENT_ROLES` = admins + tour_builder + content_editor.
- Catalog sets (`HOTEL_MANAGE_ROLES`, `GUIDE_MANAGE_ROLES`, etc.) = base catalog roles + the domain's supplier role.

## 4. Permission Model

Permission is the intersection of: (a) authenticated session, (b) role membership in the
route's allowlist, (c) for writes, membership in the field allowlist, and (d) row ownership
where the role is row-scoped. Admins bypass row/field scoping; suppliers and single-domain
managers are confined to their own domain and rows.

## 5. Route Protection Model

Every `/api/*` mutating route begins with `isAuthenticated` then `requireRole(...)`.
Public (intentionally anonymous) routes: `/api/tours/public`, `/api/destinations/popular`.
**Note:** several tour *detail* routes (`/api/tours/:id`, `/:id/days`, `/:id/day-items`,
`/:id/departures`, `/:id/guides`, `/:id/hotels`) are anonymous by design for the public
tour page — see risk in §11 and finding AUTHZ-01.

## 6. Row-Level Security Model

- **Suppliers (`own_only`):** `ownerScope()` sets `ownerId = userId` for supplier roles so
  they only read/write their own `createdBy` rows; admins see all.
- **Hotel manager:** scoped to hotels it registered (`hotels.created_by`); approval is admin-only.
- **Country manager:** `/api/user-profiles` and country PATCH filtered to its assigned country.
- **City manager:** may PATCH only its single assigned city; cannot create/delete cities.

## 7. Field-Level Security Model

- **Tours:** `content_editor` may edit only `CONTENT_FIELDS` (description, highlights,
  media, tags, category, countries, translations). `STRUCTURE_FIELDS` (title, slug,
  duration, **basePrice**, pricing, **isPublished**, internalNotes) are tour_builder/admin only.
- **Departures:** `DEPARTURE_PATCH_FIELDS` allowlist; `capacityBooked`, `tourId`, ids/audit
  fields are not client-mutable (mass-assignment guard).

## 8. Middleware Overview

`isAuthenticated` (session) → `requireRole` (role) → handler-local scope/field checks.
`getOrCreateProfile` lazily creates a `customer` profile for any user lacking one.

## 9. Frontend Authorization Flow

Reads `/api/user-profile` → drives sidebar items and dashboard route by role. Frontend
restrictions are cosmetic; all real enforcement is server-side.

## 10. Backend Authorization Flow

Session → profile lookup → role allowlist → (field allowlist | row scope) → data access.

## 11. Risks

- **AUTHZ-01:** Tour detail endpoints are fully anonymous with no `isPublished` check, so
  unpublished/draft tours are readable by ID (task #4).
- Role logic is duplicated across backend allowlists and three frontend role maps — drift risk.
- `getOrCreateProfile` defaults unknown users to `customer`, which can mask missing staff setup.

## 12. Assumptions

- Seeded demo accounts exist (one per role, username = role without underscores + `1`, password `password123`).
- Session auth from the Authentication feature is trusted (assessed separately).

## 13. Test Coverage Summary

| Area | Coverage |
|------|----------|
| Vertical privilege escalation (all key roles) | Full |
| Horizontal escalation / IDOR | Full |
| Field-level (tours, departures) | Full |
| Row-level (supplier, hotel manager, country manager) | Full |
| Master-data import `requireRole` (regression) | Full — enforced |
| Anonymous / forced browsing | Full |
| Unpublished tour exposure (task #4) | Full — **defect found** |
| Customer↔supplier isolation (task #10) | Full — pass |
| Content editor price/publish lock (task #12) | Full — pass |

Overall: **GOOD RBAC with one High-severity anonymous-exposure defect (AUTHZ-01).**
