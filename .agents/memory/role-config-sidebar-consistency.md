---
name: Role-based dashboard config must stay in sync across 3 places
description: TourOps (and similar role-based apps) define role behavior in multiple independent maps that can silently drift apart.
---

In TourOps, a user's role drives three independent pieces of config that must all agree:
1. `App.tsx` routing (which redirects a role to, e.g., `/supplier` or `/ops/role`)
2. The dashboard component's own per-role config map (e.g. `ROLE_CONFIG` in `supplier/dashboard.tsx`, `dashboardMap` in `generic-dashboard.tsx`)
3. The sidebar nav link map in `app-sidebar.tsx`

**Why:** Found two real bugs this way: the generic `supplier` role was missing from `ROLE_CONFIG` (silently fell back to the `admin` config, showing "supplier_overview_admin" copy to a lowly supplier user), and the sidebar link for `supplier` pointed to `/ops/role` while `App.tsx` routed it to `/supplier` — a route/component mismatch invisible until you log in as that specific role.

**How to apply:** When adding/auditing a role, check all three maps for that role's key, not just one. Don't assume `git grep <role>` in one file is enough — the same role string appears in at least App.tsx, the shared dashboard component(s), and app-sidebar.tsx, and any of them can lack an entry while the others compile fine.

Also: role-scoped dashboards that depend on a foreign-key link (e.g. `transport_manager` needs `userProfiles.transportCompanyId` set before its dashboard renders anything but an empty state) must have that link created in the seed script, not patched ad hoc — otherwise the fix vanishes on a fresh DB.
