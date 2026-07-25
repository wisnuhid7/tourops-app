# Tours & Itinerary — Testing Report

**Date:** 2026-07-25
**Assessor:** Senior QA / Application Security Engineer
**Application:** TourOps (Express API server + React SPA)

---

## Executive Summary

A comprehensive assessment of the Tours & Itinerary feature was performed covering CRUD,
draft/publish workflow, itinerary building (`tour_days` / `tour_day_items`), the AI
tour/itinerary generator (GPT-4o + hardcoded fallback), pricing ("Starting From" and child
pricing), Browse Tours (search/filter/sort/pagination), Tour Detail / Brochure pages, APIs,
and security.

**The feature's core flows are solid**: draft tours are fully hidden from non-staff
(post-AUTHZ-01), "Starting From" pricing correctly uses the lowest open departure with a
base-price fallback, itinerary CRUD is stable, AI routes are role-gated, the fallback
generator works when AI is unavailable, and tour content rendering is XSS-safe.

**Six findings** were identified — 3 Medium, 3 Low, none Critical/High. They cluster around
server-side pricing validation (negative prices and child > adult are persistable on the
`tours` table) and AI generator input handling (500 + internal error text on empty input,
unbounded `duration`).

## Scope

Everything listed in the QA prompt: tour CRUD, publish/draft workflow, `tours`/`tour_days`/
`tour_day_items`, AI generators + fallback, public/customer tour detail, hotels/guides,
pricing rules, brochure, browse search/filters/pagination/sorting, related APIs, security,
performance, and the 9 named regression rules.

## Environment

- Dev environment, `http://localhost:80`, API workflow running.
- AI backend: Replit AI Integrations proxy (GPT-4o) — configured and live.
- Seeded demo accounts (`superadmin1`, `contenteditor1`, …, password `password123`);
  temporary tours/departures created and deleted during testing.

## Features Tested

Tour CRUD & validation; draft/publish; itinerary days/items; AI generation (success, bad
input, huge input, role-gating, fallback); starting-from & child pricing incl. closed/
sold-out departures; browse search/filters/sort/pagination; tour detail public/customer
views; brochure; hotels/guides sub-resources; error handling.

## APIs Tested

`GET/POST /api/tours`, `GET /api/tours/public`, `GET/PATCH/PUT/DELETE /api/tours/:id`,
`/:id/days|day-items|guides|hotels|departures|price-breakdown|pdf`,
`POST/PATCH/DELETE /api/tour-days/:id`, `/api/tour-days/:dayId/items`,
`GET/POST/PATCH/DELETE /api/departures`, `POST /api/ai/generate-itinerary`,
`POST /api/admin/ai/generate-tour`.

## Pages Tested

Browse Tours, Tour Detail (public/customer), Tour Brochure, Admin Tours, Admin Tour
Generator, Admin Departures.

## Test Case Totals

| Metric | Count |
|--------|-------|
| Total test cases | 67 |
| Passed | 59 |
| Failed | 8 (mapping to 6 findings) |
| Blocked | 0 |
| Not Applicable | 0 (NoSQL injection N/A — PostgreSQL only) |

## Functional Findings

- **TOUR-01 (Medium):** negative prices accepted on `tours` (create/update).
- **TOUR-02 (Medium):** `childPrice > basePrice` persistable; child-≤-adult rule is UI-only.
- **TOUR-04 (Low):** duplicate slug → 500 instead of 400/409.
- **TOUR-05 (Low):** departure price integer-only; no cents support (confirm intent).

## Security Findings

- **TOUR-03 (Medium):** AI generator returns 500 with internal error text on empty input;
  no input validation; unbounded `duration` is a fallback-path DoS vector.
- **TOUR-06 (Low/Info):** AI output not schema-validated before return/save; prompt
  injection surface via user-controlled fields (mitigated by `json_object` + React escaping).
- No XSS, SQLi, IDOR, mass assignment, unauthorized publishing, or hidden-draft access found.

## Performance Findings

- Browse, detail, and itinerary rendering responsive on the seeded catalog.
- `tours_published_idx` supports public listing.
- Only concern: unbounded fallback-generator loop (folded into TOUR-03).

## Coverage Analysis

All prompt-scoped areas exercised. Gaps: maximum-itinerary-size stress beyond 30 days not
pushed to hard limits; AI rate-limit behavior depends on the shared proxy and was not
force-triggered; brochure PDF content verified by spot-check.

## Remaining Risks

1. Negative/inconsistent prices can enter via API until TOUR-01/02 are fixed.
2. AI endpoint 500s leak internal error strings (TOUR-03) until validated.
3. Fallback generator DoS if AI backend is ever unconfigured and a huge duration is sent.

## Recommendations

1. Add non-negative + child-≤-adult guards to the tour insert/update schemas (TOUR-01/02).
2. Zod-validate the AI generation request (required destination, duration 1–60) and return
   400 with a generic message (TOUR-03).
3. Catch unique-slug violations and return 409 (TOUR-04).
4. Decide and document integer-vs-decimal pricing for departures (TOUR-05).
5. Schema-validate AI output before returning/persisting (TOUR-06).

## Final Feature Assessment

**PASS WITH RESERVATIONS.** The Tours & Itinerary feature is functionally correct and secure
in its core flows — draft isolation, pricing display rules, itinerary management, AI
role-gating and fallback all behave as specified. Remediate the three Medium findings
(tour price validation ×2, AI input validation) before considering the feature
production-hardened; the Low findings are polish items.
