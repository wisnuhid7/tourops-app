---
name: TourOps role stores & catalog permissions
description: Where the user's role actually lives, how frontend vs backend read it, and the rule for gating catalog/rate endpoints per supplier role.
---

# TourOps role model

- There is **no `role` column on `users`**. Role lives only in `user_profiles.role`.
- Backend authz (`requireRole`) reads the role via `storage.getOrCreateProfile(userId)` → `profile.role`.
- Frontend reads role from `GET /api/user-profile` (react-query key `/api/user-profile`), **not** from `/api/auth/user` (which returns the user with no role field).
- `getOrCreateProfile` assigns a NEW profile role of `admin` only if no real admin exists yet, otherwise `customer`. Seeding must create the profile with the intended role, or the first authed request locks the user to `customer`.

# Catalog / rate-card permissions

- Supplier/manager roles (`hotel_manager`, `guide_manager`, `sights_manager`, `airline_supplier`, `transport_manager`) do their work through the **supplier dashboard**, which manages **rate cards** (`/api/rates/{hotel,guide,sights,airline}`) — not the master entity endpoints (`/api/hotels`, etc.).
- **Rule:** when a role's supplier dashboard tab exists, its matching create/read/update/delete endpoints must include that role. The frontend showed the tabs but the backend allowlists only had `super_admin/admin/country_manager`, so suppliers got 403 on their own dashboards. Keep the per-domain role-group constants in `routes.ts` in sync with the tabs the frontend exposes.

**Why:** the "frontend invites the action, backend rejects it" drift produced silent 403s that looked like broken buttons.

**How to apply:** audit the allowlist on every rate/master endpoint against `supplier/dashboard.tsx` tab gating whenever roles or tabs change.

# Hotel registration + approval flow

- `hotels` is a **shared master catalog** (staff-only `GET /api/hotels`, no ownership column). By design it is NOT per-manager scoped — a `hotel_manager` sees/registers into the whole catalog. Do not add a "My Hotels"–style ownership filter unless the user explicitly asks; label such UI as the shared catalog, not "mine".
- Registration roles: `admin`, `super_admin`, `hotel_manager` (`HOTEL_REGISTER_ROLES`). Approval roles: `admin`, `super_admin` only (`PATCH /api/hotels/:id/approve`).
- `POST /api/hotels` **force-sets `status:"draft"`** server-side so a hotel_manager can't self-approve via payload. Approval is a separate admin-only action that flips status → `approved`.

**Why:** the user wanted managers to submit hotels but reserve approval for admins; the schema already had `hotels.status` = draft/approved/published.

# Open security tradeoff (not yet resolved)

- Rate/master endpoints are **globally scoped** (no per-supplier ownership column except transport's `transportCompanyId`). Granting a supplier role access lets it read/edit/delete **all** rows in that category, not just its own. True isolation needs ownership fields + scoped queries — a schema-level change. This overlaps the "keep supplier catalog data out of customer accounts" concern.

## Role rename: travel_agent → tour_leader (July 2026)
- The staff role `travel_agent` was renamed to `tour_leader` platform-wide (enum value via ALTER TYPE ... RENAME VALUE; seed user travelagent1 → tourleader1, user id user-tour_leader-1; ops route /ops/tour-leader).
- Do NOT confuse with the separate customer-side `isTourLeader` boolean + /leader-dashboard — that concept is untouched and intentionally coexists.
- lib/db exports point at src/, so lib/db/dist is stale build junk — ignore stale enum values found there.
