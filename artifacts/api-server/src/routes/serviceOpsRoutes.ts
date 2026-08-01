/**
 * Supplier service requests, client payment schedules, and the Super Admin
 * test-data control panel.
 *
 * Access model:
 * - Service requests: ops (admin/super_admin/operations_manager) create,
 *   send, and cancel; the assigned supplier sees ONLY their own rows
 *   (never other suppliers' work, never customer selling prices) and can
 *   confirm / reject / request changes.
 * - Payment schedules: finance + ops generate and update; the booking's
 *   customer/leader can read their own schedule.
 * - Test-data endpoints: super_admin only, hard-blocked in production.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import Decimal from "decimal.js";
import {
  db, bookings, bookingServiceRequests, bookingPaymentSchedules,
  userProfiles, insertBookingServiceRequestSchema,
} from "@workspace/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { storage } from "../storage";
import { routeError } from "../lib/routeError";
import { isAuthenticated } from "../replit_integrations/auth";
import { getUserId, requireRole, canAccessBooking } from "./routes";
import { runTestSeed, resetTestData, runValidationOnly, latestSeedRun, testSeedBlockedReason, isTestEnvironment } from "../test-seed";

const OPS_ROLES = ["super_admin", "admin", "operations_manager"];
const FINANCE_SCHEDULE_ROLES = ["super_admin", "admin", "accounting", "operations_manager"];
const SCHEDULE_READ_STAFF = ["super_admin", "admin", "accounting", "operations_manager", "support_agent"];
// Roles a service request may be assigned to (external vendor accounts).
const ASSIGNABLE_SUPPLIER_ROLES = ["supplier", "airline_supplier", "hotel_manager", "transport_manager", "guide_manager", "sights_manager"];

/** Fields a supplier may see on their own service request (no internal notes/creator). */
function supplierView(r: typeof bookingServiceRequests.$inferSelect) {
  const { createdBy, ...rest } = r;
  return rest;
}

async function getProfileRole(userId: string): Promise<string | null> {
  try { return (await storage.getOrCreateProfile(userId)).role; } catch { return null; }
}

export function registerServiceOpsRoutes(app: Express): void {
  // ---- Environment flag (public): drives the "TEST ENVIRONMENT" banner ----
  app.get("/api/environment", (_req, res) => {
    res.json({ testEnvironment: isTestEnvironment() });
  });

  // =========================================================================
  // Supplier service requests
  // =========================================================================

  // Ops: list all requests for a booking
  app.get("/api/bookings/:id/service-requests", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const rows = await db.select().from(bookingServiceRequests)
        .where(eq(bookingServiceRequests.bookingId, req.params.id as string))
        .orderBy(desc(bookingServiceRequests.createdAt));
      res.json(rows);
    } catch (e) { routeError(res, e); }
  });

  // Ops: create a request for a booking (status starts at `pending`; `send` publishes it)
  app.post("/api/bookings/:id/service-requests", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const bookingId = req.params.id as string;
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const parsed = insertBookingServiceRequestSchema.safeParse({ ...req.body, bookingId });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
      // The assignee must be a real supplier-capable account.
      const [supplierProfile] = await db.select().from(userProfiles)
        .where(eq(userProfiles.userId, parsed.data.supplierUserId));
      if (!supplierProfile || !ASSIGNABLE_SUPPLIER_ROLES.includes(supplierProfile.role))
        return res.status(400).json({ message: "supplierUserId must reference a supplier account" });
      const [row] = await db.insert(bookingServiceRequests)
        .values({ ...parsed.data, createdBy: getUserId(req) ?? null })
        .returning();
      await storage.createAuditLog({
        entityType: "booking_service_request", entityId: row.id, action: "created",
        changedBy: getUserId(req),
        newValue: JSON.stringify({ bookingId, serviceType: row.serviceType, supplierUserId: row.supplierUserId }),
      }).catch(() => {});
      res.status(201).json(row);
    } catch (e) { routeError(res, e); }
  });

  // Ops: lifecycle transitions they own (send / cancel)
  app.patch("/api/service-requests/:id/status", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const parsed = z.object({ status: z.enum(["sent", "cancelled"]) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "status must be 'sent' or 'cancelled'" });
      const id = req.params.id as string;
      const [existing] = await db.select().from(bookingServiceRequests).where(eq(bookingServiceRequests.id, id));
      if (!existing) return res.status(404).json({ message: "Service request not found" });
      const allowed: Record<string, string[]> = {
        sent: ["pending", "changes_requested"],
        cancelled: ["pending", "sent", "changes_requested"],
      };
      if (!allowed[parsed.data.status].includes(existing.status))
        return res.status(409).json({ message: `Cannot move a ${existing.status} request to ${parsed.data.status}` });
      // Compare-and-swap so concurrent updates can't double-apply.
      const [row] = await db.update(bookingServiceRequests)
        .set({ status: parsed.data.status, updatedAt: new Date() })
        .where(and(eq(bookingServiceRequests.id, id), eq(bookingServiceRequests.status, existing.status)))
        .returning();
      if (!row) return res.status(409).json({ message: "Request was modified concurrently; reload and retry" });
      await storage.createAuditLog({
        entityType: "booking_service_request", entityId: id, action: `status:${parsed.data.status}`,
        changedBy: getUserId(req), previousValue: existing.status, newValue: parsed.data.status,
      }).catch(() => {});
      res.json(row);
    } catch (e) { routeError(res, e); }
  });

  // Supplier: my requests (own rows only, sent or later — pending drafts stay ops-only)
  app.get("/api/supplier/service-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const role = await getProfileRole(userId);
      if (!role || !ASSIGNABLE_SUPPLIER_ROLES.includes(role))
        return res.status(403).json({ message: "Forbidden: insufficient role" });
      const rows = await db.select().from(bookingServiceRequests)
        .where(and(
          eq(bookingServiceRequests.supplierUserId, userId),
          inArray(bookingServiceRequests.status, ["sent", "confirmed", "rejected", "changes_requested"]),
        ))
        .orderBy(desc(bookingServiceRequests.createdAt));
      res.json(rows.map(supplierView));
    } catch (e) { routeError(res, e); }
  });

  // Supplier: respond to a request assigned to them
  app.patch("/api/supplier/service-requests/:id/respond", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const role = await getProfileRole(userId);
      if (!role || !ASSIGNABLE_SUPPLIER_ROLES.includes(role))
        return res.status(403).json({ message: "Forbidden: insufficient role" });
      const parsed = z.object({
        status: z.enum(["confirmed", "rejected", "changes_requested"]),
        response: z.string().trim().max(2000).optional(),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "status must be confirmed, rejected, or changes_requested" });
      if (parsed.data.status !== "confirmed" && !parsed.data.response?.trim())
        return res.status(400).json({ message: "A note explaining the rejection / change request is required" });
      const id = req.params.id as string;
      const [existing] = await db.select().from(bookingServiceRequests).where(eq(bookingServiceRequests.id, id));
      // 404 for missing AND not-mine: don't reveal other suppliers' requests.
      if (!existing || existing.supplierUserId !== userId)
        return res.status(404).json({ message: "Service request not found" });
      if (!["sent", "changes_requested"].includes(existing.status))
        return res.status(409).json({ message: `Request is ${existing.status}; only sent requests can be answered` });
      const [row] = await db.update(bookingServiceRequests)
        .set({ status: parsed.data.status, supplierResponse: parsed.data.response ?? null, respondedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(bookingServiceRequests.id, id), eq(bookingServiceRequests.status, existing.status)))
        .returning();
      if (!row) return res.status(409).json({ message: "Request was modified concurrently; reload and retry" });
      await storage.createAuditLog({
        entityType: "booking_service_request", entityId: id, action: `supplier:${parsed.data.status}`,
        changedBy: userId, previousValue: existing.status, newValue: parsed.data.status,
      }).catch(() => {});
      res.json(supplierView(row));
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Payment schedules
  // =========================================================================

  // Read: staff (finance/ops/support) or the booking's own customer/leader.
  app.get("/api/bookings/:id/payment-schedule", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const bookingId = req.params.id as string;
      const role = await getProfileRole(userId);
      const isStaff = role != null && SCHEDULE_READ_STAFF.includes(role);
      if (!isStaff) {
        const own = await canAccessBooking(userId, bookingId);
        if (!own) return res.status(404).json({ message: "Booking not found" });
      }
      const rows = await db.select().from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.bookingId, bookingId))
        .orderBy(bookingPaymentSchedules.installmentNumber);
      res.json(rows);
    } catch (e) { routeError(res, e); }
  });

  // Generate: replaces any existing UNPAID schedule with a percentage split.
  app.post("/api/bookings/:id/payment-schedule/generate", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_SCHEDULE_ROLES)) return;
      const bookingId = req.params.id as string;
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (!booking.totalPrice || booking.totalPrice <= 0)
        return res.status(400).json({ message: "Booking has no total price; set it before generating a schedule" });
      const parsed = z.object({
        installments: z.array(z.object({
          label: z.string().trim().min(1).max(80),
          percentage: z.number().positive().max(100),
          dueDate: z.coerce.date(),
        })).min(1).max(12),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid installments" });
      const totalPct = parsed.data.installments.reduce((a, i) => a + i.percentage, 0);
      if (Math.abs(totalPct - 100) > 0.001)
        return res.status(400).json({ message: `Installment percentages must sum to 100 (got ${totalPct})` });
      const existing = await db.select().from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.bookingId, bookingId));
      if (existing.some(s => s.status === "paid" || s.status === "partially_paid" || new Decimal(s.paidAmount).greaterThan(0)))
        return res.status(409).json({ message: "Schedule has recorded payments; it cannot be regenerated" });
      const total = new Decimal(booking.totalPrice);
      const rows = await db.transaction(async (tx) => {
        await tx.delete(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.bookingId, bookingId));
        // Last installment absorbs rounding so amounts sum exactly to the total.
        let allocated = new Decimal(0);
        const values = parsed.data.installments.map((inst, i) => {
          const last = i === parsed.data.installments.length - 1;
          const amount = last ? total.minus(allocated) : total.mul(inst.percentage).div(100).toDecimalPlaces(2);
          allocated = allocated.plus(amount);
          return {
            bookingId, installmentNumber: i + 1, label: inst.label,
            percentage: String(inst.percentage), amount: amount.toFixed(2),
            currency: booking.currency ?? "USD", dueDate: inst.dueDate,
          };
        });
        return tx.insert(bookingPaymentSchedules).values(values).returning();
      });
      await storage.createAuditLog({
        entityType: "booking_payment_schedule", entityId: bookingId, action: "generated",
        changedBy: getUserId(req), newValue: JSON.stringify(parsed.data.installments.map(i => ({ label: i.label, pct: i.percentage }))),
      }).catch(() => {});
      res.status(201).json(rows);
    } catch (e) { routeError(res, e); }
  });

  // Record a payment against an installment (finance only).
  app.patch("/api/payment-schedule/:id/record-payment", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_SCHEDULE_ROLES)) return;
      const parsed = z.object({
        amount: z.string().trim().regex(/^\d{1,12}(\.\d{1,2})?$/, "amount must be a non-negative decimal"),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid amount" });
      const id = req.params.id as string;
      const [inst] = await db.select().from(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.id, id));
      if (!inst) return res.status(404).json({ message: "Installment not found" });
      if (inst.status === "cancelled") return res.status(409).json({ message: "Installment is cancelled" });
      const paid = new Decimal(inst.paidAmount).plus(parsed.data.amount);
      if (paid.greaterThan(new Decimal(inst.amount).mul(1.000001)))
        return res.status(400).json({ message: "Payment would exceed the installment amount" });
      const status = paid.greaterThanOrEqualTo(inst.amount) ? "paid" : "partially_paid";
      // Compare-and-swap on the previously read paidAmount so two concurrent
      // payments can't both pass the ceiling check and overwrite each other.
      const [row] = await db.update(bookingPaymentSchedules)
        .set({ paidAmount: paid.toFixed(2), status, updatedAt: new Date() })
        .where(and(eq(bookingPaymentSchedules.id, id), eq(bookingPaymentSchedules.paidAmount, inst.paidAmount)))
        .returning();
      if (!row) return res.status(409).json({ message: "Installment was updated concurrently; reload and retry" });
      await storage.createAuditLog({
        entityType: "booking_payment_schedule", entityId: id, action: "payment_recorded",
        changedBy: getUserId(req), newValue: JSON.stringify({ amount: parsed.data.amount, status }),
      }).catch(() => {});
      res.json(row);
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Test-data control panel (super_admin only; blocked in production)
  // =========================================================================

  const guardTestData = async (req: Request, res: Response): Promise<boolean> => {
    const blocked = testSeedBlockedReason();
    if (blocked) { res.status(403).json({ message: blocked }); return false; }
    return requireRole(req, res, ["super_admin"]);
  };

  app.get("/api/test-data/status", isAuthenticated, async (req, res) => {
    try {
      if (!await guardTestData(req, res)) return;
      res.json({ testEnvironment: true, latestRun: await latestSeedRun() });
    } catch (e) { routeError(res, e); }
  });

  app.post("/api/test-data/seed", isAuthenticated, async (req, res) => {
    try {
      if (!await guardTestData(req, res)) return;
      const report = await runTestSeed(getUserId(req) ?? null);
      res.json(report);
    } catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ message: e.message });
      routeError(res, e);
    }
  });

  app.post("/api/test-data/reset", isAuthenticated, async (req, res) => {
    try {
      if (!await guardTestData(req, res)) return;
      const deleted = await resetTestData();
      await storage.createAuditLog({
        entityType: "test_data", entityId: "reset", action: "reset",
        changedBy: getUserId(req), newValue: JSON.stringify(deleted),
      }).catch(() => {});
      res.json({ deleted });
    } catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ message: e.message });
      routeError(res, e);
    }
  });

  app.post("/api/test-data/validate", isAuthenticated, async (req, res) => {
    try {
      if (!await guardTestData(req, res)) return;
      const checks = await runValidationOnly();
      res.json({ passed: checks.every(c => c.passed), checks });
    } catch (e: any) {
      if (e?.statusCode) return res.status(e.statusCode).json({ message: e.message });
      routeError(res, e);
    }
  });
}
