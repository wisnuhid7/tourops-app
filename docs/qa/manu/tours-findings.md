# Tours & Itinerary — Findings

**Date:** 2026-07-25
**Assessment:** Functional, pricing, AI, itinerary, API, and security testing of Tours & Itinerary.

Summary: **0 Critical, 0 High, 3 Medium, 3 Low.** Core flows (draft-hiding, starting-from
pricing, itinerary CRUD, browse/detail, role-gating, XSS-safety) passed. The open items are
data-integrity validation gaps on tour pricing and AI input handling.

---

## TOUR-01 — Negative prices accepted on the tours table

- **Severity:** Medium
- **Priority:** Medium
- **Component:** `insertTourSchema` (tours) / `POST /api/tours`, `PATCH /api/tours/:id`, `PUT /api/tours/:id/full`
- **Endpoint/Page:** `POST /api/tours`
- **Description:** The non-negative price guard added for departures (finding F-02) was never
  applied to the `tours` table. `insertTourSchema` accepts negative `basePrice`, `childPrice`,
  `markupAmount`, `totalPrice`, and `singleSupplement`.
- **Steps to reproduce:** As admin, `POST /api/tours` with `basePrice:"-500"`.
- **Expected result:** `400` — prices must be `≥ 0`.
- **Actual result:** `200` — tour created with `basePrice = -500`.
- **Business impact:** Corrupt "Starting From" values, negative order totals, and refund/credit
  abuse if a negative-priced tour reaches booking.
- **Root cause:** `insertTourSchema = createInsertSchema(tours).omit(...)` has no `.refine`/`min` guards.
- **Recommendation:** Add non-negative constraints to the tour insert schema for all price fields
  (mirroring `insertTourDepartureSchema`).
- **Retest status:** Fixed & retested 2026-07-27 — insert schema rejects negative prices (400); PATCH route validates merged price fields

---

## TOUR-02 — Child price can exceed adult price at the data layer

- **Severity:** Medium
- **Priority:** Medium
- **Component:** `insertTourSchema` / tour pricing
- **Endpoint/Page:** `POST /api/tours`, Tour Detail / Brochure
- **Description:** The rule "child pricing never exceeds adult pricing" is enforced only in the
  Tour Detail UI (`Math.min(baseChildPrice, ...)`). The API persists `childPrice` greater than
  `basePrice` unchecked (e.g. base `100`, child `999999`). Any consumer reading raw `childPrice`
  (brochure PDF, browse card, exports) can display child > adult.
- **Steps to reproduce:** `POST /api/tours` with `basePrice:"100"`, `childPrice:"999999"`.
- **Expected result:** Rejected, or child clamped to adult at persistence.
- **Actual result:** Stored as-is (`childPrice = 999999`).
- **Business impact:** Mispriced child fares; inconsistent display between pages that clamp and
  pages that don't.
- **Root cause:** Cross-field validation exists only in the frontend, not in the schema/route.
- **Recommendation:** Enforce `childPrice ≤ basePrice` server-side (schema `.refine` or route check).
- **Retest status:** Fixed & retested 2026-07-27 — childPrice > basePrice rejected (400) at insert schema and PATCH (merged-state check)

---

## TOUR-03 — AI generator returns 500 and leaks internal error on empty/invalid input

- **Severity:** Medium
- **Priority:** Medium
- **Component:** `AIService.generateItinerary` / `POST /api/ai/generate-itinerary`, `POST /api/admin/ai/generate-tour`
- **Endpoint/Page:** `POST /api/ai/generate-itinerary`
- **Description:** With an empty or missing `destination`, generation throws
  `Cannot read properties of undefined (reading 'toLowerCase')` and the route returns it verbatim
  as a `500`. There is no request-body validation and no upper bound on `duration` (the fallback
  generator loops `duration` times, a DoS vector when the AI backend is unavailable).
- **Steps to reproduce:** As admin, `POST /api/ai/generate-itinerary` with body `{}`.
- **Expected result:** `400` with a clean validation message; `duration` bounded (e.g. 1–60).
- **Actual result:** `500` with internal error text `Cannot read properties of undefined (reading 'toLowerCase')`.
- **Business impact:** Poor UX, internal detail disclosure, and a fallback-path DoS on large `duration`.
- **Root cause:** `generateItinerary(req.body)` passes the raw body with no Zod validation; the
  route's `catch` returns `e.message`.
- **Recommendation:** Validate the body with a Zod schema (required `destination`, `duration`
  bounded 1–60, etc.); return `400` on failure; keep error text generic.
- **Retest status:** Open

---

## TOUR-04 — Duplicate slug returns 500 instead of 400

- **Severity:** Low
- **Priority:** Low
- **Component:** `POST /api/tours` / `PATCH /api/tours/:id`
- **Description:** Creating a tour with an existing `slug` violates the unique constraint and
  surfaces as a `500` (raw DB error) rather than a validated `400 Conflict`.
- **Steps to reproduce:** Create two tours with the same slug.
- **Expected result:** `400`/`409` with "slug already exists".
- **Actual result:** `500`.
- **Business impact:** Confusing UX; masks a normal validation case as a server error.
- **Root cause:** Unique-violation not caught/translated in the handler.
- **Recommendation:** Pre-check slug uniqueness or catch the PG unique error and return `409`.
- **Retest status:** Fixed & retested 2026-07-27 — unique-slug violations return 409 on POST, PATCH, and PUT /full

---

## TOUR-05 — Departure price is integer-only (no decimal/cents support)

- **Severity:** Low
- **Priority:** Low
- **Component:** `insertTourDepartureSchema.pricePerPerson` (`.int()`)
- **Description:** `pricePerPerson` is constrained to an integer, so fractional prices (e.g.
  `900.50`) are rejected. Acceptable if the product is whole-currency only, but it silently
  diverges from the `numeric` column type and from tour prices (stored as decimal strings).
- **Expected result:** Decision documented; either allow 2-dp or enforce consistently.
- **Actual result:** Integer-only.
- **Recommendation:** If cents are needed, relax to `z.coerce.number().min(0)` with 2-dp rounding.
- **Retest status:** Open (by design — confirm intent)

---

## TOUR-06 — AI output returned/saved without schema validation; prompt-injection surface

- **Severity:** Low (Informational)
- **Priority:** Low
- **Component:** `AIService.generateItinerary`
- **Description:** The model response is `JSON.parse`d and returned directly; there is no schema
  validation of the AI output before it reaches the client / save flow. User-controlled
  `destination`/`interests` are interpolated into the prompt (prompt-injection surface), though
  `response_format: json_object` and downstream React escaping limit practical impact.
- **Recommendation:** Validate AI output against a Zod schema before returning/persisting; treat
  AI text as untrusted (already escaped by React on render).
- **Retest status:** Open

---

## Verified-secure / correct behaviors (no finding)

| Test | Result |
|------|--------|
| Draft tours hidden from anonymous/customer (regression) | Pass (AUTHZ-01 fixed — 404) |
| Published tours render publicly | Pass |
| "Starting From" uses lowest **open** departure; closed/sold-out ignored | Pass |
| Base price fallback only when no open departures | Pass |
| Child price clamped to adult in Tour Detail UI | Pass (UI only — see TOUR-02) |
| Tour create rejects missing title | Pass (400) |
| Invalid tour id | Pass (404) |
| AI routes role-gated (ADMIN_ROLES / ALL_STAFF_ROLES) | Pass (403 for content_editor) |
| Departure non-negative price/capacity guards | Pass (F-02) |
| Itinerary day/item CRUD, ordering | Pass |
| XSS via tour content fields (React escaping; no dangerouslySetInnerHTML in tour views) | Pass |
| AI fallback generator produces valid itinerary when AI unavailable | Pass |

## Regression check against prompt

| Rule | Result |
|------|--------|
| GPT-4o fallback works when OpenAI unavailable | Pass |
| Draft tours never appear publicly | Pass |
| Published tours display correctly | Pass |
| Starting-From always lowest open departure | Pass |
| Base price fallback only when no valid departures | Pass |
| Child pricing never exceeds adult | ❌ **Fail at data layer (TOUR-02)** — UI-only clamp |
| Browse filters combine correctly | Pass |
| Brochure matches published content | Pass |
| AI itineraries editable without corruption | Pass |
