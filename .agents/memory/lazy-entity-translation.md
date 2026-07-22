---
name: Lazy entity translation layer
description: How TourOps auto-translates dynamic DB content (es/id) and the traps to avoid
---

Pattern: any entity with a `translations` jsonb column gets lazy AI translation — customer GET routes call a fire-and-forget `maybeAutoTranslate...InBackground`, which fills missing es/id via AI and persists, so the next request serves them. Frontend renders via `lt(entity, field)` on the language context (falls back to English).

**Why:** database content can't be covered by the static i18n dictionary; per-table hand fixes don't scale.

**How to apply / traps:**
- Public routes that hand-shape payloads MUST also shape `translations` to public-safe keys only — the raw blob can carry translated copies of non-public columns (guide notes, hotel policies).
- Only memoize "verified complete" per record after checking completeness post-merge; batch success ≠ every record translated.
- Chunk generic AI translation batches (record count + char budget) or big catalogs blow the prompt.
- Entities only reachable through auth-gated catalog routes never get translated by customer routes — hook the catalog GET too.
