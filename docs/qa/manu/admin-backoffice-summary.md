# Admin & Back Office — Feature Summary

_QA sweep date: 2026-07-31 · Method: authenticated API testing across all staff/admin/customer roles + source review._

## Feature Overview
The Admin & Back Office feature set covers platform administration: user management, affiliate management, business-intelligence reports, global pricing/markup configuration, and audit logging. All surfaces live under `artifacts/tourops/src/pages/admin/*` (React) backed by `artifacts/api-server/src/routes/routes.ts` (Express) and `lib/db` (Drizzle/PostgreSQL).

## Administration Architecture
- **AuthN:** session-cookie auth (`isAuthenticated` middleware) on every admin route.
- **AuthZ:** in-handler `requireRole(req, res, [...])` checks against role arrays defined at `routes.ts:111-170`. `ADMIN_ROLES = ["admin","super_admin"]`. `PLATFORM_WIDE_READ_ROLES` (effective: admin, super_admin, country_manager, flight_agent, operations_manager, tour_builder) gates wide reads. The server always reads the role from the user's profile (`user_profiles.role`), never from client input, so role cannot be spoofed via request body.

## User Management Workflow
- List: `GET /api/user-profiles` (wide-read roles; country_manager filtered to own country). No server search endpoint — UI filters client-side.
- Create: `POST /api/admin/users` (admin only) — allowlisted fields, bcrypt password hash, explicit profile provisioning.
- Edit / role / activate-deactivate: `PATCH /api/user-profiles/:id` (admin only) — Zod field allowlist (`role, phone, companyName, countryCode, cityId, isTourLeader, isActive`). `isActive` is the only enable/disable control; there is **no separate suspend state and no user-delete endpoint**.
- Password reset: `PATCH /api/admin/users/:id/password` (admin only) — allowlist `{password}` only.

## Affiliate Workflow
- `GET /api/admin/affiliates` and `POST /api/admin/affiliates` (both admin only). Create validated by `insertAffiliateSchema` (allowlist: name, code, email, commissionRate, isActive). Referral tracking via `GET /ref/:code`. **No update or delete endpoint exists.**

## Reporting Architecture
- `GET /api/admin/analytics` and `GET /api/admin/stats` — gated to admin, super_admin, country_manager. `reports.tsx` consumes analytics only, with client-side export of revenue/occupancy. Leader-scoped reports (`/api/leader/dashboard`, `/api/leader/payments`) are `isAuthenticated`-only but scope data to the caller's own bookings.

## Pricing Engine Overview
- **Markup rules:** `GET/POST/PATCH/DELETE /api/admin/pricing/markup-rules` (admin + country_manager). Precedence in `lib/pricing.ts`: country+service → country+all → global+service → global+all → default 10%; then service fee; tax computed afterward.
- **Global settings:** `GET /api/admin/pricing/settings` (admin) / `POST` (admin + country_manager) — free-form key/value store.
- **Pricing engine rules:** `/api/pricing/rules` (read: PRICING_INTERNAL_ROLES; write: admin only). `services/pricing-engine.ts` uses Decimal and rejects negative/non-decimal inputs.

## Audit Logging Architecture
- `audit_logs` table (`schema.ts:333-350`): entityType, entityId, action, changedBy/Name, previousValue, newValue, note, createdAt.
- **Manually triggered, not middleware-based.** `storage.createAuditLog` / `storage.logChange` are called explicitly by a subset of routes.
- Read: `GET /api/audit-logs/:entityType/:entityId` and `GET /api/admin/audit-logs` (both admin only, limit 50). No update/delete endpoints — logs are append-only via the API.

## Permission Model
Role-array allowlists per route; profile-sourced role; customers and unauthorized staff receive 403; unauthenticated receive 401.

## Business Rules
- Only admin/super_admin manage users, affiliates, and global pricing settings; country_manager additionally may manage markup rules and write settings.
- Markup precedence and free-passenger adjustment are deterministic in the pricing engine.

## Dependencies
Express 5, Drizzle ORM, PostgreSQL, bcrypt, Zod, session-cookie auth.

## Risks
- **Audit coverage gap** (headline): user, affiliate, and pricing/markup/settings writes are NOT audited — only payment/booking/hotel/tour actions are.
- Unvalidated `numeric()` money columns and a free-form settings store can leak SQL on bad input and store junk.
- Wide-read exposure of profile PII to flight_agent/operations_manager.

## Assumptions
- Leader report endpoints are intentionally broad but self-scoped.
- Country_manager access to markup rules/settings is intentional.

## Test Coverage Summary
User management, affiliates, reports, global pricing, and audit logging were exercised for functional behavior, RBAC, validation, and security (IDOR, mass-assignment, injection, privilege escalation, audit tampering). See findings and testing-report for detail.
