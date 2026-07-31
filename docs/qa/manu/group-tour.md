# Group Tour & Join-Code Flow (QA 2026-07-31)

Scope: leader group creation, POST /api/bookings/join, join modal on my-bookings.tsx.

## Positive
- PASS — Leader group created with unique join code (DFB05A), departure price used.
- PASS — Second customer (fresh account) joined via code in the UI; join_leader_group booking created (BK-0FBD7F1F) at departure price; leader dashboard shows 2 participants.
- PASS — Capacity model: seats are deducted only at admin confirmation (atomic SQL, sold_out flip); join capacity check compares capacityBooked vs capacityTotal.

## Negative / Security
- PASS — Invalid code → 404 "Invalid join code" (UI toast matches).
- PASS — Missing code → 400.
- **BUG-GT-01 (fixed)** — Joining a cancelled/completed group's code succeeded (200). Fix: /api/bookings/join now rejects cancelled/rejected/completed originals with 409 "This group is no longer accepting members". Retest: 409 for cancelled (AEA753) and completed (372A62) codes. PASS.
- **BUG-GT-02 (fixed)** — Same user could join the same group repeatedly (duplicate join bookings). Fix: 409 "You have already joined this group" when a non-cancelled join booking for the same leader+tour exists. Retest: 409 via API and UI. PASS.
- **BUG-GT-03 (fixed)** — Leader could join their own group. Fix: 400 "You are the leader of this group".
- **BUG-GT-04 (fixed)** — Join modal showed generic "Invalid join code" for every error (masked 409 "already joined"). Fix: my-bookings.tsx onError now surfaces the server's message. Retest in UI: correct specific toasts. PASS.
- PASS — Full departure → 409 "No spots available" (code path verified; capacity check present).
- Code guessing: codes are 6-char uppercase alphanumeric; unauthenticated access is 401; a wrong code is 404. Brute-force is rate-unlimited on this endpoint — acceptable for now, noted in bugs.md as LOW.

## Post-review hardening (same day)
- **BUG-GT-05 (fixed)** — direct POST /api/bookings with join_leader_group bypassed every guard; now 400, share-link dialog routes through /api/bookings/join, price derived server-side from departure, partial unique index closes the duplicate-join race.
- **BUG-GT-06 (fixed)** — by-code lookup 403'd prospective joiners so the share-link dialog never opened; now returns a minimal non-sensitive shape. UI retested end-to-end.

## Status
PASS (after fixes).
