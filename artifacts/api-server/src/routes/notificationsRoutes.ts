import type { Express, Request, Response } from "express";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { getQueueStats } from "../lib/emailQueue";
import { isAuthenticated } from "../replit_integrations/auth";
import { notifications } from "@workspace/db";
import { ADMIN_ROLES, getUserId, requireRole } from "../middleware/auth";

// In-app notifications, notification counts, and the admin email-queue
// diagnostics endpoint. Extracted verbatim from routes.ts — behaviour and
// registration order unchanged.
export function registerNotificationsRoutes(app: Express): void {
  // ---- Notifications ----
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const list = await storage.getNotifications(userId);
      res.json(list.map(n => ({ ...n, read: n.isRead })));
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const notification = await storage.getNotification(req.params.id as string);
      if (!notification) return res.status(404).json({ message: "Notification not found" });
      if (notification.userId !== userId) return res.status(403).json({ message: "Forbidden" });
      const updated = await storage.markNotificationAsRead(req.params.id as string);
      res.json({ ...updated, read: updated.isRead });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Notification Counts ----
  app.get("/api/notifications/counts", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getProfileByUserId(userId);
      const role = profile?.role;

      if (role === "admin" || role === "super_admin") {
        const allDocs = await storage.getAllDocuments();
        const allPayments = await storage.getAllPayments();
        const allWorkflows = await storage.getAllWorkflows();

        res.json({
          documents: allDocs.filter(d => d.status === "uploaded").length,
          payments: allPayments.filter(p => p.status === "pending").length,
          workflows: allWorkflows.filter(w => w.status === "blocked").length,
        });
      } else {
        const myBookings = await storage.getBookingsByCustomer(userId);
        let docsCount = 0;
        let paymentsCount = 0;
        
        for (const b of myBookings) {
          const docs = await storage.getDocuments(b.id);
          docsCount += docs.filter(d => d.status === "rejected").length;
          const pays = await storage.getPayments(b.id);
          paymentsCount += pays.filter(p => p.status === "pending").length;
        }

        res.json({
          documents: docsCount,
          payments: paymentsCount,
        });
      }
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Admin: Email Queue Diagnostics ----
  app.get("/api/admin/email-queue", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(getQueueStats());
    } catch (e: any) { routeError(res, e); }
  });
}
