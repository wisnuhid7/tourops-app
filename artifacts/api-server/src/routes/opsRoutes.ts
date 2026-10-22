import type { Express } from "express";
import { and, or, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { SERVICE_WORKFLOW_STEPS } from "../lib/constants";
import {
  sendAssignmentNotification,
  sendBookingConfirmedNotification,
  sendDocumentStatusNotification,
  sendPaymentStatusNotification,
  sendPaymentReminderNotification,
} from "../lib/email";
import { authStorage } from "../replit_integrations/auth/storage";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  bookings,
  db,
  documents,
  insertDocumentSchema,
  insertInvoiceSchema,
  insertTravelerSchema,
  messages,
  notifications,
  payments,
  travelers,
  users,
} from "@workspace/db";
import {
  ADMIN_ROLES,
  ALL_STAFF_ROLES,
  FINANCE_ROLES,
  OPS_DISPATCH_ROLES,
  PLATFORM_WIDE_READ_ROLES,
  SUPPORT_READ_ROLES,
  getUserId,
  requireRole,
} from "../middleware/auth";
import { getUserName, autoConfirmBookingIfEligible, syncBookingPaymentSchedules } from "./shared";

// Bookings-adjacent operations: travelers, assignments, workflows, documents,
// messages, and payments. Includes the local canReadWorkflow helper. Extracted
// verbatim from routes.ts - behaviour and registration order unchanged.
export function registerOpsRoutes(app: Express): void {
  // ---- Travelers ----
  app.get("/api/bookings/:id/travelers", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getTravelers(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/travelers", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const profile = await storage.getOrCreateProfile(userId);
      const isOwner = booking.customerId === userId;
      const isAdmin = profile.role === "admin" || profile.role === "super_admin";
      const isLeaderOfGroup = booking.leaderUserId === userId;
      if (!isOwner && !isAdmin && !isLeaderOfGroup) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const existing = await storage.getTravelers(booking.id);
      const expectedLimit = booking.partySizeExpected || 1;
      if (!isAdmin && existing.length >= expectedLimit) {
        return res.status(409).json({
          message: `Party size quota reached (${existing.length}/${expectedLimit}). Please contact support or admin to adjust party size.`,
        });
      }
      const parsed = insertTravelerSchema.safeParse({ ...req.body, bookingId: req.params.id as string });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTraveler(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/travelers/bulk", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const profile = await storage.getOrCreateProfile(userId);
      const isOwner = booking.customerId === userId;
      const isAdmin = profile.role === "admin" || profile.role === "super_admin";
      const isLeaderOfGroup = booking.leaderUserId === userId;
      if (!isOwner && !isAdmin && !isLeaderOfGroup) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const travelers = req.body.travelers;
      if (!Array.isArray(travelers)) {
        return res.status(400).json({ message: "Expected an array of travelers" });
      }

      const existing = await storage.getTravelers(booking.id);
      const expectedLimit = booking.partySizeExpected || 1;
      if (!isAdmin && existing.length + travelers.length > expectedLimit) {
        return res.status(409).json({
          message: `Cannot add ${travelers.length} travelers. Expected party size is ${expectedLimit} (${existing.length} already registered).`,
        });
      }

      const results = [];
      for (const tData of travelers) {
        const parsed = insertTravelerSchema.safeParse({ ...tData, bookingId: req.params.id as string });
        if (parsed.success) {
          results.push(await storage.createTraveler(parsed.data));
        }
      }
      res.json({ success: true, inserted: results.length });
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/travelers/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.updateTraveler(req.params.id as string, req.body));
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/travelers/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteTraveler(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/my-travelers/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const traveler = await storage.getTraveler(req.params.id as string);
      if (!traveler) return res.status(404).json({ message: "Traveler not found" });
      const booking = await storage.getBooking(traveler.bookingId);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId && booking.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await storage.updateTraveler(req.params.id as string, req.body));
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/my-travelers/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const traveler = await storage.getTraveler(req.params.id as string);
      if (!traveler) return res.status(404).json({ message: "Traveler not found" });
      const booking = await storage.getBooking(traveler.bookingId);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId && booking.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      await storage.deleteTraveler(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Assignments ----
  app.get("/api/assignments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PLATFORM_WIDE_READ_ROLES)) return;
      res.json(await storage.getAllAssignments());
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/assignments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PLATFORM_WIDE_READ_ROLES)) return;
      res.json(await storage.getAssignments(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/assignments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_DISPATCH_ROLES)) return;
      const userId = getUserId(req);
      const bookingId = req.params.id as string;
      const assignData = { ...req.body, bookingId, assignedBy: userId };
      const assignment = await storage.createAssignment(assignData);

      // Check if workflow for this serviceType already exists for this booking
      const existingWorkflows = await storage.getWorkflows(bookingId);
      const existingWf = existingWorkflows.find(w => w.serviceType === req.body.serviceType);

      let targetWf = existingWf;
      if (existingWf) {
        // Reuse and update the existing workflow to prevent duplicates
        targetWf = await storage.updateWorkflow(existingWf.id, {
          assignedUserId: req.body.assignedUserId,
          countryCode: req.body.countryCode || existingWf.countryCode,
          status: existingWf.status === "not_assigned" ? "assigned" : existingWf.status,
        });
      } else {
        // Only create new workflow if none exists yet
        targetWf = await storage.createWorkflow({
          bookingId, countryCode: req.body.countryCode,
          serviceType: req.body.serviceType, assignedUserId: req.body.assignedUserId,
          status: "assigned",
        });

        const steps = SERVICE_WORKFLOW_STEPS[req.body.serviceType] || [];
        for (let i = 0; i < steps.length; i++) {
          await storage.createWorkflowStep({
            workflowId: targetWf.id, stepOrder: i + 1,
            stepCode: steps[i].code, stepName: steps[i].name, status: "pending",
          });
        }
        if (steps.length > 0) {
          await storage.updateWorkflow(targetWf.id, { currentStep: steps[0].name });
        }
      }

      res.json({ success: true, message: "Assignment created and workflow updated", assignment, workflow: targetWf });

      // Notify Staff in background via email queue if assigned
      if (req.body.assignedUserId && targetWf) {
        try {
          const booking = await storage.getBooking(bookingId);
          if (booking) {
            const staffProfile = await storage.getProfileByUserIdWithEmail(req.body.assignedUserId);
            if (staffProfile?.user?.email) {
              sendAssignmentNotification(
                staffProfile.user.email,
                targetWf.serviceType,
                booking.bookingCode,
                targetWf.id
              );
            }
          }
        } catch (err) {
          console.error("Assignment notification failed:", err);
        }
      }
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_DISPATCH_ROLES)) return;
      // Field allowlist: only mutable assignment fields pass through; unknown
      // keys (or an effectively-empty patch) previously caused a 500 from
      // drizzle's empty/invalid `.set()` (known notes-only bug).
      const patchSchema = z.object({
        assignedUserId: z.string().nullable().optional(),
        serviceType: z.string().optional(),
        countryCode: z.string().nullable().optional(),
        status: z.string().optional(),
        notes: z.string().nullable().optional(),
      }).strip();
      const parsed = patchSchema.safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Invalid assignment update" });
      const patch = Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined));
      if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No updatable fields provided" });
      const updated = await storage.updateAssignment(req.params.id as string, patch as any);
      if (!updated) return res.status(404).json({ message: "Assignment not found" });

      // Sync to workflow
      if (patch.assignedUserId !== undefined) {
        const workflows = await storage.getWorkflows(updated.bookingId);
        const matchedWf = workflows.find(w => w.serviceType === updated.serviceType);
        if (matchedWf) {
          await storage.updateWorkflow(matchedWf.id, {
            assignedUserId: patch.assignedUserId,
            status: patch.assignedUserId ? (matchedWf.status === "not_assigned" ? "assigned" : matchedWf.status) : "not_assigned",
          });
        }
      }

      res.json(updated);
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_DISPATCH_ROLES)) return;
      const allAssignments = await storage.getAllAssignments();
      const targetAssignment = allAssignments.find(a => a.id === req.params.id);
      if (targetAssignment) {
        const workflows = await storage.getWorkflows(targetAssignment.bookingId);
        const matchedWf = workflows.find(w => w.serviceType === targetAssignment.serviceType);
        if (matchedWf && matchedWf.assignedUserId === targetAssignment.assignedUserId) {
          await storage.updateWorkflow(matchedWf.id, {
            assignedUserId: null,
            status: matchedWf.status === "assigned" ? "not_assigned" : matchedWf.status,
          });
        }
      }
      await storage.deleteAssignment(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Workflows ----
  app.get("/api/workflows", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PLATFORM_WIDE_READ_ROLES)) return;
      res.json(await storage.getAllWorkflows());
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/workflows", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = userId ? await storage.getOrCreateProfile(userId) : null;
      if (profile?.role === "tour_leader") {
        const booking = await storage.getBooking(req.params.id as string);
        if (!booking || (booking.customerId !== userId && booking.leaderUserId !== userId)) {
          return res.status(403).json({ message: "Forbidden" });
        }
        return res.json(await storage.getWorkflows(req.params.id as string));
      }
      if (!await requireRole(req, res, PLATFORM_WIDE_READ_ROLES)) return;
      res.json(await storage.getWorkflows(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  // Flight agent: all airline-service workflows across bookings, enriched with booking info
  app.get("/api/flight-agent/workflows", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "flight_agent"])) return;
      const all = await storage.getAllWorkflows();
      const airlineWorkflows = all.filter(wf => wf.serviceType === "airline");
      const enriched = await Promise.all(airlineWorkflows.map(async (wf) => {
        const booking = await storage.getBooking(wf.bookingId);
        return { ...wf, booking };
      }));
      res.json(enriched);
    } catch (e: any) { routeError(res, e); }
  });

  // Shared read guard: platform-wide readers, the assigned staff member, or a
  // flight agent on airline workflows. Everyone else is denied.
  async function canReadWorkflow(req: any, res: any, workflowId: string) {
    const userId = getUserId(req);
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
    const wf = await storage.getWorkflow(workflowId);
    if (!wf) { res.status(404).json({ message: "Workflow not found" }); return null; }
    const profile = await storage.getOrCreateProfile(userId);
    const allowed = PLATFORM_WIDE_READ_ROLES.includes(profile.role as any)
      || wf.assignedUserId === userId
      || (profile.role === "flight_agent" && wf.serviceType === "airline");
    if (!allowed) { res.status(403).json({ message: "Forbidden" }); return null; }
    return wf;
  }

  app.get("/api/workflows/:id", isAuthenticated, async (req, res) => {
    try {
      const wf = await canReadWorkflow(req, res, req.params.id as string);
      if (!wf) return;
      res.json(wf);
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/workflows/:id/steps", isAuthenticated, async (req, res) => {
    try {
      const wf = await canReadWorkflow(req, res, req.params.id as string);
      if (!wf) return;
      res.json(await storage.getWorkflowSteps(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/workflows/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      const wf = await storage.getWorkflow(req.params.id as string);
      if (!wf) return res.status(404).json({ message: "Workflow not found" });

      const parentBooking = await storage.getBooking(wf.bookingId);
      if (parentBooking?.status === "cancelled") {
        return res.status(400).json({ message: "Cannot update workflow because the parent booking is cancelled." });
      }

      const isFlightAgentOnAirlineWf = profile.role === "flight_agent" && wf.serviceType === "airline";
      let updatedWf;
      if (profile.role === "admin" || profile.role === "super_admin" || profile.role === "operations_manager") {
        updatedWf = await storage.updateWorkflow(req.params.id as string, req.body);

        // If admin/ops approves and marks the workflow as completed, auto-approve any pending fulfillment documents
        if (req.body.status === "completed") {
          try {
            const allDocs = await storage.getDocuments(wf.bookingId);
            const pendingFulfillmentDocs = allDocs.filter(
              d => d.status === "uploaded" && !["passport", "id_doc", "visa"].includes(d.docType)
            );
            for (const doc of pendingFulfillmentDocs) {
              await storage.updateDocument(doc.id, {
                status: "approved",
                reviewedBy: userId,
              });
            }
          } catch (docErr) {
            console.error("Auto-approving fulfillment documents failed:", docErr);
          }
        }
      } else if (wf.assignedUserId === userId || isFlightAgentOnAirlineWf) {
        // Non-admin updaters (assigned staff, or flight_agent on airline tasks)
        // may only touch task progress fields — not assignment/linkage/service metadata.
        const TASK_FIELDS = ["status", "notes"];
        const body: Record<string, any> = {};
        for (const key of Object.keys(req.body || {})) {
          if (TASK_FIELDS.includes(key)) body[key] = req.body[key];
        }

        // External suppliers / non-admin cannot unilaterally mark service as completed
        if (body.status === "completed") {
          return res.status(403).json({
            message: "Hanya Admin atau Operations Manager yang dapat menyetujui dan menyelesaikan layanan (status completed). Silakan ajukan untuk ditinjau (in_review).",
          });
        }

        updatedWf = await storage.updateWorkflow(req.params.id as string, body);
      } else {
        return res.status(403).json({ message: "Forbidden" });
      }

      // If assignedUserId was modified by admin/ops, sync with booking_assignments & notify
      if (req.body.assignedUserId !== undefined && req.body.assignedUserId !== wf.assignedUserId) {
        try {
          const booking = await storage.getBooking(wf.bookingId);
          const existingAssignments = await storage.getAssignments(wf.bookingId);
          const matchedAssignment = existingAssignments.find(a => a.serviceType === wf.serviceType);

          if (req.body.assignedUserId) {
            if (matchedAssignment) {
              await storage.updateAssignment(matchedAssignment.id, {
                assignedUserId: req.body.assignedUserId,
                status: "assigned",
              });
            } else {
              await storage.createAssignment({
                bookingId: wf.bookingId,
                serviceType: wf.serviceType,
                assignedUserId: req.body.assignedUserId,
                assignedBy: userId,
                countryCode: wf.countryCode || undefined,
                status: "assigned",
              });
            }

            if (booking) {
              const staffProfile = await storage.getProfileByUserIdWithEmail(req.body.assignedUserId);
              if (staffProfile?.user?.email) {
                sendAssignmentNotification(
                  staffProfile.user.email,
                  wf.serviceType,
                  booking.bookingCode,
                  wf.id
                );
              }
            }
          } else if (matchedAssignment) {
            // Unassigned
            await storage.updateAssignment(matchedAssignment.id, {
              assignedUserId: null,
              status: "unassigned",
            });
          }
        } catch (syncErr) {
          console.error("Workflow assignment sync/notification failed:", syncErr);
        }
      }

      res.json(updatedWf);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/workflow-steps/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      const isStaff = ALL_STAFF_ROLES.includes(profile.role as any);
      if (!isStaff) return res.status(403).json({ message: "Forbidden" });

      const step = await storage.getWorkflowStep(req.params.id as string);
      if (step) {
        const wf = await storage.getWorkflow(step.workflowId);
        if (wf) {
          const parentBooking = await storage.getBooking(wf.bookingId);
          if (parentBooking?.status === "cancelled") {
            return res.status(400).json({ message: "Cannot update step because the parent booking is cancelled." });
          }
        }
      }

      res.json(await storage.updateWorkflowStep(req.params.id as string, { ...req.body, updatedBy: userId }));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Documents ----
  app.get("/api/documents", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PLATFORM_WIDE_READ_ROLES)) return;
      res.json(await storage.getAllDocuments());
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const profile = await storage.getOrCreateProfile(userId);
      // Only platform-wide readers (and support agents assisting a case) may
      // see documents on arbitrary bookings; everyone else must own the booking.
      const wideStaff = PLATFORM_WIDE_READ_ROLES.includes(profile.role as any) || profile.role === "support_agent";
      if (!wideStaff && booking.customerId !== userId && booking.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await storage.getDocuments(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const profile = await storage.getOrCreateProfile(userId);
      const wideStaff = PLATFORM_WIDE_READ_ROLES.includes(profile.role as any);
      if (!wideStaff && booking.customerId !== userId && booking.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const parsed = insertDocumentSchema.safeParse({ ...req.body, bookingId: req.params.id as string, uploadedBy: userId });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createDocument(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/documents/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const userId = getUserId(req);
      const updated = await storage.updateDocument(req.params.id as string, { ...req.body, reviewedBy: userId });
      
      // Notify customer about document status update (non-blocking)
      try {
        const booking = await storage.getBooking(updated.bookingId);
        if (booking) {
          const customer = await authStorage.getUser(booking.customerId);
          if (customer?.email) {
            sendDocumentStatusNotification(
              customer.email,
              booking.bookingCode,
              updated.docType,
              updated.status || "updated",
              updated.reviewNotes || undefined
            );
          }
        }
      } catch (err) {
        console.error("Failed to enqueue document status notification:", err);
      }

      res.json(updated);
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Messages ----
  app.get("/api/messages", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAllMessages());
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/messages", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SUPPORT_READ_ROLES)) return;
      res.json(await storage.getMessages(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const profile = await storage.getOrCreateProfile(userId);
      const isStaff = ALL_STAFF_ROLES.includes(profile.role as any);
      if (!isStaff && booking.customerId !== userId && booking.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const msgSchema = z.object({ messageText: z.string().min(1), visibility: z.string().optional() });
      const parsed = msgSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createMessage({
        ...parsed.data, bookingId: req.params.id as string,
        senderUserId: userId, senderName: await getUserName(req),
        visibility: (parsed.data.visibility as any) || "customer_visible",
      }));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Payments ----
  app.get("/api/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const rows = await db.select({
        id: payments.id,
        bookingId: payments.bookingId,
        customerId: payments.customerId,
        invoiceId: payments.invoiceId,
        provider: payments.provider,
        paymentIntentId: payments.paymentIntentId,
        transactionId: payments.transactionId,
        amount: payments.amount,
        subtotal: payments.subtotal,
        taxes: payments.taxes,
        fees: payments.fees,
        discount: payments.discount,
        refundedAmount: payments.refundedAmount,
        currency: payments.currency,
        method: payments.method,
        status: payments.status,
        refundStatus: payments.refundStatus,
        receiptUrl: payments.receiptUrl,
        metadata: payments.metadata,
        notes: payments.notes,
        createdBy: payments.createdBy,
        createdAt: payments.createdAt,
        updatedAt: payments.updatedAt,
        bookingCode: bookings.bookingCode,
        bookingTotalPrice: bookings.totalPrice,
        customerName: users.username,
        customerEmail: users.email,
        customerFirstName: users.firstName,
        customerLastName: users.lastName,
      }).from(payments)
        .leftJoin(bookings, eq(payments.bookingId, bookings.id))
        .leftJoin(users, eq(payments.customerId, users.id))
        .orderBy(desc(payments.createdAt));
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/invoices", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...FINANCE_ROLES, "support_agent"])) return;
      res.json(await storage.getInvoices(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/invoices", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const parsed = insertInvoiceSchema.safeParse({ ...req.body, bookingId: req.params.id as string });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createInvoice(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...FINANCE_ROLES, "support_agent"])) return;
      res.json(await storage.getPayments(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const userId = getUserId(req);
      // Finance staff record manual payments; provider/refund/intent fields
      // are owned by the checkout + webhook pipeline and cannot be set here.
      const staffPaymentSchema = z.object({
        amount: z.number().positive(),
        method: z.enum(["bank_transfer", "card", "cash", "other"]).default("bank_transfer"),
        status: z.enum(["pending", "paid"]).default("pending"),
        currency: z.string().max(8).optional(),
        invoiceId: z.string().optional(),
        receiptUrl: z.string().max(2000).optional(),
        notes: z.string().max(2000).optional(),
      }).strict();
      const parsed = staffPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid payment: provider/refund fields are managed by the payment pipeline" });
      const targetBooking = await storage.getBooking(req.params.id as string);
      if (!targetBooking) return res.status(404).json({ message: "Booking not found" });
      const created = await storage.createPayment({
        ...parsed.data,
        bookingId: targetBooking.id,
        customerId: targetBooking.customerId,
        provider: "manual",
        createdBy: userId,
      });
      if (created.status === "paid") {
        await syncBookingPaymentSchedules(targetBooking.id);
      }
      res.json(created);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/payments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      // Field allowlist: finance staff may adjust bookkeeping fields only —
      // never provider identifiers, amounts, or refund totals (those are
      // managed by the checkout/refund pipeline).
      const patchSchema = z.object({
        status: z.enum(["pending", "processing", "paid", "failed", "canceled"]).optional(),
        method: z.enum(["bank_transfer", "card", "cash", "other"]).optional(),
        transactionId: z.string().max(255).nullable().optional(),
        receiptUrl: z.string().max(2000).nullable().optional(),
        metadata: z.record(z.string(), z.any()).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        invoiceId: z.string().nullable().optional(),
      }).strict();
      const parsedPatch = patchSchema.safeParse(req.body);
      if (!parsedPatch.success) {
        return res.status(400).json({ message: "Only status, method, transactionId, receiptUrl, metadata, notes and invoiceId can be updated" });
      }
      const updated = await storage.updatePayment(req.params.id as string, parsedPatch.data);
      if (req.body.status) {
        await syncBookingPaymentSchedules(updated.bookingId);
      }
      
      // Notify customer if payment is confirmed as paid (non-blocking) and auto-confirm booking
      if (req.body.status === "paid") {
        await autoConfirmBookingIfEligible(updated.bookingId, "Auto-confirmed on manual payment verification");
        try {
          const booking = await storage.getBooking(updated.bookingId);
          if (booking) {
            const customer = await authStorage.getUser(booking.customerId);
            if (customer?.email) {
              sendPaymentStatusNotification(
                customer.email,
                booking.bookingCode,
                updated.amount.toString(),
                updated.currency || "USD"
              );
            }
          }
        } catch (err) {
          console.error("Failed to enqueue payment status notification:", err);
        }
      }

      res.json(updated);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/payments/:id/remind", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, FINANCE_ROLES)) return;
      const [payment] = await db.select().from(payments).where(eq(payments.id, req.params.id as string));
      if (!payment) return res.status(404).json({ message: "Payment not found" });
      if (payment.status === "paid") {
        return res.status(400).json({ message: "Payment is already marked as paid" });
      }

      const booking = await storage.getBooking(payment.bookingId);
      const customerId = payment.customerId || booking?.customerId;
      if (!customerId) {
        return res.status(400).json({ message: "No customer associated with this payment" });
      }

      const [user] = await db.select().from(users).where(eq(users.id, customerId));
      const customerEmail = user?.email;
      const customerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim() || user?.username || "Pelanggan";

      // 1. Send In-App Notification to Customer
      await storage.createNotification({
        userId: customerId,
        title: `Pengingat Pembayaran (${booking?.bookingCode || "Booking"})`,
        message: `Halo ${customerName}, ini adalah pengingat pembayaran tagihan sebesar ${payment.currency || "USD"} ${Number(payment.amount).toLocaleString("id-ID", { minimumFractionDigits: 2 })} untuk booking ${booking?.bookingCode || ""}. Silakan lakukan pembayaran agar perjalanan Anda dapat segera diproses.`,
        type: "booking_update",
      });

      // 2. Send Email Notification
      if (customerEmail) {
        try {
          const installmentLabel = (payment.metadata as any)?.paymentType
            ? String((payment.metadata as any).paymentType).replace("_", " ").toUpperCase()
            : payment.notes
            ? payment.notes.slice(0, 30)
            : "Tagihan Pembayaran";
          const dueDate = (payment.metadata as any)?.dueDate
            ? new Date((payment.metadata as any).dueDate)
            : new Date();
          const daysUntilDue = (payment.metadata as any)?.dueDate
            ? Math.max(0, Math.ceil((new Date((payment.metadata as any).dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
            : 1;

          sendPaymentReminderNotification(
            customerEmail,
            booking?.bookingCode || "Booking",
            installmentLabel,
            String(payment.amount),
            payment.currency || "USD",
            dueDate,
            daysUntilDue
          );
        } catch (emailErr) {
          console.error("Failed to enqueue payment reminder email:", emailErr);
        }
      }

      // 3. Log Audit
      const staffUserId = getUserId(req);
      await storage.logChange(
        "payment",
        payment.id,
        "reminder_sent",
        null,
        { customerId, email: customerEmail, staffUserId, sentAt: new Date().toISOString() },
        staffUserId,
        "Finance"
      );

      res.json({
        success: true,
        message: "Payment reminder sent successfully",
        emailSent: !!customerEmail,
        recipient: customerEmail || customerName,
      });
    } catch (e: any) { routeError(res, e); }
  });
}
