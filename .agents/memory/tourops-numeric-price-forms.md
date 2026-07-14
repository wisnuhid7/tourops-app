---
name: TourOps numeric price columns vs form parseInt
description: Why rate-creation forms 400 on POST but succeed on PATCH; numeric columns want strings.
---

# Numeric columns expect a STRING in insert schemas

drizzle-zod maps `numeric()` columns to `z.string()`, so `insert*Schema.safeParse`
rejects a JS number for money fields (`expected string, received number`). Only
`integer()` columns take a JS number.

**Trap:** POST rate/catalog routes validate against the strict insert schema, but PATCH
goes through `sanitizeRateUpdate` (strips id/createdAt/createdBy, no schema parse). So a
form that sends `price` as a number can silently break *create* (400) while *edit* still
works — easy to miss without testing create and edit separately.

**How to apply:** send numeric/decimal fields as strings from forms; send integer fields
as numbers. If create 400s but edit succeeds (or vice-versa), suspect this POST-vs-PATCH
validation split.

# Status switch in rate forms must not coerce

The rate status enum is `draft|active|archived`. When adding a binary Active/Draft switch
to a rate create/edit form (guide/hotel/etc.), submit the tracked `status` state **as-is** —
do NOT coerce with `status === "active" ? "active" : "draft"`. A record loaded for edit can
be `archived`, and coercion silently downgrades it to `draft` when the user edits unrelated
fields.

**Why:** the shared rate form models status as a boolean switch; naive coercion loses the
third (`archived`) state and mutates data the user never touched.

**How to apply:** initialize the status state from the item, change it only on explicit
toggle, and send the raw value. Tour Generator's guide dropdown filters `status === "active"`,
so a wrongly-downgraded guide would vanish from tour assignment.
