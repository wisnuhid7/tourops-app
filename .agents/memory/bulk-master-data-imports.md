---
name: Bulk master-data & scraped-tour imports
description: Conventions used for the big dev-DB bulk loads (airports, cities, scraped tours) and their gotchas
---

# Bulk master-data & scraped-tour imports (dev DB, 2026-08)

- Airports/cities/countries were bulk-loaded via psql temp-table staging (`\copy` CSV → insert-missing by natural keys: country code ISO2, lower(city name) per country, IATA code). Enrichment updates only fill NULLs / OR booleans — never overwrite existing values.
- Scraped tours (243, source "eo") are identified by `internal_notes LIKE 'Imported from scraper%'` and are all drafts. Their images live in `artifacts/api-server/uploads/images/tours/<TourID>/` and DB URLs are `/uploads/images/tours/...` (frontend rewrites to `/api/uploads/...` in `lib/utils.ts`).
- **Why:** future imports/cleanups must use the same natural keys and marker to stay idempotent and to find scraper rows.
- **How to apply:** for any new bulk load, stage in a temp table, dedupe case-insensitively per parent, and mark provenance in internal_notes; filter scraper junk images by name (`spacer|button|logo|banner|icon`).
- Gotchas hit: `pg` is not in api-server node_modules (require it from `lib/db/node_modules/pg` for one-off scripts); scraped exports are incomplete (some tours missing folders/days/images) — import must tolerate and report, not fail; prod DB is separate, so all of this needs a prod copy step (uploads/ persistence on deploy unverified).
