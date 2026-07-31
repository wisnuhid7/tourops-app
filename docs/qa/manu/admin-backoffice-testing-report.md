# Admin & Back Office — Testing Report

_Date: 2026-07-31 · Tester: Senior QA / AppSec (agent) · Method: authenticated API testing + source review_

## Executive Summary
The Admin & Back Office feature enforces authentication and role-based authorization consistently: user management, affiliate management, reports, pricing/markup configuration, and audit-log reads are all correctly gated to administrators (with `country_manager` intentionally permitted for analytics/markup). No authentication bypass, privilege escalation, IDOR, or audit-log tampering vector was found, and role cannot be spoofed via request body. Two contained input-validation defects that leaked raw SQL and stored corrupt pricing were **found and fixed** during the sweep. The most significant open item is a **compliance-level audit-logging gap**: sensitive administrative writes (user, affiliate, pricing/markup/settings) create no audit entries. **Overall assessment: READY WITH RESERVATIONS** — safe to operate, but the audit gap should be closed before this is relied on for accountability/compliance.

## Scope
User Management, Affiliates, Reports & BI, Global Pricing Settings, and Audit Logging — functional behavior, RBAC, validation, API contract, security, and regression.

## Environment
Replit dev; `artifacts/api-server` (Express 5) + `artifacts/tourops` (React/Vite); PostgreSQL via Drizzle; base `http://localhost:80`. All seed accounts use `password123` (staff via `portal:"staff"`, admin roles via `portal:"admin"`).

## Features Tested
User CRUD/role/activation/password, affiliate create/list, analytics & stats reports, markup rules, global settings, pricing engine, audit-log read & coverage.

## APIs Tested
`/api/user-profiles`, `/api/admin/users`, `/api/admin/users/:id/password`, `/api/admin/affiliates`, `/api/admin/analytics`, `/api/admin/stats`, `/api/admin/pricing/markup-rules`, `/api/admin/pricing/settings`, `/api/pricing/rules`, `/api/pricing/quotes`, `/api/admin/audit-logs`, `/api/audit-logs/:entityType/:entityId`, `/api/leader/dashboard`, `/api/leader/payments`.

## Pages Tested (behavioral, via API + routing review)
`admin/users.tsx`, `admin/affiliates.tsx`, `admin/reports.tsx`, `admin/pricing-settings.tsx`, `admin/pricing-engine.tsx`.

## Results
- **Total test cases:** 49
- **Passed:** 39
- **Fixed (defect found & remediated):** 5 (AB-U07, AB-P03, AB-P04, AB-P05, AB-S04)
- **Open (needs decision or follow-up):** 5 (AB-01 audit gap, AB-03 PII wide-read, AB-04 settings validation, AB-U12 & AB-A06 feature gaps)
- **Failed:** 0 · **Blocked:** 0 · **N/A:** 0

## Functional Findings
- Core admin workflows function correctly (create/edit/deactivate users, password reset, affiliate create, analytics/stats, markup CRUD).
- Feature gaps vs. scope: no user delete/suspend, no affiliate update/delete, no server-side user search (client-side filtering only). Documented as AB-U12 / AB-A06 / AB-05.

## Security Findings
- **Fixed:** invalid `role` string and non-numeric/negative markup values previously 500-leaked the raw SQL statement and parameters (info disclosure) and stored negative markup; now rejected with 400 via enum + non-negative numeric-string validation, and the markup PATCH now validates its body.
- **Open (AB-01):** user/affiliate/pricing administrative writes are not audit-logged — accountability/compliance gap.
- **Open (AB-03):** profile PII (incl. role) readable by flight_agent and operations_manager.
- **Open (AB-04):** global settings accept arbitrary unvalidated key/value pairs.
- **No issue:** no privilege escalation (server-sourced role), no IDOR, no unauth access, audit logs append-only (no tamper/delete endpoint).

## Performance Findings
Endpoints respond promptly at seed volume. Large-dataset user/affiliate lists, report generation under load, and pagination were not stress-tested (no server pagination exists for these lists — a scale risk if data grows).

## Coverage Analysis
All five feature areas and their endpoints were exercised for RBAC and validation. Real-browser UI rendering (forms, loading/empty states, responsive layout) and load/performance were not exercised in this API-level pass.

## Remaining Risks
- Missing audit trail for sensitive admin actions (AB-01).
- PII over-exposure to two ops roles (AB-03).
- Unvalidated settings store (AB-04).
- No pagination on admin lists (scale).
- Missing delete/suspend/search features (AB-05).

## Recommendations
1. Wire `createAuditLog`/`logChange` into user, affiliate, and pricing/markup/settings writes (AB-01) — highest priority.
2. Narrow `/api/user-profiles` to user-administering roles (AB-03).
3. Allowlist and type-validate global settings keys/values (AB-04).
4. Add server-side search + pagination for admin lists as data grows.

## Final Feature Assessment
**READY WITH RESERVATIONS** — no critical/high security defects remain open after remediation; the feature is safe to operate, but the audit-logging gap (AB-01) is a compliance concern that should be addressed before relying on the back office for accountability.
