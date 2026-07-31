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
