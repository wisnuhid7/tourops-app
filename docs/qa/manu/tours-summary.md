# Tours & Itinerary — Feature Summary

**Date:** 2026-07-25
**Prepared by:** Senior QA / Application Security Engineer
**Component:** Tours & Itinerary (TourOps API server + React frontend)

---

## 1. Feature Overview

The Tours & Itinerary feature covers the full lifecycle of a tour product: CRUD, a
draft/publish workflow, day-by-day itinerary building (`tour_days` → `tour_day_items`),
an AI tour/itinerary generator (GPT-4o via the Replit AI Integrations proxy, with a
hardcoded fallback), the customer-facing Browse Tours / Tour Detail / Brochure pages,
and "Starting From" + child pricing derived from open departures.

## 2. Architecture

- **Backend:** Express routes in `routes.ts`; `AIService` (`lib/ai.ts`); `pricingService`
  (`/api/tours/:id/price-breakdown`); `pdfService` (brochure/itinerary PDF).
- **Frontend:** `pages/customer/{browse-tours,tour-detail,tour-brochure}.tsx`,
  `pages/admin/{tours,tour-generator,departures}.tsx`.
- **Data:** `tours`, `tour_days`, `tour_day_items`, `tour_departures`.

## 3. Database Entities

| Table | Purpose | Key fields |
|-------|---------|-----------|
| `tours` | Tour master record | title, slug (unique), duration, basePrice, childPrice, singleSupplement, isPublished, translations |
| `tour_days` | Per-day itinerary | tourId, dayNumber, city, countryCode |
| `tour_day_items` | Activities in a day | dayId, itemType (sight/meal/hotel/transport/flight/custom), startTime, cost, sightId/hotelId |
| `tour_departures` | Scheduled departures | tourId, startDate, capacityTotal, capacityBooked, pricePerPerson, status |

## 4. Business Rules

- Draft (`isPublished:false`) tours must never be publicly visible (enforced post-AUTHZ-01).
- "Starting From" = lowest **open** departure price; base price only when no open departures.
- Child price should never exceed adult price.
- Slugs are unique.
- Departure capacity: `capacityTotal ≥ 1`, `capacityBooked ≥ 0`; `pricePerPerson ≥ 0`.

## 5. Pricing Logic

Computed client-side in `tour-detail.tsx`: `startingFromPrice = min(open departure prices)`
or `tour.basePrice` fallback. Child price scales proportionally when the adult price comes
from a departure, else `min(childPrice, startingFromPrice)`. Server exposes a fuller
breakdown via `pricingService.calculateTourPrice`.

## 6. AI Integration

`AIService.generateItinerary` builds a system+user prompt enriched with verified DB
sights/hotels, calls GPT-4o with `response_format: json_object`, and **falls back to a
deterministic generator** when no AI backend is configured or the call throws. Also:
`enrichSightDescription`, `analyzeBusinessPerformance`, and translation helpers.

## 7. User Flows

- **Staff:** create/edit tour → build itinerary (days/items) → set departures/pricing →
  publish. AI generator can pre-fill a draft.
- **Customer/anonymous:** browse (search/filter/sort/paginate) → tour detail → brochure.

## 8. Dependencies

- OpenAI (GPT-4o) via `AI_INTEGRATIONS_OPENAI_*`.
- Master data (sights/hotels) for AI grounding and itinerary item linkage.
- Auth/RBAC (assessed separately) for all mutations.

## 9. Risks

- Pricing validation exists on **departures** but not on the **tours** table (negative
  prices, child > adult persistable at the data layer).
- AI generator lacks input validation/bounds and returns internal error text on bad input.
- Duplicate-slug conflicts surface as `500` rather than a clean `400`.

## 10. Assumptions

- AI backend is configured (integration proxy present), so the fallback path is exercised
  only on failure. Seeded published tours exist for browse/detail testing.

## 11. Test Coverage Summary

| Area | Coverage | Result |
|------|----------|--------|
| Tour CRUD + validation | Full | Partial pass (see TOUR-01/04) |
| Draft/publish visibility | Full | Pass (post AUTHZ-01) |
| Itinerary (days/items) | Full | Pass |
| AI generator (success/fallback/bad input) | Full | Partial (see TOUR-03) |
| Pricing (starting-from / child) | Full | Partial (see TOUR-01/02) |
| Browse (search/filter/sort/paginate) | Full | Pass |
| Tour detail / brochure | Full | Pass |
| Security (XSS/IDOR/mass-assignment/authz) | Full | Pass |

Overall: **GOOD feature with correct core flows; several data-integrity validation gaps
(pricing) and one AI input-validation defect to remediate.**
