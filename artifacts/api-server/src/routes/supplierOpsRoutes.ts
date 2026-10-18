import type { Express } from "express";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { db, bookings, documents, messages, travelers, bookingRooms } from "@workspace/db";
import { asc, eq, or } from "drizzle-orm";
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

      let tour = null;
      let departure = null;
      let hotels: any[] = [];
      if (booking.tourId) {
        tour = await storage.getTour(booking.tourId);
        const dayItems = await storage.getTourDayItemsByTourId(booking.tourId);
        const hotelIds = [...new Set(dayItems.filter(i => i.itemType === "hotel" && i.hotelId).map(i => i.hotelId as string))];
        if (hotelIds.length > 0) {
          const hotelRows = await Promise.all(hotelIds.map(hid => storage.getHotel(hid)));
          hotels = hotelRows.filter((h): h is NonNullable<typeof h> => !!h);
        }
      }
      if (booking.departureId) {
        departure = await storage.getDeparture(booking.departureId);
      }

      // Rooming list if configured
      const rooms = await db.select().from(bookingRooms).where(eq(bookingRooms.bookingId, booking.id)).orderBy(asc(bookingRooms.label));
      const roomsWithOccupants = rooms.map(r => ({
        ...r,
        occupants: travelers.filter(t => t.roomId === r.id).map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName }))
      }));

      // Calculate rooms needed
      let roomsNeeded = 1;
      const allocs = booking.roomAllocations as Array<{ roomType: string; count: number }> | null;
      if (allocs && Array.isArray(allocs) && allocs.length > 0) {
        roomsNeeded = allocs.reduce((acc, a) => acc + (Number(a.count) || 0), 0);
      } else if (booking.roomType === "triple") {
        roomsNeeded = Math.max(1, Math.ceil((booking.partySizeExpected || 1) / 3));
      } else {
        roomsNeeded = Math.max(1, Math.ceil((booking.partySizeExpected || 1) / 2));
      }

      // Special requests / preferences aggregated from travelers
      const specialRequests = travelers
        .map(t => ({
          travelerName: `${t.firstName} ${t.lastName}`,
          roomingPreference: t.roomingPreference,
          dietaryNotes: t.dietaryNotes,
          mobilityNotes: t.mobilityNotes,
          specialNeeds: t.specialNeeds,
        }))
        .filter(t => t.roomingPreference || t.dietaryNotes || t.mobilityNotes || t.specialNeeds);

      res.json({
        ...booking,
        travelers,
        documents,
        tour: tour ? {
          id: tour.id,
          title: tour.title,
          duration: tour.duration,
          translations: tour.translations,
        } : null,
        departure: departure ? {
          id: departure.id,
          startDate: departure.startDate,
          endDate: departure.endDate,
        } : null,
        hotels: hotels.map(h => ({
          id: h.id,
          name: h.name,
          starRating: h.starRating,
          address: h.address,
          cityId: h.cityId,
          checkinTime: h.checkinTime,
          checkoutTime: h.checkoutTime,
          contactPhone: h.contactPhone,
          contactEmail: h.contactEmail,
          imageUrl: h.imageUrl,
          description: h.description,
        })),
        accommodationDetails: {
          roomType: booking.roomType,
          roomsNeeded,
          roomAllocations: booking.roomAllocations,
          checkInDate: departure?.startDate ?? null,
          checkOutDate: departure?.endDate ?? null,
          nights: tour?.duration ? Math.max(0, tour.duration - 1) : 0,
          assignedRooms: roomsWithOccupants,
          specialRequests,
        },
      });
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
