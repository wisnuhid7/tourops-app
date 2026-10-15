import type { Express } from "express";
import { and, eq, or } from "drizzle-orm";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { maybeAutoTranslateEntitiesInBackground } from "../lib/entity-translation";
import { isAuthenticated } from "../replit_integrations/auth";
import { bookings, db, hotels, insertTourDaySchema, insertTourDepartureSchema, tourDays, tours } from "@workspace/db";
import { ADMIN_ROLES, TOUR_BUILDER_ROLES, requireRole } from "../middleware/auth";
import { ensureCityExists, ensureTourViewable, pickPublicTranslations } from "./shared";

// Tour days and departures. Includes the local DEPARTURE_PATCH_FIELDS helper.
// Extracted verbatim from routes.ts - behaviour and registration order unchanged.
export function registerTourDaysRoutes(app: Express): void {
  // ---- Tour Days ----

  app.get("/api/tours/:id/days", async (req, res) => {
    try {
      if (!await ensureTourViewable(req, res, req.params.id as string)) return;
      res.json(await storage.getTourDays(req.params.id as string));
    }
    catch (e: any) { routeError(res, e); }
  });

  app.get("/api/tours/:id/day-items", async (req, res) => {
    try {
      if (!await ensureTourViewable(req, res, req.params.id as string)) return;
      const items = await storage.getTourDayItemsByTourId(req.params.id as string);
      maybeAutoTranslateEntitiesInBackground("tourDayItem", items as any);
      res.json(items);
    }
    catch (e: any) { routeError(res, e); }
  });

  // Public: consolidated list of unique guides assigned across all days of a tour.
  // Deduped server-side by guide id; exposes only public-safe profile fields
  // (never pricing, contact info, or the wider guide catalog).
  app.get("/api/tours/:id/guides", async (req, res) => {
    try {
      if (!await ensureTourViewable(req, res, req.params.id as string)) return;
      const items = await storage.getTourDayItemsByTourId(req.params.id as string);
      const guideIds = [...new Set(
        items.filter((i) => i.itemType === "guide" && i.guideId).map((i) => i.guideId as string)
      )];
      const rows = await Promise.all(guideIds.map((gid) => storage.getGuideRate(gid)));
      const fullGuides = rows.filter((g): g is NonNullable<typeof g> => !!g);
      maybeAutoTranslateEntitiesInBackground("guide", fullGuides as any);
      const guides = fullGuides
        .map((g) => ({
          id: g.id,
          guideName: g.guideName,
          language: g.language,
          photoUrl: g.photoUrl,
          age: g.age,
          email: g.email,
          phone: g.phone,
          // Only expose translations for public-safe fields (never `notes`).
          translations: pickPublicTranslations((g as any).translations, ["language"]),
        }));
      res.json(guides);
    } catch (e: any) { routeError(res, e); }
  });

  // Public: consolidated list of unique hotels assigned across all days of a tour.
  // Deduped server-side by hotel id; exposes display + contact fields (per product
  // requirement) but never pricing internals or the wider hotel catalog.
  app.get("/api/tours/:id/hotels", async (req, res) => {
    try {
      if (!await ensureTourViewable(req, res, req.params.id as string)) return;
      const items = await storage.getTourDayItemsByTourId(req.params.id as string);
      const hotelIds = [...new Set(
        items.filter((i) => i.itemType === "hotel" && i.hotelId).map((i) => i.hotelId as string)
      )];
      const rows = await Promise.all(hotelIds.map((hid) => storage.getHotel(hid)));
      const fullHotels = rows.filter((h): h is NonNullable<typeof h> => !!h);
      maybeAutoTranslateEntitiesInBackground("hotel", fullHotels as any);
      const hotels = fullHotels
        .map((h) => ({
          id: h.id,
          name: h.name,
          starRating: h.starRating,
          imageUrl: h.imageUrl,
          googleMapsUrl: h.googleMapsUrl,
          contactPhone: h.contactPhone,
          contactEmail: h.contactEmail,
          description: h.description,
          // Customer-facing room rates (Matrimonial/Doble/Triple $/night) —
          // registered by admin/hotel manager for customers to choose from.
          roomRateMatrimonial: (h as any).roomRateMatrimonial,
          roomRateDouble: (h as any).roomRateDouble,
          roomRateTriple: (h as any).roomRateTriple,
          currency: (h as any).currency,
          // Only expose translations for public-safe fields (never policies).
          translations: pickPublicTranslations((h as any).translations, ["description"]),
        }));
      res.json(hotels);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/tours/:id/days", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      const parsed = insertTourDaySchema.safeParse({ ...req.body, tourId: req.params.id as string });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      
      if (parsed.data.city) {
        await ensureCityExists(parsed.data.city, parsed.data.countryCode);
      }

      res.json(await storage.createTourDay(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/tour-days/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      
      if (req.body.city) {
        const [existingDay] = await db.select().from(tourDays).where(eq(tourDays.id, req.params.id as string)).limit(1);
        const countryCode = req.body.countryCode || existingDay?.countryCode;
        await ensureCityExists(req.body.city, countryCode);
      }

      res.json(await storage.updateTourDay(req.params.id as string, req.body));
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/tour-days/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      await storage.deleteTourDay(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Departures ----
  app.get("/api/departures", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAllDepartures());
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/tours/:id/departures", async (req, res) => {
    try {
      if (!await ensureTourViewable(req, res, req.params.id as string)) return;
      res.json(await storage.getDeparturesByTour(req.params.id as string));
    }
    catch (e: any) { routeError(res, e); }
  });

  app.post("/api/departures", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertTourDepartureSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (parsed.data.endDate < parsed.data.startDate) {
        return res.status(400).json({ message: `endDate "${parsed.data.endDate}" must not be earlier than startDate "${parsed.data.startDate}"` });
      }
      res.json(await storage.createDeparture(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });

  // Field allowlist: capacityBooked is system-managed via booking flows, and
  // tourId/ids/audit fields must never be client-mutable (mass-assignment guard).
  const DEPARTURE_PATCH_FIELDS = [
    "startDate", "endDate", "capacityTotal", "pricePerPerson", "status",
    "publicJoinEnabled", "departureAirportId", "arrivalAirportId",
  ] as const;
  app.patch("/api/departures/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const update: Record<string, any> = {};
      for (const f of DEPARTURE_PATCH_FIELDS) {
        if (f in req.body) update[f] = req.body[f];
      }
      if (Object.keys(update).length === 0) return res.status(400).json({ message: "No updatable fields provided" });
      // Validate endDate >= startDate. A partial update may supply only one of
      // the two dates, so fetch the existing record to fill in the missing side.
      if ("startDate" in update || "endDate" in update) {
        const existing = await storage.getDeparture(req.params.id as string);
        if (!existing) return res.status(404).json({ message: "Departure not found" });
        const effectiveStart = update.startDate ?? existing.startDate;
        const effectiveEnd   = update.endDate   ?? existing.endDate;
        if (effectiveEnd < effectiveStart) {
          return res.status(400).json({ message: `endDate "${effectiveEnd}" must not be earlier than startDate "${effectiveStart}"` });
        }
      }
      res.json(await storage.updateDeparture(req.params.id as string, update));
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/departures/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const id = req.params.id as string;
      const existing = await storage.getDeparture(id);
      if (!existing) return res.status(404).json({ message: "Departure not found" });
      // Never orphan bookings: block deletion while bookings reference this departure.
      const linkedBookings = await storage.getBookingsByDeparture(id);
      if (linkedBookings.length > 0) {
        return res.status(409).json({ message: `Cannot delete: ${linkedBookings.length} booking(s) are linked to this departure. Cancel or reassign them first.` });
      }
      await storage.deleteDeparture(id);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });
}
