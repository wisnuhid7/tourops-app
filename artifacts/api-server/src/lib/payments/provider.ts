// Payment gateway abstraction. All amounts are integer minor units (cents).
// Implementations: offlineProvider (test/offline), stripeProvider (future).

export type IntentStatus =
  | "requires_confirmation"
  | "processing"
  | "succeeded"
  | "failed"
  | "canceled";

export interface CreateIntentInput {
  amount: number; // cents
  currency: string;
  bookingId: string;
  customerId: string;
  metadata?: Record<string, string>;
}

export interface PaymentIntentResult {
  intentId: string;
  clientSecret: string;
  status: IntentStatus;
}

export interface ConfirmInput {
  intentId: string;
  /**
   * Test-mode instrument reference. For the offline provider this is a
   * simulated card number (only the last 4 digits are ever inspected or
   * stored — never a real PAN). Real providers receive an opaque token.
   */
  instrument?: string;
}

export interface ConfirmResult {
  status: IntentStatus;
  transactionId?: string;
  failureReason?: string;
}

export interface RefundInput {
  transactionId: string;
  amount: number; // cents
  currency: string;
  reason: string;
  refundId: string; // our refund row id, for provider metadata / events
}

export interface RefundResult {
  status: "pending" | "succeeded" | "failed";
  providerRefundId: string;
  failureReason?: string;
}

/** Normalized event names, mirroring Stripe's vocabulary so a future Stripe
 *  provider maps 1:1. */
export type PaymentEventType =
  | "payment_intent.succeeded"
  | "payment_intent.processing"
  | "payment_intent.payment_failed"
  | "payment_intent.canceled"
  | "charge.refunded"
  | "refund.updated"
  | "refund.failed"
  | "charge.dispute.created"
  | "charge.dispute.updated"
  | "charge.dispute.closed";

export interface PaymentWebhookEvent {
  id: string; // provider event id (idempotency key)
  type: PaymentEventType;
  intentId?: string;
  transactionId?: string;
  providerRefundId?: string;
  refundId?: string; // our refunds.id when the provider echoes metadata back
  amount?: number;
  failureReason?: string;
  data?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: CreateIntentInput): Promise<PaymentIntentResult>;
  confirmIntent(input: ConfirmInput): Promise<ConfirmResult>;
  createRefund(input: RefundInput): Promise<RefundResult>;
  /**
   * Verify a webhook request and parse it into a normalized event.
   * Throws on bad signature. rawBody must be the unparsed request body.
   */
  verifyWebhook(rawBody: Buffer, signature: string): PaymentWebhookEvent;
}
