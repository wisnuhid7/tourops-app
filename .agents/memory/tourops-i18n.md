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
