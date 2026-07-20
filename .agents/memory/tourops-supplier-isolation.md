---
name: TourOps supplier data isolation (own_only)
description: Ownership model for per-supplier catalog isolation, and the two holes that recur when adding it.
---

# TourOps supplier catalog isolation (own_only model)

Each supplier role sees/edits/deletes only records it created; full-access roles
(super_admin, admin, country_manager) see/manage everything. Ownership is tracked
via a `created_by` column (rate tables already had it; airline_agencies and
transport_companies had it added). A module-level `ownerScope(req, scopedRoles)`
helper returns `ownerId = userId` only when the caller's role is in that
category's scoped role list, else `null` (= see all).

Per category: GET list filters to `createdBy === ownerId` when scoped; POST/bulk/
import stamp `createdBy = userId` (override any client value); PATCH/DELETE fetch
existing by id and 403 if `createdBy !== ownerId`. transport_manager also gets its
assigned company (`id === profile.transportCompanyId`).

**Two holes that recur when adding this — check them every time:**
- **Ownership field is client-mutable on PATCH.** POST stamps `createdBy` server-side,
  but PATCH schemas (`insert*Schema.partial()`, or a hand-rolled sanitizer) still
  include `createdBy` unless you strip it. A scoped supplier can then reassign/hide
  a record by PATCHing `createdBy`. Strip `createdBy` (+ `id`, `createdAt`) from every
  update payload.
- **Master-data GET routes gated only by `isAuthenticated`.** `/api/master/transport-companies`
  and `/api/master/airline-agencies` had no `requireRole`, so a customer (non-scoped →
  ownerId null → filter skipped) received the full catalog. Gate catalog GETs with
  `ALL_STAFF_ROLES` at minimum; `isAuthenticated` alone leaks to customers.

**Why:** own_only was the user's chosen isolation level; both holes were caught in
architect review after the first pass and would otherwise be silent horizontal-priv /
data-exposure bugs.

**How to apply:** when scoping any new owned resource, audit all three of GET filter,
POST/import stamping, and PATCH/DELETE ownership check + `createdBy` strip; and confirm
the list GET has a staff-role gate, not just `isAuthenticated`.

**Pre-existing rows:** records created before the change have `createdBy = null`, so
scoped suppliers won't see them (only full-access roles will). Acceptable, but note
prod rows are the same after publish — backfill if suppliers must see legacy records.

**Exception — guide AND hotel rates are GLOBAL, not own_only.** Per explicit user request
(July 2026), `/api/rates/guide` and `/api/rates/hotel` endpoints use `ownerScope(req, [])` so
`guide_manager`/`hotel_manager` see and manage the same global list as admins — do NOT "fix"
this by re-adding creator scoping. Role gates still apply. Sights & airline rates remain own_only.

**Exception — hotels are a SHARED master catalog, not own_only.** `/api/hotels` GET
returns the full list to all staff, and `hotel_manager` can edit/delete ANY hotel
(role set `HOTEL_EDIT_ROLES = admin/super_admin/hotel_manager` on PATCH+DELETE). This is
intentional per explicit user request — do NOT "fix" it by adding createdBy scoping.
Two invariants still hold and must be preserved: (1) approval status is admin-only —
`/api/hotels/:id/approve` is ADMIN_ROLES, and the PATCH handler strips `status` from the
payload for non-admins so a hotel_manager can't self-approve; (2) PATCH runs the body
through `insertHotelSchema.partial()` as a field allowlist so internal columns
(id/createdAt/etc.) can't be mass-assigned. **Why:** widening PATCH/DELETE to
hotel_manager without those two guards would let a manager self-approve or mutate
internal fields — flagged in architect review.

**Exception — cities are GLOBAL too.** Per explicit user request (July 2026),
`/api/master/cities` GET/POST/PATCH/DELETE have NO country- or creator-based scoping:
`city_manager` sees and manages the same global list as admins (the old
`profile.countryCode` → country filter and the PATCH `countryId` strip were removed).
Write role gate stays (super_admin/admin/country_manager/city_manager); GET stays
`isAuthenticated` because cities feed dropdowns app-wide. CSV import remains without
city_manager. Do NOT "fix" by re-adding country scoping. Both roles share
`city-form-fields.tsx` (like `hotel-form-fields.tsx` for hotels).

## Exception: sights rates are intentionally GLOBAL (July 2026)
Per explicit user request, /api/rates/sights GET/PATCH/DELETE have NO per-owner (createdBy) scoping — superadmin and all sights_managers share one global rates table, same for /api/master/sights writes (SIGHTS_MANAGE_ROLES). Hotel/guide/airline rates keep own_only scoping. Don't "fix" sights back to own_only in future audits.

## Exception: airlines catalog + airline rates also GLOBAL (July 2026)
Per user request, /api/master/airline-agencies GET/PATCH/DELETE and /api/rates/airline GET/PATCH/DELETE have no ownerScope — superadmin and airline_supplier share global records (POST still stamps createdBy). Rate dialogs: sights attractionName and airline airlineName are catalog-fed Select dropdowns (no free text; master sights use field 'name', agencies 'name'). Only hotel/guide rates remain own_only.
