# Booking Assignments (QA 2026-07-31)

Scope: admin/assignments.tsx, /api/assignments.

## Positive
- PASS — Create assignment (Guide → staff user) from booking detail Assignments tab; row persisted (verified in DB).
- PASS — Notes-only PATCH /api/assignments/:id → 200, notes saved, valid response body. (Formerly a known 500 bug — remains fixed.)
- PASS — Update and delete assignment via UI; "Assignment removed successfully" toast; pre-existing rows untouched.

## Security / Allowlist
- PASS — `{"notes":"test","invalidField":"attack"}` → 200 with invalid field stripped (zod `.strip()` allowlist); response contains only real columns.
- PASS — Only-invalid-fields body → 400 "No updatable fields provided".
- PASS — Empty body → 400. Unknown id → 404. Unauthenticated → 401; customer role → 403.

## Status
PASS. No 500s observed during any assignment operation.
