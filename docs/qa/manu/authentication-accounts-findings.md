# Authentication & Accounts — Findings

**Date:** 2026-07-25
**Assessment:** Functional + Security + API + Edge-case test of Authentication & Accounts.

Summary: **1 Medium, 1 Low (session), 4 Low (unimplemented recovery/2FA), 1 Info.**
No Critical or High findings. Core RBAC, CSRF, injection, brute-force, enumeration, and
IDOR protections all passed.

---

## AUTH-01 — Deactivated accounts can still authenticate

- **Severity:** Medium
- **Priority:** High
- **Component:** `POST /api/auth/login` (`replit_integrations/auth/routes.ts`)
- **Description:** Admins can deactivate a user by setting `user_profiles.isActive = false`
  via `PATCH /api/user-profiles/:id`, but the login flow never reads `isActive`. A
  deactivated account continues to authenticate and receive a valid session.
- **Steps to reproduce:**
  1. As admin, create a staff user, then `PATCH /api/user-profiles/:id {"isActive":false}` → `200`.
  2. `POST /api/auth/login` with that user's credentials.
- **Expected result:** `403` / `401` — deactivated accounts must be denied.
- **Actual result:** `200` — login succeeds and a session is issued.
- **Root cause:** No lifecycle check in the login handler; `isActive` is stored but never enforced.
- **Recommendation:** After credential validation and profile lookup, reject login when
  `profile.isActive === false` (e.g. `403 {"message":"Account is disabled"}`). Consider also
  invalidating existing sessions for a user when they are deactivated.
- **Retest status:** ✅ Fixed & Retested (2026-07-25) — login now returns `403 "Account is disabled"`
  when `profile.isActive === false`. Verified: active→200, deactivated→403, reactivated→200.
  (Residual enhancement: existing sessions are not force-invalidated on deactivation.)

---

## AUTH-02 — No session ID regeneration on login

- **Severity:** Low
- **Priority:** Low
- **Component:** login / register session establishment
- **Description:** On successful login/registration the handler sets `req.session.userId`
  directly without calling `req.session.regenerate()`, so the pre- and post-auth session
  identifier is the same object.
- **Steps to reproduce:** Inspect handler; no `regenerate()` call before privilege elevation.
- **Expected result:** Session ID rotated at the moment of privilege change (defense-in-depth
  against session fixation).
- **Actual result:** Session ID not rotated.
- **Root cause:** Missing `regenerate()` in the auth handlers.
- **Mitigating factor:** `saveUninitialized:false` means **no session cookie is issued to
  anonymous clients** (verified: unauthenticated requests receive no `Set-Cookie`), which
  removes the practical fixation vector. Hence Low.
- **Recommendation:** Call `req.session.regenerate()` before assigning `userId`/`userRole` on
  login and registration.
- **Retest status:** Open

---

## AUTH-03 — Self-service password reset / forgot password not implemented

- **Severity:** Low
- **Priority:** Medium
- **Component:** Auth (scope gap)
- **Description:** The feature scope lists password reset and forgot-password flows, but no
  such endpoints exist. Only admin-initiated password change (`PATCH /api/admin/users/:id/password`)
  is available; a locked-out user has no recovery path.
- **Steps to reproduce:** `grep` for reset/forgot endpoints → none found.
- **Expected result:** Token-based, expiring, single-use reset flow (if in scope).
- **Actual result:** Not implemented.
- **Root cause:** Feature not built.
- **Recommendation:** If in scope, implement expiring single-use reset tokens with rate limiting
  and generic (enumeration-safe) responses. Otherwise mark out of scope.
- **Retest status:** N/A (not implemented)

---

## AUTH-04 — Two-factor authentication (2FA) not implemented

- **Severity:** Low
- **Priority:** Low
- **Component:** Auth (scope gap)
- **Description:** No 2FA/TOTP/OTP mechanism exists. In-scope per the brief but absent in code.
- **Expected result:** Optional TOTP enrollment + challenge (if in scope).
- **Actual result:** Not implemented.
- **Recommendation:** Add TOTP with recovery codes for privileged (admin/staff) accounts if 2FA is required.
- **Retest status:** N/A (not implemented)

---

## AUTH-05 — Email verification not implemented; emails accepted unverified

- **Severity:** Low
- **Priority:** Low
- **Component:** Registration / profile
- **Description:** Registration accepts an optional `email` with format validation only; the
  address is never verified. No verification token flow exists.
- **Expected result:** Email ownership confirmed before it is trusted for notifications/recovery.
- **Actual result:** Email stored unverified.
- **Recommendation:** Add a verification-token flow if email is used for recovery or trust decisions.
- **Retest status:** N/A (not implemented)

---

## AUTH-06 — Weak password policy

- **Severity:** Low
- **Priority:** Low
- **Component:** register (min 6) / admin create (min 4) / admin password change (min 4)
- **Description:** Minimum lengths are short and inconsistent (6 for self-registration, 4 for
  admin-created users and admin password resets), with no complexity or breached-password checks.
- **Expected result:** Consistent minimum (≥ 8–12) and ideally a breached-password check.
- **Actual result:** 4–6 character minimums, no complexity rules.
- **Recommendation:** Standardize to a single stronger policy across all three code paths.
- **Retest status:** Open

---

## AUTH-07 — Rate limiter is per-IP only (no per-account lockout)

- **Severity:** Informational
- **Priority:** Low
- **Component:** `authRateLimiter`
- **Description:** Brute-force protection keys only on client IP. A distributed attack from
  many IPs against one account is not throttled per-account; conversely many users behind one
  NAT/proxy share a bucket.
- **Mitigating factor:** `trust proxy=1` resolves the real client IP (not spoofable header),
  and the 10/15-min limit meaningfully slows single-source attacks (verified: 429 after 10 fails).
- **Recommendation:** Add a complementary per-account failed-attempt counter with temporary lockout.
- **Retest status:** Open (enhancement)

---

## Verified-secure behaviors (no finding)

| Test | Result |
|------|--------|
| Username enumeration (message + no hash leak) | PASS — uniform "Invalid username or password"; `passwordHash` never returned |
| Cross-portal gating (customer→admin/staff) | PASS — `403` |
| Privilege escalation via profile PATCH (customer→super_admin) | PASS — `403`, role unchanged |
| Role injection via registration body (`role:super_admin`) | PASS — ignored, assigned `customer` |
| IDOR on `/api/user-profiles/:id` | PASS — `403` for non-admin |
| CSRF cross-origin mutating request | PASS — `403` (Origin guard) |
| SQL injection in username | PASS — no `500`, rejected/parameterized |
| Malformed JSON body | PASS — generic `400` (no stack trace) |
| Oversized body (200KB / 3MB) | PASS — `413` |
| Unexpected method (GET on login) | PASS — `404` |
| Brute-force throttle | PASS — `429` after 10 failed attempts |
| Logout invalidates session | PASS — reused cookie → `401` |
| `getOrCreateProfile` auto-creation | PASS — new user gets `customer` profile |
| Anonymous session persistence (fixation vector) | PASS — no `Set-Cookie` for anon requests |
