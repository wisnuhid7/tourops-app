# Authentication & Accounts — Testing Report

**Date:** 2026-07-25
**Tester:** Senior QA / Security Test Engineer
**Build:** TourOps API server (dev), session-based auth

---

## Executive Summary

The Authentication & Accounts feature was assessed across functional, security, API, and
edge-case dimensions. The core security posture is **strong**: role-based authorization,
CSRF (Origin) protection, SQL-injection resistance, brute-force rate limiting,
enumeration-safe error handling, and IDOR/mass-assignment protection all passed.

One **Medium** functional-security defect was confirmed: **deactivated accounts
(`isActive:false`) can still log in** because the login flow never checks the account's
active state. The remaining findings are Low/Informational — a missing session-ID
regeneration (well-mitigated by `saveUninitialized:false`), a weak/inconsistent password
policy, per-IP-only rate limiting, and several in-scope-but-unimplemented features
(password reset, forgot password, 2FA, email verification).

**Overall assessment: MODERATE.** Ship-blocking items: fix AUTH-01 before deactivation is
relied upon as a security control.

## Scope

Session login/logout, customer self-registration, portal-aware login, profile management
(`/api/user-profile`, `/api/user-profiles`), role management in `user_profiles`,
iframe-compatible cookies, Origin/Host CSRF protection, the secret-guarded bootstrap
endpoint, and account lifecycle. Password reset, forgot password, 2FA, and email
verification were in scope but are **not implemented** (documented as gaps).

## Environment

- Dev API base: `http://localhost:80`
- Accounts (password `password123`): `superadmin1` (admin), `customer1` (customer), staff roles e.g. `contenteditor1`.
- Tooling: `curl` + Node for JSON parsing.
- Rate limiter note: the login/register limiter (10 fails/IP/15 min) throttles rapid test
  batches; the API workflow was restarted between batches to reset the in-memory counter.

## Features Tested

Login (happy/invalid/empty/boundary), registration (valid/duplicate/validation),
logout & session invalidation, portal & cross-portal gating, authorization &
privilege escalation, IDOR, CSRF, SQL injection, enumeration, rate limiting/brute force,
payload limits, malformed input, session fixation, account lifecycle, `getOrCreateProfile`
auto-creation, bootstrap endpoint.

## Results

| Metric | Count |
|--------|-------|
| Total test cases | 49 |
| Passed (incl. retests) | 49 |
| Failed (open) | 0 — AUTH-01/02/06/07 fixed & retested |
| Blocked | 0 |
| Not applicable (unimplemented scope) | 4 (reset, forgot, 2FA, email verification) |

### Security Findings

| ID | Severity | Title | Status |
|----|----------|-------|--------|
| AUTH-01 | Medium | Deactivated accounts can still authenticate | ✅ Fixed |
| AUTH-02 | Low | No session ID regeneration on login (mitigated by `saveUninitialized:false`) | ✅ Fixed |
| AUTH-03 | Low | Self-service password reset / forgot password not implemented | N/A |
| AUTH-04 | Low | 2FA not implemented | N/A |
| AUTH-05 | Low | Email verification not implemented | N/A |
| AUTH-06 | Low | Weak/inconsistent password policy (4–6 char minimums) | ✅ Fixed |
| AUTH-07 | Info | Rate limiter is per-IP only (no per-account lockout) | ✅ Fixed |

## Performance Observations

- Auth responses were consistently fast (single-digit to low-hundreds ms; bcrypt compare on
  valid login ~200 ms, expected for cost factor 10).
- Oversized bodies rejected early at the body-parser limit (`413`) without server strain.

## Known Limitations

- Password reset, forgot password, 2FA, and email verification are absent; account recovery
  depends entirely on an admin.
- Rate-limiter counter is in-memory (resets on restart) and per-IP.

## Remediation Status (2026-07-25)

All actionable findings have been **fixed and retested**:
- **AUTH-01 ✅** Login rejects deactivated profiles (`403 "Account is disabled"`).
- **AUTH-02 ✅** Session ID regenerated on login/registration.
- **AUTH-06 ✅** Unified password policy (min 8) across register / admin-create / admin-reset.
- **AUTH-07 ✅** Per-account lockout (5 fails → 15-min lock) added alongside the per-IP limiter.

## Remaining Risks

1. **No account recovery / 2FA (AUTH-03/04/05, Low):** password reset, forgot password, 2FA, and
   email verification remain unimplemented — account recovery depends entirely on an admin.
2. **Password complexity (AUTH-06 residual):** minimum length enforced, but no complexity or
   breached-password check yet.
3. **Lockout durability (AUTH-07 residual):** the per-account counter is in-memory and resets on
   restart; move to a shared store if the API scales to multiple processes.
4. **Session invalidation on deactivation (AUTH-01 residual):** deactivation blocks new logins but
   does not force-expire a user's existing active sessions.

## Final Assessment

**MODERATE.** Strong authorization, injection, CSRF, and brute-force defenses with no
Critical/High issues. The one Medium defect (deactivated-account login) should be fixed
promptly; the Low/Info items are hardening and feature-completeness improvements.

## Recommendations

1. Enforce `profile.isActive` in the login handler (AUTH-01) — highest priority.
2. Call `req.session.regenerate()` on login/registration before setting `userId` (AUTH-02).
3. Standardize a single stronger password policy (≥ 8–12 chars) across register, admin-create,
   and admin password-change paths (AUTH-06).
4. Add a per-account failed-attempt lockout to complement the per-IP limiter (AUTH-07).
5. If in scope, implement token-based password reset, 2FA (TOTP), and email verification
   (AUTH-03/04/05).
