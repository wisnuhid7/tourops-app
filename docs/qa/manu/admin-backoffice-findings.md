# Admin & Back Office — Findings

_QA sweep date: 2026-07-31. All findings verified via authenticated API calls._

---

## AB-01 — Sensitive admin writes are not audit-logged (audit coverage gap)
- **Severity:** High · **Priority:** High
- **Component:** Audit logging / user, affiliate, pricing routes
- **Endpoint/Page:** `POST /api/admin/users`, `PATCH /api/user-profiles/:id`, `PATCH /api/admin/users/:id/password`, `POST /api/admin/affiliates`, `POST/PATCH/DELETE /api/admin/pricing/markup-rules`, `POST /api/admin/pricing/settings`
- **Description:** Audit logging is manually triggered per-route (not middleware). Only payment, booking, hotel, and tour flows call `storage.createAuditLog`/`logChange`. User creation, role changes, account enable/disable, password resets, affiliate creation, and all pricing/markup/settings changes create **no** audit entry.
- **Steps to Reproduce:** As `superadmin1`, create an affiliate and change a user role; then `GET /api/admin/audit-logs`. Observed entityTypes: `payment, booking, hotel, tour` only — no `user_profile`, `affiliate`, `markup_rule`, or `global_settings` entries.
- **Expected Result:** Every sensitive administrative action records who changed what, when, and (ideally) before/after values.
- **Actual Result:** No audit trail for user/affiliate/pricing administration.
- **Business/Security Impact:** No accountability or forensic trail for privilege changes, password resets, or pricing manipulation — a compliance and insider-threat gap.
- **Root Cause:** Manual (non-middleware) audit logging; these routes were never wired to `createAuditLog`.
- **Recommendation:** Add `createAuditLog` calls (with before/after diff via `logChange`) to each listed write route, or introduce an audit wrapper for admin mutations. **No change made** — cross-cutting; tracked as follow-up.
- **Retest Status:** Open.

---

## AB-02 — Bad input on `numeric()`/enum columns 500-leaked raw SQL (FIXED)
- **Severity:** Medium · **Priority:** High
- **Component:** User profile role validation; markup-rule pricing validation
- **Endpoint/Page:** `PATCH /api/user-profiles/:id`, `POST /api/admin/pricing/markup-rules`
- **Description:** The user-profile update schema validated `role` as `z.string()` (not the enum), and markup-rule `markupPercentage`/`minProfit` (Drizzle `numeric()`) had no numeric validation. Invalid values passed Zod and hit Postgres, whose driver error — including the full SQL statement and bound parameters — was returned to the client via the generic `catch { message: e.message }`.
- **Steps to Reproduce (pre-fix):** `PATCH /api/user-profiles/:id {"role":"not_a_real_role"}` → 500 with `Failed query: update "user_profiles" set "role"=$1 ...`. `POST /api/admin/pricing/markup-rules {"markupPercentage":"abc"}` → 500 with the INSERT statement.
- **Expected Result:** 400 validation error, no internal detail leaked.
- **Actual Result (pre-fix):** 500 with raw SQL + params (info disclosure); negative markup (`-50`) was also silently stored.
- **Business/Security Impact:** Information disclosure (schema/column/params) and corrupt pricing data.
- **Root Cause:** `drizzle-zod` maps `numeric()` → plain `z.string()` with no numeric check; the inline role schema used `z.string()` instead of the DB enum.
- **Recommendation / Fix applied:** Added `requiredMoneyString` (non-negative numeric string) to `insertMarkupRuleSchema` (`markupPercentage`, `minProfit`) and validated `role` against `userRoleEnum.enumValues` in both the profile PATCH and the admin-user create schemas; also validated the markup-rule PATCH body against the partial schema (was passing `req.body` raw). Verified: invalid role/markup → 400 (no SQL), valid → 200.
- **Retest Status:** Fixed & retested 2026-07-31.

---

## AB-03 — Profile PII (incl. role) readable by flight_agent and operations_manager
- **Severity:** Low–Medium · **Priority:** Medium
- **Component:** User list endpoint
- **Endpoint/Page:** `GET /api/user-profiles`
- **Description:** `PLATFORM_WIDE_READ_ROLES` grants read of all user profiles (names, phone, company, role) to `flight_agent` and `operations_manager` in addition to admins/country_manager. These operational roles likely do not need the full staff/customer directory.
- **Steps to Reproduce:** Log in as `flightagent1` or `operationsmanager1`; `GET /api/user-profiles` → 200 with all profiles.
- **Expected Result:** Restrict profile listing to roles that administer users.
- **Actual Result:** 200 for flight_agent and operations_manager.
- **Business/Security Impact:** Over-exposure of staff/customer PII.
- **Root Cause:** Broad `PLATFORM_WIDE_READ_ROLES` reused for the profile directory.
- **Recommendation:** Gate `/api/user-profiles` to `[...ADMIN_ROLES, "country_manager"]` (keeping country scoping), or confirm the broad read is intended. **No change made** — needs product decision.
- **Retest Status:** Open.

---

## AB-04 — Global settings store accepts arbitrary keys/values with no validation
- **Severity:** Low · **Priority:** Low
- **Component:** Global pricing settings
- **Endpoint/Page:** `POST /api/admin/pricing/settings`
- **Description:** The endpoint writes any `{key, value}` pair (both free-form text) with no allowlist or value validation, and is reachable by country_manager as well as admins. A caller can create junk keys (`qa_probe_key` was stored during testing) or set a known key (e.g. `default_service_fee`) to a non-numeric/negative value that the legacy pricing lib later `parseFloat`s permissively.
- **Steps to Reproduce:** As `countrymanager1`, `POST /api/admin/pricing/settings {"key":"qa_probe_key","value":"qa"}` → 200, row stored.
- **Expected Result:** Restrict to a known set of setting keys and validate values by type.
- **Actual Result:** Arbitrary key/value accepted.
- **Business/Security Impact:** Settings pollution and potential pricing miscalculation from unvalidated values.
- **Root Cause:** Unconstrained key/value upsert.
- **Recommendation:** Allowlist known keys and validate each value's type/range. **No change made** — needs product decision on the setting catalog.
- **Retest Status:** Open.

---

## AB-05 — No user delete / suspend; no server-side user search (functional gaps)
- **Severity:** Info · **Priority:** Low
- **Component:** User management
- **Description:** The scope references user deletion, suspension, and search. There is no delete or suspend endpoint (only `isActive` enable/disable), and no server search endpoint (the UI filters the full list client-side). These are missing features, not defects; noted for completeness.
- **Recommendation:** If required, add a soft-delete/suspend state and a server-side search/pagination endpoint. No change made.
- **Retest Status:** Open (feature gap).

---

## Verified secure / no-issue
- Affiliate, analytics, stats, markup-rules, settings, and audit-log endpoints all reject customers and unauthorized staff with 403; unauthenticated 401.
- Role cannot be escalated via request tampering — the server reads role from the profile, not the request body; role changes are admin-only.
- Audit logs are append-only via the API (only GET endpoints exist; no update/delete route or storage method) — no audit-tampering or deletion vector found.
- Affiliate and admin-user create use Zod field allowlists (no mass assignment); password reset allowlists `{password}` only.
- Pricing engine (`services/pricing-engine.ts`) rejects negative/non-decimal quote inputs with a clean 400.
