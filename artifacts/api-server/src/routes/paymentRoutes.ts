import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import rateLimit from "express-rate-limit";
import { db, payments, refunds, paymentEvents, bookings, users, type Payment } from "@workspace/db";
import { and, desc, asc, eq, ilike, or, sql, count } from "drizzle-orm";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { routeError } from "../lib/routeError";
import { isAuthenticated } from "../replit_integrations/auth";
import { getPaymentProvider, processPaymentEvent, applyRefundTotals } from "../lib/payments";
import { FINANCE_ROLES, getUserId, canAccessBooking, requireRole } from "./routes";

// Checkout endpoints are authenticated but still rate-limited: they trigger
// provider calls and row inserts, so per-IP throttling caps abuse.
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many checkout requests. Please try again later." },
});

/** All money is integer cents. Booking.totalPrice is whole currency units. */
async function computeCheckoutSummary(booking: { totalPrice: number | null; currency: string | null }) {
  const subtotal = Math.round((booking.totalPrice || 0) * 100);
  const feeSetting = await storage.getGlobalSettingByKey("default_service_fee");
  const fees = Math.round(Number(feeSetting?.value || 0) * 100);
  const taxSetting = await storage.getGlobalSettingByKey("checkout_tax_rate_percent");
  const taxRate = Number(taxSetting?.value || 0);
  const taxes = Math.round((subtotal * taxRate) / 100);
  const discount = 0; // promo codes not supported yet
  return { subtotal, taxes, fees, discount, total: subtotal + taxes + fees - discount, currency: booking.currency || "USD", taxRate };
}

function paidCoverage(rows: Payment[]): number {
  return rows
    .filter((p) => ["paid", "processing"].includes(p.status || ""))
    .reduce((sum, p) => sum + (p.amount - (p.refundedAmount || 0)), 0);
}

export function registerPaymentRoutes(app: Express): void {
  // ---- Config endpoint for frontend Stripe Elements & provider status ----
  app.get("/api/checkout/config", (req: Request, res: Response) => {
    const provider = getPaymentProvider();
    res.json({
      provider: provider.name,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || "",
    });
  });

  // ---- Webhook (raw body; express.raw is mounted for this path in app.ts) ----
  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    try {
      const signature = req.headers["stripe-signature"] || req.headers["x-payment-signature"];
      const sig = Array.isArray(signature) ? signature[0] : signature;
      if (!sig) return res.status(400).json({ message: "Missing signature" });
      if (!Buffer.isBuffer(req.body)) return res.status(400).json({ message: "Raw body required" });
      const provider = getPaymentProvider();
      let event;
      try {
        event = provider.verifyWebhook(req.body, sig);
      } catch (err: any) {
        logger.warn({ err: err.message }, "payment webhook signature rejected");
        return res.status(400).json({ message: "Invalid signature" });
      }
      const { duplicate } = await processPaymentEvent(provider.name, event);
      res.json({ received: true, duplicate });
    } catch (e: any) {
      logger.error({ err: e }, "payment webhook processing failed");
      // 500 signals the provider to retry; processing is idempotent.
      res.status(500).json({ message: "Webhook processing failed" });
    }
  });

  // ---- Customer checkout ----

  // Summary + session recovery: returns totals and any resumable payment.
  app.get("/api/checkout/:bookingId", isAuthenticated, checkoutLimiter, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.bookingId as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      const summary = await computeCheckoutSummary(booking);
      const rows = await db.select().from(payments).where(eq(payments.bookingId, booking.id)).orderBy(desc(payments.createdAt));
      const covered = paidCoverage(rows);
      const openPayment = rows.find((p) => p.provider !== "manual" && ["pending", "processing"].includes(p.status || "") && p.paymentIntentId);
      res.json({
        booking: { id: booking.id, bookingCode: booking.bookingCode, groupName: booking.groupName, partySizeExpected: booking.partySizeExpected, status: booking.status, tourId: booking.tourId },
        summary,
        alreadyPaid: covered,
        fullyPaid: covered >= summary.total && summary.total > 0,
        openPayment: openPayment ? { id: openPayment.id, status: openPayment.status, amount: openPayment.amount, currency: openPayment.currency } : null,
      });
    } catch (e: any) { routeError(res, e); }
  });

  // Create (or resume) a payment intent for the booking's outstanding total.
  app.post("/api/checkout/:bookingId/intent", isAuthenticated, checkoutLimiter, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.bookingId as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      if (["cancelled", "completed"].includes(booking.status || "")) {
        return res.status(409).json({ message: "This booking can no longer be paid online" });
      }
      const summary = await computeCheckoutSummary(booking);
      if (summary.total <= 0) return res.status(400).json({ message: "Nothing to pay for this booking" });

      const provider = getPaymentProvider();
      if (process.env.NODE_ENV === "production" && provider.name === "offline_test") {
        return res.status(503).json({ message: "Online payments are not configured yet" });
      }
      // Serialize per booking (advisory xact lock) so concurrent requests
      // cannot both pass the coverage check and create duplicate charges.
      const result = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"checkout:" + booking.id}))`);
        const rows = await tx.select().from(payments).where(eq(payments.bookingId, booking.id));
        // Duplicate payment prevention: block when paid/processing already covers the total.
        if (paidCoverage(rows) >= summary.total) {
          return { conflict: "This booking is already paid" as const };
        }
        // Session recovery: reuse an open online payment instead of stacking intents.
        const open = rows.find((p) => p.provider !== "manual" && p.status === "pending" && p.paymentIntentId);
        if (open) {
          return {
            payment: open,
            intentId: open.paymentIntentId!,
            clientSecret: (open.metadata as any)?.clientSecret || null,
            resumed: true,
          };
        }
        const intent = await provider.createIntent({
          amount: summary.total,
          currency: summary.currency,
          bookingId: booking.id,
          customerId: userId,
          metadata: { bookingCode: booking.bookingCode || "" },
        });
        const [payment] = await tx.insert(payments).values({
          bookingId: booking.id,
          customerId: booking.customerId,
          provider: provider.name,
          paymentIntentId: intent.intentId,
          amount: summary.total,
          subtotal: summary.subtotal,
          taxes: summary.taxes,
          fees: summary.fees,
          discount: summary.discount,
          currency: summary.currency,
          method: "card",
          status: "pending",
          metadata: { taxRate: summary.taxRate, clientSecret: intent.clientSecret },
          createdBy: userId,
        }).returning();
        return { payment, intentId: intent.intentId, clientSecret: intent.clientSecret, resumed: false };
      });
      if ("conflict" in result) return res.status(409).json({ message: result.conflict });
      const { payment, intentId, clientSecret, resumed } = result;
      if (resumed) {
        return res.json({ paymentId: payment.id, intentId, clientSecret, status: payment.status, amount: payment.amount, currency: payment.currency, resumed: true });
      }
      await storage.createAuditLog({ entityType: "payment", entityId: payment.id, action: "created", changedBy: userId, previousValue: null, newValue: `intent ${intentId} for ${(summary.total / 100).toFixed(2)} ${summary.currency}`, note: `booking ${booking.bookingCode}` } as any);
      res.json({ paymentId: payment.id, intentId, clientSecret, status: payment.status, amount: payment.amount, currency: payment.currency, resumed: false });
    } catch (e: any) { routeError(res, e); }
  });

  // Confirm the payment with a (test) instrument. PCI-friendly: the
  // instrument is passed straight to the provider; only its last 4 digits
  // are stored for display.
  app.post("/api/checkout/:bookingId/confirm", isAuthenticated, checkoutLimiter, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.bookingId as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      const schema = z.object({ paymentId: z.string().min(1), instrument: z.string().min(4).max(32).optional() });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "paymentId required" });
      const [payment] = await db.select().from(payments).where(eq(payments.id, parsed.data.paymentId));
      if (!payment || payment.bookingId !== booking.id) return res.status(404).json({ message: "Payment not found" });
      if (!payment.paymentIntentId) return res.status(400).json({ message: "Payment has no intent to confirm" });
      if (payment.status === "paid") return res.status(409).json({ message: "Payment already completed" });
      if (payment.status === "processing") {
        return res.json({ status: "processing", paymentId: payment.id });
      }
      if (!["pending", "failed"].includes(payment.status || "")) {
        return res.status(409).json({ message: `Payment is ${payment.status} and cannot be confirmed` });
      }

      const provider = getPaymentProvider();
      if (process.env.NODE_ENV === "production" && provider.name === "offline_test") {
        return res.status(503).json({ message: "Online payments are not configured yet" });
      }
      const result = await provider.confirmIntent({ intentId: payment.paymentIntentId, instrument: parsed.data.instrument });
      const last4 = (parsed.data.instrument || "").replace(/\D/g, "").slice(-4) || null;
      const statusMap: Record<string, Payment["status"]> = { succeeded: "paid", processing: "processing", failed: "failed", canceled: "canceled", requires_confirmation: "pending" };
      const nextStatus = statusMap[result.status] ?? "pending";
      const prev = payment.status;
      // Conditional update: never let a slow confirm response overwrite a
      // webhook that already settled this payment (paid/refunded states).
      await db.update(payments).set({
        status: nextStatus,
        transactionId: result.transactionId ?? payment.transactionId,
        metadata: { ...(payment.metadata as any ?? {}), cardLast4: last4, failureReason: result.failureReason ?? null },
        updatedAt: new Date(),
      }).where(and(
        eq(payments.id, payment.id),
        sql`${payments.status} NOT IN ('paid', 'refunded', 'partially_refunded')`,
      ));
      await storage.createAuditLog({ entityType: "payment", entityId: payment.id, action: "status_changed", changedBy: userId, previousValue: prev, newValue: nextStatus, note: result.failureReason ?? "checkout confirm" } as any);
      // Success side effects (notify/email) run via the provider webhook so
      // they behave identically for sync and async settlements.
      res.json({ status: nextStatus, paymentId: payment.id, failureReason: result.failureReason ?? null });
    } catch (e: any) { routeError(res, e); }
  });

  // Poll a payment's status (pending-payment screens, session recovery).
  app.get("/api/checkout/:bookingId/payment/:paymentId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.bookingId as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      const [payment] = await db.select().from(payments).where(eq(payments.id, req.params.paymentId as string));
      if (!payment || payment.bookingId !== booking.id) return res.status(404).json({ message: "Payment not found" });
      res.json({ id: payment.id, status: payment.status, amount: payment.amount, currency: payment.currency, refundedAmount: payment.refundedAmount, failureReason: (payment.metadata as any)?.failureReason ?? null });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Admin: payments list (search / filter / sort / pagination) ----
  app.get("/api/admin/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const q = z.object({
        search: z.string().optional(),
        status: z.string().optional(),
        provider: z.string().optional(),
        refundStatus: z.string().optional(),
        sort: z.enum(["createdAt", "amount", "status"]).default("createdAt"),
        dir: z.enum(["asc", "desc"]).default("desc"),
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(20),
      }).parse(req.query);

      const filters = [] as any[];
      if (q.status) filters.push(eq(payments.status, q.status as any));
      if (q.provider) filters.push(eq(payments.provider, q.provider));
      if (q.refundStatus) filters.push(eq(payments.refundStatus, q.refundStatus as any));
      if (q.search) {
        const term = `%${q.search}%`;
        filters.push(or(
          ilike(bookings.bookingCode, term),
          ilike(users.username, term),
          ilike(users.email, term),
          ilike(payments.transactionId, term),
          ilike(payments.paymentIntentId, term),
        ));
      }
      const where = filters.length ? and(...filters) : undefined;
      const sortCol = q.sort === "amount" ? payments.amount : q.sort === "status" ? payments.status : payments.createdAt;
      const orderBy = q.dir === "asc" ? asc(sortCol) : desc(sortCol);

      const base = db.select({
        payment: payments,
        bookingCode: bookings.bookingCode,
        bookingStatus: bookings.status,
        customerName: users.username,
        customerEmail: users.email,
      }).from(payments)
        .leftJoin(bookings, eq(payments.bookingId, bookings.id))
        .leftJoin(users, eq(payments.customerId, users.id));

      const [rows, [{ total }]] = await Promise.all([
        (where ? base.where(where) : base).orderBy(orderBy).limit(q.pageSize).offset((q.page - 1) * q.pageSize),
        (() => {
          const c = db.select({ total: count() }).from(payments)
            .leftJoin(bookings, eq(payments.bookingId, bookings.id))
            .leftJoin(users, eq(payments.customerId, users.id));
          return where ? c.where(where) : c;
        })(),
      ]);
      res.json({ rows, total, page: q.page, pageSize: q.pageSize });
    } catch (e: any) { routeError(res, e); }
  });

  // Admin: payment detail (customer, booking, refunds, event/transaction history)
  app.get("/api/admin/payments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const [payment] = await db.select().from(payments).where(eq(payments.id, req.params.id as string));
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, payment.bookingId));
      const customer = payment.customerId ? (await db.select({ id: users.id, username: users.username, email: users.email, firstName: users.firstName, lastName: users.lastName }).from(users).where(eq(users.id, payment.customerId)))[0] : null;
      const refundRows = await db.select().from(refunds).where(eq(refunds.paymentId, payment.id)).orderBy(desc(refunds.createdAt));
      const events = await db.select().from(paymentEvents).where(eq(paymentEvents.paymentId, payment.id)).orderBy(desc(paymentEvents.createdAt));
      const audit = await storage.getAuditLogs("payment", payment.id);
      res.json({ payment, booking: booking ?? null, customer, refunds: refundRows, events, audit });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Refunds ----
  app.post("/api/payments/:id/refunds", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const userId = getUserId(req)!;
      const schema = z.object({
        amount: z.number().int().positive().optional(), // cents; omitted = full remaining
        reason: z.string().min(1).max(500),
        notes: z.string().max(2000).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "A refund reason is required (amount in cents optional for partial refunds)" });
      const [payment] = await db.select().from(payments).where(eq(payments.id, req.params.id as string));
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (!["paid", "partially_refunded", "refunded"].includes(payment.status || "")) {
        return res.status(409).json({ message: `Only settled payments can be refunded (status: ${payment.status})` });
      }
      const remaining = payment.amount - (payment.refundedAmount || 0);
      const amount = parsed.data.amount ?? remaining;
      if (amount <= 0 || amount > remaining) {
        return res.status(400).json({ message: `Refund must be between 0.01 and ${(remaining / 100).toFixed(2)} ${payment.currency}` });
      }

      // Serialize refunds per payment (advisory xact lock) and re-check the
      // remaining balance inside the lock so concurrent refund requests
      // cannot jointly exceed the charge.
      const insertResult = await db.transaction(async (tx) => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"refund:" + payment.id}))`);
        const existing = await tx.select().from(refunds).where(eq(refunds.paymentId, payment.id));
        const committed = existing.filter((r) => r.status !== "failed").reduce((sum, r) => sum + r.amount, 0);
        if (amount > payment.amount - committed) {
          return { conflict: `Refund exceeds remaining balance of ${((payment.amount - committed) / 100).toFixed(2)} ${payment.currency}` as string };
        }
        const [row] = await tx.insert(refunds).values({
          paymentId: payment.id,
          bookingId: payment.bookingId,
          provider: payment.provider || "manual",
          amount,
          currency: payment.currency,
          reason: parsed.data.reason,
          notes: parsed.data.notes ?? null,
          status: "pending",
          createdBy: userId,
        }).returning();
        return { refund: row };
      });
      if ("conflict" in insertResult) return res.status(409).json({ message: insertResult.conflict });
      const refund = insertResult.refund;
      await applyRefundTotals(payment.id);
      await storage.createAuditLog({ entityType: "payment", entityId: payment.id, action: "refund_requested", changedBy: userId, previousValue: null, newValue: `${(amount / 100).toFixed(2)} ${payment.currency}`, note: parsed.data.reason } as any);

      // Manual (offline-recorded) payments have no provider transaction; the
      // refund is recorded as immediately succeeded.
      if (!payment.transactionId || payment.provider === "manual") {
        await db.update(refunds).set({ status: "succeeded", updatedAt: new Date() }).where(eq(refunds.id, refund.id));
        await applyRefundTotals(payment.id);
      } else {
        const provider = getPaymentProvider();
        const result = await provider.createRefund({ transactionId: payment.transactionId, amount, currency: payment.currency || "USD", reason: parsed.data.reason, refundId: refund.id });
        await db.update(refunds).set({ status: result.status === "failed" ? "failed" : result.status === "succeeded" ? "succeeded" : "pending", providerRefundId: result.providerRefundId, notes: result.failureReason ? `${parsed.data.notes ?? ""}\n[provider] ${result.failureReason}`.trim() : parsed.data.notes ?? null, updatedAt: new Date() }).where(eq(refunds.id, refund.id));
        await applyRefundTotals(payment.id);
      }

      const [finalRefund] = await db.select().from(refunds).where(eq(refunds.id, refund.id));
      const [finalPayment] = await db.select().from(payments).where(eq(payments.id, payment.id));
      // Notify customer + finance staff.
      try {
        if (payment.customerId && finalRefund?.status !== "failed") {
          await storage.createNotification({ userId: payment.customerId, title: "Refund update", message: `A refund of ${(amount / 100).toFixed(2)} ${payment.currency} was ${finalRefund?.status} for your booking.`, type: "payment_received" } as any);
        }
      } catch (err) { logger.error({ err }, "refund notification failed"); }
      res.json({ refund: finalRefund, payment: finalPayment });
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/payments/:id/refunds", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const rows = await db.select().from(refunds).where(eq(refunds.paymentId, req.params.id as string)).orderBy(desc(refunds.createdAt));
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });
}
