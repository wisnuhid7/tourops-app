---
name: Generic catch leaks e.message
description: TourOps api-server routes leak internal DB errors via their catch blocks; validate before hitting the DB.
---

Nearly every route handler in `artifacts/api-server/src/routes/routes.ts` (and related route files) ends with `catch (e:any) { res.status(500).json({ message: e.message }) }`. When a bad value reaches Postgres (e.g. a non-numeric string into a `numeric()` column), the driver error — which includes the full SQL statement column list and bound parameters — is returned verbatim to the client. This is an information-disclosure vector.

**Why:** discovered during the Suppliers & Supply Chain QA sweep — `POST /api/rates/guide` with `price:"abc"` returned a 500 whose body contained the INSERT column list and params.

**How to apply:**
- Validate/refine inputs at the zod layer *before* they reach the DB (drizzle-zod maps `numeric()` → plain `z.string()` with NO numeric check, so add refinements — see `optionalMoneyString`/`requiredMoneyString` helpers in `lib/db/src/schema/schema.ts`).
- The same leak applies to pgEnum columns: inline route schemas that type an enum field as `z.string()` (e.g. user-profile `role`) let junk reach the DB and leak SQL. Validate against `<enum>.enumValues` via `z.enum(...)`.
- Also watch inline route schemas that pass `req.body` straight to storage (markup-rule PATCH did) — validate with the partial insert schema.
- If you touch the error-handling path broadly, prefer a global handler that logs `e.message` server-side but returns a generic message to clients in production. A blanket change across hundreds of handlers is risky; do it deliberately, not as a drive-by.
