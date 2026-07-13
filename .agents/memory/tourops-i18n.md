---
name: TourOps i18n dictionary & finding missing keys
description: How TourOps translations are structured and how to find keys referenced by t() but missing from the dictionary.
---

# TourOps i18n

Dictionary lives in `artifacts/tourops/src/hooks/use-language.tsx` as a single
`const translations = { en: {...}, es: {...}, id: {...} }` object; `TranslationKey`
= `keyof typeof translations.en`, and `t(key)` is typed to that union. Three
languages: English, Spanish, Indonesian — **every key must exist in all three**
or the object shape / type breaks.

**Finding missing keys:** run `pnpm --filter @workspace/tourops run typecheck`.
Any `t("foo")` whose key isn't in the dictionary shows as
`error TS2345: Argument of type '"foo"' is not assignable to parameter of type '<TranslationKey union>'`.
These render as raw snake_case in the UI **in every language, including English**,
so they're a correctness bug, not just a translation gap. The Vite build does NOT
catch them (esbuild transpiles without type-check) — only `typecheck` does.

**Two distinct i18n defects here, don't conflate them:**
1. Hardcoded English strings that bypass `t()` (don't switch language).
2. `t("key")` calls whose key was never added to the dictionary (render raw in all
   languages). This was the larger class (~750 keys) and looked "fine" in English
   only because nobody noticed the raw keys on secondary pages.

**Gotcha:** a `t()` call only works inside a component/function that has
`const { t } = useLanguage();` in scope. Files with multiple sub-components can have
one sub-component calling `t()` without the hook → `TS2304: Cannot find name 't'`.

**Known unrelated noise:** `src/components/ui/calendar.tsx` has 3 pre-existing tsc
errors (shadcn vs react-day-picker version mismatch, `IconLeft`/implicit-any) — not
i18n, ignore them when judging i18n completeness.

**Dynamic DB content translations are a separate axis from `t()`:** tour & tour-day
content (title/description/highlights/inclusions/exclusions/itinerary) is stored in a
per-row `translations` jsonb column keyed by lang (`translations.es.title`, etc.), read
in the UI as `row.translations?.[language]?.field || row.field` (English fallback). The
customer pages are already wired this way — BUT the column is empty for every row, so
switching to ES/ID shows translated section *labels* (from `t()`) over English content,
which reads as "the switcher doesn't work." Populating that jsonb (manual editor field
or an AI translate step) is a data task, not a code fix. `t()` dictionary and the
`translations` jsonb are independent — fixing one does nothing for the other.

**Language provider must stay reactive:** `LanguageProvider.setLanguage` should update
React state (so consumers re-render instantly); do NOT reintroduce `window.location.reload()`.
Guard `localStorage`/`navigator`/`document` access in try/catch — they throw in the
sandboxed preview iframe and previously broke switching entirely.
