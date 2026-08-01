---
name: Booking lifecycle conventions
description: Status workflow, passenger invitations, and concurrency/CSV rules for TourOps lifecycle routes
---

- Status workflow lives in `STATUS_TRANSITIONS` in api-server `lifecycleRoutes.ts` AND is mirrored in the frontend `booking-operations.tsx`. **The two maps must stay identical** — a review round caught the UI offering `confirmed→completed` while the server only allows `confirmed→in_operation|cancelled` (guaranteed 409).
- **Why:** transitions are enforced server-side with a CAS update on the previous status; the UI derives its buttons from its own copy of the map.
- Passenger invite tokens are sha256-hashed at rest, single-use (pending→accepted CAS), 7-day TTL; accept flow refuses to link to an existing-email account (409, anti-takeover) and regenerates the session.
- Any seat/pax/price mutation (change-request approval, cancellations) must be one transaction with a conditional atomic capacity update (`capacity_booked + delta <= capacity_total` in the WHERE) — claim the pending row first, then apply. Room assignment uses `SELECT ... FOR UPDATE` on the room row before counting occupants.
- CSV exports of passenger-controlled text must neutralize spreadsheet formulas (prefix leading `=+-@` with `'`) — see the shared `csv()` helper.
- `paxDelta` semantics are bound to request type at creation: add>0, remove<0, other types must not carry a delta.
- E2E: staging seed includes the DR Faith & Leisure tour (slug `test-dr-faith-leisure`, 3 departures identified by `notes` = DR-FL-2026-00x); a full 36-step lifecycle script pattern lives in session history (login-per-role cookie sessions, expect 200/201 variance).
