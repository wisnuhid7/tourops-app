# Authentication & Accounts — Feature Summary

**Date:** 2026-07-25
**Prepared by:** Senior QA / Security Test Engineer
**Component under test:** Authentication & Accounts (TourOps API server)

---

## 1. Feature Overview

TourOps uses **session-based authentication** with a single shared backend that serves
three logical portals (customer / admin / staff). Sessions are persisted in PostgreSQL
via `express-session` + `connect-pg-simple`. Roles are stored in the `user_profiles`
table, not on the `users` table, and a customer profile is auto-created on first access.

## 2. Architecture

| Layer | Implementation |
|-------|----------------|
| Session store | `connect-pg-simple` → PostgreSQL `sessions` table, 7-day TTL |
| Session cookie | `connect.sid`, `httpOnly`, `secure:"auto"`, `sameSite:none`, `partitioned:true` (CHIPS) — required for the cross-origin preview iframe |
| Password hashing | `bcryptjs`, cost factor 10 |
| Credential compare | `bcrypt.compare` for passwords; `crypto.timingSafeEqual` for the seed secret |
| CSRF defense | Origin/Host allowlist middleware on all mutating methods (`app.ts`) |
| Rate limiting | `express-rate-limit` on `/api/auth/login` + `/api/auth/register` (10 fails / IP / 15 min, keyed on `req.ip` behind `trust proxy=1`) |
| Authorization | `isAuthenticated` middleware + per-route `requireRole()` against `user_profiles.role` |

## 3. Components / Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/auth/login` | POST | public (rate-limited) | Portal-aware login |
| `/api/auth/register` | POST | public (rate-limited) | Customer self-registration |
| `/api/auth/user` | GET | session | Current user (password hash stripped) |
| `/api/auth/logout` | POST | session | Destroy session + clear cookie |
| `/api/logout` | GET | session | Destroy session + redirect `/` |
| `/api/auth/seed-demo` | POST | `x-seed-secret` header | One-time bootstrap of demo accounts |
| `/api/user-profile` | GET | session | Own profile (`getOrCreateProfile`) |
| `/api/user-profiles` | GET | admin / wide-read roles | List profiles (country-scoped for country_manager) |
| `/api/user-profiles/:id` | PATCH | admin | Edit a profile (role, phone, isActive, …) |
| `/api/admin/users` | POST | admin | Create user + profile |
| `/api/admin/users/:id/password` | PATCH | admin | Admin-set password |

## 4. User Flows

- **Customer self-registration** → validates input → hashes password → `upsertUser` → `ensureProfile` (role `customer`) → auto-login.
- **Portal login** → validate → lookup user → `bcrypt.compare` → `ensureProfile` → portal/role gate → set `session.userId` + `session.userRole`.
- **Profile bootstrap** → `getOrCreateProfile` lazily creates a `customer` profile for any authenticated user lacking one.
- **Admin lifecycle** → admins create users, set roles, reset passwords, toggle `isActive`.

## 5. Dependencies

`express-session`, `connect-pg-simple`, `bcryptjs`, `express-rate-limit`, `zod/v4`,
Drizzle ORM (parameterized queries), PostgreSQL.

## 6. Risks

- Roles live only in `user_profiles`; the three frontend role maps + backend allowlists can drift (see project memory).
- Shared authentication backend across three portals: portal gating is the only separation, so gate logic must stay correct.
- Iframe cookie requirements (`SameSite=None`) put full weight on the Origin CSRF guard.
- **Account-lifecycle enforcement gap:** login does not consult `isActive` (see findings AUTH-01).

## 7. Assumptions

- `SESSION_SECRET` is set (it is, per environment).
- `SEED_SECRET` is unset in normal operation, so `/api/auth/seed-demo` returns 404 unless deliberately enabled.
- Production runs over HTTPS so `secure:"auto"` yields a `Secure` cookie.

## 8. Test Coverage Summary

| Area | Coverage |
|------|----------|
| Functional (login/register/logout/session) | Full |
| Portal / cross-portal gating | Full |
| Authorization / privilege escalation / IDOR | Full |
| CSRF (Origin guard) | Full |
| Injection (SQLi) | Full |
| Rate limiting / brute force | Full |
| Enumeration | Full |
| Payload limits / malformed input | Full |
| Session fixation / lifecycle | Full |
| Password reset / forgot / 2FA / email verification | **N/A — not implemented** (documented as gaps) |

Overall rating: **GOOD (post-remediation)** — strong RBAC, CSRF, injection, and brute-force
posture. All actionable findings fixed & retested (2026-07-25): deactivated-account login blocked
(AUTH-01), session regeneration on login (AUTH-02), unified 8-char password policy (AUTH-06), and
per-account lockout (AUTH-07). Remaining gaps are unimplemented account-recovery/2FA features
(AUTH-03/04/05) and minor hardening residuals.
