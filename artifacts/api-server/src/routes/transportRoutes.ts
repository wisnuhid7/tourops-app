import type { Express, Request, Response } from "express";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  insertBusTypeSchema,
  insertTransportBookingSchema,
  insertTransportInvoiceSchema,
  insertTransportPaymentSchema,
  insertTransportRoutePricingSchema,
  insertTransportRouteSchema,
} from "@workspace/db";
import { TRANSPORT_FINANCE_ROLES, requireRole } from "../middleware/auth";

// Transport operations: bus types, routes, route pricing, bookings, invoices,
// and payments. Includes the local getTransportScope helper. Extracted
// verbatim from routes.ts - behaviour and registration order unchanged.
export function registerTransportRoutes(app: Express): void {
  // Helper: get transport manager's company ID (returns null for admin, enforces scope for transport_manager)
  async function getTransportScope(req: Request, res: Response): Promise<{ companyId: string | undefined; isAdmin: boolean } | null> {
    const userId = req.session.userId;
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
    const profile = await storage.getProfileByUserId(userId);
    if (!profile) { res.status(403).json({ message: "No profile" }); return null; }
    // Transport data is shared/global by design: transport_manager gets the same
    // unrestricted scope as admins (no per-company isolation).
    if (profile.role === "admin" || profile.role === "super_admin" || profile.role === "country_manager" || profile.role === "transport_manager") return { companyId: req.query.companyId as string | undefined, isAdmin: true };
    res.status(403).json({ message: "Forbidden" }); return null;
  }

  // ---- Transport: Bus Types ----
  app.get("/api/transport/bus-types", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      if (scope.companyId) res.json(await storage.getBusTypes(scope.companyId));
      else if (scope.isAdmin) res.json(await storage.getAllBusTypes());
      else res.json([]);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/transport/bus-types", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertBusTypeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createBusType(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/transport/bus-types/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertBusTypeSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateBusType(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/transport/bus-types/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      await storage.deleteBusType(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Transport: Routes ----
  app.get("/api/transport/routes", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      if (scope.companyId) res.json(await storage.getTransportRoutes(scope.companyId));
      else if (scope.isAdmin) res.json(await storage.getAllTransportRoutes());
      else res.json([]);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/transport/routes", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportRouteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createTransportRoute(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/transport/routes/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportRouteSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateTransportRoute(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/transport/routes/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      await storage.deleteTransportRoute(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Transport: Route Pricing ----
  app.get("/api/transport/route-pricing", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const routeId = req.query.routeId as string | undefined;
      if (routeId) res.json(await storage.getRoutePricing(routeId));
      else if (scope.isAdmin) res.json(await storage.getAllRoutePricing());
      else res.json([]);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/transport/route-pricing", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportRoutePricingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createRoutePricing(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/transport/route-pricing/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportRoutePricingSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateRoutePricing(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/transport/route-pricing/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      await storage.deleteRoutePricing(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Transport: Bookings ----
  app.get("/api/transport/bookings", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const page = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1);
      const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize), 10) || 50));
      const { rows, total } = await storage.getTransportBookingsPage(scope.companyId, page, pageSize);
      res.json({ rows, total, page, pageSize });
    } catch (e: any) { routeError(res, e); }
  });
  app.get("/api/transport/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const tb = await storage.getTransportBooking(req.params.id as string);
      if (!tb) return res.status(404).json({ message: "Not found" });
      if (!scope.isAdmin && tb.companyId !== scope.companyId) return res.status(403).json({ message: "Forbidden" });
      res.json(tb);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/transport/bookings", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportBookingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createTransportBooking(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/transport/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const existing = await storage.getTransportBooking(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!scope.isAdmin && existing.companyId !== scope.companyId) return res.status(403).json({ message: "Forbidden" });
      const parsed = insertTransportBookingSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const data: any = { ...parsed.data };
      if (data.status === "confirmed" && !data.confirmedAt) {
        data.confirmedAt = new Date();
      }
      res.json(await storage.updateTransportBooking(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Transport: Invoices ----
  app.get("/api/transport/invoices", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const page = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1);
      const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize), 10) || 50));
      const { rows, total } = await storage.getTransportInvoicesPage(scope.companyId, page, pageSize);
      res.json({ rows, total, page, pageSize });
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/transport/invoices", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_FINANCE_ROLES)) return;
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createTransportInvoice(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/transport/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_FINANCE_ROLES)) return;
      const parsed = insertTransportInvoiceSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const data: any = { ...parsed.data };
      if (data.status === "approved" && !data.approvedAt) {
        data.approvedAt = new Date();
      }
      res.json(await storage.updateTransportInvoice(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Transport: Payments ----
  app.get("/api/transport/payments", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const page = Math.max(1, Number.parseInt(String(req.query.page), 10) || 1);
      const pageSize = Math.min(200, Math.max(1, Number.parseInt(String(req.query.pageSize), 10) || 50));
      const { rows, total } = await storage.getTransportPaymentsPage(scope.companyId, page, pageSize);
      res.json({ rows, total, page, pageSize });
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/transport/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_FINANCE_ROLES)) return;
      const parsed = insertTransportPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTransportPayment(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/transport/payments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_FINANCE_ROLES)) return;
      const parsed = insertTransportPaymentSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateTransportPayment(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
}
