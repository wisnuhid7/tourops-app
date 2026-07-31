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

**Guide/rate catalog tables are duplicated across two surfaces:** the SAME guide (and hotel/sights/airline) rate catalog is rendered in BOTH `pages/admin/rate-cards.tsx` (admin/super_admin tabs) AND `pages/supplier/dashboard.tsx` (the guide_manager's dashboard, also reachable by admin/super_admin). Both hit `/api/rates/<type>`. A UI feature added to one table (e.g. an interactive status toggle) must be mirrored in the other or one role silently keeps the old static UI. **Why:** the guide-status Switch was added only to rate-cards.tsx first, but guide_manager manages guides via supplier/dashboard.tsx, so the feature appeared "not implemented" for that role. **How to apply:** when touching a rate/catalog row's cells or actions, grep both files. Note the supplier dashboard guide table has no archive control, so its status Switch must be `disabled` for `archived` rows (only active↔draft), else toggling silently unarchives.

**Sidebar deep-links to a sub-tab:** master-data-style pages are deep-linkable via a `?tab=<name>` query param — the page reads it with wouter `useSearch`, whitelists against the known tab list, and controls the `Tabs value` (falling back to default for missing/invalid values). When a sidebar item carries a query string, the active-highlight check must match the *full* URL (path+search) for that item but keep matching *pathname only* for plain items — otherwise plain nav items stop highlighting whenever the page has any unrelated query param. **Why:** a blanket switch to full-URL matching silently broke active state for every path-only route.

## Sidebar active-state rule (app-sidebar.tsx)
Plain-path nav items match by pathname but must yield when a query-based sibling (?tab=...) is the exact match, or two items highlight at once. Also: supplier dashboard Tabs must be controlled (value synced to ?tab via useEffect), not defaultValue-only, or sidebar tab links don't switch a mounted dashboard.

**Update (2026-07-31):** Consolidated — `lib/roles.ts` `ROLE_HOME`/`getRoleHome` is now the single source for role→dashboard URLs; sidebar and login redirect derive from it (labels/icons stay in the sidebar). When adding a role, add it to ROLE_HOME and the sidebar branch only needs label+icon.
