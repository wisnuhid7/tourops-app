# QA Retest — Tours & Departures Fixes (2026-07-27)

Scope: fix + retest TOUR-01, TOUR-02, TOUR-04 (from `docs/qa/manu/tours-findings.md`)
and full live verification of Departure CRUD, delete protection, and promo pricing.
All API tests run live as `superadmin1` against dev (`http://localhost:80`);
temporary tours/departures/bookings created and deleted afterwards.

## Fixes

| Finding | Fix |
|---|---|
| TOUR-01 (negative prices accepted) | `insertTourSchema` now enforces non-negative `basePrice`, `childPrice`, `markupAmount`, `totalPrice`, `singleSupplement` (numeric columns are strings — validated via parse). PATCH `/api/tours/:id` (which bypasses the insert schema) gets an equivalent route-level check. |
| TOUR-02 (child > adult persisted) | Cross-field guard: `childPrice ≤ basePrice` enforced in the insert schema (`superRefine`) and on PATCH against the merged existing+patch state. |
| TOUR-04 (duplicate slug → 500) | PG unique-violation (23505) translated to `409 "A tour with this slug already exists"` on POST, PATCH, and PUT `/full`. |

## Test results

### Tour CRUD + publish status
| Test | Result |
|---|---|
| POST tour with `basePrice:"-500"` | 400 "Price must be a non-negative number" |
| POST tour with base 100 / child 999999 | 400 "Child price cannot exceed the adult base price" |
| POST valid tour (base 1000, child 500) | 200, created |
| POST duplicate slug | **409** (was 500) |
| PATCH `basePrice:"-1"` | 400 |
| PATCH `childPrice:"5000"` (> existing base) | 400 |
| PATCH valid price update, publish toggle | 200 |
| Tour day + day item create/delete | 200/204 |
| DELETE tour; GET after delete | 200; 404 |

### Departures
| Test | Result |
|---|---|
| Create (dates/capacity/price/status) | 200 |
| Create with `pricePerPerson:-5` | 400 |
| PATCH dates/capacity/price/status/public-join | 200, all applied |
| PATCH blocked fields only (`capacityBooked`, `tourId`) | 400 (mass-assignment guard) |
| **Delete protection**: DELETE with a linked booking | **409** "Cannot delete: 1 booking(s) are linked…" |
| DELETE after booking removed | 200 |
| **Promo pricing**: departure 800 < base price | Accepted; served as the open-departure price on the public tour endpoint |

### Regression suite
`vitest` functional suite: **78/78 passing**. Three stale tests were updated to
match intentional hardening from earlier sessions (admin-create password now
must be ≥ 8 chars; `/api/hotels/search` is auth-gated; auth-module mock needed
the `passwordSchema` export and `ensureProfile`).

## Code-review round — hardening applied & retested
1. Strict numeric-string validation (`^\d+(\.\d+)?$`) replaces `parseFloat`
   checks in both the insert schema and the PATCH helper — `"12abc"`, `"0x10"`,
   and `"9,99"` now return 400 instead of leaking to a DB error; `"999.50"`
   still accepted.
2. Content-only PATCHes no longer run the child≤base cross-check, so legacy
   rows with bad pricing stay editable (verified: content PATCH 200, price
   PATCH child>base 400, repair PATCH 200).
3. 409 slug translation narrowed to the actual slug constraint (via PG
   constraint/detail inspection); other unique violations return a generic
   409 instead of a misleading "slug already exists".

## Still open (unchanged)
- TOUR-03 — AI generator 500/error-leak on empty input (not in this batch's scope)
- TOUR-05 — departure price integer-only (by design, pending product decision)
- TOUR-06 — AI output not schema-validated (informational)
