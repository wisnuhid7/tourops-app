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
