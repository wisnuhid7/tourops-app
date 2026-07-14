---
name: Preview iframe storage & session cookies
description: The Replit preview iframe partitions/blocks storage — affects localStorage AND session cookies; cookie fix requires a CSRF guard.
---

The preview pane embeds the app in a cross-origin iframe with storage partitioning. Two failure modes seen in TourOps:

1. **localStorage**: mere property access can throw ("Access is denied"). All reads/writes must go through try/catch-guarded helpers (`safeStorage` in tourops `lib/utils.ts`; theme + language + tour-draft autosave already guarded).
2. **Session cookies**: `SameSite=Lax` cookies are silently dropped in the iframe → login POST returns 200 but the next `GET /api/auth/user` is 401, so the SPA boots the user to the landing page (looks like a "redirect loop"). Diagnostic signature in api logs: `POST /api/auth/login 200` immediately followed by `GET /api/auth/user 401`.

**Fix**: session cookie must be `secure: "auto"` (trust proxy is on), `sameSite: "none"`, `partitioned: true` (CHIPS; express-session ≥1.18).

**Consequences to keep in lockstep**:
- `SameSite=None` re-opens CSRF: app.ts has a same-origin guard rejecting mutating requests whose Origin host ≠ x-forwarded-host/host (no-Origin requests like curl pass). Any new mutating route is covered automatically; don't remove this middleware while the cookie is SameSite=None.
- Logout must `clearCookie` with the SAME attributes (path/secure/sameSite/partitioned) or browsers keep the stale cookie; both variants are cleared in auth routes.

**How to apply**: if login "works" in curl but the browser bounces back to the public page, suspect cookie attributes in the iframe context before touching frontend routing.
