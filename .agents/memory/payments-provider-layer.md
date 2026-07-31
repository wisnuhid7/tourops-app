---
name: Payments provider layer
description: How the payment gateway abstraction, webhook idempotency, and session-cookie downgrade work; gotchas for adding Stripe later.
---

- Gateway abstraction lives in api-server `lib/payments/` (provider interface + offline_test provider + shared `processPaymentEvent`). Stripe later = implement the interface, register in the provider map, set PAYMENT_PROVIDER. Event names deliberately mirror Stripe's.
- **Webhook idempotency** = unique index on payment_events(provider, event_id) with insert `onConflictDoNothing`; duplicate deliveries are skipped. Webhook route needs the raw body — `express.raw` is mounted for `/api/payments/webhook` in app.ts BEFORE `express.json`.
- All payment/refund money columns are integer cents; bookings.totalPrice is whole currency units (multiply by 100 at checkout).
- Refund truth: `applyRefundTotals(paymentId)` recomputes refunded_amount/refund_status/status from the refunds table — always call it after any refund state change instead of hand-updating the payment row.
- **Why:** session.regenerate() on login rebuilds the cookie from original options, silently discarding any per-request cookie mutation. The plain-HTTP downgrade (SameSite=Lax, no Secure/Partitioned, for curl/e2e testers) must be re-applied inside regenerateSession, not just in a post-session middleware. Browsers hard-reject SameSite=None cookies lacking Secure — symptom: login 200 but cookie never stored.
- Offline provider test cards by last 4: 0002 declined, 0003 async processing (webhook settles ~2s later), anything else succeeds; refund reason "test_fail" simulates provider refund failure.
