import type { Express } from "express";
import { or } from "drizzle-orm";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { bookings, documents, messages, travelers } from "@workspace/db";
import { ALL_STAFF_ROLES, getUserId } from "../middleware/auth";
import { getUserName } from "./shared";

// Supplier/operations endpoints. Extracted verbatim from routes.ts -
// behaviour and registration order unchanged.
export function registerSupplierOpsRoutes(app: Express): void {
  // ---- Supplier/Ops ----
  const SUPPLIER_ROLES = ALL_STAFF_ROLES;

  app.get("/api/supplier/workflows", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      if (!SUPPLIER_ROLES.includes(profile.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await storage.getWorkflowsByUser(userId));
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/supplier/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      if (!SUPPLIER_ROLES.includes(profile.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      // Verify supplier is assigned to at least one workflow for this booking
      const workflows = await storage.getWorkflows(req.params.id as string);
      const isAssigned = workflows.some(w => w.assignedUserId === userId);
      if (!isAssigned && profile.role !== "admin" && profile.role !== "super_admin") {
        return res.status(403).json({ message: "Access denied to this booking" });
      }

      const travelers = await storage.getTravelers(req.params.id as string);
      const allDocuments = await storage.getDocuments(req.params.id as string);
      // Filter documents: supplier sees their own uploads or all if admin
      const documents = (profile.role === "admin" || profile.role === "super_admin")
        ? allDocuments 
        : allDocuments.filter(d => d.uploadedBy === userId);
      
      res.json({ ...booking, travelers, documents });
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/supplier/bookings/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      if (!SUPPLIER_ROLES.includes(profile.role)) return res.status(403).json({ message: "Forbidden" });

      const workflows = await storage.getWorkflows(req.params.id as string);
      const isAssigned = workflows.some(w => w.assignedUserId === userId);
      if (!isAssigned && profile.role !== "admin" && profile.role !== "super_admin") return res.status(403).json({ message: "Access denied" });

      const allMessages = await storage.getMessages(req.params.id as string);
      res.json(allMessages.filter(m => m.visibility === "internal_only" || m.senderUserId === userId));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/supplier/bookings/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      if (!SUPPLIER_ROLES.includes(profile.role)) return res.status(403).json({ message: "Forbidden" });

      const workflows = await storage.getWorkflows(req.params.id as string);
      const isAssigned = workflows.some(w => w.assignedUserId === userId);
      if (!isAssigned && profile.role !== "admin" && profile.role !== "super_admin") return res.status(403).json({ message: "Access denied" });

      const { messageText } = req.body;
      const message = await storage.createMessage({
        bookingId: req.params.id as string,
        senderUserId: userId,
        senderName: await getUserName(req),
        messageText,
        visibility: "internal_only",
      });
      res.json(message);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/supplier/workflows/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      if (!SUPPLIER_ROLES.includes(profile.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const wf = await storage.getWorkflow(req.params.id as string);
      if (!wf) return res.status(404).json({ message: "Workflow not found" });
      if (wf.assignedUserId !== userId && profile.role !== "admin" && profile.role !== "super_admin") {
        return res.status(403).json({ message: "Not assigned to this workflow" });
      }

      const { fileName, fileUrl, docType } = req.body;
      const document = await storage.createDocument({
        bookingId: wf.bookingId || "",
        travelerId: null,
        workflowStepId: null,
        docType: docType || "other",
        fileName,
        fileUrl,
        uploadedBy: userId,
        status: "uploaded"
      });

      res.json(document);
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/ops/workflows", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      const opsRoles = ALL_STAFF_ROLES;
      if (!opsRoles.includes(profile.role)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await storage.getWorkflowsByUser(userId));
    } catch (e: any) { routeError(res, e); }
  });
}
