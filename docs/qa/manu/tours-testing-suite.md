# Tours & Itinerary — Testing Suite

**Date:** 2026-07-25
**Environment:** `http://localhost:80`. Admin: `superadmin1` / `password123` (portal `admin`).
Staff: e.g. `contenteditor1` (portal `staff`). Customer: register a fresh account.

Status legend: Pass / Fail / Blocked / N/A.

---

## 1. Functional / CRUD Tests

| Test ID | Category | Objective | Preconditions | Test Steps | Expected Result | Status |
|---------|----------|-----------|---------------|------------|-----------------|--------|
| FN-01 | CRUD | Create tour | Admin | POST /api/tours valid body | 200 + tour | Pass |
| FN-02 | CRUD | Create rejects missing title | Admin | POST without title | 400 | Pass |
| FN-03 | CRUD | Update tour | Admin | PATCH /api/tours/:id | 200, fields changed | Pass |
| FN-04 | CRUD | Full replace | Admin | PUT /api/tours/:id/full | 200 | Pass |
| FN-05 | CRUD | Delete tour | Admin | DELETE /api/tours/:id | 200 | Pass |
| FN-06 | CRUD | Invalid id | — | GET /api/tours/bad-id | 404 | Pass |
| FN-07 | CRUD | Negative basePrice | Admin | POST basePrice=-500 | 400 | **Fail (TOUR-01)** |
| FN-08 | CRUD | Duplicate slug | Admin | POST existing slug | 400/409 | **Fail (TOUR-04 → 500)** |
| FN-09 | Draft | Draft not public | Anon | GET /api/tours/:draftId | 404 | Pass |
| FN-10 | Publish | Publish/unpublish toggles visibility | Admin | PATCH isPublished | reflected in /public | Pass |
| FN-11 | Metadata | Categories/tags/images persist | Admin | POST with tags/category | stored | Pass |
| FN-12 | Unicode | Unicode/special chars in title | Admin | POST title with 中文/emoji | stored & rendered | Pass |

## 2. Itinerary Tests

| Test ID | Category | Objective | Test Steps | Expected | Status |
|---------|----------|-----------|------------|----------|--------|
| IT-01 | Days | Create day | POST /api/tours/:id/days | 200 | Pass |
| IT-02 | Days | Update day | PATCH /api/tour-days/:id | 200 | Pass |
| IT-03 | Days | Delete day | DELETE /api/tour-days/:id | 200 | Pass |
| IT-04 | Items | Create day item | POST /api/tour-days/:dayId/items | 200 | Pass |
| IT-05 | Items | Item ordering preserved | create multiple items | stable order | Pass |
| IT-06 | Empty | Empty itinerary renders | tour with no days | detail renders, no crash | Pass |
| IT-07 | Large | Large itinerary (many days) | create 30-day tour | renders | Pass |
| IT-08 | Missing | Missing hotel/guide item | item without hotelId | renders gracefully | Pass |
| IT-09 | Draft guard | Draft sub-resources hidden | anon GET /:draftId/days | 404 | Pass |

## 3. AI Generation Tests

| Test ID | Category | Objective | Test Steps | Expected | Status |
|---------|----------|-----------|------------|----------|--------|
| AI-01 | Success | Generate itinerary (GPT-4o) | POST /api/ai/generate-itinerary valid | 200 + days | Pass |
| AI-02 | Auth | Role gating | content_editor POST | 403 | Pass |
| AI-03 | Auth | Anonymous | anon POST | 401 | Pass |
| AI-04 | Bad input | Empty body | POST {} | 400 clean | **Fail (TOUR-03 → 500 + leak)** |
| AI-05 | Bounds | Huge duration | duration=100000 | bounded/400 | **Fail (TOUR-03 — no bound)** |
| AI-06 | Fallback | AI unavailable → fallback | unset AI env | deterministic itinerary | Pass |
| AI-07 | Output | AI output schema-validated | inspect response | validated | **Fail (TOUR-06 — not validated)** |
| AI-08 | Injection | Prompt injection via destination | malicious destination | no instruction leak | Pass (json_object) |
| AI-09 | Save/edit | Save generated then edit | generate → save → PATCH | no corruption | Pass |

## 4. Pricing Tests

| Test ID | Category | Objective | Test Steps | Expected | Status |
|---------|----------|-----------|------------|----------|--------|
| PR-01 | StartingFrom | Lowest open departure | 3 open departures | min open price | Pass |
| PR-02 | StartingFrom | Closed/sold-out ignored | mix open+closed | closed excluded | Pass |
| PR-03 | StartingFrom | No departures → base | tour, no departures | basePrice shown | Pass |
| PR-04 | StartingFrom | Single departure | 1 open departure | that price | Pass |
| PR-05 | Child | Child ≤ adult (UI) | detail page | clamped | Pass |
| PR-06 | Child | Child > adult persisted | POST child=999999 base=100 | rejected | **Fail (TOUR-02)** |
| PR-07 | Departure | Negative price | POST pricePerPerson=-50 | 400 | Pass |
| PR-08 | Tour price | Negative basePrice | POST basePrice=-500 | 400 | **Fail (TOUR-01)** |
| PR-09 | Decimal | Fractional departure price | pricePerPerson=900.5 | accepted or documented | **Fail (TOUR-05 — int only)** |
| PR-10 | Formatting | Currency/decimal rendering | detail page | toLocaleString | Pass |

## 5. Browse / Search / Filter Tests

| Test ID | Category | Objective | Test Steps | Expected | Status |
|---------|----------|-----------|------------|----------|--------|
| BR-01 | Search | Partial/exact search | query term | matching tours | Pass |
| BR-02 | Filter | Category filter | pick category | filtered | Pass |
| BR-03 | Filter | Duration filter | set range | filtered | Pass |
| BR-04 | Filter | Price slider | set range | filtered | Pass |
| BR-05 | Filter | Combined filters | search+category+price | intersection | Pass |
| BR-06 | Filter | Empty results | impossible combo | empty state | Pass |
| BR-07 | Sort | Sorting | by price/name | ordered | Pass |
| BR-08 | Paginate | Pagination | many tours | paged | Pass |
| BR-09 | URL | Filter persistence on refresh | reload w/ params | state retained | Pass |
| BR-10 | Visibility | Only published listed | /api/tours/public | no drafts | Pass |

## 6. Tour Detail / Brochure Tests

| Test ID | Objective | Test Steps | Expected | Status |
|---------|-----------|------------|----------|--------|
| TD-01 | Public view of published tour | GET detail | full render | Pass |
| TD-02 | Draft blocked | anon GET draft | 404 | Pass |
| TD-03 | Hotels list | GET /:id/hotels | public-safe fields only | Pass |
| TD-04 | Guides list | GET /:id/guides | public-safe fields only | Pass |
| TD-05 | Brochure matches content | brochure page | matches published | Pass |
| TD-06 | Broken/missing image fallback | tour w/o image | placeholder | Pass |
| TD-07 | Empty fields | tour w/ null fields | no crash | Pass |

## 7. API Tests

| Test ID | Objective | Expected | Status |
|---------|-----------|----------|--------|
| API-01 | Invalid payload | 400 | Pass |
| API-02 | Missing required field | 400 | Pass |
| API-03 | Unauthorized mutate | 401 | Pass |
| API-04 | Forbidden role mutate | 403 | Pass |
| API-05 | HTTP method validation | 404/405 | Pass |
| API-06 | Malformed JSON | 400 "Invalid JSON body" | Pass (F-01) |
| API-07 | Response consistency | JSON shape stable | Pass |

## 8. Security Tests

| Test ID | Objective | Expected | Status |
|---------|-----------|----------|--------|
| SEC-01 | Hidden draft access | denied | Pass (AUTHZ-01) |
| SEC-02 | IDOR on tour sub-resources | draft 404 | Pass |
| SEC-03 | Mass assignment (departure createdBy/capacityBooked) | ignored | Pass |
| SEC-04 | Unauthorized publishing (content_editor isPublished) | blocked | Pass |
| SEC-05 | Stored XSS via tour content | escaped | Pass |
| SEC-06 | SQL injection in search | parameterized, no leak | Pass |
| SEC-07 | Prompt injection in AI | no instruction override | Pass |
| SEC-08 | AI internal error disclosure | generic message | **Fail (TOUR-03)** |

## 9. Performance / Edge Cases

| Test ID | Objective | Expected | Status |
|---------|-----------|----------|--------|
| PF-01 | Large catalog browse | responsive | Pass |
| PF-02 | Large itinerary render | responsive | Pass |
| PF-03 | AI generation latency | reasonable | Pass |
| PF-04 | Fallback loop with huge duration | bounded | **Fail (TOUR-03 DoS vector)** |
| PF-05 | Published-tour index used | `tours_published_idx` | Pass |
