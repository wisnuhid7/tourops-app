# QA Report — Account Security Features (2026-07-27)

Scope: password reset, email verification, two-factor authentication (TOTP),
`getOrCreateProfile` fail-closed fix, assignments notes-only PATCH bug,
gpt-4o → gpt-5 upgrade.

All tests run live against the dev API (`http://localhost:80`) with curl,
plus the vitest functional suite. Test account `qasec_user1` was created,
exercised, and deleted (users, profiles, tokens, sessions).

## 1. Password reset / forgot password — ✅ PASS
Implementation: `POST /api/auth/forgot-password` (rate-limited, accepts
username or email), `POST /api/auth/reset-password`. Tokens are 32-byte
random values, stored **SHA-256 hashed** in the new `auth_tokens` table,
single-use, 1-hour TTL; requesting a new token invalidates prior unused ones.
Frontend: `/forgot-password` and `/reset-password` pages; "Forgot password?"
link on every login form (customer/admin/staff).

| Test | Result |
|---|---|
| Request reset by username and by email | 200, email enqueued & delivered (dev console) |
| Unknown account | Same neutral 200 message (no enumeration) |
| Weak password (<8) | 400 "Password must be at least 8 characters" |
| Valid reset | 200; old password rejected, new password logs in |
| Token reuse | 400 invalid/expired |
| Fixed: `initEmailSystem()` was never called at startup — queued emails were never delivered | queue now drains; dev fallback also prints action links |

## 2. Email verification — ✅ PASS
Implementation: `users.email_verified` column; verification email sent
automatically on registration; `POST /api/auth/send-verification` (resend,
authed) and `POST /api/auth/verify-email` (token). 24-hour single-use tokens.
Frontend `/verify-email` page + status/resend in `/account/security`.

| Test | Result |
|---|---|
| Register with email | Verification email auto-enqueued with link |
| Verify with token | 200, `emailVerified: true` in 2FA status |
| Token reuse | 400 invalid/expired |

## 3. Two-factor authentication (TOTP) — ✅ PASS
Implementation: otplib v12 + `qrcode`. `users.totp_secret` / `totp_enabled`.
Endpoints: `GET /api/auth/2fa/status`, `POST /api/auth/2fa/setup` (QR data
URL + secret; inactive until confirmed), `/enable`, `/disable` (both require
a valid current code). Login with 2FA enabled returns
`{requiresTwoFactor:true}` with a session-parked pending login (no
privileges), completed by `POST /api/auth/login/2fa`; session ID is
regenerated on both the pending step and final elevation. Frontend: 2FA step
in the shared login form; enrollment UI in `/account/security`
(all roles, route `/account/security`).

| Test | Result |
|---|---|
| Setup returns secret + PNG QR data URL | ✅ |
| Enable with wrong code | 400 |
| Enable with valid code | ✅ enabled |
| Login: password-only | `{requiresTwoFactor:true}`, no session privileges |
| 2FA step wrong code | 401 |
| 2FA step valid code | Full login, `/api/auth/user` works |
| `/login/2fa` with no pending login | 401 |
| Disable requires valid code; direct login restored after | ✅ |

## 4. `getOrCreateProfile` fail-closed fix (AUTHZ-02) — ✅ PASS
Previously any authenticated user without a profile silently got a
"customer" (or, if no admin existed, **admin**) profile. Now:
- `storage.getOrCreateProfile` never creates; missing profile → 403
  "Account profile is not provisioned."
- Login is portal-aware: customer-portal logins may auto-provision a
  customer profile (legacy self-registered accounts); **admin/staff portal
  logins with no profile are rejected 403** instead of being demoted.
- Functional suite `auto-created-account-role.test.ts` rewritten to lock
  down the new behavior — 8/8 tests pass (no rows written, staff endpoints
  403, `/api/user-profile` 403 for unprovisioned sessions).

## 5. Assignments notes-only PATCH 500 — ✅ FIXED
Root cause: `booking_assignments` had **no `notes` column** and the route
passed raw `req.body` into `db.update().set()`. Fix: added the `notes`
column and a strict field allowlist (assignedUserId, serviceType,
countryCode, status, notes) with 400 on empty/unknown-only patches.

| Test | Result |
|---|---|
| `{"notes":"QA test note"}` | 200, persisted |
| `{"notes":null}` (clear) | 200 |
| `{}` | 400 "No updatable fields provided" |
| `{"createdBy":"hax"}` | 400 (stripped, nothing updatable) |

## 6. gpt-4o → gpt-5 (task #21) — ✅ PASS
All 6 chat-completion call sites in `src/lib/ai.ts` switched to `gpt-5`
(no temperature/max_tokens params were in use, so the swap is safe).
Live smoke test: `POST /api/admin/ai/generate-tour` produced a complete
structured Bali itinerary in ~105s.

## 7. Code-review round — 3 findings, all fixed & retested
1. **Reset-link host poisoning (critical)**: link base was derived from the
   request `Origin` header — an attacker could receive the victim's live
   reset token on their own domain. Fixed: links now use only
   `APP_URL` → `REPLIT_DEV_DOMAIN` (env-configured, never request headers).
   Retested with `Origin: https://evil.example.com` — request is also
   rejected 403 by the existing CSRF origin guard (defense in depth).
2. **Fail-closed regression**: `POST /api/admin/users` relied on
   `getOrCreateProfile` creating the profile. Fixed to use explicit
   `ensureProfile`; retested — admin-created staff user gets the correct
   role and can log in via the staff portal.
3. **Rate-limit gap**: the shared auth limiter skips successful requests, so
   the always-200 forgot-password was unthrottled. Added a dedicated
   limiter (5 req / 15 min / IP, all requests counted) on
   forgot-password + reset-password. Retested: 429 after the limit.

## Notes / limitations
- No SMTP configured in dev: emails print to the API console (with action
  links). Set `SMTP_HOST/PORT/USER/PASS` (+ `APP_URL`) for production
  delivery; reset/verify links prefer the request Origin, then `APP_URL`.
- 2FA has no backup/recovery codes yet — an admin password reset via email
  is the recovery path.
- Known pre-existing findings TOUR-01…06 (`docs/qa/manu/tours-findings.md`)
  remain open and are unrelated to this batch.
