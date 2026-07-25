# TourOps — Manual Security Testing Suite

| Field | Value |
|---|---|
| **Title** | TourOps Comprehensive Security Test Suite |
| **File Path** | `docs/qa/manual/security-testing-suite.md` |
| **Version** | 1.0 |
| **Date** | 2026-07-25 |
| **Target Tech Stack** | Node.js / Express 5, Drizzle ORM (PostgreSQL), express-session (connect-pg-simple), Zod / drizzle-zod validation, React + Vite frontend, multer file uploads, BullMQ jobs |
| **Auth Model** | Session cookies (`SameSite=None; Secure; Partitioned`) + Origin/Host CSRF guard; 19-role RBAC via `requireRole` on `user_profiles.role` |
| **Scope** | All endpoints accepting input: `POST`, `PUT`, `PATCH`, `DELETE`, and `GET` with query parameters |

---

## 1. Execution Guide / Summary for the QA Team

### Purpose
This suite defines **safe, non-destructive** manual security test cases for the TourOps API. It targets the OWASP-relevant risk classes most applicable to this stack: injection, broken access control, denial of service, and input-validation/data-integrity flaws.

### Environment & Ground Rules
- **Run against the development environment only** (`http://localhost:80` / the `.replit.dev` dev domain). Never run injection, DoS, or resource-exhaustion tests against the published/production deployment.
- Use a **cookie jar** for authenticated tests (`curl -c jar -b jar`). Authenticate via `POST /api/auth/login` with `{username, password, portal}`.
- Maintain **separate test accounts per role** (e.g. `customer1`, `content_editor1`, `hotel_manager1`, `superadmin1`) to exercise horizontal and vertical access control.
- All payloads below are **defensive / safe indicators** — designed to *prove* the control works, not to damage data. Time-based and DoS probes use small bounds (single-digit seconds, few-MB payloads). Do **not** escalate payload sizes on production.
- **Clean up** any records created during testing (or use a disposable seeded DB / restore a checkpoint afterward).

### How to Read Each Case
Each case lists: **Vulnerability**, **Target Input / Parameter**, **Testing Method / Vector**, **Sample Payload / Test Indicator (safe)**, and **Expected Safe Behavior**. A test **passes** when the system exhibits the *Expected Safe Behavior*.

### Result Codes
- ✅ **PASS** — system behaved securely (matches expected behavior).
- ❌ **FAIL** — vulnerability reproduced; log endpoint, payload, response, raise ticket immediately.
- ⚠️ **REVIEW** — ambiguous/partial; needs developer confirmation.

### Example Endpoints Referenced
- `POST /api/auth/login`, `POST /api/auth/register`
- `GET /api/tours?search=...`, `POST /api/tours`, `PATCH /api/tours/:id`
- `PATCH /api/departures/:id`, `DELETE /api/departures/:id`
- `GET /api/bookings`, `GET /api/bookings/:id`, `POST /api/bookings`
- `POST /api/master/cities/import`, `POST /api/upload` (multer image upload)
- `GET /api/hotels`, `PATCH /api/hotels/:id` (supplier-scoped)

---

## 2. Injection Flaws

### 2.1 SQL Injection (SQLi)

> **Context:** TourOps uses Drizzle ORM with parameterized queries, so raw SQLi should be structurally impossible on ORM paths. These tests confirm no endpoint concatenates user input into raw SQL (`db.execute`, `sql.raw`, dynamic `ORDER BY`).

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| SQLi — Boolean-based | `GET /api/tours?search=` and any list filter (category, price, sort) | Inject boolean tautology into query params | `search=' OR '1'='1` | Treated as a literal search string; returns 0 or normally-filtered results — **never** the full unfiltered table. No 500. |
| SQLi — Error-based | Path IDs (`/api/tours/:id`, `/api/bookings/:id`, `/api/departures/:id`) and JSON body fields | Send malformed SQL fragments in ID and string fields | `id = 1'` ; body `{"title": "x'; --"}` | 400/404 with a generic message. **No** database error text, SQL fragment, driver name, or stack trace leaked in the response. |
| SQLi — Time-based blind | Search/filter params, sort field, pagination params | Attempt injected sleep; measure response delay (keep bound tiny) | `search=';SELECT pg_sleep(3)--` | Response time unchanged (no ~3s delay). Payload treated as a literal string. |
| SQLi — Order/pagination | `sort`, `orderBy`, `limit`, `offset` query params | Inject column/SQL into sort or limit | `sort=id;DROP TABLE tours` / `limit=1e9` | Unknown sort → rejected or ignored (safe default); `limit` clamped to a sane max. No raw SQL executed. |

**Method notes:** Run each with an authenticated session where required. Compare response bodies against a clean baseline request. A change in result count for the boolean payload = ❌ FAIL.

---

### 2.2 Cross-Site Scripting (XSS)

> **Context:** React escapes rendered content by default. Risk concentrates on stored fields rendered later (tour titles/descriptions, traveler names, messages) and any use of `dangerouslySetInnerHTML`, plus AI-translated content.

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| Stored XSS | Persisted free-text: tour `title`/`description`, traveler `name`, message `body`, hotel/guide notes | Submit script payload via POST/PATCH, then load the page that renders it | `<script>window.__xss=1</script>` and `<img src=x onerror="window.__xss=1">` | Stored verbatim but rendered as inert text (HTML-escaped). `window.__xss` remains undefined; no alert/execution. |
| Reflected XSS | Query params echoed in responses/error messages (`search`, invalid-field messages) | Inject payload in a param that may be reflected | `search=<svg/onload=alert(1)>` | Reflected value is escaped/encoded; no script executes. Error messages do not echo raw HTML. |
| DOM-based XSS | Client-side routing params, `join code`, hash/query read by JS | Craft URL with payload consumed by frontend JS | `/join?code=<img src=x onerror=alert(1)>` | Frontend treats value as data; no `innerHTML` sink executes it. |
| Translated-content XSS | `translations` jsonb fields filled by AI background job | Store payload in source field, trigger translation, view public page | `<b onmouseover=alert(1)>hi</b>` | `pickPublicTranslations` output rendered escaped; no execution in any language. |

**Method notes:** Verify in the browser (payload must actually render), not just via curl. Check the response `Content-Type` for JSON endpoints is `application/json` (not `text/html`). Confirm CSP headers if present.

---

### 2.3 Command / OS Command Injection

> **Context:** Low native surface (no obvious shell-outs), but check any code path that could invoke the OS: PDF/Excel export, image processing on upload, scrapers, or filenames.

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| OS Command Injection | Upload filename, export filename params, any URL/path passed to a subprocess | Inject shell metacharacters into filenames/params | `filename = "invoice; sleep 3.pdf"` / `report$(id).xlsx` | Metacharacters neutralized/sanitized; no command executes; no response delay; file stored under a safe generated name. |
| Argument/path injection | Fields interpolated into file paths (export, upload dir) | Inject path traversal + separators | `../../etc/passwd` , `name = "a\n; whoami"` | Rejected or sanitized to a basename; writes stay inside the intended upload directory. |

---

## 3. Broken Access Control & Authorization

> **Context:** This is the highest-priority class for TourOps (multi-tenant suppliers, 19 roles, row-scoped data). Memory notes recurring holes: unfiltered GET list endpoints, PATCH resetting `createdBy`, shadowed route registrations, and subroutes defaulting to ALL_STAFF.

### 3.1 Insecure Direct Object References (IDOR)

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| IDOR — booking access | `GET /api/bookings/:id`, `booking-detail` | As `customer A`, request `customer B`'s booking ID | `GET /api/bookings/<other-users-booking-id>` | 403/404. Customer A can only read their own bookings. |
| IDOR — supplier catalog | `GET/PATCH /api/hotels/:id`, guides, sights (supplier `own_only`) | As `hotel_manager X`, read/modify `hotel_manager Y`'s record | `PATCH /api/hotels/<Y-owned-id>` | 403/404. Cross-supplier access blocked on both read and write. |
| IDOR — list leakage | `GET /api/hotels`, `/api/sights`, `/api/departures` (list endpoints) | As a scoped supplier/customer, fetch the full list | `GET /api/hotels` (no filter) | Response contains **only** rows the caller owns/may see — not the whole catalog. (Frontend filtering is not sufficient.) |
| IDOR — country scope | Country-manager endpoints | As country-manager for country A, request country B rows | `GET /api/...?country_id=B` or unfiltered list | Out-of-scope rows excluded server-side. |

### 3.2 Privilege Escalation

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| Vertical escalation — role self-promotion | `PATCH /api/user-profile`, user update body | As `customer`, attempt to set own `role` to `super_admin` | `{"role":"super_admin"}` | `role` field is not client-writable (allowlist strips it); role unchanged. |
| Vertical escalation — admin function | Admin-only routes (`POST /api/tours`, `DELETE /api/departures/:id`, user management) | Call admin route with a non-admin session | `DELETE /api/departures/:id` as `content_editor` | 403 Forbidden. `requireRole(ADMIN_ROLES)` blocks it. |
| Horizontal escalation — ownership hijack | PATCH bodies containing `createdBy`, `ownerId`, `tourId` | Attempt to reassign a record to another owner/tenant | `PATCH /api/hotels/:id {"createdBy":"<other>"}` | `createdBy`/owner fields not client-mutable; ownership unchanged. |
| Field-level escalation — content editor | `PATCH /api/tours/:id` | As `content_editor`, edit price / publish status | `{"basePrice":1,"published":true}` | Restricted fields ignored/rejected (content_editor allowlist = marketing fields only). |

### 3.3 Missing Function-Level Access Control

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| Unauthenticated access | Every mutating endpoint | Call with **no** session cookie | `curl -X POST /api/tours` (no cookie) | 401 Unauthorized. |
| Missing role check on imports | `POST /api/master/cities/import` and other `/api/master/*/import` | Call as a low-privilege authenticated user | import call as `customer` | 403. (⚠️ Known review item — imports currently gated by `isAuthenticated` only; confirm role gating.) |
| Shadowed/duplicate routes | Endpoints registered more than once (e.g. transport at `/admin/*` and `/ops/*`) | Hit both paths with an under-privileged role | duplicate path pairs | Both registrations enforce the same auth. First-registered wins in Express — verify the ungated one isn't shadowing a gated one. |
| Subroute parity | Booking/workflow subroutes (assignments, workflow steps) | Access a subroute by ID as a role restricted at the wide-read level | `GET /api/bookings/:id/workflow` | Subroute enforces the same scope as the parent, not a blanket ALL_STAFF. |

---

## 4. Availability & Denial of Service (DoS / DDoS)

> **Context:** Run only against dev with small bounds. Goal is to confirm the app rejects abusive input gracefully, not to actually take the server down.

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| App-level DoS — large payload | Any JSON body endpoint | Send an oversized JSON body (keep to a few MB) | `{"description":"A"×5_000_000}` | Request rejected with `413 Payload Too Large` (body size limit). Server stays responsive; no crash/OOM. |
| App-level DoS — deep/complex JSON | JSON body endpoints | Deeply nested or huge-array JSON | 10k-element array / 50-level nesting | Bounded parsing; rejected or handled without unbounded CPU/memory. |
| ReDoS | Fields validated by regex (email, join code, slugs, phone) | Submit pathological string against any backtracking regex | `email = "a"×50 + "!"` (long non-matching) | Validation returns quickly (<1s); no CPU spike. Response time flat regardless of input length. |
| Rate-limit bypass — header spoofing | Login and other sensitive endpoints | Repeat requests varying `X-Forwarded-For` / `X-Real-IP` | rotate `X-Forwarded-For: 1.1.1.1..N` | Rate limiting (if implemented) keys on a trusted source; spoofed headers don't reset the counter. ⚠️ If no rate limiting exists, flag as REVIEW. |
| Rate-limit bypass — IP rotation | `POST /api/auth/login` (brute force) | Rapid repeated failed logins | 20+ failed logins in a short window | Throttling / lockout / backoff after threshold; no unbounded attempt rate. (⚠️ Confirm whether implemented.) |
| Resource exhaustion — large file | `POST /api/upload` (multer) | Upload a file exceeding the size limit | 50 MB image | Rejected with a clear error; multer `limits.fileSize` enforced; disk not filled. |
| Resource exhaustion — bad file type | `POST /api/upload` | Upload disallowed MIME / disguised extension | `.php`/`.svg`/`.exe` renamed to `.jpg` | Rejected by MIME/type allowlist; not stored or executed; stored under a safe generated name outside any served/executable path. |

---

## 5. Input Validation & Data Integrity

### 5.1 Mass Assignment / HTTP Parameter Pollution

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| Mass assignment — protected fields | Any PATCH/POST that persists a body (`/api/departures/:id`, `/api/tours/:id`, profile) | Add fields not exposed in the UI | `PATCH /api/departures/:id {"capacityBooked":999,"tourId":"x","id":"y"}` | System-managed fields ignored via server-side allowlist. `capacityBooked`, `tourId`, `id`, audit fields unchanged. (departures already hardened — use as reference.) |
| Mass assignment — audit fields | Create/update bodies | Attempt to set `createdAt`, `createdBy`, `updatedAt` | `{"createdBy":"<other>","createdAt":"2000-01-01"}` | Server sets these; client values discarded. |
| HTTP Parameter Pollution | Query params & body keys | Send a param twice / mix query+body | `?role=customer&role=super_admin` | Deterministic, safe handling (first/last consistently); no privilege from duplication. |

### 5.2 Business Logic Flaws

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| Negative / zero values | `pricePerPerson`, `capacityTotal`, traveler count, payment amount | Submit negative or zero where positive required | `{"pricePerPerson":-100,"capacityTotal":0}` | 400 validation error; negatives rejected. No negative prices or zero-capacity bookable departures. |
| Boundary / overflow | Numeric and length fields | Submit extreme values | `capacityTotal = 2^53`, 100k-char title | Clamped/rejected by schema bounds; no overflow or truncation corruption. |
| Booking over capacity | Booking creation against a departure | Book more seats than `capacityTotal - capacityBooked` | book 999 seats on a 10-seat departure | Rejected; capacity enforced server-side, not just in UI. |
| Delete with dependencies | `DELETE /api/departures/:id` | Delete a departure that has linked bookings | delete a booked departure | `409 Conflict` with a clear message; no orphaned bookings. (Already implemented — reference behavior.) |
| Price/promo tampering | Booking price, join-code price | Attempt to set an arbitrary price on a booking | `{"totalPrice":1}` | Price derived server-side from tour/departure; client-supplied price ignored. |
| Status transition abuse | `status` fields (departure/booking/payment) | Set an invalid or out-of-order status | `{"status":"paid"}` on unpaid / `{"status":"banana"}` | Only enum-valid, workflow-valid transitions accepted; invalid → 400. |

### 5.3 Server-Side Request Forgery (SSRF)

> **Context:** Check any endpoint that fetches a URL server-side — image-by-URL imports, scrapers, webhook targets, AI enrichment that follows links.

| Vulnerability | Target Input / Parameter | Testing Method / Vector | Sample Payload / Test Indicator (Safe) | Expected Safe Behavior |
|---|---|---|---|---|
| SSRF — internal metadata | Any URL/webhook/import-by-URL param | Point URL at cloud metadata / localhost | `http://169.254.169.254/latest/meta-data/` , `http://localhost:80/api/...` | Request blocked; internal/loopback/link-local ranges denied by allowlist. No internal data returned. |
| SSRF — private ranges | Image/scraper URL params | Point at RFC1918 addresses | `http://10.0.0.1/` , `http://192.168.0.1/` | Rejected before any fetch; private ranges disallowed. |
| SSRF — scheme abuse | URL params | Non-HTTP schemes | `file:///etc/passwd` , `gopher://...` | Only `http(s)` allowed; other schemes rejected. |
| SSRF — redirect bypass | URL params | Public URL that 302-redirects to internal | public → `http://169.254.169.254` | Redirects re-validated against the allowlist; internal redirect target blocked. |

---

## 6. Cross-Cutting Checks (Session / CSRF / Headers)

| Check | Method | Expected Safe Behavior |
|---|---|---|
| CSRF guard | Send a mutating request with a foreign/absent `Origin`/`Referer` | Rejected by the Origin/Host guard on state-changing methods. |
| Session cookie flags | Inspect `Set-Cookie` on login | `HttpOnly`, `Secure`, `SameSite=None`, `Partitioned` present. |
| Session fixation | Compare session ID before vs. after login | Session ID rotates on authentication. |
| Error leakage | Trigger 500s across endpoints | Generic error messages only — no stack traces, SQL, file paths, or dependency versions leaked. |
| Sensitive data in responses | Inspect user/profile/booking payloads | No password hashes, session secrets, or other users' PII returned. |

---

## 7. Test Execution Log Template

| # | Case ID | Endpoint | Payload | Result (✅/❌/⚠️) | Notes / Ticket |
|---|---|---|---|---|---|
| 1 | SQLi-Bool | `GET /api/tours?search=` | `' OR '1'='1` | | |
| 2 | XSS-Stored | `POST /api/tours` | `<script>…` | | |
| 3 | IDOR-Booking | `GET /api/bookings/:id` | other user's id | | |
| 4 | PrivEsc-Role | `PATCH /api/user-profile` | `{"role":"super_admin"}` | | |
| 5 | MassAssign | `PATCH /api/departures/:id` | `{"capacityBooked":999}` | | |
| 6 | DoS-Upload | `POST /api/upload` | 50MB file | | |
| 7 | SSRF-Meta | URL param | `169.254.169.254` | | |
| … | | | | | |

> On any ❌ FAIL: record the exact request/response, stop escalation, and file a ticket referencing the case ID. Re-test after the fix is merged.
