import { db } from "@workspace/db";
import { payments, refunds, paymentEvents, bookings, users } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import { logger } from "../logger";
import { storage } from "../../storage";
import { sendPaymentStatusNotification } from "../email";
import { offlineProvider } from "./offlineProvider";
import { stripeProvider } from "./stripeProvider";
import type { PaymentProvider, PaymentWebhookEvent } from "./provider";
import { autoConfirmBookingIfEligible, recordSchedulePayment, syncBookingPaymentSchedules } from "../../routes/shared";

/** Provider registry. PAYMENT_PROVIDER env selects the active gateway;
 *  Stripe and offline providers are registered here. */
const providers: Record<string, PaymentProvider> = {
  [offlineProvider.name]: offlineProvider,
  [stripeProvider.name]: stripeProvider,
};

export function getPaymentProvider(): PaymentProvider {
  const name = process.env.PAYMENT_PROVIDER || offlineProvider.name;
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown payment provider: ${name}`);
  return provider;
}

async function auditPayment(paymentId: string, action: string, previous: string | null, next: string | null, note?: string, actor?: string) {
  try {
    await storage.createAuditLog({
      entityType: "payment",
      entityId: paymentId,
      action,
      changedBy: actor ?? "payment-webhook",
      previousValue: previous,
      newValue: next,
      note: note ?? null,
    } as any);
  } catch (err) {
    logger.error({ err, paymentId, action }, "payment audit log failed");
  }
}

async function notifyCustomerAndAdmins(payment: typeof payments.$inferSelect, title: string, message: string) {
  try {
    if (payment.customerId) {
      await storage.createNotification({ userId: payment.customerId, title, message, type: "payment_received" } as any);
    }
    const admins = await db.execute(sql`SELECT user_id FROM user_profiles WHERE role IN ('super_admin','admin','accounting')`);
    for (const row of (admins as any).rows ?? admins) {
      const uid = (row as any).user_id;
      if (uid && uid !== payment.customerId) {
        await storage.createNotification({ userId: uid, title, message, type: "payment_received" } as any);
      }
    }
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, "payment notification failed");
  }
}

async function emailCustomerPaymentReceived(payment: typeof payments.$inferSelect) {
  try {
    if (!payment.customerId) return;
    const [user] = await db.select().from(users).where(eq(users.id, payment.customerId));
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId));
    if (user?.email && booking) {
      sendPaymentStatusNotification(user.email, booking.bookingCode || booking.id, Number(payment.amount).toFixed(2), payment.currency || "USD");
    }
  } catch (err) {
    logger.error({ err, paymentId: payment.id }, "payment email failed");
  }
}

/**
 * Idempotent, retry-safe webhook event processing shared by every provider.
 * The (provider, event_id) unique index is the idempotency gate: a duplicate
 * delivery fails the insert and is skipped without side effects.
 */
export async function processPaymentEvent(providerName: string, event: PaymentWebhookEvent): Promise<{ duplicate: boolean }> {
  const inserted = await db
    .insert(paymentEvents)
    .values({ provider: providerName, eventId: event.id, type: event.type, payload: event as any })
    .onConflictDoNothing()
    .returning({ id: paymentEvents.id });
  if (inserted.length === 0) return { duplicate: true };

  // Resolve the payment row this event belongs to.
  let payment: typeof payments.$inferSelect | undefined;
  if (event.intentId) {
    [payment] = await db.select().from(payments).where(eq(payments.paymentIntentId, event.intentId));
  }
  if (!payment && event.transactionId) {
    [payment] = await db.select().from(payments).where(eq(payments.transactionId, event.transactionId));
  }
  if (payment) {
    await db.update(paymentEvents).set({ paymentId: payment.id })
      .where(and(eq(paymentEvents.provider, providerName), eq(paymentEvents.eventId, event.id)));
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      if (!payment) break;
      // Status sync is monotonic: never demote a refunded payment.
      if (["refunded", "partially_refunded"].includes(payment.status || "")) break;
      const prev = payment.status;
      const [updated] = await db.update(payments)
        .set({ status: "paid", transactionId: event.transactionId ?? payment.transactionId, updatedAt: new Date() })
        .where(eq(payments.id, payment.id)).returning();
      if (prev !== "paid") {
        await auditPayment(payment.id, "status_changed", prev, "paid", `webhook ${event.id}`);
        await notifyCustomerAndAdmins(updated, "Payment received", `Payment of ${Number(updated.amount).toFixed(2)} ${updated.currency} was received.`);
        await emailCustomerPaymentReceived(updated);
        await autoConfirmBookingIfEligible(payment.bookingId, "Auto-confirmed on payment receipt (webhook)");
        const instId = (payment.metadata as any)?.installmentId;
        if (instId) {
          await recordSchedulePayment(instId, payment.amount);
        } else {
          await syncBookingPaymentSchedules(payment.bookingId);
        }
      }
      break;
    }
    case "payment_intent.processing": {
      if (!payment || payment.status !== "pending") break;
      await db.update(payments).set({ status: "processing", transactionId: event.transactionId ?? payment.transactionId, updatedAt: new Date() }).where(eq(payments.id, payment.id));
      await auditPayment(payment.id, "status_changed", payment.status, "processing", `webhook ${event.id}`);
      break;
    }
    case "payment_intent.payment_failed": {
      if (!payment || ["paid", "refunded", "partially_refunded"].includes(payment.status || "")) break;
      await db.update(payments).set({ status: "failed", updatedAt: new Date() }).where(eq(payments.id, payment.id));
      await auditPayment(payment.id, "status_changed", payment.status, "failed", event.failureReason ?? `webhook ${event.id}`);
      break;
    }
    case "payment_intent.canceled": {
      if (!payment || ["paid", "refunded", "partially_refunded"].includes(payment.status || "")) break;
      await db.update(payments).set({ status: "canceled", updatedAt: new Date() }).where(eq(payments.id, payment.id));
      await auditPayment(payment.id, "status_changed", payment.status, "canceled", `webhook ${event.id}`);
      break;
    }
    case "charge.refunded":
    case "refund.updated": {
      if (!event.refundId) break;
      const [refund] = await db.select().from(refunds).where(eq(refunds.id, event.refundId));
      if (!refund) break;
      if (refund.status !== "succeeded") {
        await db.update(refunds).set({ status: "succeeded", providerRefundId: event.providerRefundId ?? refund.providerRefundId, updatedAt: new Date() }).where(eq(refunds.id, refund.id));
        await applyRefundTotals(refund.paymentId);
        await auditPayment(refund.paymentId, "refund_succeeded", null, `${Number(refund.amount).toFixed(2)} ${refund.currency}`, `webhook ${event.id}`);
      }
      break;
    }
    case "refund.failed": {
      if (!event.refundId) break;
      const [refund] = await db.select().from(refunds).where(eq(refunds.id, event.refundId));
      if (!refund || refund.status === "failed") break;
      await db.update(refunds).set({ status: "failed", updatedAt: new Date() }).where(eq(refunds.id, refund.id));
      await applyRefundTotals(refund.paymentId);
      await auditPayment(refund.paymentId, "refund_failed", null, event.failureReason ?? null, `webhook ${event.id}`);
      break;
    }
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed": {
      if (payment) {
        await auditPayment(payment.id, event.type.replace("charge.", ""), null, JSON.stringify(event.data ?? {}), `webhook ${event.id}`);
        await notifyCustomerAndAdmins(payment, "Payment dispute update", `A dispute event (${event.type}) was received for payment ${payment.id}.`);
      }
      break;
    }
  }
  return { duplicate: false };
}

/** Recompute a payment's refunded_amount / refund_status / status from its
 *  succeeded refunds — the single source of truth after any refund change. */
export async function applyRefundTotals(paymentId: string): Promise<void> {
  const [payment] = await db.select().from(payments).where(eq(payments.id, paymentId));
  if (!payment) return;
  const rows = await db.select().from(refunds).where(eq(refunds.paymentId, paymentId));
  const succeeded = rows.filter((r) => r.status === "succeeded").reduce((sum, r) => sum + r.amount, 0);
  const anyPending = rows.some((r) => r.status === "pending");
  const refundStatus = succeeded >= payment.amount ? "full" : succeeded > 0 ? "partial" : anyPending ? "pending" : rows.some((r) => r.status === "failed") ? "failed" : "none";
  const status = succeeded >= payment.amount ? "refunded" : succeeded > 0 ? "partially_refunded" : payment.status;
  await db.update(payments).set({ refundedAmount: succeeded, refundStatus: refundStatus as any, status: status as any, updatedAt: new Date() }).where(eq(payments.id, paymentId));
  await syncBookingPaymentSchedules(payment.bookingId);
}
