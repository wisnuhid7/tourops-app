# Admin Order Management (QA 2026-07-31)

Scope: admin/bookings.tsx, admin/booking-detail.tsx.

## Positive
- PASS — Bookings list renders all bookings (incl. BK-F021FE00, QA Group OYR7).
- PASS — Search by booking code filters correctly; status filter works.
- PASS — Booking detail shows customer data, travelers, payments, workflow and assignment tabs.
- PASS — Status update (Submitted → Confirmed) persists across reload; capacity auto-deducted atomically on confirm and PDF/itinerary + notifications generated. (Test booking reverted to submitted, capacity restored.)

## Security
- PASS — Unauthenticated: /api/bookings 401. Customer role: 403 on staff booking endpoints.

## Status
PASS.
