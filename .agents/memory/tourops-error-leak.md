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
- Route catch blocks must use `routeError(res, e)` from `artifacts/api-server/src/lib/routeError.ts` — that helper logs the full error server-side and returns `"Internal server error"` in production for any 5xx, forwarding the message verbatim only for 4xx.
- `routes.ts` and `paymentRoutes.ts` now use `routeError` throughout. The auth sub-routes (`replit_integrations/auth/`) still use inline `e.message` (tracked as a separate follow-up).
