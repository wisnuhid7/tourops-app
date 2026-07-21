---
name: TourOps new-role checklist
description: Every place that must be touched when adding a staff role to TourOps
---

Adding a role (e.g. accounting, operations_manager, support_agent) requires ALL of:
1. `lib/db/src/schema/schema.ts` userRoleEnum + `pnpm run push` + `npx tsc -b .` in lib/db.
2. `artifacts/api-server/src/seed-core.ts` roles list, then `npx tsx seed-users.ts` from artifacts/api-server/src (plain `tsx` is not on PATH). Seed username = role name without underscores + "1" (transport_manager → transportmanager1).
3. **Separate STAFF_ROLES list** in `artifacts/api-server/src/replit_integrations/auth/routes.ts` (~L23) — miss it and staff-portal login 403s. It duplicates, not imports, routes.ts constants.
4. `routes.ts`: ALL_STAFF_ROLES, plus explicit decision on PLATFORM_WIDE_READ_ROLES / MASTER_RECORDS_MANAGE_ROLES exclusion filters (both are INTERNAL_STAFF_ROLES.filter with a growing exclusion list).
5. Frontend role→home maps in **three** places: `App.tsx` (opsRoleHome fn AND two duplicated opsRoles arrays in redirects) and `components/login-form.tsx` getRedirectUrl (post-login navigation — this one caused a wrong-landing bug). Plus `components/app-sidebar.tsx` role menu and i18n keys in `hooks/translations.ts` (all 3 languages, anchored inserts).

**Why:** each of these was independently missed at least once; symptoms are silent (login lands on /tours, sidebar empty, 403 at login).
