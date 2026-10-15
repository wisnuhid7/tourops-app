import type { Express } from "express";
import { and, or } from "drizzle-orm";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { hotels, insertHotelSchema } from "@workspace/db";
import {
  ADMIN_ROLES,
  HOTEL_EDIT_ROLES,
  HOTEL_REGISTER_ROLES,
  PLATFORM_WIDE_READ_ROLES,
  getUserId,
  requireRole,
} from "../middleware/auth";
import { maybeAutoTranslateEntitiesInBackground } from "../lib/entity-translation";
import { ownerScope } from "./shared";

// Hotels, leader dashboard, and leader payments report. Includes the local
// normalizeRoomRates / ROOM_RATE_FIELDS helpers. Extracted verbatim from
// routes.ts - behaviour and registration order unchanged.
export function registerHotelsRoutes(app: Express): void {
  // ---- Supplier Rates ----
  // NOTE: Rate-card routes (hotel/transport/guide/sights/airline) are defined
  // once, with role gates, in the "Rate Cards" section further below. Do not
  // add ungated duplicates here — Express uses the first-registered match, so a
  // duplicate above the gated definition would silently bypass authorization.

  // ---- Airline Management ----
  // ---- Hotels ----
  app.get("/api/hotels", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...PLATFORM_WIDE_READ_ROLES, "hotel_manager"])) return;
      // hotel_manager only sees hotels it registered (created_by ownership).
      const { ownerId } = await ownerScope(req, ["hotel_manager"]);
      if (req.query.cityId) {
        const byCity = await storage.getHotelsByCity(req.query.cityId as string);
        const visible = ownerId ? byCity.filter(h => (h as any).createdBy === ownerId) : byCity;
        maybeAutoTranslateEntitiesInBackground("hotel", visible as any);
        return res.json(visible);
      }
      const all = await storage.getAllHotels();
      const visible = ownerId ? all.filter(h => (h as any).createdBy === ownerId) : all;
      maybeAutoTranslateEntitiesInBackground("hotel", visible as any);
      res.json(visible);
    } catch (e: any) { routeError(res, e); }
  });

  // Direct room rates (Matrimonial/Doble/Triple $/night) must be positive
  // decimals when present. Zero/empty means "room type not offered" and is
  // normalized to null; negative or non-numeric values are rejected.
  const ROOM_RATE_FIELDS = ["roomRateMatrimonial", "roomRateDouble", "roomRateTriple"] as const;
  function normalizeRoomRates(data: Record<string, any>): string | null {
    for (const f of ROOM_RATE_FIELDS) {
      if (!(f in data) || data[f] == null || data[f] === "") { if (f in data) data[f] = null; continue; }
      const n = Number(data[f]);
      if (!Number.isFinite(n) || n < 0) return `${f} must be a non-negative number`;
      data[f] = n === 0 ? null : String(data[f]);
    }
    return null;
  }

  app.post("/api/hotels", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_REGISTER_ROLES)) return;
      const parsed = insertHotelSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const rateErr = normalizeRoomRates(parsed.data as any);
      if (rateErr) return res.status(400).json({ message: rateErr });
      // New registrations must price all 3 room types (Matrimonial/Doble/Triple).
      for (const f of ROOM_RATE_FIELDS) {
        if ((parsed.data as any)[f] == null) {
          return res.status(400).json({ message: "All three room rates (Matrimonial, Doble, Triple) are required" });
        }
      }
      // Registration always starts as "draft"; only admin/super_admin can approve.
      // Force the status server-side so a hotel_manager can't self-approve via the payload.
      res.status(201).json(await storage.createHotel({ ...parsed.data, status: "draft", createdBy: getUserId(req)! }));
    } catch (e: any) { routeError(res, e); }
  });

  // Approve a registered hotel — admin/super_admin only.
  app.patch("/api/hotels/:id/approve", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.updateHotel(req.params.id as string, { status: "approved" }));
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/hotels/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_EDIT_ROLES)) return;
      const { role, ownerId } = await ownerScope(req, ["hotel_manager"]);
      if (ownerId) {
        const target = (await storage.getAllHotels()).find(h => h.id === req.params.id);
        if (!target || (target as any).createdBy !== ownerId) {
          return res.status(403).json({ message: "Hotel managers can only edit their own hotels" });
        }
      }
      // Field allowlist: parse against the (partial) insert schema so only known
      // hotel columns can be updated — prevents mass-assignment of internal fields.
      const parsed = insertHotelSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const data: Record<string, any> = { ...parsed.data };
      const rateErr = normalizeRoomRates(data);
      if (rateErr) return res.status(400).json({ message: rateErr });
      // Approval status is admin-only: strip it so a hotel_manager can't
      // self-approve by smuggling `status` into an ordinary edit payload.
      if (!ADMIN_ROLES.includes(role)) delete data.status;
      // Ownership is server-managed; never accept it from the payload.
      delete data.createdBy;
      res.json(await storage.updateHotel(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/hotels/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_EDIT_ROLES)) return;
      const { ownerId } = await ownerScope(req, ["hotel_manager"]);
      if (ownerId) {
        const target = (await storage.getAllHotels()).find(h => h.id === req.params.id);
        if (!target || (target as any).createdBy !== ownerId) {
          return res.status(403).json({ message: "Hotel managers can only delete their own hotels" });
        }
      }
      await storage.deleteHotel(req.params.id as string);
      res.sendStatus(204);
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Leader Dashboard ----
  app.get("/api/leader/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const leaderBookings = await storage.getBookingsByLeader(userId);
      const ownBookings = await storage.getBookingsByCustomer(userId);
      const allBookings = [...ownBookings];
      for (const lb of leaderBookings) {
        if (!allBookings.find(b => b.id === lb.id)) {
          allBookings.push(lb);
        }
      }
      const bookingIds = allBookings.map(b => b.id);
      const alerts = await storage.getLeaderDashboardAlerts(bookingIds);
      res.json({
        bookings: allBookings,
        alerts,
      });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Leader Payments Report ----
  app.get("/api/leader/payments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const leaderBookings = await storage.getBookingsByLeader(userId);
      const ownBookings = await storage.getBookingsByCustomer(userId);
      const allBookings = [...ownBookings];
      for (const lb of leaderBookings) {
        if (!allBookings.find(b => b.id === lb.id)) allBookings.push(lb);
      }
      const report = await storage.getLeaderPaymentsReport(userId, allBookings);
      res.json(report);
    } catch (e: any) { routeError(res, e); }
  });
}
