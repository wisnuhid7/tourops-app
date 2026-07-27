---
name: TourOps auth security features
description: Non-obvious constraints from adding password reset, email verification, and TOTP 2FA
---

- **Email queue must be initialized**: `initEmailSystem()` wires the send function into the in-memory queue; without it, jobs enqueue forever and never send (this had silently broken ALL email since the queue was added). It is now called in server startup — keep it there.
- **otplib must stay on v12**: v13 removed the `authenticator` preset export and requires a plugin architecture. The 2FA code assumes the v12 API.
- **Auth email links**: built from request Origin → `APP_URL` → `REPLIT_DEV_DOMAIN`. In production, set `APP_URL` (or rely on browser Origin). Dev SMTP fallback prints `?token=` links to the API console for testing.
- **Reset/verify tokens**: stored SHA-256 hashed in `auth_tokens`, single-use (consume = atomic update where usedAt is null), new request invalidates prior unused tokens of same type.
- **2FA login is two-step**: password success with totpEnabled parks `{userId, role}` in `session.pendingTwoFactor` (after regenerate, NO privileges), and `/api/auth/login/2fa` regenerates again before elevating. Don't merge the steps.
- **Profile provisioning is fail-closed (AUTHZ-02 fix)**: `storage.getOrCreateProfile` never creates; it throws a 403-status error. Only customer-portal login/registration auto-provision a customer profile via `authStorage.ensureProfile`. Admin/staff portal login with no profile → 403. `auto-created-account-role.test.ts` locks this down — update it if the policy changes deliberately.
