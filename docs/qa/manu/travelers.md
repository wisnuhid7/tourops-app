# Traveler / Passenger Management (QA 2026-07-31)

Scope: manage-passengers.tsx, booking-detail Travelers tab, travelers table.

## Positive
- PASS — Add traveler from booking detail: appears in list, count "1 of 3 travelers added", success toast.
- PASS — Update (PATCH /api/my-travelers/:id) and delete (DELETE /api/my-travelers/:id) both 200; UI reflects removal ("0 of 3").
- PASS — Travelers correctly related to booking; counts correct.

## Negative
- PASS — Empty required fields: submit button disabled, no save (no invalid rows created).
- NOTE (UX, low) — The Add Traveler dialog gives no inline error messages; it relies on a disabled button. Acceptable but could be friendlier.

## Issues
- **BUG-TR-01 (fixed)** — Edit/delete controls exist only on the dedicated Manage Passengers page (/manage-passengers, full edit/delete UI), but the booking-detail Travelers tab offered no path to them — testers/users only saw "Add Traveler". Fix: added a "Manage Passengers" button in the Travelers tab linking to /manage-passengers.

## Status
PASS (after BUG-TR-01 fix).
