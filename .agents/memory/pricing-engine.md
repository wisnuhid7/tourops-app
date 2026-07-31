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
