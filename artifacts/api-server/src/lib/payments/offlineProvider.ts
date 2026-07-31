import crypto from "crypto";
import { logger } from "../logger";
import type {
  ConfirmInput,
  ConfirmResult,
  CreateIntentInput,
  PaymentIntentResult,
  PaymentProvider,
  PaymentWebhookEvent,
  RefundInput,
  RefundResult,
} from "./provider";

/**
 * Offline/test payment provider. Simulates a real gateway end to end —
 * intents, async confirmation, refunds, and signed webhooks — without any
 * external calls, so the whole payment pipeline (including webhook
 * verification and idempotency) is exercised in development.
 *
 * Test instruments (simulated card numbers, judged by their last 4 digits):
 *   ...0002  -> payment fails (card_declined)
 *   ...0003  -> stays "processing"; a payment_intent.succeeded webhook is
 *               delivered ~2s later (exercises the async webhook path)
 *   anything else -> succeeds immediately (a webhook is also delivered,
 *               exercising duplicate-event idempotency)
 *
 * Webhooks are signed with HMAC-SHA256 over `${timestamp}.${body}` using
 * PAYMENT_WEBHOOK_SECRET (falls back to SESSION_SECRET) and delivered to the
 * local server, mirroring Stripe's signature scheme.
 */

const PROVIDER_NAME = "offline_test";

function webhookSecret(): string {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET || process.env.SESSION_SECRET;
  if (!secret) throw new Error("PAYMENT_WEBHOOK_SECRET or SESSION_SECRET must be set for payment webhooks");
  return secret;
}

export function signWebhookPayload(body: string, timestamp: number): string {
  const mac = crypto.createHmac("sha256", webhookSecret()).update(`${timestamp}.${body}`).digest("hex");
  return `t=${timestamp},v1=${mac}`;
}

async function deliverWebhook(event: PaymentWebhookEvent, attempt = 1): Promise<void> {
  const port = process.env.PORT;
  if (!port) return;
  const body = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/payments/webhook`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-payment-signature": signWebhookPayload(body, timestamp),
      },
      body,
    });
    if (!res.ok && attempt < 3) throw new Error(`webhook delivery got ${res.status}`);
  } catch (err) {
    // Retry-safe: webhook processing is idempotent, so redelivery is harmless.
    if (attempt < 3) {
      setTimeout(() => { void deliverWebhook(event, attempt + 1); }, 1500 * attempt);
    } else {
      logger.error({ err, eventId: event.id }, "offline payment webhook delivery failed");
    }
  }
}

// In-memory intent ledger for the offline provider. Authoritative payment
// state lives in the payments table; this only carries provider-side context
// between create and confirm (like Stripe's own intent store would).
const intents = new Map<string, { amount: number; currency: string; status: string; secret: string }>();

export const offlineProvider: PaymentProvider = {
  name: PROVIDER_NAME,

  async createIntent(input: CreateIntentInput): Promise<PaymentIntentResult> {
    const intentId = `oti_${crypto.randomUUID().replace(/-/g, "")}`;
    const clientSecret = `${intentId}_secret_${crypto.randomBytes(8).toString("hex")}`;
    intents.set(intentId, { amount: input.amount, currency: input.currency, status: "requires_confirmation", secret: clientSecret });
    return { intentId, clientSecret, status: "requires_confirmation" };
  },

  async confirmIntent(input: ConfirmInput): Promise<ConfirmResult> {
    const intent = intents.get(input.intentId);
    // Restart-safe: an unknown intent (e.g. server restarted) is re-accepted
    // as long as the DB row exists; the caller validates ownership.
    const last4 = (input.instrument || "").replace(/\D/g, "").slice(-4);
    const eventBase = { intentId: input.intentId };

    if (last4 === "0002") {
      if (intent) intent.status = "failed";
      void deliverWebhook({ id: `oevt_${crypto.randomUUID()}`, type: "payment_intent.payment_failed", ...eventBase, failureReason: "card_declined" });
      return { status: "failed", failureReason: "card_declined" };
    }

    const transactionId = `otx_${crypto.randomUUID().replace(/-/g, "")}`;

    if (last4 === "0003") {
      if (intent) intent.status = "processing";
      void deliverWebhook({ id: `oevt_${crypto.randomUUID()}`, type: "payment_intent.processing", ...eventBase, transactionId });
      // Async settlement: succeed via webhook shortly after.
      setTimeout(() => {
        if (intent) intent.status = "succeeded";
        void deliverWebhook({ id: `oevt_${crypto.randomUUID()}`, type: "payment_intent.succeeded", ...eventBase, transactionId });
      }, 2000);
      return { status: "processing", transactionId };
    }

    if (intent) intent.status = "succeeded";
    // Deliver the settlement webhook too (duplicate of the synchronous
    // result) — processing must be idempotent, and this proves it.
    void deliverWebhook({ id: `oevt_${crypto.randomUUID()}`, type: "payment_intent.succeeded", ...eventBase, transactionId });
    return { status: "succeeded", transactionId };
  },

  async createRefund(input: RefundInput): Promise<RefundResult> {
    const providerRefundId = `oref_${crypto.randomUUID().replace(/-/g, "")}`;
    // Test hook: refund reason "test_fail" simulates a provider-side failure.
    if (input.reason === "test_fail") {
      void deliverWebhook({ id: `oevt_${crypto.randomUUID()}`, type: "refund.failed", transactionId: input.transactionId, providerRefundId, refundId: input.refundId, amount: input.amount, failureReason: "insufficient_provider_balance" });
      return { status: "failed", providerRefundId, failureReason: "insufficient_provider_balance" };
    }
    void deliverWebhook({ id: `oevt_${crypto.randomUUID()}`, type: "charge.refunded", transactionId: input.transactionId, providerRefundId, refundId: input.refundId, amount: input.amount });
    return { status: "succeeded", providerRefundId };
  },

  verifyWebhook(rawBody: Buffer, signature: string): PaymentWebhookEvent {
    const parts = Object.fromEntries(signature.split(",").map((kv) => kv.split("=") as [string, string]));
    const timestamp = Number(parts["t"]);
    const provided = parts["v1"] || "";
    if (!Number.isFinite(timestamp) || !provided) throw new Error("Malformed webhook signature");
    // Reject stale deliveries (5 min tolerance) to block replay attacks.
    if (Math.abs(Date.now() / 1000 - timestamp) > 300) throw new Error("Webhook timestamp outside tolerance");
    const expected = crypto.createHmac("sha256", webhookSecret()).update(`${timestamp}.${rawBody.toString("utf8")}`).digest("hex");
    const a = Buffer.from(provided, "hex");
    const b = Buffer.from(expected, "hex");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid webhook signature");
    return JSON.parse(rawBody.toString("utf8")) as PaymentWebhookEvent;
  },
};
