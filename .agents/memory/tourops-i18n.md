---
name: TourOps i18n dictionary & finding missing keys
description: How TourOps translations are structured and how to find keys referenced by t() but missing from the dictionary.
---

# TourOps i18n

Dictionary lives in `artifacts/tourops/src/hooks/translations.ts` (a **plain
non-React module**) as a single `export const translations = { en:{...}, es:{...},
id:{...} }` object, alongside `Language`, `LANGUAGE_LABELS`, `LANGUAGE_FLAGS`, and
`TranslationKey = keyof typeof translations.en`. `use-language.tsx` imports from it
and only exports the `LanguageProvider` component + `useLanguage` hook (plus type
re-exports of `Language`/`TranslationKey` for back-compat). `t(key)` is typed to the
`TranslationKey` union. Three languages: English, Spanish, Indonesian — **every key
must exist in all three** or the object shape / type breaks.

**Why the split (do NOT merge back):** when the huge `translations` object + the
`LANGUAGE_FLAGS` const lived in the same file as the provider/hook, Vite react-refresh
couldn't Fast-Refresh it. Every edit forced a module invalidation cascade, and
consumers (e.g. `AppSidebar`) briefly got a null context → runtime crash
`useLanguage must be used within a LanguageProvider`. Keeping data/constants out of the
provider file makes it a clean refresh boundary. Add new keys in `translations.ts`;
import value constants (`LANGUAGE_LABELS`/`LANGUAGE_FLAGS`) from `@/hooks/translations`,
not from `@/hooks/use-language`.

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

**Populating dynamic translations:** an AI auto-fill endpoint (`/api/ai/translate-tour/:id`,
gated by TOUR_CONTENT_ROLES) translates a tour + all its days in ONE gpt-4o call and persists
to the `translations` jsonb; manual ES/ID fields also exist in the content editor and the
itinerary day edit form. **Key days by their unique `id`, never by dayNumber** (dayNumber is
not unique per tour). Always sanitize AI output to string-only expected keys before DB write,
and merge into existing translations (don't blind-replace) so other langs survive.

**TourOps AI runs through Replit AI Integrations (OpenAI proxy):** `ai.ts` inits the OpenAI
client with `AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY` (falls back to
a raw `OPENAI_API_KEY` if ever set) and gates real calls on an `AI_ENABLED` flag; otherwise
`generateItinerary` returns a local fallback. Model stays `gpt-4o` (don't upgrade legacy models
without being asked). **Why:** no raw OPENAI_API_KEY is configured — re-adding one is not needed;
provision via `setupReplitAIIntegrations({providerSlug:"openai"})`.

**Language provider must stay reactive:** `LanguageProvider.setLanguage` should update
React state (so consumers re-render instantly); do NOT reintroduce `window.location.reload()`.
Guard `localStorage`/`navigator`/`document` access in try/catch — they throw in the
sandboxed preview iframe and previously broke switching entirely.
