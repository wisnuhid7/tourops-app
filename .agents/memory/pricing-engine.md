---
name: TourOps pricing engine conventions
description: Decisions behind the Phase 1&2 pricing engine (decimal strings, quote access model, zod v4 gotcha)
---

- All money is decimal strings end-to-end (PG `numeric` ↔ decimal.js); engine rejects non `^\d+(\.\d+)?$` inputs. **Why:** avoids float drift; matches existing tour price convention.
- Calculation order is fixed: base cost (component shares + hotel×nights + airfare) → margin (fixed/percentage) → free-passenger factor ((paying+free)/paying). Selling price is the authoritative figure; independently rounded components may differ by a cent.
- Quote access model: customer views require quote `status=final` AND (assigned `customerId` OR unguessable `shareToken`); unauthorized reads return 404, not 403. Internal breakdown limited to admin/super_admin/operations_manager. **Why:** code review found IDOR — any authed user could read any quote by UUID.
- Rule precedence: explicit ruleId (must be active + own/global tour) > newest active tour rule > newest active global rule. Airfare rate must be active and date-valid.
- zod v4 gotcha: `z.record(z.enum(...), v)` makes every enum key REQUIRED; use `z.partialRecord` for optional occupancy maps.
- Seed: `src/seed-pricing.ts` (idempotent) creates 6 bands + global 20%/1-per-3 rule.

**Exact-ratio rounding:** multiply by `(paying+free)/paying` inline, never by a pre-divided factor decimal — the truncated 1.3333… factor can flip half-cent ROUND_HALF_UP boundaries (caught by a 50-case drift test).

**Integrity guards (app-level, no DB FKs):** active band overlap → 409 on create/patch (validate merged state); single active global rule enforced transactionally (activating one deactivates others); band/rule delete blocked with 409 while quotes reference them; airfare validFrom≤validTo via zod superRefine — PATCH must merge existing row + body and re-run the full schema, since `.partial()` skips cross-field refinements.

**Frontend:** staff screen at /admin/group-quotes (tabs: quotes/rules/airfare/bands); operations_manager gets an explicit exception in App.tsx admin gating AND must be in the /api/tours role list. Customer page /quotes/:id + /quotes/shared/:token (authenticated; anonymous share access deferred to a separate task). All UI keys prefixed pe_ in translations.ts (en/es/id).

## Rate-driven costing (resolver) lessons — 2026-07-31
- Resolver (`rate-resolver.ts`) maps tour_day_items → engine inputs. Rate-card tables store free-text currency/dates: MUST filter by quote currency (seed data mixes IDR-magnitude prices labeled USD) and default validity checks to *today* when no departureDate — otherwise expired junk rates (e.g. a 23M "USD" guide rate) silently inflate quotes.
- Engine takes ONE global nights value; hotels with different night counts are handled by scaling the *unrounded* room-rate Decimal by hNights/globalNights and rounding once — scaling already-rounded per-occupancy rates double-rounds and drifts cents.
- Hotel rate cards match by exact hotel name (no FK); POST /api/rates/* forces status=draft — rates only resolve after approval (status=active).
- from-tour endpoint must validate departureId belongs to the tour and derive departureDate from its startDate.
- Shared-token quote endpoint is now public by design (task #25): token = credential, final-only, customerQuoteView shaping.

## Direct hotel room rates (Matrimonial/Doble/Triple) — 2026-07-31
- hotels now carry roomRateMatrimonial/Double/Triple ($/room/night); shared hotel-form-fields.tsx keeps admin + hotel-manager portals identical; basePrice kept as legacy fallback, auto-synced to cheapest rate on save.
- occupancy_type pg enum gained "matrimonial" (add-only, never drop); engine OCCUPANCY_TYPES + routes zod enum + both quote UIs (OCC_KEYS/OCCUPANCIES) must all list new occupancies or the price silently won't render.
- Resolver preference: direct hotel room rates > active hotel_rates card > basePrice. Per-person: M/2, D/2, single=D, T/3. Zero/absent rate = room not offered → omit, never price 0; route-level normalizeRoomRates coerces 0→null and 400s negatives (insertHotelSchema has no numeric bounds).
- Customer /api/tours/:id/hotels is a hand-picked field allowlist — new customer-visible columns must be added there explicitly or UI badges silently never render.
- Booking room-type flow: bookings.roomType/accommodationCost are server-computed only (POST validates enum + currency match, PATCH strips both); roomType is REQUIRED for tour bookings when tourOffersRoomTypes(), except join_leader_group (leader's booking carries accommodation). accommodationForTour never sums mixed currencies — first priced hotel fixes currency, mismatches skipped with warning.
