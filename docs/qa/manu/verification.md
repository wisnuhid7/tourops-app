# Verification & Regression (2026-07-31)

## Retests (all PASS)
- Duplicate submit → exactly one booking created (BK-F021FE00).
- Join: cancelled code 409, completed code 409, duplicate join 409 with specific UI toast, invalid code 404, missing code 400, leader self-join 400.
- Assignments: notes-only PATCH 200; invalid fields stripped; empty patch 400; bad id 404.
- Workflow detail: step status toggles, progress updates, notes save/cancel.

## Regression checks
- Payment: leader payments page renders; booking payments tab renders; no errors.
- Booking status: admin status update persists; confirm path deducts capacity atomically and generates itinerary PDF + notifications (verified in logs); cancel path restores capacity (code inspected).
- Dashboards: admin dashboard, leader dashboard OK.
- Notifications/emails: booking-created emails enqueued and sent (dev transport) — observed in API logs.
- Customer view: my-bookings, booking-detail, tour-detail render, no console errors.
- Admin view: bookings list/detail, assignments, workflow detail OK.
- Traveler data: add/edit/delete round-trips; relations correct.
- Unit suite: `pnpm --filter @workspace/api-server test` → 98/98 pass (unchanged).
- Typecheck: tourops clean after removing 60 duplicate translation keys (pre-existing calendar.tsx errors excluded).

## Security spot checks (curl)
- Unauthenticated: staff endpoints 401.
- Customer → staff endpoints: 403.
- IDOR: foreign booking + subresources (travelers/payments/workflows): 403.
- Assignment PATCH field allowlist enforced.

## Test hygiene
- QA bookings BK-5F2DA669 / BK-A4575341 deleted; BK-F021FE00 reverted to submitted and departure capacity restored; QA traveler removed; workflow step/statuses reverted.
- QA accounts/bookings left in place (harmless dev data): qa-join-nN44oB, QA Group OYR7 (BK-3D875A9C), BK-0FBD7F1F, BK-F021FE00, BK-6CDEC97F, BK-EBF3ABB7.

## Playwright status
- E2E coverage executed via the Playwright-based testing agent across all seven requested flows (private booking, group join, passenger management, leader dashboard, admin booking, workflow, assignment update), with screenshots captured per step and console/network monitored. No standing Playwright spec files are checked into the repo — this project's convention is agent-driven e2e plus the vitest unit suite.
