# TourOps: "show all + filter + search" admin tabs

Convention used by the Transport Management tabs (`artifacts/tourops/src/pages/admin/transport.tsx`):
Bus Types, Routes, Route Pricing, Bookings all follow the same shape; Companies is the same idea
mapped onto a root entity (see the variant section below).

## The pattern
- Query fetches the **whole** catalog (`queryKey: ["/api/transport/bus-types"]`, no `?companyId=`,
  no `enabled:` gate). Backend returns everything for admin scope, and only the caller's company
  for company-scoped roles — so dropping the client gate does not leak (see
  `row-scoped-roles-need-get-filtering.md`).
- Toolbar: `CompanySelector` (with `allowAll`) + search `Input` + "Add" button, all always visible.
- Filtering/searching is **client-side** over the fetched array; Add button is never gated on a filter.
- Table shows a **Company column** (and a Route column for pricing) because rows now span companies.
  When you add a body cell, remember to add the matching `<TableHead>` and bump the empty-state `colSpan`.
- Create/edit dialogs keep a **separate `formCompanyId`** — never reuse the filter `companyId` state
  for the payload, or a "create" silently targets whatever is currently filtered.
  Dependent selects (Route, Bus Type) are derived from `formCompanyId` via client-side `.filter()`.

## Variant — root entity (nothing to filter "up" to)
`Companies` is the parent of every other tab, so there is no company filter to add and no gate to
remove (it always fetched all rows). The pattern still applies, mapped onto its own categorical
field: **country filter** (`allCountriesValue` sentinel) + search. Search covers name, contact
name/email/phone, city, state, the **resolved** country name, and vehicle-type tags — note the
country name comes from a lookup (`getCountryName`), so it is only searchable once
`/api/master/countries` has loaded.
It is also a plain 8-column `<Table>` (Name, Country, Contact Name/Phone/Email, City, Vehicle
Types as badges, Actions) like the siblings. **Learned preference: the user wants a table, not a
card grid.** A grid was tried first on the reasoning that each company has rich profile data
(address/bank/tax), but the answer was "buat datanya jadi table saja" — i.e. match the sibling tabs
rather than preserve the grid. Only ~7 of the ~20 profile fields fit in a table; the rest stay in
the create/edit dialog. Converting a card grid also orphans its `Card*` imports, and this file uses
`noUnusedLocals`, so remove them.
Restructuring note: the original `if (isLoading) return <Skeleton/>` early-return hides the toolbar,
so it moved inside the content area (`{isLoading && ...}` plus a `!isLoading &&` guard on the empty
state) to match the other tabs.

## Footgun 1 — Radix Select rejects `value=""`
`<SelectItem value="">` throws at runtime, so "All companies" / "All routes" need an internal
sentinel that is mapped back to `""`:
```tsx
const allCompaniesValue = "__all_companies__";
const allRoutesValue    = "__all_routes__";
const allCountriesValue = "__all_countries__";
// <Select value={allowAll && !value ? allCompaniesValue : value}
//   onValueChange={(v) => onChange(allowAll && v === allCompaniesValue ? "" : v)}>
```
Form-scoped selectors intentionally omit `allowAll`, so the sentinel can never reach a payload.

## Footgun 2 — duplicate i18n keys are a typecheck error, not a silent overwrite
Adding a key that already exists anywhere in the same language block fails with
`TS1117: An object literal cannot have multiple properties with the same name`
(e.g. `search_bookings_placeholder` already existed for the support dashboard).
**Grep `hooks/translations.ts` for the key name across all three blocks before adding one.**
Unrelated precedent: caption in `tourops-i18n.md`.

## Pitfall — client-side search on a *paginated* list
Bookings is server-paginated (50/page), so its search only filters the current page. That is
acceptable but must be stated to the user; a true cross-page search needs a backend `q` param and
joins (company name / tour title are not columns on `transport_bookings`).

## Verification that actually catches things here
`npx tsc --noEmit` (catches key/JSX/type errors) **and** `pnpm run build` inside `artifacts/tourops`
(typecheck alone still passes for silently-dropped Tailwind v4 syntax — see
`tailwind-v3-not-v4-syntax.md`). Grep the fresh `dist/public/assets/*.css` for any new utility class.
