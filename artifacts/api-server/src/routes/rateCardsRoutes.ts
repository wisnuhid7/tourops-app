import type { Express } from "express";
import { and } from "drizzle-orm";
import { z } from "zod/v4";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  insertAirlineRateSchema,
  insertGuideRateSchema,
  insertHotelRateSchema,
  insertSightsRateSchema,
  insertTransportRateSchema,
} from "@workspace/db";
import {
  AIRLINE_MANAGE_ROLES,
  GUIDE_MANAGE_ROLES,
  GUIDE_READ_ROLES,
  HOTEL_MANAGE_ROLES,
  SIGHTS_MANAGE_ROLES,
  requireRole,
} from "../middleware/auth";
import { ownerScope } from "./shared";

// Rate cards: hotel / transport / guide / sights / airline rates, plus the
// one-time legacy-role remap maintenance endpoint. Extracted verbatim from
// routes.ts - behaviour and registration order unchanged.
export function registerRateCardsRoutes(app: Express): void {
  const validRateStatuses = ["draft", "active", "archived"] as const;
  function sanitizeRateUpdate(body: any) {
    const { id, createdAt, createdBy, ...rest } = body;
    if (rest.status && !validRateStatuses.includes(rest.status)) {
      return null;
    }
    return rest;
  }

  // ---- Rate Cards: Hotel Rates ----
  app.get("/api/rates/hotel", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_MANAGE_ROLES)) return;
      const { ownerId } = await ownerScope(req, []);
      let rows = await storage.getHotelRates();
      if (ownerId) rows = rows.filter(r => r.createdBy === ownerId);
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/hotel", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_MANAGE_ROLES)) return;
      const parsed = insertHotelRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { userId } = await ownerScope(req, []);
      const hotel = parsed.data.hotelId ? await storage.getHotel(parsed.data.hotelId) : undefined;
      if (parsed.data.hotelId && !hotel) return res.status(400).json({ message: "Hotel not found" });
      res.json(await storage.createHotelRate({
        ...parsed.data,
        ...(hotel ? { hotelName: hotel.name } : {}),
        createdBy: userId,
      }));
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/hotel/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_MANAGE_ROLES)) return;
      const rows = z.array(insertHotelRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const { userId } = await ownerScope(req, []);
      res.json(await storage.bulkCreateHotelRates(rows.data.map(r => ({ ...r, createdBy: userId }))));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/rates/hotel/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_MANAGE_ROLES)) return;
      const { ownerId } = await ownerScope(req, []);
      if (ownerId) {
        const existing = await storage.getHotelRate(req.params.id as string);
        if (!existing || existing.createdBy !== ownerId) return res.status(403).json({ message: "Forbidden: not your record" });
      }
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      if (data.hotelId) {
        const hotel = await storage.getHotel(data.hotelId);
        if (!hotel) return res.status(400).json({ message: "Hotel not found" });
        data.hotelName = hotel.name;
      }
      res.json(await storage.updateHotelRate(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/rates/hotel/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, HOTEL_MANAGE_ROLES)) return;
      const { ownerId } = await ownerScope(req, []);
      if (ownerId) {
        const existing = await storage.getHotelRate(req.params.id as string);
        if (!existing || existing.createdBy !== ownerId) return res.status(403).json({ message: "Forbidden: not your record" });
      }
      await storage.deleteHotelRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- One-time maintenance: remap legacy role values ----
  // Old deployments used "travel_agent" for what is now "tour_leader". The
  // enum keeps the legacy value only so publish-time migration can cast old
  // rows; this endpoint remaps them. Super-admin only; idempotent.
  app.post("/api/admin/migrate-legacy-roles", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin"])) return;
      const updated = await storage.remapLegacyRoles("travel_agent", "tour_leader");
      res.json({ ok: true, updated });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Rate Cards: Transport Rates ----
  app.get("/api/rates/transport", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "transport_manager"])) return;
      res.json(await storage.getTransportRates());
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/transport", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "transport_manager"])) return;
      const parsed = insertTransportRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTransportRate(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/transport/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "transport_manager"])) return;
      const rows = z.array(insertTransportRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateTransportRates(rows.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/rates/transport/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "transport_manager"])) return;
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateTransportRate(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/rates/transport/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "transport_manager"])) return;
      await storage.deleteTransportRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Rate Cards: Guide Rates ----
  app.get("/api/rates/guide", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, GUIDE_READ_ROLES)) return;
      const { ownerId } = await ownerScope(req, []);
      let rows = await storage.getGuideRates();
      if (ownerId) rows = rows.filter(r => r.createdBy === ownerId);
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/guide", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, GUIDE_MANAGE_ROLES)) return;
      const parsed = insertGuideRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { userId } = await ownerScope(req, []);
      res.json(await storage.createGuideRate({ ...parsed.data, createdBy: userId }));
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/guide/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, GUIDE_MANAGE_ROLES)) return;
      const rows = z.array(insertGuideRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const { userId } = await ownerScope(req, []);
      res.json(await storage.bulkCreateGuideRates(rows.data.map(r => ({ ...r, createdBy: userId }))));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/rates/guide/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, GUIDE_MANAGE_ROLES)) return;
      const { ownerId } = await ownerScope(req, []);
      if (ownerId) {
        const existing = await storage.getGuideRate(req.params.id as string);
        if (!existing || existing.createdBy !== ownerId) return res.status(403).json({ message: "Forbidden: not your record" });
      }
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateGuideRate(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/rates/guide/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, GUIDE_MANAGE_ROLES)) return;
      const { ownerId } = await ownerScope(req, []);
      if (ownerId) {
        const existing = await storage.getGuideRate(req.params.id as string);
        if (!existing || existing.createdBy !== ownerId) return res.status(403).json({ message: "Forbidden: not your record" });
      }
      await storage.deleteGuideRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Rate Cards: Sights Rates ----
  app.get("/api/rates/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      // Sights rates are a shared global table: superadmin and sights managers
      // all see and manage the same rows (no per-owner isolation by design).
      res.json(await storage.getSightsRates());
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      const parsed = insertSightsRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { userId } = await ownerScope(req, ["sights_manager"]);
      res.json(await storage.createSightsRate({ ...parsed.data, createdBy: userId }));
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/sights/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      const rows = z.array(insertSightsRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const { userId } = await ownerScope(req, ["sights_manager"]);
      res.json(await storage.bulkCreateSightsRates(rows.data.map(r => ({ ...r, createdBy: userId }))));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/rates/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      // Shared global table — no per-owner check (see GET above).
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateSightsRate(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/rates/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      // Shared global table — no per-owner check (see GET above).
      await storage.deleteSightsRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Rate Cards: Airline Rates ----
  app.get("/api/rates/airline", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      // Airline rates are shared/global by design: no per-owner filtering.
      res.json(await storage.getAirlineRates());
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/airline", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      const parsed = insertAirlineRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { userId } = await ownerScope(req, ["airline_supplier"]);
      res.json(await storage.createAirlineRate({ ...parsed.data, createdBy: userId }));
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/rates/airline/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      const rows = z.array(insertAirlineRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const { userId } = await ownerScope(req, ["airline_supplier"]);
      res.json(await storage.bulkCreateAirlineRates(rows.data.map(r => ({ ...r, createdBy: userId }))));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/rates/airline/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      // Airline rates are shared/global by design: no ownership check.
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateAirlineRate(req.params.id as string, data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/rates/airline/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      // Airline rates are shared/global by design: no ownership check.
      await storage.deleteAirlineRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });
}
