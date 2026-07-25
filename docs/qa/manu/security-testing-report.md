# TourOps — Security Testing Execution Report

| Field | Value |
|---|---|
| **Source of Truth** | `docs/qa/manu/security-testing-suite.md` |
| **Environment** | Development (`http://localhost:80`) — API Server + tourops web |
| **Date Executed** | 2026-07-25 |
| **Executed By** | Senior Security QA (automated `curl` battery against live API) |
| **Auth Model Under Test** | Session cookies + Origin/Host CSRF guard; 19-role RBAC (`user_profiles.role`) |
| **Accounts Used** | `superadmin1` (admin), `customer1` (customer), `contenteditor1`, `hotelmanager1`, `tourbuilder1`, `sightsmanager1`, `supportagent1`, `accounting1` (staff) — all password `password123` |

> Progress note: All test cases below were executed. Reports were written after the full battery completed. Findings detail is in `security-findings.md`; roll-up is in `security-summary.md`.

---

## 1. Injection Flaws

### TC-INJ-01 — SQL Injection (Boolean-based)
- **Objective:** Confirm boolean SQLi in list/search parameters cannot alter query results.
- **Status:** ✅ Passed (Not Applicable surface)
- **Steps Performed:** `GET /api/tours?search=' OR '1'='1` as `superadmin1`; compared to baseline `GET /api/tours` and to `?search=zzznomatch` / `?search=Egypt`.
- **Expected Result:** Payload treated as literal; no full-table dump via injection.
- **Actual Result:** All variants returned the identical full list (11). Code review confirms `/api/tours` ignores `search` entirely and calls `storage.getAllTours()` (Drizzle parameterized). No user input reaches SQL. Filtering is client-side.
- **Evidence:** `search=' OR '1'='1` → 200, count 11; `search=zzznomatch` → 11; `search=Egypt` → 11 (param has no server effect).
- **Severity:** Informational
- **Recommendation:** None for injection. Optional: implement server-side search so the param is functional (not a security issue).

### TC-INJ-02 — SQL Injection (Error-based)
- **Objective:** Ensure malformed SQL fragments in path IDs don't leak DB errors.
- **Status:** ✅ Passed
- **Steps Performed:** `GET /api/tours/1'` as `superadmin1`.
- **Expected Result:** Generic 400/404, no SQL/driver error text.
- **Actual Result:** `404 {"message":"Tour not found"}`. No DB error leaked.
- **Evidence:** Response body `{"message":"Tour not found"}` `[404]`.
- **Severity:** Informational
- **Recommendation:** None.

### TC-INJ-03 — SQL Injection (Time-based blind)
- **Objective:** Confirm injected `pg_sleep` has no effect on response timing.
- **Status:** ✅ Passed
- **Steps Performed:** `GET /api/tours?search=';SELECT pg_sleep(3)--`; measured elapsed time.
- **Expected Result:** No ~3s delay.
- **Actual Result:** Response in **16 ms**. No delay; payload never executed.
- **Evidence:** `elapsed_ms=16`.
- **Severity:** Informational
- **Recommendation:** None.

### TC-INJ-04 — Stored XSS
- **Objective:** Verify script payloads persisted in tour fields are not executed.
- **Status:** ✅ Passed (with related upload note — see F-04)
- **Steps Performed:** `POST /api/tours` as `tourbuilder1` with `title=<script>window.__xss=1</script>` and `description=<img src=x onerror=alert(1)>`.
- **Expected Result:** Stored as inert text; escaped on render (React default).
- **Actual Result:** Stored verbatim in DB. React auto-escapes on render (no `dangerouslySetInnerHTML` on these fields), so it renders as inert text. No execution. Test record deleted afterward.
- **Evidence:** Created tour returned raw payload in `title`/`description`; cleanup delete `200`.
- **Severity:** Informational
- **Recommendation:** Keep relying on React escaping; never introduce `dangerouslySetInnerHTML` for these fields. See F-04 for the SVG-upload angle.

### TC-INJ-05 — Reflected / DOM XSS
- **Objective:** Confirm query params echoed in errors are encoded.
- **Status:** ✅ Passed
- **Steps Performed:** Injected `<svg/onload=alert(1)>` in `search`; inspected JSON responses (`Content-Type: application/json`).
- **Expected Result:** No HTML reflection into an HTML context.
- **Actual Result:** API responses are JSON; params are not reflected into HTML. No execution.
- **Severity:** Informational
- **Recommendation:** None.

### TC-INJ-06 — Command / OS Injection
- **Objective:** Identify OS command execution surface.
- **Status:** ⚪ Not Applicable
- **Steps Performed:** Source review of `lib/scrapers.ts`, `lib/ai.ts`, routes for `child_process`/shell-outs; upload filename handling.
- **Actual Result:** No shell execution of user input found. Upload filenames are regenerated server-side (`Date.now()-rand`), not passed to a shell.
- **Severity:** Informational
- **Recommendation:** Re-test if any PDF/Excel/scraper feature later shells out.

---

## 2. Broken Access Control & Authorization

### TC-AC-01 — Unauthenticated access to mutating endpoints
- **Objective:** All state-changing endpoints require a session.
- **Status:** ✅ Passed
- **Steps Performed:** No-cookie `POST /api/tours`, `GET /api/bookings`, `DELETE /api/departures/:id`.
- **Actual Result:** `401`, `401`, `401`.
- **Severity:** Informational
- **Recommendation:** None.

### TC-AC-02 — Vertical privilege escalation (customer → admin actions)
- **Objective:** Low-privilege roles cannot invoke admin/staff functions.
- **Status:** ✅ Passed
- **Steps Performed:** As `customer1`: `POST /api/tours`, `GET /api/bookings`, `GET /api/admin/analytics`, `POST /api/admin/users {role:super_admin}`. As `contenteditor1`: `POST /api/tours` (requires tour_builder).
- **Actual Result:** `403` on all five.
- **Severity:** Informational
- **Recommendation:** None.

### TC-AC-03 — Role self-promotion (mass-assignment on profile)
- **Objective:** A customer cannot elevate their own role.
- **Status:** ✅ Passed
- **Steps Performed:** As `customer1`: `PATCH /api/user-profiles/:id {"role":"super_admin"}`.
- **Actual Result:** `403`. Role remained `customer`.
- **Severity:** Informational
- **Recommendation:** None.

### TC-AC-04 — IDOR: booking access
- **Objective:** A customer cannot read another party's booking.
- **Status:** ✅ Passed
- **Steps Performed:** As `customer1`: `GET /api/bookings/:id` and `GET /api/my-bookings/:id` for a booking owned by another user (id from admin list).
- **Actual Result:** `403` on both.
- **Severity:** Informational
- **Recommendation:** None.

### TC-AC-05 — IDOR: cross-owner supplier catalog (hotel_manager)
- **Objective:** A hotel_manager cannot read/edit/delete hotels it does not own.
- **Status:** ✅ Passed
- **Steps Performed:** Created a superadmin-owned hotel; as `hotelmanager1`: `PATCH`, `DELETE`, and `GET /api/hotels` list.
- **Actual Result:** `PATCH` → `403`, `DELETE` → `403`, list did not include the SA-owned hotel (`sees_SA_hotel=false`).
- **Severity:** Informational
- **Recommendation:** None. Good example of server-side row scoping (not just client filtering).

### TC-AC-06 — Self-approval via payload (hotel_manager)
- **Objective:** A hotel_manager cannot self-approve a hotel by smuggling `status`.
- **Status:** ✅ Passed
- **Steps Performed:** As `hotelmanager1`: `POST /api/hotels {status:"approved"}`.
- **Actual Result:** Stored as `status:"draft"` (server forces draft). Approval is admin-only.
- **Severity:** Informational
- **Recommendation:** None.

### TC-AC-07 — Missing function-level control on imports
- **Objective:** Bulk import routes must be role-gated, not just authenticated.
- **Status:** ✅ Passed
- **Steps Performed:** As `contenteditor1`: `POST /api/master/cities/import`.
- **Actual Result:** `403`. Code review confirms `requireRole(["super_admin","admin"])`. (This resolves the prior "needs review" concern from the feature inventory.)
- **Severity:** Informational
- **Recommendation:** Apply the same explicit gate to any newly added `/import` routes.

---

## 3. Availability & Denial of Service

### TC-DOS-01 — Application-level DoS (large payload)
- **Objective:** Oversized bodies are rejected before processing.
- **Status:** ✅ Passed
- **Steps Performed:** `POST /api/tours` with a ~6 MB JSON body as `superadmin1`.
- **Actual Result:** `413 Payload Too Large`. Server stayed responsive.
- **Severity:** Informational
- **Recommendation:** None.

### TC-DOS-02 — Resource exhaustion (file upload)
- **Objective:** Upload size and type are bounded.
- **Status:** ✅ Passed (with note F-04)
- **Steps Performed:** Source review of multer config (`/api/upload`).
- **Actual Result:** `limits.fileSize = 10 MB`; `fileFilter` rejects non-`image/*` MIME; filenames server-generated. See F-04 for the SVG/extension nuance.
- **Severity:** Low (see F-04)
- **Recommendation:** Add an explicit extension allowlist and block `image/svg+xml`.

### TC-DOS-03 — Rate-limit bypass / brute force (login)
- **Objective:** Repeated failed logins should be throttled.
- **Status:** ❌ Failed
- **Steps Performed:** 12 consecutive `POST /api/auth/login` with a wrong password for `superadmin1`.
- **Expected Result:** Throttling / lockout / backoff after a threshold.
- **Actual Result:** All 12 returned `401` with no delay, lockout, or CAPTCHA. **No rate limiting present.**
- **Evidence:** codes `401 401 401 401 401 401 401 401 401 401 401 401`.
- **Severity:** Medium → see **F-03**.
- **Recommendation:** Add per-IP + per-account rate limiting / exponential backoff on auth endpoints.

### TC-DOS-04 — ReDoS
- **Objective:** Regex validators don't catastrophically backtrack.
- **Status:** ⚪ Not Applicable
- **Steps Performed:** Reviewed validation — Zod schemas; no custom user-facing backtracking regex identified on hot paths.
- **Actual Result:** No vulnerable regex found.
- **Severity:** Informational
- **Recommendation:** Re-test if custom regex validators are added.

---

## 4. Input Validation & Data Integrity

### TC-IV-01 — Mass Assignment (protected fields)
- **Objective:** System-managed fields cannot be set via request body.
- **Status:** ✅ Passed
- **Steps Performed:** `PATCH /api/departures/:id {"capacityBooked":999,"tourId":"HACKED","id":"HACKED","pricePerPerson":777}` as `superadmin1`.
- **Expected Result:** Only allowlisted fields change.
- **Actual Result:** Response: `tourId` unchanged, `id` unchanged, `capacityBooked=0` unchanged; only `pricePerPerson` updated to 777.
- **Evidence:** Raw response confirmed original `tourId`/`id`, `capacityBooked:0`.
- **Severity:** Informational
- **Recommendation:** Keep the allowlist pattern; extend to any endpoint still passing raw `req.body` (see F-05).

### TC-IV-02 — Business logic: negative / zero values
- **Objective:** Negative price / capacity must be rejected.
- **Status:** ❌ Failed
- **Steps Performed:** `POST /api/departures {capacityTotal:-5, pricePerPerson:-100}` as `superadmin1`.
- **Expected Result:** `400` validation error.
- **Actual Result:** `200 OK` — departure created with negative capacity and negative price. Record deleted after test.
- **Evidence:** POST returned `200`; the negative departure was found and deleted during cleanup.
- **Severity:** Medium → see **F-02**.
- **Recommendation:** Add `.nonnegative()`/`.positive()` bounds to numeric fields in the insert/patch schemas.

### TC-IV-03 — Type validation / error leakage
- **Objective:** Bad types rejected with a safe message; no stack traces.
- **Status:** ❌ Failed (partial)
- **Steps Performed:** (a) `POST /api/departures {tourId:123, capacityTotal:"abc"}`; (b) malformed JSON body `{bad json` to `/api/auth/login`.
- **Expected Result:** `400` with a generic message; no internal paths/stack.
- **Actual Result:** (a) `400` Zod error — safe but verbose (exposes schema field names, minor). (b) **Malformed JSON returned an HTML page containing a full stack trace with absolute server file paths** (`/home/runner/workspace/node...`).
- **Evidence:** (b) `<pre>SyntaxError: Expected property name ... at JSON.parse ... /home/runner/workspace/node...`.
- **Severity:** Medium → see **F-01** (stack trace); Low → see **F-06** (verbose Zod).
- **Recommendation:** Add a global error handler that returns generic JSON errors and suppresses stack traces outside development.

### TC-IV-04 — CSRF (cross-origin mutation)
- **Objective:** State-changing requests from a foreign Origin are blocked.
- **Status:** ✅ Passed
- **Steps Performed:** `POST /api/tours` with valid session cookie + `Origin: https://evil.example.com`.
- **Actual Result:** `403` (Origin/Host CSRF guard).
- **Severity:** Informational
- **Recommendation:** None.

### TC-IV-05 — SSRF
- **Objective:** Identify server-side URL fetch surface from user input.
- **Status:** ⚪ Not Applicable
- **Steps Performed:** Source review — scrapers are simulated (no real outbound fetch of user-supplied URLs); no webhook/import-by-URL endpoint accepts an arbitrary URL to fetch server-side.
- **Actual Result:** No exploitable SSRF surface currently.
- **Severity:** Informational
- **Recommendation:** If real scrapers or image-by-URL import are implemented, add an allowlist blocking loopback/link-local/private ranges and non-http(s) schemes.

---

## 5. Cross-Cutting Checks

### TC-CC-01 — Session cookie flags
- **Objective:** Cookie hardened with HttpOnly/Secure/SameSite/Partitioned.
- **Status:** ⚠️ Needs Review
- **Steps Performed:** Inspected `Set-Cookie` on login over plain HTTP.
- **Actual Result:** `HttpOnly; Partitioned; SameSite=None` present. `Secure` **absent over HTTP** because session uses `secure:"auto"`. `trust proxy` is set to `1`, so `Secure` is applied when the request is HTTPS (i.e. in production behind the Replit proxy).
- **Evidence:** `Set-Cookie: connect.sid=...; HttpOnly; Partitioned; SameSite=None`.
- **Severity:** Informational → see **F-05**.
- **Recommendation:** Verify in the deployed environment that `Secure` is present; the app-login cookie in `auth/routes.ts` already sets `secure:true` explicitly.

### TC-CC-02 — Error message leakage (global)
- **Objective:** No stack traces or internal paths in error responses.
- **Status:** ❌ Failed
- **Actual Result:** See TC-IV-03(b) / **F-01** — malformed body yields an HTML stack trace with server file paths.
- **Severity:** Medium
- **Recommendation:** Global JSON error handler; disable Express verbose error page.

### TC-CC-03 — Session fixation
- **Objective:** Session ID rotates on login.
- **Status:** ⚠️ Needs Review
- **Steps Performed:** Not fully isolated in this run (login flow issues a fresh `connect.sid`).
- **Actual Result:** New `connect.sid` observed on login; explicit pre/post-fixation comparison recommended as a follow-up.
- **Severity:** Informational
- **Recommendation:** Confirm `req.session.regenerate()` on authentication.

---

## Execution Log Summary

| Test ID | Name | Status |
|---|---|---|
| TC-INJ-01 | SQLi Boolean | ✅ Passed |
| TC-INJ-02 | SQLi Error-based | ✅ Passed |
| TC-INJ-03 | SQLi Time-based | ✅ Passed |
| TC-INJ-04 | Stored XSS | ✅ Passed |
| TC-INJ-05 | Reflected/DOM XSS | ✅ Passed |
| TC-INJ-06 | Command Injection | ⚪ N/A |
| TC-AC-01 | Unauth access | ✅ Passed |
| TC-AC-02 | Vertical priv-esc | ✅ Passed |
| TC-AC-03 | Role self-promotion | ✅ Passed |
| TC-AC-04 | IDOR booking | ✅ Passed |
| TC-AC-05 | IDOR cross-owner hotel | ✅ Passed |
| TC-AC-06 | Self-approve payload | ✅ Passed |
| TC-AC-07 | Import function-level control | ✅ Passed |
| TC-DOS-01 | Large payload | ✅ Passed |
| TC-DOS-02 | Upload limits | ✅ Passed (note F-04) |
| TC-DOS-03 | Login brute force | ❌ Failed (F-03) |
| TC-DOS-04 | ReDoS | ⚪ N/A |
| TC-IV-01 | Mass assignment | ✅ Passed |
| TC-IV-02 | Negative/zero values | ❌ Failed (F-02) |
| TC-IV-03 | Type validation / error leak | ❌ Failed (F-01, F-06) |
| TC-IV-04 | CSRF cross-origin | ✅ Passed |
| TC-IV-05 | SSRF | ⚪ N/A |
| TC-CC-01 | Cookie flags | ⚠️ Review (F-05) |
| TC-CC-02 | Error leakage | ❌ Failed (F-01) |
| TC-CC-03 | Session fixation | ⚠️ Review |
