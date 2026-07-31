# Suppliers & Supply Chain — Findings

_QA sweep date: 2026-07-31. Roles tested via authenticated API. Severity: Critical/High/Medium/Low/Info._

---

## F-01 — Invalid rate-card price returns 500 and leaks the SQL statement; negative prices accepted
- **Severity:** Medium · **Priority:** High
- **Component:** Rate cards (all five: hotel/transport/guide/sights/airline)
- **Role:** any rate-manager role (e.g. `guide_manager`)
- **Endpoint/Page:** `POST /api/rates/{guide|hotel|sights|airline|transport}`, `admin/rate-cards.tsx`
- **Description:** Drizzle `numeric()` money columns are typed as plain `string` in the insert schema, and drizzle-zod did not validate numeric-parseability. Submitting `price: "abc"` passed validation and failed at the database, returning HTTP 500 whose body contained the raw SQL column list and bound parameters (information disclosure). Submitting `price: "-5"` was accepted and stored as a negative value.
- **Steps to Reproduce:**
  1. Log in as `guidemanager1` (staff portal).
  2. `POST /api/rates/guide` with `{"guideName":"x","price":"abc"}` → previously 500 with SQL in the message.
  3. `POST` again with `price:"-5"` → previously 200, stored `-5`.
- **Expected Result:** 400 with a validation message; no negative prices; no internal SQL exposed.
- **Actual Result (pre-fix):** 500 leaking SQL for `"abc"`; 200 storing `-5`.
- **Business/Security Impact:** Information disclosure of DB schema/params; corrupt pricing data that could flow into quotes/bookings.
- **Root Cause:** `createInsertSchema` maps `numeric()` → `z.string()` with no numeric refinement; generic `catch` returns `e.message` verbatim.
- **Recommendation:** Validate money fields as non-negative numeric strings in the insert schemas (applied). Consider a global 500 handler that does not echo `e.message`.
- **Retest Status:** ✅ **Fixed & verified** — `"abc"`→400, `"-5"`→400, `"150.50"`→200, null→200. Fix in `lib/db/src/schema/schema.ts` (`optionalMoneyString` applied to the five rate insert schemas).

---

## F-02 — Simulated airline pricing is non-deterministic for identical inputs
- **Severity:** Low · **Priority:** Low
- **Component:** Airline flight search (`src/lib/airline.ts`)
- **Role:** `flight_agent`, `airline_supplier`, admin, `country_manager`
- **Endpoint/Page:** `GET /api/flights/search`
- **Description:** Two identical searches (`CGK→DPS`, same date/pax/cabin) returned different first-flight prices (1222 then 1286). Root cause is an intentional ±10% random jitter (`0.9 + Math.random()*0.2`) plus randomized `seatsAvailable`.
- **Steps to Reproduce:** Call the same search URL twice; compare prices.
- **Expected Result (per QA spec):** Identical inputs → identical pricing.
- **Actual Result:** Prices vary per request.
- **Business/Security Impact:** Low — a customer refreshing a quote could see a different fare; acceptable for a simulation but confusing if surfaced in binding quotes.
- **Root Cause:** Deliberate randomization in the simulation.
- **Recommendation:** If deterministic pricing is required, seed the RNG from `(origin,destination,date,cabin)` so identical inputs are stable while still looking varied across routes. **No code change made** — flagged as a product decision.
- **Retest Status:** Open (by design).

---

## F-03 — All-disallowed catalog/tour PATCH returns 500 "No values to set" instead of a clean no-op
- **Severity:** Low · **Priority:** Low
- **Component:** Tours (and any allowlist-filtered PATCH)
- **Role:** `content_editor`
- **Endpoint/Page:** `PATCH /api/tours/:id`
- **Description:** When a `content_editor` sends only fields the allowlist strips (`basePrice`, `isPublished`), the resulting update has no columns and the DB throws → HTTP 500 `"No values to set"`. The **security control is correct** (price/publish are stripped — positive result, aligns with the existing "content editors can't change tour prices" rule), but the empty-update case should be a graceful 200/400.
- **Steps to Reproduce:** As `contenteditor1`, `PATCH /api/tours/:id` `{"basePrice":"1","isPublished":true}`.
- **Expected Result:** 200 no-op or 400 "no editable fields".
- **Actual Result:** 500 "No values to set".
- **Business/Security Impact:** None security-wise; poor UX / noisy errors.
- **Root Cause:** No guard for the empty post-allowlist update object.
- **Recommendation:** Return early when the sanitized update is empty. **Not changed** in this sweep (out of the rate-card fix scope).
- **Retest Status:** Open (low priority).

---

## Verified secure / no-issue (regression pass)
- **Cross-portal isolation:** staff via `customer` portal, customer via `staff`/`admin` portal → all 403.
- **Catalog & rate-card role gating:** customers 403 everywhere; each supplier role only reaches its own rate endpoint (guide↔guide, airline↔airline, etc.).
- **Ownership scoping:** `hotel_manager` GET `/api/hotels` returns only own rows (0 of 19 admin-seeded); guide rates own_only.
- **Transport authorization parity:** `/admin/transport` and `/ops/transport` hit the same `/api/transport/*` API; content_editor/tour_leader/support/customer all 403 on GET and writes despite `isAuthenticated`-only middleware (role enforced in-handler).
- **Direct API access / privilege escalation:** customer POST to transport routes → 403; content_editor POST bus-types → 403.
- **Flight search validation:** missing `date` → 400; unauthorized roles → 403.
