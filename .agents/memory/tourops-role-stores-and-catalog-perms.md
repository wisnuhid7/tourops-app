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

# Open security tradeoff (not yet resolved)

- Rate/master endpoints are **globally scoped** (no per-supplier ownership column except transport's `transportCompanyId`). Granting a supplier role access lets it read/edit/delete **all** rows in that category, not just its own. True isolation needs ownership fields + scoped queries — a schema-level change. This overlaps the "keep supplier catalog data out of customer accounts" concern.
