# Booking Engine — Private & Group Tours (QA 2026-07-31)

Scope: customer booking flow on tour-detail.tsx, POST /api/bookings.

## Positive
- PASS — Private booking on "Bali Signature Escape": Private Family, 2 travelers, Room Type Doble → booking created (BK-6CDEC97F / retest BK-F021FE00), visible in My Bookings, detail shows Room Type = Doble, Accommodation $300.00, total $1,660, payment status Unpaid.
- PASS — Group (leader) booking: "QA Group OYR7", party 3, departure price used ($2,400 total), join code generated (DFB05A) and shown on booking detail.
- PASS — Server computes accommodation (rate × nights) authoritatively; PATCH strips roomType/accommodationCost.

## Negative
- PASS — Missing room type: Confirm button disabled, no booking created.
- PASS — Party size cannot go to 0 via the UI stepper.
- N/A — Past date: booking uses admin-managed departures, no free date input; past dates cannot be selected by design.
- **BUG-BE-01 (fixed)** — Duplicate submit: rapid double-click on Confirm Booking created two bookings (BK-5F2DA669 + BK-A4575341). Root cause: `bookMutation.isPending` disables the button asynchronously; second click fires before re-render. Fix: `submittingRef` guard in tour-detail.tsx around all `bookMutation.mutate` call sites, reset in `onSettled`. Retest: only one booking (BK-F021FE00) created on double-click. PASS.

## Status
PASS (after BUG-BE-01 fix).
