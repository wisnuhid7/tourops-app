/**
 * Payment Reminder Job
 *
 * Runs on a daily schedule to:
 *  1. Mark past-due pending/partially_paid installments as `late`.
 *  2. Send overdue email notifications at the moment of that transition.
 *  3. Send upcoming-due reminders when an installment is ≤7, ≤3, or ≤1 day(s) away.
 *
 * Call `startPaymentReminderScheduler()` once at server startup.
 */
import { and, eq, inArray, lt, lte, gte } from "drizzle-orm";
import { db, bookings, bookingPaymentSchedules } from "@workspace/db";
import { storage } from "../storage";
import {
  sendPaymentReminderNotification,
  sendPaymentOverdueNotification,
} from "./email";
import { logger } from "./logger";

// Reminder windows (days before due date). Each installment is reminded once per window per server session.
const REMINDER_WINDOWS_DAYS = [7, 3, 1];

// In-memory dedup: prevents re-sending the same notification within a single
// server session. Key format: `${installmentId}:overdue` or `${installmentId}:w${days}`.
const notifiedSet = new Set<string>();

export async function runPaymentReminderJob(): Promise<{
  marked: number;
  overdueNotified: number;
  reminded: number;
}> {
  const now = new Date();
  let marked = 0;
  let overdueNotified = 0;
  let reminded = 0;

  try {
    // ── 1. Mark overdue installments as `late` and notify ───────────────────
    const overdueRows = await db
      .select()
      .from(bookingPaymentSchedules)
      .where(
        and(
          inArray(bookingPaymentSchedules.status, ["pending", "partially_paid"]),
          lt(bookingPaymentSchedules.dueDate, now),
        ),
      );

    for (const inst of overdueRows) {
      const remaining = Number(inst.amount) - Number(inst.paidAmount || 0);
      if (remaining <= 0.005) continue;
      // Compare-and-swap: only update if another concurrent runner hasn't already.
      const [updated] = await db
        .update(bookingPaymentSchedules)
        .set({ status: "late", updatedAt: now })
        .where(
          and(
            eq(bookingPaymentSchedules.id, inst.id),
            inArray(bookingPaymentSchedules.status, ["pending", "partially_paid"]),
          ),
        )
        .returning();

      if (updated) {
        marked++;
        const key = `${inst.id}:overdue`;
        if (!notifiedSet.has(key)) {
          notifiedSet.add(key);
          await notifyCustomer(inst, "overdue");
          overdueNotified++;
        }
      }
    }

    // ── 2. Remind for upcoming installments ─────────────────────────────────
    const maxWindow = Math.max(...REMINDER_WINDOWS_DAYS);
    const windowEnd = new Date(now.getTime() + maxWindow * 24 * 60 * 60 * 1000);

    const upcomingRows = await db
      .select()
      .from(bookingPaymentSchedules)
      .where(
        and(
          inArray(bookingPaymentSchedules.status, ["pending", "partially_paid"]),
          gte(bookingPaymentSchedules.dueDate, now),
          lte(bookingPaymentSchedules.dueDate, windowEnd),
        ),
      );

    for (const inst of upcomingRows) {
      const msUntilDue = inst.dueDate.getTime() - now.getTime();
      const daysUntilDue = Math.ceil(msUntilDue / (24 * 60 * 60 * 1000));

      // Find the smallest window that covers this installment.
      for (const window of [...REMINDER_WINDOWS_DAYS].sort((a, b) => a - b)) {
        if (daysUntilDue <= window) {
          const key = `${inst.id}:w${window}`;
          if (!notifiedSet.has(key)) {
            notifiedSet.add(key);
            await notifyCustomer(inst, "upcoming", daysUntilDue);
            reminded++;
          }
          break;
        }
      }
    }
  } catch (err) {
    logger.error({ err }, "[PaymentReminderJob] Error during run");
  }

  logger.info(
    { marked, overdueNotified, reminded },
    "[PaymentReminderJob] Run complete",
  );
  return { marked, overdueNotified, reminded };
}

async function notifyCustomer(
  inst: typeof bookingPaymentSchedules.$inferSelect,
  type: "upcoming" | "overdue",
  daysUntilDue?: number,
): Promise<void> {
  try {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, inst.bookingId));
    if (!booking) return;

    const customerProfile = await storage.getProfileByUserIdWithEmail(
      booking.customerId,
    );
    const email = customerProfile?.user?.email;
    if (!email) return;

    if (type === "overdue") {
      sendPaymentOverdueNotification(
        email,
        booking.bookingCode,
        inst.label,
        inst.amount,
        inst.currency,
        inst.dueDate,
      );
    } else {
      sendPaymentReminderNotification(
        email,
        booking.bookingCode,
        inst.label,
        inst.amount,
        inst.currency,
        inst.dueDate,
        daysUntilDue!,
      );
    }
  } catch (err) {
    logger.warn(
      { err, installmentId: inst.id },
      "[PaymentReminderJob] Failed to notify customer for installment",
    );
  }
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

let schedulerTimer: ReturnType<typeof setInterval> | null = null;
const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

export function startPaymentReminderScheduler(): void {
  if (schedulerTimer) return;

  logger.info("[PaymentReminderJob] Scheduler starting — runs every 24 hours");

  // Run immediately on startup to catch anything from while the server was down.
  runPaymentReminderJob().catch(() => {});

  schedulerTimer = setInterval(() => {
    runPaymentReminderJob().catch(() => {});
  }, INTERVAL_MS);
}

export function stopPaymentReminderScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("[PaymentReminderJob] Scheduler stopped");
  }
}
