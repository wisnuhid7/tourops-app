# TourOps — Security Findings

Date: 2026-07-25 · Environment: Development · Source suite: `docs/qa/manu/security-testing-suite.md`

Ordered by severity. Retest status is **Open** unless noted.

---

## F-01 — Stack trace / internal path disclosure on malformed request body
- **Severity:** Medium
- **Affected Component:** Global Express error handling (body-parser JSON parse errors) — reproduced via `POST /api/auth/login`, applies to any JSON endpoint.
- **Risk Description:** A malformed JSON body triggers Express's default HTML error page, which includes the full stack trace and absolute server file paths (`/home/runner/workspace/node_modules/...`). This leaks framework versions, directory structure, and dependency internals that aid an attacker in fingerprinting and targeting known CVEs.
- **Reproduction Steps:**
  1. `curl -X POST http://localhost:80/api/auth/login -H "Content-Type: application/json" -d '{bad json'`
  2. Observe an HTML response containing `SyntaxError ... at JSON.parse ... /home/runner/workspace/node...`.
- **Impact:** Information disclosure; reconnaissance aid. Not directly exploitable but lowers the bar for further attacks.
- **Root Cause:** No global error-handling middleware; Express falls back to its default development error page. Body-parser `SyntaxError` is not caught and normalized.
- **Suggested Fix:** Add a terminal error-handling middleware `(err, req, res, next)` that returns `res.status(err.status||500).json({ message: "..." })`, special-casing body-parser `SyntaxError` → `400 {"message":"Invalid JSON body"}`. Never send stack traces when `NODE_ENV==="production"`.
- **Retest Status:** ✅ Fixed & Retested (2026-07-25) — global error handler added in `app.ts`. Malformed JSON now returns `{"message":"Invalid JSON body"}` (400) with no stack trace.

## F-02 — Missing non-negative validation on departure price & capacity
- **Severity:** Medium
- **Affected Component:** `POST /api/departures` (and likely other numeric create/patch schemas).
- **Risk Description:** A departure can be created with `capacityTotal:-5` and `pricePerPerson:-100`; the API returns `200`. Negative prices/capacity corrupt pricing math and inventory logic (e.g. a negative price could translate to a credit, negative capacity breaks seat-availability checks).
- **Reproduction Steps:**
  1. Authenticate as an admin role.
  2. `POST /api/departures` with `{tourId, startDate, endDate, capacityTotal:-5, pricePerPerson:-100, status:"open"}`.
  3. Observe `200 OK` and a persisted record with negative values.
- **Impact:** Business-logic/data-integrity flaw; potential financial impact if negative prices flow into bookings.
- **Root Cause:** Insert/patch validation schema does not enforce numeric lower bounds.
- **Suggested Fix:** Add `.nonnegative()` (capacity) / `.positive()` (price, capacity ≥ 1) constraints in the departure Zod schema, and audit tours, rates, bookings, and payments for the same gap.
- **Retest Status:** ✅ Fixed & Retested (2026-07-25) — `capacityTotal ≥ 1`, `capacityBooked ≥ 0`, `pricePerPerson ≥ 0` enforced in the insert schema. Negative values now return 400; positive values unaffected. (Residual: audit tours/rates/bookings/payments schemas for the same pattern.)

## F-03 — No rate limiting / brute-force protection on authentication
- **Severity:** Medium
- **Affected Component:** `POST /api/auth/login` (and by extension all auth/sensitive endpoints).
- **Risk Description:** 12 consecutive failed logins for the same account all returned `401` with no throttling, lockout, backoff, or CAPTCHA. This allows unlimited-rate credential brute forcing / password spraying.
- **Reproduction Steps:**
  1. Loop `POST /api/auth/login` with a wrong password 12+ times.
  2. Observe every response is `401` with no added latency or lockout.
- **Impact:** Enables online brute force and credential stuffing against all accounts (including `super_admin`).
- **Root Cause:** No rate-limiting middleware on auth routes.
- **Suggested Fix:** Add per-IP and per-account rate limiting (e.g. `express-rate-limit`) with exponential backoff / temporary lockout after N failures. Consider CAPTCHA after repeated failures. Ensure the limiter keys on a trusted client identifier (behind `trust proxy`), not spoofable headers.
- **Retest Status:** ✅ Fixed & Retested (2026-07-25) — `express-rate-limit` applied to `/api/auth/login` and `/api/auth/register`: 10 failed attempts per IP per 15 min, keyed on `req.ip` (trust proxy), successful logins excluded. Verified 429 after the 10th failed attempt.

## F-04 — Image upload allows SVG and derives extension from user filename
- **Severity:** Low
- **Affected Component:** `POST /api/upload` (multer config) + static serving of `/uploads/images`.
- **Risk Description:** The `fileFilter` accepts any `image/*` MIME, which includes `image/svg+xml`. SVG files can embed `<script>`; if served inline and opened directly, they can execute script in the app's origin (stored XSS vector). The stored filename keeps the original extension (`path.extname(originalname)`), so the extension is attacker-influenced even though the basename is randomized.
- **Reproduction Steps:**
  1. Upload an `.svg` containing a script with `Content-Type: image/svg+xml`.
  2. It passes the `image/*` filter and is stored under `/uploads/images/<ts>-<rand>.svg`.
  3. Navigate directly to that URL.
- **Impact:** Potential stored XSS / content-type confusion if SVGs are served inline.
- **Root Cause:** MIME-prefix-only allowlist; no explicit extension allowlist; no `Content-Disposition`/`Content-Security-Policy` on served uploads.
- **Suggested Fix:** Restrict to a concrete allowlist (`png/jpeg/webp/gif`), block `svg`, derive the stored extension from the validated MIME (not the user filename), and serve uploads with `Content-Disposition: attachment` or a restrictive CSP. Validate magic bytes, not just the client MIME header.
- **Retest Status:** ✅ Fixed & Retested (2026-07-25) — multer now uses an explicit MIME→extension allowlist (`png/jpeg/webp/gif`), excludes SVG, and derives the stored extension from the validated MIME (not the user filename). Verified: PNG accepted, SVG rejected, MIME-spoofed `.php` stored safely as `.png`. Residual hardening (not yet done): magic-byte validation and `Content-Disposition`/CSP on served uploads; rejected uploads currently return 500 instead of 400.

## F-05 — Session cookie `Secure` relies on `secure:"auto"`
- **Severity:** Informational
- **Affected Component:** Session cookie config (`replitAuth.ts`, `secure:"auto"`).
- **Risk Description:** Over plain HTTP the session cookie is issued without the `Secure` flag (`SameSite=None` without `Secure` is technically non-compliant and rejected by modern browsers). `trust proxy` is set to `1`, so behind the HTTPS proxy in production `Secure` should be applied — but this depends on the proxy correctly forwarding `X-Forwarded-Proto`.
- **Reproduction Steps:** Inspect `Set-Cookie` on login over `http://localhost:80` → `HttpOnly; Partitioned; SameSite=None` (no `Secure`).
- **Impact:** Low in production (HTTPS + trust proxy). Would be significant only if the app were ever served over plain HTTP.
- **Root Cause:** `secure:"auto"` defers the flag to per-request protocol detection.
- **Suggested Fix:** Confirm the deployed cookie carries `Secure` (capture `Set-Cookie` in production). Optionally force `secure:true` in production config for defense in depth.
- **Retest Status:** Open (verify in prod)

## F-06 — Verbose validation errors expose schema internals
- **Severity:** Low / Informational
- **Affected Component:** Endpoints returning raw Zod `error.message` (e.g. `POST /api/departures`, `POST /api/hotels`).
- **Risk Description:** Validation failures return the full Zod issue array including internal field paths and expected types. This is minor information disclosure and produces noisy client errors.
- **Reproduction Steps:** `POST /api/departures {"tourId":123,"capacityTotal":"abc"}` → `400` with a JSON-stringified Zod issue list.
- **Impact:** Minor reconnaissance aid; poor client UX.
- **Root Cause:** Passing `parsed.error.message` straight to the response.
- **Suggested Fix:** Map Zod errors to a concise, field-keyed message shape and avoid leaking internal type expectations verbatim.
- **Retest Status:** Open

---

## Positive Controls Confirmed (no action needed)
- Parameterized queries (Drizzle) — no SQLi surface (boolean/error/time-based all safe).
- Row-scoped supplier isolation on hotels — read, write, delete, and list all enforce ownership server-side.
- Mass-assignment allowlists on departures (and hotels forcing `status:draft`, stripping `createdBy`).
- RBAC via `requireRole` — vertical and function-level access control held on every tested endpoint, including bulk `/import` routes.
- IDOR on bookings — customers cannot access others' bookings.
- CSRF Origin/Host guard — cross-origin mutation blocked (`403`).
- Body size limit — ~6 MB body rejected with `413`.
- Upload size (10 MB) and image MIME filter present.
