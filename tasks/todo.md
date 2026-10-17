# Master Task List: TourOps Enterprise Platform

> **Source PRD:** [docs/prd-tourops-platform.md](file:///Users/wisnuflash/freelance/tourops-app/docs/prd-tourops-platform.md) (Revision 1.1)  
> **Plan Document:** [tasks/plan.md](file:///Users/wisnuflash/freelance/tourops-app/tasks/plan.md)  
> **Status Target:** `tasks/todo.md` & `task.md`  
> **Last Updated:** October 17, 2026  

---

## Phase 1d: Core Booking Hardening, Staged Payments, Hold & Idempotency

### Task 1: Database Schema Expansion for Capacity Hold, Idempotency & Booking States
**Description:** Expand the PostgreSQL schema via Drizzle ORM in `@workspace/db` to support PRD 1.1 booking hold invariants, request idempotency, structured room allocations, and expanded booking statuses.

**Acceptance criteria:**
- [x] Add `hold_expires_at` (timestamp) and `idempotency_key` (varchar unique) to `bookings` table.
- [x] Add `room_allocations` (jsonb array of `{ roomType: string, count: number }`), `single_supplement_cost` (numeric), `departure_surcharge` (numeric), `discount_amount` (numeric), `tax_amount` (numeric), and `service_fee_amount` (numeric) to `bookings`.
- [x] Expand `bookingStatusEnum` to include `pending_payment`, `expired`, `cancelled_unpaid`, `cancelled_by_customer`, and `cancelled_by_operator`.
- [x] Add database check constraint or strict validation guaranteeing `tour_departures.capacityBooked <= tour_departures.capacityTotal`.
- [x] Export updated Zod insert/select schemas in `@workspace/api-zod`.

**Verification:**
- [x] Tests pass: `pnpm --filter @workspace/api-server run test`
- [x] Build succeeds: `pnpm run typecheck`
- [x] Manual check: Run `pnpm run build` and inspect database migration or schema exports.

**Dependencies:** None  
**Files likely touched:**
- `lib/db/src/schema/schema.ts`
- `lib/api-zod/src/index.ts`  
**Estimated scope:** Medium (2-3 files)

---

### Task 2: Atomic Capacity Seat Hold on Booking Creation (US-03)
**Description:** Implement atomic 30-minute seat reservations on `POST /api/bookings`. When a booking is submitted, atomically increment `capacityBooked` on `tour_departures` inside a PostgreSQL transaction using `SELECT ... FOR UPDATE` and set `hold_expires_at = NOW() + INTERVAL '30 minutes'` with initial status `pending_payment`.

**Acceptance criteria:**
- [x] `POST /api/bookings` locks the target `tour_departures` row using `SELECT ... FOR UPDATE`.
- [x] Rejects the booking with HTTP 409 if `capacityBooked + partySize > capacityTotal`.
- [x] Atomically increments `capacityBooked` by `partySize` and inserts booking with status `pending_payment` and `hold_expires_at` 30 minutes in the future.
- [x] Concurrency test validates that concurrent bookings competing for the last seat result in exactly one successful hold.

**Verification:**
- [x] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "capacity hold"`
- [x] Build succeeds: `pnpm run typecheck`
- [x] Manual check: Attempt simultaneous bookings exceeding departure capacity via test script.

**Dependencies:** Task 1  
**Files likely touched:**
- `artifacts/api-server/src/routes/bookingsRoutes.ts`
- `artifacts/api-server/src/routes/shared.ts`
- `artifacts/api-server/test/capacity-hold.test.ts`  
**Estimated scope:** Medium (3 files)

---

### Task 3: Booking Request Idempotency via Header Validation (US-03)
**Description:** Add idempotent execution to `POST /api/bookings` by requiring and validating the `Idempotency-Key` header (UUID) to prevent accidental duplicate bookings and duplicate charges.

**Acceptance criteria:**
- [x] `POST /api/bookings` validates presence and UUID format of `Idempotency-Key` header.
- [x] If an identical key with identical payload is received within 24 hours, returns the previously created booking with HTTP 200 and an `Idempotent-Replay: true` header.
- [x] If the same key is reused with a differing payload, returns HTTP 422 Unprocessable Entity.
- [x] Frontend booking submit button enters a disabled, loading state while request is in flight.

**Verification:**
- [x] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "idempotency"`
- [x] Build succeeds: `pnpm run typecheck`
- [x] Manual check: Replay identical `POST /api/bookings` request and verify no new database row is inserted.

**Dependencies:** Task 2  
**Files likely touched:**
- `artifacts/api-server/src/routes/bookingsRoutes.ts`
- `artifacts/tourops/src/components/booking-drawer.tsx`  
**Estimated scope:** Small (2 files)

---

## Checkpoint 1: Seat Holds & Idempotency
- [x] Database schema migrations applied cleanly.
- [x] Booking creation atomically locks departure capacity.
- [x] Duplicate submit requests are safely rejected/replayed without data corruption.
- [x] `pnpm run typecheck` passes without errors.

---

### Task 4: Dynamic Staged Installment Generator Engine (US-04)
**Description:** Implement the business logic that generates staged installment schedules based on $D$ (number of days between booking date and tour departure date), strictly enforcing the mathematical invariant that the sum of installments equals `totalPrice` exactly.

**Acceptance criteria:**
- [ ] For $D \le 30$ days: generates 1 installment (100% full payment due at checkout).
- [ ] For $31 \le D \le 90$ days: generates 2 installments (30% deposit at checkout, 70% due at $D-30$).
- [ ] For $D \ge 91$ days: generates 3 installments (20% deposit at checkout, 30% due at $D-90$, 50% due at $D-30$).
- [ ] Enforces invariant: $\sum_{i=1}^{n} \text{amount}(S_i) = \text{totalPrice}$ exactly by calculating the last installment as $S_n = \text{totalPrice} - \sum_{i=1}^{n-1} S_i$.
- [ ] Stores multi-language labels (`labelEn`, `labelId`) and creates snapshot rows in `booking_payment_schedules`.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "installment generator"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Unit test fixtures covering $D=15, 30, 31, 60, 90, 91, 180$ days verify exact totals with no rounding drift.

**Dependencies:** Task 1  
**Files likely touched:**
- `artifacts/api-server/src/routes/shared.ts`
- `artifacts/api-server/src/routes/bookingsRoutes.ts`
- `artifacts/api-server/test/installments.test.ts`  
**Estimated scope:** Medium (3 files)

---

### Task 5: Server-Authoritative Quote Endpoint & Precision Pricing Engine (US-01, US-02)
**Description:** Create an authoritative `POST /api/tours/:id/quote` endpoint ($p95 \le 300\text{ms}$) that calculates the complete breakdown: base adult price, child price (`child_ratio`), room allocations (Matrimonial/Doble/Triple $\times$ duration nights), single supplement for odd party sizes, departure surcharges, promo discount, and tax/service fees.

**Acceptance criteria:**
- [ ] Computes accommodation surcharge: $\sum (\text{nightlyRate} \times \text{tourNights} \times \text{count})$ based on submitted `roomAllocations`.
- [ ] Automatically applies single supplement surcharge if party size leaves a single traveler in a multi-bed room.
- [ ] Enforces child pricing: $\text{adultPrice} \times \text{childRatio}$ ($0 < \text{childRatio} \le 1.0$), rejecting values greater than adult price.
- [ ] Validates currency freshness: if hotel/rate currency differs from tour currency, requires an exchange rate in `global_settings` with age $< 24$ hours; otherwise blocks quote with explanatory notice.
- [ ] All money values rounded using `ROUND_HALF_UP` to minor currency unit.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "quote endpoint"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Submit quotes with mixed room types, children, and single occupancy; verify output fields against golden test data.

**Dependencies:** Task 1  
**Files likely touched:**
- `artifacts/api-server/src/routes/pricingRoutes.ts`
- `artifacts/api-server/src/routes/toursRoutes.ts`
- `artifacts/api-server/test/pricing-engine.test.ts`  
**Estimated scope:** Medium (3-4 files)

---

### Task 6: Responsive Booking Drawer Integration & Guest State Persistence (US-01)
**Description:** Integrate the 3-step responsive `BookingDrawer` with the authoritative server quote endpoint, and persist unauthenticated guest configuration in `sessionStorage` (2-hour TTL) across login redirects.

**Acceptance criteria:**
- [ ] Step 1 (Departure Date & City) and Step 2 (Rooms & Party Size) calculate live client preview in $\le 50\text{ms}$.
- [ ] Transitioning to Step 3 calls `POST /api/tours/:id/quote`. If server price differs from preview, the UI visibly updates the price and explains the adjustment.
- [ ] Unauthenticated guest state is saved in `sessionStorage` (`tour_booking_draft_<tourId>`) with a 2-hour expiration, containing only non-sensitive preferences (dates, city, party size, rooms).
- [ ] Inline login/registration in drawer restores saved state without losing user progress.
- [ ] Component satisfies WCAG 2.2 AA (keyboard focus trap, ESC key close, ARIA live regions on price updates).

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/tourops run test` (or UI test runner)
- [ ] Build succeeds: `pnpm --filter @workspace/tourops run build`
- [ ] Manual check: Configure a tour booking as an unauthenticated guest, log in via the drawer tab, and verify that all selections persist into checkout.

**Dependencies:** Task 5  
**Files likely touched:**
- `artifacts/tourops/src/components/booking-drawer.tsx`
- `artifacts/tourops/src/pages/customer/tour-detail.tsx`
- `artifacts/tourops/src/lib/booking-storage.ts`  
**Estimated scope:** Medium (3 files)

---

## Checkpoint 2: Pricing Engine & Booking Drawer
- [ ] Installment generator produces mathematically exact schedules across all $D$ ranges.
- [ ] Quote API computes room allocations, child rates, and single supplements accurately.
- [ ] Booking drawer integrates with server quote and retains unauthenticated guest state.
- [ ] All unit and type tests pass cleanly.

---

### Task 7: Sequential Payment Allocation Engine (US-04)
**Description:** Build the payment application engine that applies incoming payments and partial payments sequentially to the oldest pending installment row in `booking_payment_schedules`, transitioning installment and booking statuses atomically.

**Acceptance criteria:**
- [ ] A successful payment applies funds to the oldest `pending` or `partially_paid` installment row.
- [ ] If payment exceeds installment amount, marks current installment as `paid` and cascades surplus to subsequent installment.
- [ ] Rejects payment intents exceeding total remaining balance on the booking.
- [ ] When the initial deposit installment is satisfied, atomically transitions booking status from `pending_payment` to `confirmed`.
- [ ] When all installments are satisfied, sets booking status to `completed` fulfillment readiness.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "payment allocation"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Simulate split payments ($100 on $500 total) and verify row-by-row installment `paidAmount` updates.

**Dependencies:** Task 4  
**Files likely touched:**
- `artifacts/api-server/src/routes/shared.ts`
- `artifacts/api-server/src/routes/paymentRoutes.ts`
- `artifacts/api-server/test/payment-allocation.test.ts`  
**Estimated scope:** Medium (3 files)

---

### Task 8: Customer Portal Installment Timeline & Payment Action (US-04)
**Description:** Update `/my-bookings/:id` and `/checkout/:id` to render a modern visual payment schedule timeline with status badges, due dates, remaining balances, and a direct "Pay Installment" action.

**Acceptance criteria:**
- [ ] Displays a vertical or horizontal milestone timeline of all installments with status badges (`Pending`, `Paid`, `Partially Paid`, `Overdue`).
- [ ] Displays remaining balance, original installment amount, and paid amount formatted in tour currency.
- [ ] "Pay Next Installment" button initializes payment intent for the exact outstanding amount of the active installment.
- [ ] Full payment toggle allows customer to pay all remaining installments in one transaction with early payment discount if applicable.
- [ ] Responsive across mobile and desktop screens with localized labels (English/Indonesian).

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/tourops run build`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Open booking detail with a 3-installment schedule and verify installment status changes dynamically upon payment.

**Dependencies:** Task 7, Task 8  
**Files likely touched:**
- `artifacts/tourops/src/pages/customer/booking-detail.tsx`
- `artifacts/tourops/src/pages/customer/checkout.tsx`
- `artifacts/tourops/src/components/installment-timeline.tsx`  
**Estimated scope:** Medium (3 files)

---

### Task 9: Late Payment Auto-Cancellation & Grace Period Management (US-06)
**Description:** Implement the late payment tracking system that flags overdue installments, manages a 3-day grace period, auto-cancels unpaid bookings to `cancelled_unpaid`, releases departure capacity, and allows accounting overrides with audit logging.

**Acceptance criteria:**
- [ ] Identifies installments where `dueDate < NOW()` and `status = 'pending'`, updating status to `overdue`.
- [ ] Sends automated notification reminders at $D+1$ and $D+3$ past due date.
- [ ] If grace period of 3 days expires without payment, transitions booking status to `cancelled_unpaid`, cancels remaining installment rows, and releases `capacityBooked` back to the departure.
- [ ] Confirms that initial deposit is non-refundable upon cancellation for non-payment.
- [ ] Allows `accounting` role to manually extend grace period via `/api/admin/bookings/:id/extend-grace` requiring a mandatory justification string logged in `audit_logs`.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "late payment"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Run test cron job with past-due booking and verify status transitions to `cancelled_unpaid` and capacity is restored.

**Dependencies:** Task 7  
**Files likely touched:**
- `artifacts/api-server/src/lib/paymentReminderJob.ts`
- `artifacts/api-server/src/routes/lifecycleRoutes.ts`
- `artifacts/api-server/src/routes/opsRoutes.ts`  
**Estimated scope:** Medium (3 files)

---

### Task 10: Customer Cancellation & Tiered Refund Calculation Engine (US-07)
**Description:** Implement the customer cancellation workflow and tiered refund engine based on days remaining prior to departure ($\ge 91\text{d}: 100\% - \text{admin fee}$, $61\text{--}90\text{d}: 70\%$, $31\text{--}60\text{d}: 40\%$, $\le 30\text{d}: 0\%$).

**Acceptance criteria:**
- [ ] `POST /api/bookings/:id/cancel-preview` returns refundable amount, non-refundable deductions, and administration fee before confirmation.
- [ ] `POST /api/bookings/:id/cancel` sets booking status to `cancelled_by_customer`, cancels pending installments, and releases departure capacity.
- [ ] Issues refund via gateway abstraction (`refundPayment`) to original payment method.
- [ ] If refund amount exceeds configured threshold ($1,000 USD / equivalent), sets refund status to `pending_approval` requiring `admin` approval before disbursement.
- [ ] Every calculation and status change is immutably recorded in `audit_logs` and `refunds` tables.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "cancellation refund"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Cancel bookings at 120 days, 75 days, 45 days, and 10 days out; verify correct percentage calculations.

**Dependencies:** Task 7  
**Files likely touched:**
- `artifacts/api-server/src/routes/paymentRoutes.ts`
- `artifacts/api-server/src/routes/lifecycleRoutes.ts`
- `artifacts/tourops/src/pages/customer/booking-detail.tsx`  
**Estimated scope:** Medium (3 files)

---

## Checkpoint 3: Installments, Late Payments & Refunds
- [ ] Sequential payment engine allocates funds across multiple installments.
- [ ] Customer portal renders dynamic installment timeline with direct pay actions.
- [ ] Late payments trigger grace period reminders and capacity release upon expiry.
- [ ] Tiered refund calculations pass unit tests for all milestone dates.
- [ ] Full system typecheck passes cleanly.

---

## Phase 2a: Live Stripe Gateway, Webhook Sync & Reconciliation (US-05)

### Task 11: Production Stripe Provider Integration & HMAC Signature Verification (US-05)
**Description:** Implement the live Stripe payment provider adhering to the payment provider abstraction (`createIntent`, `confirmPayment`, `handleWebhook`, `refundPayment`) using Stripe Elements on frontend and `@stripe/stripe-node` on backend with strict HMAC webhook verification.

**Acceptance criteria:**
- [ ] Frontend initializes `@stripe/react-stripe-js` Elements with PaymentIntent client secret.
- [ ] Webhook route `/api/payments/webhook/stripe` verifies `stripe-signature` using the raw request body and webhook secret.
- [ ] Invalid or tampered signatures are rejected with HTTP 400 and logged in security telemetry.
- [ ] Supports card payments, digital wallets (Apple Pay/Google Pay), and SCA 3D-Secure challenges.
- [ ] Card details never touch TourOps servers (maintaining PCI-DSS SAQ A scope).

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "stripe provider"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Execute test payment using Stripe CLI test card triggers and verify webhook delivery.

**Dependencies:** Task 7  
**Files likely touched:**
- `artifacts/api-server/src/lib/payments/stripeProvider.ts`
- `artifacts/api-server/src/routes/paymentRoutes.ts`
- `artifacts/tourops/src/pages/customer/checkout.tsx`  
**Estimated scope:** Medium (3 files)

---

### Task 12: Idempotent Webhook Processing via `payment_events` Compound Key (US-05)
**Description:** Guarantee idempotent webhook processing by inserting events into `payment_events` with unique constraint `(provider, event_id)` inside the same PostgreSQL transaction that updates payment and schedule records.

**Acceptance criteria:**
- [ ] Enforces unique compound index `(provider, event_id)` on `payment_events` table.
- [ ] If an already-processed webhook event is redelivered, immediately returns HTTP 200 `{ status: "duplicate_ignored" }` without re-running accounting side effects.
- [ ] Webhook record insertion, payment row update, and installment schedule update execute within a single atomic database transaction (`db.transaction`).
- [ ] Database error in payment update rolls back webhook event record.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "webhook idempotency"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Send duplicate webhook payload via test suite; verify single database mutation occurs.

**Dependencies:** Task 11  
**Files likely touched:**
- `artifacts/api-server/src/routes/paymentRoutes.ts`
- `artifacts/api-server/src/routes/shared.ts`  
**Estimated scope:** Small (2 files)

---

### Task 13: Manual Bank Transfer Verification Workflow for Accounting (US-05)
**Description:** Implement offline bank transfer payment option where customers upload transfer receipt image/PDF (`status = 'awaiting_verification'`), and `accounting` staff can review, verify, and approve/reject transfers from their dashboard.

**Acceptance criteria:**
- [ ] Checkout page provides "Bank Transfer" option displaying operator bank account details and reference code.
- [ ] Allows customer to upload payment proof (JPG, PNG, PDF $\le 5\text{MB}$) stored securely in object storage.
- [ ] Accounting portal (`/ops/accounting`) displays queue of pending transfer verifications with proof viewer.
- [ ] Approving a transfer triggers identical sequence as gateway webhook: updates payment status, satisfies installment, and transitions booking to `confirmed`.
- [ ] Rejecting a transfer requires a rejection reason sent via email to customer.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "bank transfer"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Submit a bank transfer proof as a customer, approve it as accounting role, and verify booking confirmation.

**Dependencies:** Task 7  
**Files likely touched:**
- `artifacts/api-server/src/routes/paymentRoutes.ts`
- `artifacts/tourops/src/pages/customer/checkout.tsx`
- `artifacts/tourops/src/pages/ops/accounting.tsx`  
**Estimated scope:** Medium (3-4 files)

---

### Task 14: Daily Automated Financial Reconciliation Job (US-05)
**Description:** Build a scheduled reconciliation worker that compares Stripe transaction records with local `payment_events` and `payments` tables, generating daily reports and alerting on anomalies.

**Acceptance criteria:**
- [ ] Queries Stripe BalanceTransactions API for preceding 24-hour window.
- [ ] Cross-references each external transaction ID against `payments.transactionId` and `payment_events.eventId`.
- [ ] Flags discrepancies: missing internal records, mismatched amounts, unrecorded refunds, or fee variances.
- [ ] Persists reconciliation summary in `reconciliation_reports` table accessible via `/ops/accounting`.
- [ ] Emits high-priority alert to accounting if variance $> 0$.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "reconciliation"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Run reconciliation script against simulated mismatched transaction set and verify generated discrepancy report.

**Dependencies:** Task 11, Task 12  
**Files likely touched:**
- `artifacts/api-server/src/lib/reconciliationJob.ts`
- `artifacts/api-server/src/routes/opsRoutes.ts`
- `artifacts/tourops/src/pages/ops/accounting.tsx`  
**Estimated scope:** Medium (3 files)

---

## Checkpoint 4: Payment Gateways & Reconciliation
- [ ] Production Stripe provider handles Card, Wallets, and 3D Secure.
- [ ] Webhook processing is idempotent with compound database unique constraints.
- [ ] Bank transfer manual approval flow operational in accounting dashboard.
- [ ] Daily reconciliation job detects simulated payment discrepancies.
- [ ] Zero build or type errors.

---

## Phase 2b: Operations Workflows, Reminders & Automated Jobs (US-10, US-11, US-12)

### Task 15: Background Jobs for Seat Hold Expiration & Installment Reminders (US-03, US-04)
**Description:** Configure BullMQ workers and cron schedulers to automatically sweep expired seat holds and dispatch transactional email reminders relative to installment due dates.

**Acceptance criteria:**
- [ ] Every 60 seconds, sweeps bookings where `status = 'pending_payment'` and `hold_expires_at < NOW()`.
- [ ] Transitions expired bookings to `status = 'expired'` and restores `capacityBooked` to the departure.
- [ ] If payment arrives after expiration, attempts to re-acquire seat; if sold out, triggers automatic full refund.
- [ ] Daily reminder worker sends email notices for installments at $D-7$, $D-1$, and on the due date.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "hold expiration"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Create a booking with a 5-second mock hold; verify background worker expires the booking and releases capacity.

**Dependencies:** Task 2, Task 4  
**Files likely touched:**
- `artifacts/api-server/src/lib/holdExpirationJob.ts`
- `artifacts/api-server/src/lib/paymentReminderJob.ts`
- `artifacts/api-server/src/lib/emailService.ts`  
**Estimated scope:** Medium (3-4 files)

---

### Task 16: Automated Booking Fulfillment Workflow Step Dispatcher (US-10)
**Description:** Implement automatic provisioning of fulfillment workflows (`booking_workflows`) and service steps (`workflow_steps`: Airline, Hotel, Transport, Guide, Sights) upon booking confirmation, with $D-14$ alert escalation and cancellation cascade.

**Acceptance criteria:**
- [ ] When a booking transitions to `confirmed`, automatically creates `booking_workflows` with 5 discrete `workflow_steps`.
- [ ] Ops staff can assign suppliers/internal staff, update status (`pending`, `assigned`, `confirmed`, `completed`), and record inline notes in `/admin/workflow-detail.tsx`.
- [ ] Automatic alert raised in operations dashboard if any workflow step remains unfulfilled at 14 days prior to departure ($D-14$).
- [ ] When a booking is cancelled, all active workflow steps cascade to `cancelled` and affected suppliers receive email notifications.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "workflow dispatcher"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Confirm a test booking, verify 5 workflow steps appear in `/admin/workflow-detail.tsx`, and cancel booking to verify cancellation cascade.

**Dependencies:** Task 7  
**Files likely touched:**
- `artifacts/api-server/src/routes/serviceOpsRoutes.ts`
- `artifacts/api-server/src/routes/lifecycleRoutes.ts`
- `artifacts/tourops/src/pages/admin/workflow-detail.tsx`  
**Estimated scope:** Medium (3 files)

---

### Task 17: Customer Booking Change Engine (US-11)
**Description:** Build the customer self-service booking change engine allowing date, room type, or party size alterations up to $D-30$ prior to departure, with atomic dual-departure capacity locking and schedule recalculation.

**Acceptance criteria:**
- [ ] Allows authenticated customers to request departure date, party size, or room type modifications up to $D-30$.
- [ ] Atomically releases capacity on old departure and claims capacity on new departure inside a single transaction.
- [ ] Recomputes total price: if new price is higher, generates an additional installment row; if lower, processes refund per policy.
- [ ] Applies configured change fee (e.g. $50 USD) to the updated balance.
- [ ] Changes requested after $D-30$ require manual escalation to `operations_manager`.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "booking changes"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Change booking departure date in customer portal; verify old departure capacity increments and new departure capacity decrements atomically.

**Dependencies:** Task 2, Task 5  
**Files likely touched:**
- `artifacts/api-server/src/routes/bookingsRoutes.ts`
- `artifacts/tourops/src/pages/customer/booking-detail.tsx`
- `artifacts/tourops/src/components/change-booking-dialog.tsx`  
**Estimated scope:** Medium (3 files)

---

### Task 18: Operator Departure Cancellation & Bulk Transfer Engine (US-12)
**Description:** Implement operator-initiated departure cancellation when minimum passenger threshold is unmet, supporting automated full refunds or zero-fee customer transfers to alternate departures.

**Acceptance criteria:**
- [ ] `operations_manager` or `admin` can cancel a departure no later than $D-21$ days prior to departure date.
- [ ] Automatically transitions all linked bookings to `cancelled_by_operator`.
- [ ] Sends automated notification emails providing travelers with a choice: (1) 100% full refund with zero cancellation fees, or (2) Free transfer to an alternate open departure.
- [ ] Automated bulk refund execution logs each transaction in `refunds` and notifies `accounting`.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "operator departure cancellation"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Trigger departure cancellation from admin departures page; verify all customers receive automated options and linked bookings update.

**Dependencies:** Task 10  
**Files likely touched:**
- `artifacts/api-server/src/routes/toursRoutes.ts`
- `artifacts/api-server/src/routes/lifecycleRoutes.ts`
- `artifacts/tourops/src/pages/admin/departures.tsx`  
**Estimated scope:** Medium (3 files)

---

## Checkpoint 5: Ops Automation & Lifecycle Workflows
- [ ] Hold expiration job runs every 60s without memory leaks.
- [ ] Installment reminders fire at D-7, D-1, and D-0.
- [ ] 5-step fulfillment workflows auto-generated on booking confirmation.
- [ ] Self-service customer booking changes lock dual-departure capacity atomically.
- [ ] Operator departure cancellation triggers zero-deduction refund pipeline.

---

## Phase 2c: Supplier Self-Service Portal & Rate Card Management (US-09, US-14)

### Task 19: Supplier Entity Multi-Tenancy & Member Association (US-09)
**Description:** Decouple supplier data ownership from individual user accounts by introducing `supplier_entities` and `supplier_members` tables, enforcing row-level access control across all supplier catalogs.

**Acceptance criteria:**
- [ ] Create `supplier_entities` (id, name, type, contactEmail, status) and `supplier_members` (id, supplierEntityId, userId, role) tables.
- [ ] Middleware filters supplier catalog queries (`hotels`, `transport_companies`, `guide_rates`, `sights`) by `supplierEntityId` rather than `createdBy`.
- [ ] Multiple supplier staff users can be assigned to a single supplier entity with shared visibility.
- [ ] HQ `admin` approval required before any new supplier entity or rate card becomes active.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "supplier multi-tenancy"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Log in as two users belonging to the same supplier entity; verify shared rate cards and service requests.

**Dependencies:** Task 1  
**Files likely touched:**
- `lib/db/src/schema/schema.ts`
- `artifacts/api-server/src/routes/supplierOpsRoutes.ts`
- `artifacts/api-server/src/routes/shared.ts`  
**Estimated scope:** Medium (3-4 files)

---

### Task 20: Supplier Excel Rate Card Bulk Import / Export Engine
**Description:** Build standardized Excel template import/export for supplier rate cards with cell data validation, strict schema checking, and non-negative price regex validation (`MONEY_RE`).

**Acceptance criteria:**
- [ ] Provides downloadable standardized `.xlsx` templates for Hotel, Transport, Guide, and Sights rate cards.
- [ ] Upload parser validates row values, rejecting negative numbers or invalid currency codes via `MONEY_RE` regex.
- [ ] Atomically inserts or updates rate card records, returning line-by-line validation errors if format is violated.
- [ ] Changes require approval by `admin` before affecting live tour quotes.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "rate card import"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Upload valid and corrupted Excel rate card templates; verify detailed validation errors are returned.

**Dependencies:** Task 19  
**Files likely touched:**
- `artifacts/api-server/src/routes/rateCardsRoutes.ts`
- `artifacts/tourops/src/pages/supplier/index.tsx`
- `lib/tour-spreadsheet/src/index.ts`  
**Estimated scope:** Medium (3 files)

---

### Task 21: Tour Catalog Advanced Search & Filter Performance Optimization (US-14)
**Description:** Optimize tour catalog search API with multi-faceted filtering (destination, departure month, origin city, duration, price range) and sorting, ensuring median latency $\le 200\text{ms}$ ($p95 \le 600\text{ms}$).

**Acceptance criteria:**
- [ ] Full-text search on tour title, description, and highlights.
- [ ] Filters for destination country/city, duration range, price slider, departure months, and departure origin cities.
- [ ] Only returns published tours (`status = 'published'`), completely excluding drafts.
- [ ] Database query optimization with composite indexes on `(status, destination_country_id, base_price)`.
- [ ] Benchmark test confirms catalog search median response time $\le 200\text{ms}$ across a 10,000 tour dataset.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "catalog search"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Run search benchmark test script and verify latency distributions.

**Dependencies:** None  
**Files likely touched:**
- `artifacts/api-server/src/routes/catalogRoutes.ts`
- `artifacts/tourops/src/pages/customer/browse-tours.tsx`
- `lib/db/src/schema/schema.ts`  
**Estimated scope:** Medium (3 files)

---

## Checkpoint 6: Supplier Entity Management & Catalog Search
- [ ] Supplier multi-tenancy enforces entity-level data isolation.
- [ ] Excel rate card bulk upload validates price formatting rigorously.
- [ ] Catalog search API fulfills median $\le 200\text{ms}$ performance threshold.
- [ ] All tests pass without warnings.

---

## Phase 3a: Group Travel, Passenger Security & B2B Proposals (US-08, US-13)

### Task 22: Cryptographic Group Join Codes & Party Size Capacity Bounds (US-08)
**Description:** Implement cryptographic alphanumeric `join_code` generation and validation for group bookings, strictly bounding participant registrations to held party size (`partySizeExpected`).

**Acceptance criteria:**
- [ ] Generates unique, cryptographically random alphanumeric join codes ($\ge 8$ chars) on group booking creation.
- [ ] Accessing `/join/:joinCode` allows travelers to register their details onto the booking manifest.
- [ ] Rejects join requests when registered travelers reach `partySizeExpected`; adding further travelers requires a formal booking change.
- [ ] Prevents duplicate self-joins by the group leader and blocks joins to cancelled or expired bookings.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "group join codes"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Create a group booking with party size 3, join with 3 distinct accounts, and verify the 4th attempt is rejected.

**Dependencies:** Task 2  
**Files likely touched:**
- `artifacts/api-server/src/routes/bookingsRoutes.ts`
- `artifacts/tourops/src/pages/customer/group-tour.tsx`  
**Estimated scope:** Small (2 files)

---

### Task 23: Sensitive Passenger Data (PII) Encryption at Rest & UI Masking (US-08, Section 9)
**Description:** Secure sensitive passenger information (passport numbers, dates of birth, medical/dietary notes) using AES-256-GCM encryption at rest, role-scoped access control, and UI masking.

**Acceptance criteria:**
- [ ] Passport number and medical notes columns encrypted at rest using AES-256-GCM application-level encryption.
- [ ] In customer and ops UI views, passport numbers are masked (e.g. `XXXX-XXXX-8912`) unless explicitly unmasked by authorized staff.
- [ ] Access to unmasked PII is restricted to `admin`, `operations_manager`, and assigned `tour_leader`, logging each view in `audit_logs`.
- [ ] Enforces passenger passport validity rule: expiration date must be $\ge 6$ months after tour return date.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "pii encryption"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Inspect raw database row to verify ciphertext, then inspect customer UI to verify masked display.

**Dependencies:** Task 1  
**Files likely touched:**
- `artifacts/api-server/src/lib/crypto.ts`
- `artifacts/api-server/src/routes/bookingsRoutes.ts`
- `artifacts/tourops/src/pages/customer/manage-passengers.tsx`  
**Estimated scope:** Medium (3 files)

---

### Task 24: B2B Travel Advisor Custom Quote Requests & Proposals Engine (US-13)
**Description:** Implement custom quote request workflow allowing travel advisors and group organizers to submit detailed trip requirements, auto-assigned to `tour_builder` for proposal generation and one-click booking conversion.

**Acceptance criteria:**
- [ ] Quote request form captures destination, dates, party size, budget, and custom requirements into `quote_requests` table.
- [ ] Auto-assigns new quote requests to available `tour_builder` staff with notification dispatch.
- [ ] Tour builders can assemble a custom proposal with customized itinerary, itemized pricing, and proposal validity period.
- [ ] Customer receives proposal link and can accept with a single click, instantly provisioning a `confirmed` booking and installment schedule.
- [ ] Response time tracked to measure compliance with KPI 3 ($< 3$ business hours).

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "quote proposals"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Submit custom quote request as a customer, draft proposal as tour builder, and accept proposal to generate booking.

**Dependencies:** Task 5  
**Files likely touched:**
- `artifacts/api-server/src/routes/serviceOpsRoutes.ts`
- `artifacts/tourops/src/pages/customer/request-quote.tsx`
- `artifacts/tourops/src/pages/ops/tour-builder.tsx`  
**Estimated scope:** Medium (3-4 files)

---

## Checkpoint 7: Group Travel, PII Security & B2B Proposals
- [ ] Group join codes securely bound to booking capacity limit.
- [ ] Sensitive passenger data encrypted at rest with UI masking and audit logging.
- [ ] B2B quote request and proposal generation workflow functional end-to-end.
- [ ] Typecheck and lint checks pass clean.

---

## Phase 3b: AI Itinerary Deterministic Validation & System Observability (Section 8, Section 9)

### Task 25: AI Itinerary Context Scrubber & Deterministic Geographic Validation (Section 8)
**Description:** Upgrade the AI Tour Generator pipeline (`admin/tour-generator.tsx`) with strict PII scrubbing, context limited to verified master data IDs, post-generation geographic cluster validation, and a 15-second hard timeout triggering graceful heuristic fallback.

**Acceptance criteria:**
- [ ] Retrieval engine feeds only public destination master data (`cities`, `sights`, `hotels`, `airports`) with zero PII.
- [ ] Prompt mandates referencing only existing master data IDs; prohibits inventing arbitrary entities.
- [ ] Post-generation validator verifies all assigned sights and hotels belong to the destination city or adjacent cluster.
- [ ] 15-second hard timeout aborts LLM request and activates deterministic heuristic generator without 500 error.
- [ ] Generated tours are saved with `status = 'draft'` requiring human `tour_builder` review and `admin` approval to publish.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "ai tour generator"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Trigger AI tour generator with invalid/timeout mock; verify deterministic fallback generates valid draft tour.

**Dependencies:** None  
**Files likely touched:**
- `artifacts/api-server/src/routes/toursRoutes.ts`
- `artifacts/api-server/src/lib/aiItineraryGenerator.ts`
- `artifacts/tourops/src/pages/admin/tour-generator.tsx`  
**Estimated scope:** Medium (3 files)

---

### Task 26: Automated Encrypted PDF Document Generation via BullMQ (Section 9)
**Description:** Build background PDF document generator for payment invoices, booking confirmation vouchers, daily service vouchers, and complete customer itineraries, stored encrypted and accessible only to authorized owners.

**Acceptance criteria:**
- [ ] BullMQ job handles asynchronous PDF rendering via `puppeteer` or `jspdf`.
- [ ] Generates standardized branded PDFs: (1) Payment Receipt/Invoice, (2) Booking Confirmation, (3) Daily Vouchers, (4) Tour Itinerary Brochure.
- [ ] PDFs stored encrypted in object storage with time-limited signed download URLs.
- [ ] Download endpoint `/api/bookings/:id/documents/:docType` enforces row ownership (`customerId` match or staff role).

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "pdf generator"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Complete a payment and download generated PDF invoice; verify layout, data accuracy, and authorization check.

**Dependencies:** Task 7  
**Files likely touched:**
- `artifacts/api-server/src/lib/pdfGeneratorWorker.ts`
- `artifacts/api-server/src/routes/bookingsRoutes.ts`  
**Estimated scope:** Medium (3 files)

---

### Task 27: Concurrency Stress Test & Invariant Verification Suite (Section 9, KPIs 4 & 5)
**Description:** Create automated verification test suites including a 200-parallel requests concurrency test against 1 remaining departure seat and an invariant suite proving installment schedule sums equal total price across 1,000 random permutations.

**Acceptance criteria:**
- [ ] Concurrency test spawns 200 parallel booking requests targeting a departure with exactly 1 available seat; asserts exactly 1 success and 199 HTTP 409 responses.
- [ ] Mathematical invariant test generates 1,000 random booking permutations (varying party sizes, nights, currencies, discounts, and room types); asserts $\sum \text{installments} = \text{totalPrice}$ with 0 cent deviation.
- [ ] Automated authorization test covers all 19 roles against protected endpoints asserting 100% adherence to section 3 matrix.

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "concurrency and invariants"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Run concurrency test script; verify zero overbooking violations in departure database records.

**Dependencies:** Task 2, Task 4  
**Files likely touched:**
- `artifacts/api-server/test/concurrency-overbooking.test.ts`
- `artifacts/api-server/test/invariant-pricing.test.ts`
- `artifacts/api-server/test/rbac-matrix.test.ts`  
**Estimated scope:** Medium (3 files)

---

### Task 28: Security Hardening: Mandatory 2FA for Admin/Accounting & CSRF Guard (Section 9)
**Description:** Enforce mandatory TOTP Two-Factor Authentication for privileged roles (`super_admin`, `admin`, `accounting`) and enable anti-CSRF token verification and origin validation across all state-changing API endpoints.

**Acceptance criteria:**
- [ ] Users with roles `super_admin`, `admin`, or `accounting` are required to enroll in TOTP 2FA before accessing administrative dashboards.
- [ ] Double-submit cookie or custom header CSRF validation enforced on all `POST`, `PUT`, `PATCH`, `DELETE` routes.
- [ ] SameSite cookie strategy validated: `SameSite=Lax` for standard portals; `SameSite=None; Partitioned` reserved only for verified iframe/white-label embeds.
- [ ] Rate limiting and account lockout policy: 5 consecutive failed login attempts trigger a 15-minute freeze (`AUTH-07`).

**Verification:**
- [ ] Tests pass: `pnpm --filter @workspace/api-server run test -- -t "security hardening"`
- [ ] Build succeeds: `pnpm run typecheck`
- [ ] Manual check: Log in as admin without 2FA and verify forced redirect to 2FA enrollment; attempt CSRF attack and verify request rejection.

**Dependencies:** None  
**Files likely touched:**
- `artifacts/api-server/src/routes/accountsRoutes.ts`
- `artifacts/api-server/src/routes/shared.ts`
- `artifacts/tourops/src/pages/auth/two-factor.tsx`  
**Estimated scope:** Medium (3 files)

---

## Final Checkpoint: Complete Platform Acceptance & Verification
- [ ] All 28 tasks completed and verified with automated test suites.
- [ ] 100% pass rate on all role-based authorization test suites.
- [ ] 0 capacity overbooking instances during concurrency stress test.
- [ ] 0 cent price/installment sum discrepancies across multi-night and mixed-currency fixture tests.
- [ ] Production build passes cleanly: `pnpm run build` and `pnpm run typecheck`.
