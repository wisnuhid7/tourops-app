import type { Express, Request, Response, NextFunction } from "express";
import { createServer, type Server } from "http";
import { storage } from "../storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { 
  sendNewBookingNotification, 
  sendBookingConfirmedNotification, 
  sendAssignmentNotification,
  sendDocumentStatusNotification,
  sendPaymentStatusNotification
} from "../lib/email";
import { 
  SERVICE_WORKFLOW_STEPS 
} from "../lib/constants";
import { generateCode, isSafeImageUrl } from "../lib/utils";
import { getQueueStats } from "../lib/emailQueue";
import { pricingService } from "../lib/pricing";
import { imageService } from "../lib/images";
import { pdfService } from "../lib/pdf";
import { scraperService } from "../lib/scrapers";
import { airlineService } from "../lib/airline";
import { hotelService } from "../lib/hotel";
import { aiService } from "../lib/ai";
import { queues } from "../lib/workers";
import { scraperSafety } from "../lib/scraperSafety";
import { setupAuth, isAuthenticated } from "../replit_integrations/auth";
import { registerAuthRoutes } from "../replit_integrations/auth";
import { authStorage } from "../replit_integrations/auth/storage";
import { db } from "@workspace/db";
import { countries, cities, tourDays, tourDepartures } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "images");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed"));
    }
    cb(null, true);
  }
});

import {
  insertTourSchema, insertTourDepartureSchema, insertBookingSchema,
  insertTravelerSchema, insertBookingAssignmentSchema, insertMessageSchema,
  insertDocumentSchema, insertPaymentSchema, insertTourDaySchema, insertTourDayItemSchema,
  insertCountrySchema, insertCitySchema, insertAirportSchema,
  insertSightSchema, insertHotelSchema, insertTransportCompanySchema, insertAirlineAgencySchema,
  insertBusTypeSchema, insertTransportRouteSchema, insertTransportRoutePricingSchema,
  insertTransportBookingSchema, insertTransportInvoiceSchema, insertTransportPaymentSchema,
  insertHotelRateSchema, insertTransportRateSchema, insertGuideRateSchema, insertSightsRateSchema,
  insertBookingWorkflowSchema, insertWorkflowStepSchema, insertInvoiceSchema,
  insertAffiliateSchema, insertMarkupRuleSchema
} from "@workspace/db";

import { sendWhatsApp, sendSMS, MESSAGE_TEMPLATES } from "../lib/messaging";
import { generateCode as genCode } from "../lib/utils";

const ALL_STAFF_ROLES = [
  "admin", "super_admin",
  "airline_supplier", "country_manager", "city_manager",
  "hotel_manager", "transport_manager", "guide_manager",
  "sights_manager", "content_editor", "flight_agent",
  "tour_builder", "supplier", "travel_agent",
];

// Both admin and super_admin have full administrative access
const ADMIN_ROLES = ["admin", "super_admin"];

// Tour builders assemble itineraries (days/items) and can create/edit tour structure & pricing
const TOUR_BUILDER_ROLES = [...ADMIN_ROLES, "tour_builder"];
// Content editors + tour builders can edit tour marketing/content fields
const TOUR_CONTENT_ROLES = [...ADMIN_ROLES, "tour_builder", "content_editor"];

function getUserId(req: Request): string | undefined {
  return req.session?.userId;
}

async function getUserName(req: Request): Promise<string> {
  const userId = req.session?.userId;
  if (!userId) return "User";
  const user = await authStorage.getUser(userId);
  if (user?.firstName) return `${user.firstName} ${user.lastName || ""}`.trim();
  return user?.username || "User";
}

async function canAccessBooking(userId: string, bookingId: string) {
  const booking = await storage.getBooking(bookingId);
  if (!booking) return null;
  if (booking.customerId === userId) return booking;
  if (booking.leaderUserId === userId) return booking;
  return null;
}

async function initializeBookingWorkflows(bookingId: string) {
  const existingWfs = await storage.getWorkflows(bookingId);
  if (existingWfs && existingWfs.length > 0) return; // Prevent duplicate generation

  const services: ("airline" | "hotel" | "transport" | "guide" | "sights")[] = ["airline", "hotel", "transport"];
  
  for (const service of services) {
    const wf = await storage.createWorkflow({
      bookingId,
      serviceType: service,
      status: "not_assigned",
    });

    const steps = [
      { code: "REQ", name: `Request ${service.toUpperCase()} Choice` },
      { code: "CONF", name: "Booking Confirmed with Supplier" },
      { code: "DOC", name: "Issuing Document/Voucher" },
    ];

    for (let i = 0; i < steps.length; i++) {
      await storage.createWorkflowStep({
        workflowId: wf.id,
        stepOrder: i + 1,
        stepCode: steps[i].code,
        stepName: steps[i].name,
        status: "pending",
      });
    }
  }
}

async function requireRole(req: Request, res: Response, roles: string[]): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return false; }
  const profile = await storage.getOrCreateProfile(userId);
  if (!roles.includes(profile.role)) {
    res.status(403).json({ message: "Forbidden: insufficient role" });
    return false;
  }
  return true;
}

function coerceBooleans(data: any[], booleanFields: string[]) {
  return data.map(row => {
    const newRow = { ...row };
    booleanFields.forEach(field => {
      if (typeof newRow[field] === 'string') {
        newRow[field] = newRow[field].toLowerCase() === 'true' || newRow[field] === '1' || newRow[field].toLowerCase() === 'yes';
      }
    });
    return newRow;
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  registerAuthRoutes(app);

  // Pre-create uploads directory so it exists before any request hits
  const uploadsDir = path.join(process.cwd(), "uploads", "images");
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.post("/api/upload", isAuthenticated, (req, res, next) => {
    upload.single("image")(req, res, (err) => {
      if (err) {
        console.error("Multer upload error:", err);
        return res.status(500).json({ message: `Upload error: ${err.message}` });
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });
      res.json({ url: `/uploads/images/${req.file.filename}` });
    });
  });

  // ---- User Profiles ----
  app.get("/api/user-profile", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      res.json(profile);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/user-profiles", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllProfiles());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/user-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const updateSchema = z.object({ role: z.string().optional(), phone: z.string().optional(), companyName: z.string().optional(), countryCode: z.string().optional(), isTourLeader: z.boolean().optional(), isActive: z.boolean().optional() });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateProfile(req.params.id as string, parsed.data as any));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const createSchema = z.object({
        username: z.string().min(3).max(50),
        password: z.string().min(4),
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        role: z.string(),
        phone: z.string().optional(),
        companyName: z.string().optional(),
        countryCode: z.string().optional(),
      });
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      const existing = await authStorage.getUserByUsername(parsed.data.username);
      if (existing) return res.status(409).json({ message: "Username already exists" });

      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await authStorage.upsertUser({
        username: parsed.data.username,
        passwordHash,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        email: parsed.data.email || null,
      });

      await storage.getOrCreateProfile(user.id);
      const profile = await storage.getProfileByUserId(user.id);
      if (profile) {
        await storage.updateProfile(profile.id, {
          role: parsed.data.role as any,
          phone: parsed.data.phone || null,
          companyName: parsed.data.companyName || null,
          countryCode: parsed.data.countryCode || null,
        });
      }

      res.json({ user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email }, profile });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/users/:id/password", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const pwSchema = z.object({ password: z.string().min(4) });
      const parsed = pwSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await authStorage.getUser(req.params.id as string);
      if (!user) return res.status(404).json({ message: "User not found" });
      await authStorage.upsertUser({ ...user, passwordHash, updatedAt: new Date() });
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Tours ----
  app.get("/api/tours", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "tour_builder", "content_editor"])) return;
      res.json(await storage.getAllTours());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tours/accommodation-summary", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      res.json(await storage.getTourAccommodationSummary());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tours/public", async (_req, res) => {
    try { res.json(await storage.getPublishedTours()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/destinations/popular", async (_req, res) => {
    try {
      const tours = await storage.getPublishedTours();
      const allCountries = await storage.getAllCountries();
      const countryMap = new Map<string, string>();
      for (const c of allCountries) {
        countryMap.set(c.code.toLowerCase(), c.name);
        countryMap.set(c.name.toLowerCase(), c.name);
      }

      const destMap = new Map<string, { name: string, tours: number, img: string }>();

      for (const tour of tours) {
        if (!tour.countries || !Array.isArray(tour.countries)) continue;
        
        for (const country of tour.countries) {
          if (!country) continue;
          const trimmed = country.trim();
          const lowerName = trimmed.toLowerCase();
          
          let countryName = countryMap.get(lowerName) || trimmed;
          // Apply manual fallbacks if country is not in database
          if (lowerName === 'il') countryName = 'Israel';
          else if (lowerName === 'us' || lowerName === 'usa') countryName = 'United States';
          else if (lowerName === 'uk') countryName = 'United Kingdom';
          else if (lowerName === 'ae' || lowerName === 'uae') countryName = 'United Arab Emirates';
          
          if (destMap.has(countryName)) {
            const dest = destMap.get(countryName)!;
            dest.tours += 1;
            // Optionally update image if the current one has no image but tour does
            if (dest.img.includes('placeholder') && tour.imageUrl) {
              dest.img = tour.imageUrl;
            }
          } else {
            // Provide reliable fallback images based on country name for well-known broken cases
            let finalImg = tour.imageUrl || 'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&q=80';
            
            destMap.set(countryName, {
              name: countryName,
              tours: 1,
              img: finalImg,
            });
          }
        }
      }

      // Sort by number of tours descending and limit to top 8
      const popularDestinations = Array.from(destMap.values())
        .sort((a, b) => b.tours - a.tours)
        .slice(0, 8);

      res.json(popularDestinations);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/tours/:id", async (req, res) => {
    try {
      const tour = await storage.getTour(req.params.id as string);
      if (!tour) return res.status(404).json({ message: "Tour not found" });
      res.json(tour);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tours", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      const payload = { ...req.body };
      if (!payload.slug && payload.title) {
        payload.slug = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();
      }
      const parsed = insertTourSchema.safeParse(payload);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTour(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

    app.patch("/api/tours/:id", isAuthenticated, async (req, res) => {
      try {
        if (!await requireRole(req, res, TOUR_CONTENT_ROLES)) return;
        const profile = await storage.getOrCreateProfile(getUserId(req) as string);
        // Field-level allowlist: content_editor may only touch marketing/content
        // fields; tour_builder/admins may also touch structure & pricing fields.
        const CONTENT_FIELDS = ["description", "highlights", "inclusions", "exclusions", "imageUrl", "galleryUrls", "tags", "category", "countries", "translations"];
        const STRUCTURE_FIELDS = ["title", "slug", "duration", "basePrice", "markupAmount", "totalPrice", "isPriceConfirmed", "childPrice", "singleSupplement", "isPublished", "internalNotes"];
        const allowedFields = profile.role === "content_editor" ? CONTENT_FIELDS : [...CONTENT_FIELDS, ...STRUCTURE_FIELDS];
        const body: Record<string, any> = {};
        for (const key of Object.keys(req.body || {})) {
          if (allowedFields.includes(key)) body[key] = req.body[key];
        }
        res.json(await storage.updateTour(req.params.id as string, body, getUserId(req), await getUserName(req)));
      } catch (e: any) { res.status(500).json({ message: e.message }); }
    });

    app.put("/api/tours/:id/full", isAuthenticated, async (req, res) => {
      try {
        if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
        const { tour, days } = req.body;
        
        const payload = { ...tour };
        if (!payload.slug && payload.title) {
          payload.slug = payload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();
        }
        
        const parsedTour = insertTourSchema.safeParse(payload);
        if (!parsedTour.success) return res.status(400).json({ message: parsedTour.error.message });
        
        // Validation for days
        const itemSchema = insertTourDayItemSchema.omit({ tourDayId: true });
        const parsedDays = [];
        for (const d of days || []) {
          const { items, ...dayFields } = d;
          const parsed = insertTourDaySchema.safeParse({ ...dayFields, tourId: req.params.id }); // tourId is overridden later but needed for schema
          if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

          if (parsed.data.city) {
            await ensureCityExists(parsed.data.city, parsed.data.countryCode);
          }
          // Restore ID if it existed, schema omitted it
          if (d.id) (parsed.data as any).id = d.id;

          const parsedItems = [];
          for (const it of items || []) {
            const parsedItem = itemSchema.safeParse(it);
            if (!parsedItem.success) return res.status(400).json({ message: parsedItem.error.message });
            if (it.id) (parsedItem.data as any).id = it.id;
            parsedItems.push(parsedItem.data);
          }
          (parsed.data as any).items = parsedItems;

          parsedDays.push(parsed.data);
        }

        const result = await storage.upsertTourFull(req.params.id as string, parsedTour.data, parsedDays, getUserId(req), await getUserName(req));
        res.json(result);
      } catch (e: any) { res.status(500).json({ message: e.message }); }
    });

  app.delete("/api/tours/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteTour(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/generate-itinerary", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const itinerary = await aiService.generateItinerary(req.body);
      res.json(itinerary);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/translate-content", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const translated = await aiService.translateTourContent(req.body);
      res.json(translated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Tour Days ----
  async function ensureCityExists(cityName: string | null | undefined, countryCode: string | null | undefined) {
    if (!cityName || !cityName.trim()) return;
    const nameTrimmed = cityName.trim();
    
    let countryId: string | null = null;
    if (countryCode && countryCode.trim()) {
      const codeUpper = countryCode.trim().toUpperCase();
      const [country] = await db.select().from(countries).where(eq(countries.code, codeUpper)).limit(1);
      if (country) {
        countryId = country.id;
      } else {
        const [countryByName] = await db.select().from(countries).where(eq(sql`lower(${countries.name})`, codeUpper.toLowerCase())).limit(1);
        if (countryByName) {
          countryId = countryByName.id;
        }
      }
    }

    if (!countryId) {
      const [firstCountry] = await db.select().from(countries).limit(1);
      if (firstCountry) {
        countryId = firstCountry.id;
      } else {
        return;
      }
    }

    const [existingCity] = await db.select()
      .from(cities)
      .where(and(
        eq(sql`lower(${cities.name})`, nameTrimmed.toLowerCase()),
        eq(cities.countryId, countryId)
      ))
      .limit(1);

    if (!existingCity) {
      await db.insert(cities).values({
        name: nameTrimmed,
        countryId: countryId,
      });
    }
  }

  app.get("/api/tours/:id/days", async (req, res) => {
    try { res.json(await storage.getTourDays(req.params.id as string)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tours/:id/day-items", async (req, res) => {
    try { res.json(await storage.getTourDayItemsByTourId(req.params.id as string)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/tour-days/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      await storage.deleteTourDay(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Departures ----
  app.get("/api/departures", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAllDepartures());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tours/:id/departures", async (req, res) => {
    try { res.json(await storage.getDeparturesByTour(req.params.id as string)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/departures", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertTourDepartureSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createDeparture(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/departures/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.updateDeparture(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Bookings ----
  app.get("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllBookings());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/by-code/:code", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBookingByJoinCode(req.params.code as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const profile = await storage.getOrCreateProfile(userId);
      const isStaff = ALL_STAFF_ROLES.includes(profile.role as any);
      if (!isStaff && booking.customerId !== userId && booking.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(booking);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      res.json(booking);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const profile = await storage.getOrCreateProfile(userId);
      const isStaff = ALL_STAFF_ROLES.includes(profile.role);
      const customerId = (isStaff && req.body.customerId) ? req.body.customerId : userId;

      const bookingCode = `BK-${generateCode(8)}`;
      const joinCode = req.body.bookingType === "leader_group" ? genCode(6) : undefined;
      const leaderUserId = (req.body.bookingType === "leader_group" || req.body.bookingType === "private_family") ? customerId : undefined;
      let affiliateId = undefined;
      if (req.body.referralCode) {
        const aff = await storage.getAffiliateByCode(req.body.referralCode);
        if (aff) affiliateId = aff.id;
      }

      const booking = await storage.createBooking({
        ...req.body, 
        customerId, 
        bookingCode, 
        joinCode, 
        leaderUserId, 
        affiliateId,
        status: req.body.status || ("submitted" as const), 
        fulfillmentStatus: req.body.fulfillmentStatus || ("pending" as const),
      });

      if (req.body.bookingType === "leader_group") {
        const customerProfileToUpdate = await storage.getProfileByUserId(customerId);
        if (customerProfileToUpdate) {
          await storage.updateProfile(customerProfileToUpdate.id, { isTourLeader: true });
        }
      }

      // Notify Admins
      try {
        const allProfiles = await storage.getAllProfiles();
        const admins = allProfiles.filter(p => (p.role === "admin" || p.role === "super_admin") && p.user?.email);
        const customerProfile = await storage.getProfileByUserIdWithEmail(customerId);
        const customerName = customerProfile?.user?.firstName ? `${customerProfile.user.firstName} ${customerProfile.user.lastName || ""}` : (customerProfile?.user?.username || "Pelanggan");
        
        for (const admin of admins) {
          if (admin.user?.email) {
            // Non-blocking: queue sends in background
            sendNewBookingNotification(admin.user.email, booking, customerName);
          }
        }
      } catch (err) {
        console.error("Failed to send admin notifications:", err);
      }

      res.json(booking);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const userId = getUserId(req);
      const profile = await storage.getProfileByUserIdWithEmail(userId!);
      const userName = (profile?.user?.firstName ? `${profile.user.firstName} ${profile.user.lastName || ""}` : profile?.user?.username) || "Admin";

      const oldBooking = await storage.getBooking(req.params.id as string);
      const updated = await storage.updateBooking(req.params.id as string, req.body, userId, userName);
      
      // Audit trail for status changes
      if (req.body.status && req.body.status !== oldBooking?.status) {
        const userName = await getUserName(req);
        const userId = getUserId(req);
        await storage.createAuditLog({
          entityType: "booking",
          entityId: req.params.id as string,
          action: "status_changed",
          changedBy: userId || undefined,
          changedByName: userName,
          previousValue: oldBooking?.status || "unknown",
          newValue: req.body.status,
        }).catch(() => {}); // non-blocking
      }
      
      // Auto-initialize workflows and manage capacity if status changed to confirmed
      if (req.body.status === "confirmed" && oldBooking?.status !== "confirmed") {
        await initializeBookingWorkflows(req.params.id as string);
        
        // Auto-payout for affiliate
        if (updated.affiliateId) {
          const aff = await storage.getAffiliates().then(list => list.find(a => a.id === updated.affiliateId));
          if (aff) {
            const commRate = parseFloat(aff.commissionRate?.toString() || "10");
            const commAmount = (updated.totalPrice || 0) * (commRate / 100);
            await storage.createAffiliatePayout({
              affiliateId: aff.id,
              bookingId: updated.id,
              amount: commAmount.toString(),
              status: "pending"
            });
          }
        }
        
        // Automated Document Delivery: Generate Itinerary PDF
        if (updated.tourId) {
          try {
            console.log(`[Automation] Generating automated itinerary for booking ${updated.bookingCode}`);
            const { pdfService } = await import("../lib/pdf");
            const pdfBuffer = await pdfService.generateItinerary(updated.tourId);
            // In a real app, we would upload to S3/Storage and get a URL
            // For now, we simulate by creating a document record
            await storage.createDocument({
              bookingId: updated.id,
              docType: "voucher",
              fileName: `Itinerary_${updated.bookingCode}.pdf`,
              fileUrl: `/api/tours/${updated.tourId}/pdf`, // Link to the generation endpoint
              status: "approved"
            });

            // Notify Customer
            await storage.createNotification({
              userId: updated.customerId,
              title: "Booking Confirmed! ✨",
              message: `Your booking ${updated.bookingCode} is confirmed. Your official itinerary PDF is now available in your documents.`,
              type: "booking_update"
            });
          } catch (pdfErr) {
            console.error("Automated PDF generation failed:", pdfErr);
          }
        }
        
        // Auto capacity management (deduct seats — atomic update to avoid race conditions)
        if (oldBooking && oldBooking.departureId) {
          const partySize = oldBooking.partySizeExpected || 0;
          await db.transaction(async (tx) => {
            await tx.update(tourDepartures)
              .set({
                capacityBooked: sql`LEAST(${tourDepartures.capacityTotal}, COALESCE(${tourDepartures.capacityBooked}, 0) + ${partySize})`
              })
              .where(eq(tourDepartures.id, oldBooking.departureId!));
            const [dep] = await tx.select().from(tourDepartures).where(eq(tourDepartures.id, oldBooking.departureId!));
            if (dep && (dep.capacityBooked || 0) >= (dep.capacityTotal || 0)) {
              await tx.update(tourDepartures).set({ status: "sold_out" }).where(eq(tourDepartures.id, dep.id));
            }
          });
        }
      } else if ((req.body.status === "cancelled" || req.body.status === "rejected") && oldBooking?.status === "confirmed") {
        // Restore capacity if confirmed booking is cancelled/rejected (atomic)
        if (oldBooking && oldBooking.departureId) {
          const partySize = oldBooking.partySizeExpected || 0;
          await db.transaction(async (tx) => {
            await tx.update(tourDepartures)
              .set({
                capacityBooked: sql`GREATEST(0, COALESCE(${tourDepartures.capacityBooked}, 0) - ${partySize})`
              })
              .where(eq(tourDepartures.id, oldBooking.departureId!));
            const [dep] = await tx.select().from(tourDepartures).where(eq(tourDepartures.id, oldBooking.departureId!));
            if (dep && dep.status === "sold_out" && (dep.capacityBooked || 0) < (dep.capacityTotal || 0)) {
              await tx.update(tourDepartures).set({ status: "open" }).where(eq(tourDepartures.id, dep.id));
            }
          });
        }
      }
      
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteBooking(req.params.id as string);
      res.json({ success: true, message: "Booking deleted" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/bookings/bulk-initialize", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { bookingIds } = req.body;
      if (!Array.isArray(bookingIds)) {
        return res.status(400).json({ message: "bookingIds must be an array" });
      }
      let initialized = 0;
      for (const id of bookingIds) {
        await initializeBookingWorkflows(id);
        const wfs = await storage.getWorkflows(id);
        for (const wf of wfs) {
          let assignedUserId = undefined;
          if (wf.serviceType === "airline") assignedUserId = "user-airline_supplier-1";
          else if (wf.serviceType === "hotel") assignedUserId = "user-hotel_manager-1";
          else if (wf.serviceType === "transport") assignedUserId = "user-transport_manager-1";
          
          if (assignedUserId) {
            await storage.updateWorkflow(wf.id, { assignedUserId, status: "assigned" });
          }
        }
        initialized++;
      }
      res.json({ initialized });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/bookings/join", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const joinSchema = z.object({ joinCode: z.string().min(1) });
      const parsed = joinSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Join code required" });
      const original = await storage.getBookingByJoinCode(parsed.data.joinCode);
      if (!original) return res.status(404).json({ message: "Invalid join code" });
      if (original.departureId) {
        const departure = await storage.getDeparture(original.departureId);
        if (departure && (departure.capacityBooked || 0) >= (departure.capacityTotal || 0)) {
          return res.status(409).json({ message: "No spots available for this departure" });
        }
      }
      const bookingCode = `BK-${generateCode(8)}`;
      const booking = await storage.createBooking({
        tourId: original.tourId, departureId: original.departureId,
        customerId: userId, bookingType: "join_leader_group", bookingCode,
        groupName: original.groupName, leaderUserId: original.customerId,
        partySizeExpected: 1, status: "submitted", fulfillmentStatus: "pending",
      });
      res.json(booking);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Customer booking routes ----
  app.get("/api/my-bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      res.json(await storage.getBookingsByCustomer(userId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/my-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId) return res.status(403).json({ message: "Not your booking" });
      res.json(booking);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/my-bookings/:id/travelers", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId && booking.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await storage.getTravelers(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/my-bookings/:id/workflows", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking || booking.customerId !== userId) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getWorkflows(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/my-bookings/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking || booking.customerId !== userId) return res.status(403).json({ message: "Forbidden" });
      const msgs = await storage.getMessages(req.params.id as string);
      res.json(msgs.filter(m => m.visibility === "customer_visible"));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Customer Documents ----
  app.get("/api/my-bookings/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getDocuments(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/my-bookings/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      const parsed = insertDocumentSchema.safeParse({ ...req.body, bookingId: req.params.id as string, uploadedBy: userId });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createDocument(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Customer Payments ----
  app.get("/api/my-bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getPayments(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/my-bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      const parsed = insertPaymentSchema.safeParse({ ...req.body, bookingId: req.params.id as string, createdBy: userId });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createPayment(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/my-bookings/:id/payments/:paymentId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      
      const payments = await storage.getPayments(req.params.id as string);
      const targetPayment = payments.find(p => p.id === req.params.paymentId as string);
      if (!targetPayment) return res.status(404).json({ message: "Payment not found" });

      const updated = await storage.updatePayment(req.params.paymentId as string, {
        receiptUrl: req.body.receiptUrl,
        notes: req.body.notes,
      });

      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Leader Group Participants ----
  app.get("/api/my-bookings/:id/participants", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId || booking.bookingType !== "leader_group") {
        return res.status(403).json({ message: "Forbidden" });
      }
      res.json(await storage.getGroupParticipants(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/my-bookings/:id/participants/:participantBookingId/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId || booking.bookingType !== "leader_group") {
        return res.status(403).json({ message: "Forbidden" });
      }
      const participant = await storage.getBooking(req.params.participantBookingId as string);
      if (!participant) return res.status(404).json({ message: "Participant booking not found" });
      if (participant.leaderUserId !== userId) {
        return res.status(403).json({ message: "Forbidden: not your participant" });
      }
      const updated = await storage.updateBooking(req.params.participantBookingId as string, { status: "cancelled" });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Customer Self-Cancellation ----
  app.post("/api/my-bookings/:id/cancel", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId) return res.status(403).json({ message: "Not your booking" });
      if (booking.status === "cancelled") return res.status(400).json({ message: "Already cancelled" });
      if (booking.status === "completed") return res.status(400).json({ message: "Cannot cancel a completed booking" });
      const previousStatus = booking.status;
      const updated = await storage.updateBooking(req.params.id as string, { status: "cancelled" });
      // Audit trail
      const userName = await getUserName(req);
      await storage.createAuditLog({
        entityType: "booking",
        entityId: req.params.id as string,
        action: "status_changed",
        changedBy: userId,
        changedByName: userName,
        previousValue: previousStatus || "submitted",
        newValue: "cancelled",
        note: req.body.reason || "Customer self-cancelled",
      });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Public Groups (Joinable Departures) ----
  app.get("/api/departures/:departureId/public-groups", async (req, res) => {
    try {
      const departure = await storage.getDeparture(req.params.departureId as string);
      if (!departure) return res.status(404).json({ message: "Departure not found" });
      if (!departure.publicJoinEnabled) return res.json([]);
      // Return leader_group bookings for this departure (minus personal info)
      const allBookings = await storage.getAllBookings();
      const publicGroups = allBookings
        .filter(b => b.departureId === req.params.departureId as string && b.bookingType === "leader_group" && b.status !== "cancelled")
        .map(b => ({
          id: b.id,
          groupName: b.groupName || "Travel Group",
          partySizeExpected: b.partySizeExpected,
          joinCode: b.joinCode,
        }));
      res.json(publicGroups);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/public-groups", async (req, res) => {
    try {
      const publicGroups = await storage.getPublicGroups();
      res.json(publicGroups);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Audit Logs ----
  app.get("/api/audit-logs/:entityType/:entityId", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAuditLogs(req.params.entityType as string, req.params.entityId as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Scraping ----
  app.post("/api/admin/scrape/countries", isAuthenticated, async (req, res) => {
    let job;
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      job = await storage.createImportJob({ entityType: "country", status: "running" });
      const countriesList = await scraperService.scrapeCountries();
      const results = await storage.bulkCreateCountries(countriesList);
      await storage.updateImportJob(job.id, { 
        status: "completed", 
        totalRecords: countriesList.length, 
        processedRecords: results.length,
        completedAt: new Date()
      });
      res.json({ success: true, count: results.length, jobId: job.id });
    } catch (e: any) { 
      if (job) await storage.updateImportJob(job.id, { status: "failed", errors: e.message, completedAt: new Date() });
      res.status(500).json({ message: e.message }); 
    }
  });

  app.post("/api/admin/scrape/cities/:countryCode", isAuthenticated, async (req, res) => {
    let job;
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const countryId = req.body.countryId as string;
      const country = await storage.getCountry(countryId);
      if (!country) return res.status(404).json({ message: "Country not found" });
      
      job = await storage.createImportJob({ entityType: "city", status: "running" });
      const citiesList = await scraperService.scrapeCities(req.params.countryCode as string, country.id);
      const results = await storage.bulkCreateCities(citiesList);
      await storage.updateImportJob(job.id, { 
        status: "completed", 
        totalRecords: citiesList.length, 
        processedRecords: results.length,
        completedAt: new Date()
      });
      res.json({ success: true, count: results.length, jobId: job.id });
    } catch (e: any) { 
      if (job) await storage.updateImportJob(job.id, { status: "failed", errors: e.message, completedAt: new Date() });
      res.status(500).json({ message: e.message }); 
    }
  });

  app.post("/api/admin/scrape/sights/:cityId", isAuthenticated, async (req, res) => {
    let job;
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const cityId = req.params.cityId as string;
      const city = await storage.getCity(cityId);
      if (!city) return res.status(404).json({ message: "City not found" });

      job = await storage.createImportJob({ entityType: "sight", status: "running" });
      const sightsList = await scraperService.scrapeSights(city.id, city.name, city.osmId || undefined);
      const results = await storage.bulkCreateSights(sightsList);
      await storage.updateImportJob(job.id, { 
        status: "completed", 
        totalRecords: sightsList.length, 
        processedRecords: results.length,
        completedAt: new Date()
      });
      res.json({ success: true, count: results.length, jobId: job.id });
    } catch (e: any) { 
      if (job) await storage.updateImportJob(job.id, { status: "failed", errors: e.message, completedAt: new Date() });
      res.status(500).json({ message: e.message }); 
    }
  });

  app.post("/api/admin/scrape/hotels/:cityId", isAuthenticated, async (req, res) => {
    let job;
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const cityId = req.params.cityId as string;
      const city = await storage.getCity(cityId);
      if (!city) return res.status(404).json({ message: "City not found" });

      job = await storage.createImportJob({ entityType: "hotel", status: "running" });
      const hotelsList = await hotelService.searchPrices(city.name, "US", { from: new Date().toISOString(), to: new Date().toISOString() });
      const results = await storage.bulkCreateHotels(hotelsList);
      await storage.updateImportJob(job.id, { 
        status: "completed", 
        totalRecords: hotelsList.length, 
        processedRecords: results.length,
        completedAt: new Date()
      });
      res.json({ success: true, count: results.length, jobId: job.id });
    } catch (e: any) { 
      if (job) await storage.updateImportJob(job.id, { status: "failed", errors: e.message, completedAt: new Date() });
      res.status(500).json({ message: e.message }); 
    }
  });

  // ---- AI Features ----
  app.post("/api/admin/ai/generate-tour", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const itinerary = await aiService.generateItinerary(req.body);
      res.json(itinerary);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/ai/enrich-sight/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const sight = await storage.getSight(req.params.id as string);
      if (!sight) return res.status(404).json({ message: "Sight not found" });
      const enriched = await aiService.enrichSightDescription(sight.name, sight.description || "");
      const updated = await storage.updateSight(sight.id, { longDescription: enriched });
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Tour Day Items ----
  app.get("/api/tour-days/:dayId/items", async (req, res) => {
    try { res.json(await storage.getTourDayItems(req.params.dayId as string)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/tour-days/:dayId/items", isAuthenticated, async (req, res) => {
    try {
      const data = { ...req.body, tourDayId: req.params.dayId };
      const item = await storage.createTourDayItem(data);
      res.status(201).json(item);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/tour-day-items/:id", isAuthenticated, async (req, res) => {
    try { res.json(await storage.updateTourDayItem(req.params.id as string, req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/tour-day-items/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteTourDayItem(req.params.id as string);
      res.sendStatus(204);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Master Records ----
  app.get("/api/master-records", isAuthenticated, async (req, res) => {
    try {
      res.json(await storage.getMasterRecords(req.query.type as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/master-records", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const record = await storage.createMasterRecord(req.body);
      
      // If it is a city manager creating a city, auto-insert into cities table
      if (req.body.recordType === "city_manager" && req.body.title) {
        const userId = getUserId(req);
        const profile = await storage.getProfileByUserId(userId!);
        const countryCode = profile?.countryCode || "EG"; // default to Egypt if not set
        
        let countryId: string | null = null;
        const [country] = await db.select().from(countries).where(eq(countries.code, countryCode.toUpperCase())).limit(1);
        if (country) {
          countryId = country.id;
        } else {
          const [firstCountry] = await db.select().from(countries).limit(1);
          if (firstCountry) countryId = firstCountry.id;
        }
        
        if (countryId) {
          const nameTrimmed = req.body.title.trim();
          const [existingCity] = await db.select()
            .from(cities)
            .where(and(
              eq(sql`lower(${cities.name})`, nameTrimmed.toLowerCase()),
              eq(cities.countryId, countryId)
            ))
            .limit(1);
            
          if (!existingCity) {
            await db.insert(cities).values({
              name: nameTrimmed,
              countryId: countryId
            });
          }
        }
      }
      
      res.status(201).json(record);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/master-records/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const oldRecord = await storage.getMasterRecord(req.params.id as string);
      const updated = await storage.updateMasterRecord(req.params.id as string, req.body);
      
      if (oldRecord && oldRecord.recordType === "city_manager" && req.body.title && req.body.title !== oldRecord.title) {
        const oldName = oldRecord.title.trim().toLowerCase();
        const newName = req.body.title.trim();
        
        const match = await db.select().from(cities).where(eq(sql`lower(${cities.name})`, oldName)).limit(1);
        if (match[0]) {
          await db.update(cities).set({ name: newName }).where(eq(cities.id, match[0].id));
        }
      }
      
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/master-records/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const oldRecord = await storage.getMasterRecord(req.params.id as string);
      
      if (oldRecord && oldRecord.recordType === "city_manager") {
        const cityName = oldRecord.title.trim().toLowerCase();
        const match = await db.select().from(cities).where(eq(sql`lower(${cities.name})`, cityName)).limit(1);
        if (match[0]) {
          await db.delete(cities).where(eq(cities.id, match[0].id));
        }
      }
      
      await storage.deleteMasterRecord(req.params.id as string);
      res.sendStatus(204);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Supplier Rates ----
  // Hotel Rates
  app.get("/api/rates/hotel", isAuthenticated, async (req, res) => {
    try { res.json(await storage.getHotelRates()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/rates/hotel", isAuthenticated, async (req, res) => {
    try { res.status(201).json(await storage.createHotelRate(req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/rates/hotel/:id", isAuthenticated, async (req, res) => {
    try { res.json(await storage.updateHotelRate(req.params.id as string, req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/rates/hotel/:id", isAuthenticated, async (req, res) => {
    try { await storage.deleteHotelRate(req.params.id as string); res.sendStatus(204); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Guide Rates
  app.get("/api/rates/guide", isAuthenticated, async (req, res) => {
    try { res.json(await storage.getGuideRates()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/rates/guide", isAuthenticated, async (req, res) => {
    try { res.status(201).json(await storage.createGuideRate(req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/rates/guide/:id", isAuthenticated, async (req, res) => {
    try { res.json(await storage.updateGuideRate(req.params.id as string, req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/rates/guide/:id", isAuthenticated, async (req, res) => {
    try { await storage.deleteGuideRate(req.params.id as string); res.sendStatus(204); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Sights Rates
  app.get("/api/rates/sights", isAuthenticated, async (req, res) => {
    try { res.json(await storage.getSightsRates()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/rates/sights", isAuthenticated, async (req, res) => {
    try { res.status(201).json(await storage.createSightsRate(req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/rates/sights/:id", isAuthenticated, async (req, res) => {
    try { res.json(await storage.updateSightsRate(req.params.id as string, req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/rates/sights/:id", isAuthenticated, async (req, res) => {
    try { await storage.deleteSightsRate(req.params.id as string); res.sendStatus(204); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Airline Rates
  app.get("/api/rates/airline", isAuthenticated, async (req, res) => {
    try { res.json(await storage.getAirlineRates()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/rates/airline", isAuthenticated, async (req, res) => {
    try { res.status(201).json(await storage.createAirlineRate(req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/rates/airline/:id", isAuthenticated, async (req, res) => {
    try { res.json(await storage.updateAirlineRate(req.params.id as string, req.body)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/rates/airline/:id", isAuthenticated, async (req, res) => {
    try { await storage.deleteAirlineRate(req.params.id as string); res.sendStatus(204); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Airline Management ----
  app.get("/api/flights/search", async (req, res) => {
    try {
      const origin = req.query.origin as string;
      const destination = req.query.destination as string;
      const date = req.query.date as string;
      const passengers = req.query.passengers as string;
      const cabinClass = req.query.cabinClass as string;
      if (!origin || !destination || !date) {
        return res.status(400).json({ message: "Origin, destination, and date are required" });
      }
      const results = await airlineService.searchFlights({
        origin: origin as string,
        destination: destination as string,
        date: date as string,
        passengers: passengers ? parseInt(passengers as string) : 1,
        cabinClass: cabinClass as any,
      });
      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Hotels ----
  app.get("/api/hotels", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      if (req.query.cityId) {
        return res.json(await storage.getHotelsByCity(req.query.cityId as string));
      }
      res.json(await storage.getAllHotels());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/hotels", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.status(201).json(await storage.createHotel(req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/hotels/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.updateHotel(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/hotels/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteHotel(req.params.id as string);
      res.sendStatus(204);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Travelers ----
  app.get("/api/bookings/:id/travelers", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getTravelers(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
      const parsed = insertTravelerSchema.safeParse({ ...req.body, bookingId: req.params.id as string });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTraveler(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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

      const results = [];
      for (const tData of travelers) {
        const parsed = insertTravelerSchema.safeParse({ ...tData, bookingId: req.params.id as string });
        if (parsed.success) {
          results.push(await storage.createTraveler(parsed.data));
        }
      }
      res.json({ success: true, inserted: results.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/travelers/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.updateTraveler(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/travelers/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteTraveler(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Assignments ----
  app.get("/api/assignments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllAssignments());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/:id/assignments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAssignments(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/bookings/:id/assignments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const userId = getUserId(req);
      const assignData = { ...req.body, bookingId: req.params.id as string, assignedBy: userId };
      const assignment = await storage.createAssignment(assignData);

      const wf = await storage.createWorkflow({
        bookingId: req.params.id as string, countryCode: req.body.countryCode,
        serviceType: req.body.serviceType, assignedUserId: req.body.assignedUserId,
        status: "assigned",
      });

      const steps = SERVICE_WORKFLOW_STEPS[req.body.serviceType] || [];
      for (let i = 0; i < steps.length; i++) {
        await storage.createWorkflowStep({
          workflowId: wf.id, stepOrder: i + 1,
          stepCode: steps[i].code, stepName: steps[i].name, status: "pending",
        });
      }
      if (steps.length > 0) {
        await storage.updateWorkflow(wf.id, { currentStep: steps[0].name });
      }

      res.json({ success: true, message: "Booking confirmed and workflows initialized" });

      // Notify Customer & Staff in background via email queue (non-blocking)
      try {
        const booking = await storage.getBooking(req.params.id as string);
        if (!booking) return;

        const customerProfile = await storage.getProfileByUserIdWithEmail(booking.customerId);
        if (customerProfile?.user?.email) {
          sendBookingConfirmedNotification(customerProfile.user.email, booking);
        }

        const workflows = await storage.getWorkflows(req.params.id as string);
        for (const wf of workflows) {
          if (wf.assignedUserId) {
            const staffProfile = await storage.getProfileByUserIdWithEmail(wf.assignedUserId);
            if (staffProfile?.user?.email) {
              sendAssignmentNotification(
                staffProfile.user.email,
                wf.serviceType,
                booking.bookingCode,
                wf.id
              );
            }
          }
        }
      } catch (err) {
        console.error("Post-confirmation notifications failed:", err);
      }
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.updateAssignment(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteAssignment(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Workflows ----
  app.get("/api/workflows", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllWorkflows());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/:id/workflows", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getWorkflows(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/workflows/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const wf = await storage.getWorkflow(req.params.id as string);
      if (!wf) return res.status(404).json({ message: "Workflow not found" });
      res.json(wf);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/workflows/:id/steps", isAuthenticated, async (req, res) => {
    try { res.json(await storage.getWorkflowSteps(req.params.id as string)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/workflows/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      const wf = await storage.getWorkflow(req.params.id as string);
      if (!wf) return res.status(404).json({ message: "Workflow not found" });
      const isFlightAgentOnAirlineWf = profile.role === "flight_agent" && wf.serviceType === "airline";
      if (profile.role === "admin" || profile.role === "super_admin") {
        res.json(await storage.updateWorkflow(req.params.id as string, req.body));
      } else if (wf.assignedUserId === userId || isFlightAgentOnAirlineWf) {
        // Non-admin updaters (assigned staff, or flight_agent on airline tasks)
        // may only touch task progress fields — not assignment/linkage/service metadata.
        const TASK_FIELDS = ["status", "notes"];
        const body: Record<string, any> = {};
        for (const key of Object.keys(req.body || {})) {
          if (TASK_FIELDS.includes(key)) body[key] = req.body[key];
        }
        res.json(await storage.updateWorkflow(req.params.id as string, body));
      } else {
        res.status(403).json({ message: "Forbidden" });
      }
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/workflow-steps/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      const isStaff = ALL_STAFF_ROLES.includes(profile.role as any);
      if (!isStaff) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.updateWorkflowStep(req.params.id as string, { ...req.body, updatedBy: userId }));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Documents ----
  app.get("/api/documents", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllDocuments());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/:id/documents", isAuthenticated, async (req, res) => {
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
      res.json(await storage.getDocuments(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/bookings/:id/documents", isAuthenticated, async (req, res) => {
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
      const parsed = insertDocumentSchema.safeParse({ ...req.body, bookingId: req.params.id as string, uploadedBy: userId });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createDocument(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Messages ----
  app.get("/api/messages", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAllMessages());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/:id/messages", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getMessages(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Payments ----
  app.get("/api/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAllPayments());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/:id/invoices", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getInvoices(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/bookings/:id/invoices", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertInvoiceSchema.safeParse({ ...req.body, bookingId: req.params.id as string });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createInvoice(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getPayments(req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const userId = getUserId(req);
      const parsed = insertPaymentSchema.safeParse({ ...req.body, bookingId: req.params.id as string, createdBy: userId });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createPayment(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/payments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const updated = await storage.updatePayment(req.params.id as string, req.body);
      
      // Notify customer if payment is confirmed as paid (non-blocking)
      if (req.body.status === "paid") {
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Master Data: Countries ----
  app.get("/api/master/countries", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllCountries());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/countries", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertCountrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createCountry(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/master/countries/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertCountrySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateCountry(req.params.id as string, parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/master/countries/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteCountry(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/master/countries/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const data = coerceBooleans(req.body, ["isActive"]);
      const rows = z.array(insertCountrySchema).safeParse(data);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateCountries(rows.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Master Data: Cities ----
  app.get("/api/master/cities", isAuthenticated, async (req, res) => {
    try {
      const profile = await storage.getOrCreateProfile(getUserId(req) as string);
      const allCities = await storage.getAllCities();
      if (profile.role === "city_manager") {
        const ownCountryId = await resolveCityManagerCountryId(getUserId(req) as string);
        return res.json(ownCountryId ? allCities.filter(c => c.countryId === ownCountryId) : []);
      }
      res.json(allCities);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  // city_manager may only create/edit/delete cities within their own assigned
  // country (profile.countryCode); admins/country_manager are unrestricted.
  async function resolveCityManagerCountryId(userId: string): Promise<string | null> {
    const profile = await storage.getProfileByUserId(userId);
    if (!profile?.countryCode) return null;
    const [country] = await db.select().from(countries).where(eq(countries.code, profile.countryCode.toUpperCase())).limit(1);
    return country?.id || null;
  }

  app.post("/api/master/cities", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "city_manager"])) return;
      const profile = await storage.getOrCreateProfile(getUserId(req) as string);
      const body = { ...req.body };
      if (profile.role === "city_manager") {
        const ownCountryId = await resolveCityManagerCountryId(getUserId(req) as string);
        if (!ownCountryId) return res.status(403).json({ message: "No country assigned to this account" });
        body.countryId = ownCountryId;
      }
      const parsed = insertCitySchema.safeParse(body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createCity(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/master/cities/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "city_manager"])) return;
      const profile = await storage.getOrCreateProfile(getUserId(req) as string);
      const parsed = insertCitySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (profile.role === "city_manager") {
        const ownCountryId = await resolveCityManagerCountryId(getUserId(req) as string);
        const existing = await storage.getCity(req.params.id as string);
        if (!ownCountryId || !existing || existing.countryId !== ownCountryId) {
          return res.status(403).json({ message: "Forbidden: city is outside your assigned country" });
        }
        delete (parsed.data as any).countryId; // cannot move a city to another country
      }
      res.json(await storage.updateCity(req.params.id as string, parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/master/cities/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "city_manager"])) return;
      const profile = await storage.getOrCreateProfile(getUserId(req) as string);
      if (profile.role === "city_manager") {
        const ownCountryId = await resolveCityManagerCountryId(getUserId(req) as string);
        const existing = await storage.getCity(req.params.id as string);
        if (!ownCountryId || !existing || existing.countryId !== ownCountryId) {
          return res.status(403).json({ message: "Forbidden: city is outside your assigned country" });
        }
      }
      await storage.deleteCity(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/cities/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const allCountries = await storage.getAllCountries();
      const countryNameMap = new Map<string, string>();
      for (const c of allCountries) countryNameMap.set(c.name.toLowerCase(), c.id);

      const rawData = coerceBooleans(req.body, ["isActive", "isAirportCity"]);
      const resolved = [];
      const skipped: string[] = [];
      for (const row of rawData) {
        if (row.countryName) {
          const cid = countryNameMap.get(row.countryName.toLowerCase());
          if (cid) {
            const { countryName, ...rest } = row;
            resolved.push({ ...rest, countryId: cid });
          } else {
            skipped.push(row.countryName);
          }
        } else if (row.countryId) {
          resolved.push(row);
        } else {
          skipped.push(row.name || "unknown");
        }
      }
      if (resolved.length === 0) {
        return res.status(400).json({ message: `No cities could be matched to existing countries. Make sure countries are imported first. Unmatched: ${Array.from(new Set(skipped)).slice(0, 10).join(", ")}${skipped.length > 10 ? "..." : ""}` });
      }
      const rows = z.array(insertCitySchema).safeParse(resolved);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const result = await storage.bulkCreateCities(rows.data);
      const response: any = Array.isArray(result) ? result : [result];
      if (skipped.length > 0) {
        return res.json({ imported: response.length, skipped: skipped.length, skippedSample: Array.from(new Set(skipped)).slice(0, 10) });
      }
      res.json(response);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Master Data: Airports ----
  app.get("/api/master/airports", isAuthenticated, async (_req, res) => {
    try { res.json(await storage.getAllAirports()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/airports", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertAirportSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createAirport(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/master/airports/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertAirportSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateAirport(req.params.id as string, parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/master/airports/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteAirport(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/airports/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const allCities = await storage.getAllCities();
      const cityNameMap = new Map<string, string>();
      for (const c of allCities) cityNameMap.set(c.name.toLowerCase(), c.id);

      const rawData = coerceBooleans(req.body, ["isActive"]);
      const resolved = [];
      const skipped: string[] = [];
      for (const row of rawData) {
        if (row.cityId) {
          resolved.push(row);
        } else if (row.cityName) {
          const cid = cityNameMap.get(row.cityName.toLowerCase());
          if (cid) {
            const { cityName, ...rest } = row;
            resolved.push({ ...rest, cityId: cid });
          } else {
            skipped.push(row.cityName);
          }
        } else {
          skipped.push(row.code || "unknown");
        }
      }
      if (resolved.length === 0) {
        return res.status(400).json({ message: `No airports could be matched to existing cities. Make sure cities are imported first. Unmatched: ${Array.from(new Set(skipped)).slice(0, 10).join(", ")}${skipped.length > 10 ? "..." : ""}` });
      }
      const rows = z.array(insertAirportSchema).safeParse(resolved);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const result = await storage.bulkCreateAirports(rows.data);
      const response: any = Array.isArray(result) ? result : [result];
      if (skipped.length > 0) {
        return res.json({ imported: response.length, skipped: skipped.length, skippedSample: Array.from(new Set(skipped)).slice(0, 10) });
      }
      res.json(response);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Master Data: Sights ----
  app.get("/api/master/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllSights());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertSightSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createSight(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/master/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertSightSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateSight(req.params.id as string, parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/master/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteSight(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/sights/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const validCategories = ["museum", "landmark", "park", "religious", "entertainment", "nature", "historical", "other"];
      const categoryMap: Record<string, string> = {
        "cultural": "landmark", "historical": "historical", "religious": "religious",
        "natural": "nature", "nature": "nature", "museum": "museum", "landmark": "landmark",
        "park": "park", "entertainment": "entertainment", "other": "other",
      };

      const allCities = await storage.getAllCities();
      const cityNameMap = new Map<string, string>();
      for (const c of allCities) cityNameMap.set(c.name.toLowerCase(), c.id);

      const allCountries = await storage.getAllCountries();
      const countryNameMap = new Map<string, string>();
      for (const co of allCountries) countryNameMap.set(co.name.toLowerCase(), co.id);

      const rawData = coerceBooleans(req.body, ["isActive", "ticketRequired"]);
      const resolved = [];
      const skipped: string[] = [];
      const createdCities: string[] = [];
      for (const row of rawData) {
        if (row.category) {
          const mapped = categoryMap[row.category.toLowerCase()];
          row.category = mapped || "other";
        }
        let cityId = row.cityId;
        if (row.cityName) {
          const cid = cityNameMap.get(row.cityName.toLowerCase());
          if (cid) {
            cityId = cid;
          } else {
            const countryName = row.countryName || row.country;
            const countryId = countryName ? countryNameMap.get(countryName.toLowerCase()) : (allCountries.length === 1 ? allCountries[0].id : null);
            if (!countryId) {
              const defaultCountry = countryNameMap.get("jordan") || (allCountries.length > 0 ? allCountries[0].id : null);
              if (defaultCountry) {
                const newCity = await storage.createCity({ name: row.cityName, countryId: defaultCountry, isActive: true });
                cityNameMap.set(row.cityName.toLowerCase(), newCity.id);
                cityId = newCity.id;
                createdCities.push(row.cityName);
              } else {
                skipped.push(`${row.name || "unknown"} (city: ${row.cityName})`);
                continue;
              }
            } else {
              const newCity = await storage.createCity({ name: row.cityName, countryId, isActive: true });
              cityNameMap.set(row.cityName.toLowerCase(), newCity.id);
              cityId = newCity.id;
              createdCities.push(row.cityName);
            }
          }
          delete row.cityName;
          delete row.countryName;
          delete row.country;
        }
        if (!cityId) {
          skipped.push(row.name || "unknown");
          continue;
        }
        row.cityId = cityId;
        resolved.push(row);
      }
      if (resolved.length === 0) {
        return res.status(400).json({ message: `No sights could be imported. Check your CSV format.` });
      }
      const rows = z.array(insertSightSchema).safeParse(resolved);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const result = await storage.bulkCreateSights(rows.data);
      const response: any = Array.isArray(result) ? result : [result];
      const result2: any = { imported: response.length };
      if (createdCities.length > 0) result2.citiesCreated = createdCities.length;
      if (skipped.length > 0) { result2.skipped = skipped.length; result2.skippedSample = Array.from(new Set(skipped)).slice(0, 10); }
      res.json(result2);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Master Data: Transport Companies ----
  app.get("/api/master/transport-companies", isAuthenticated, async (_req, res) => {
    try { res.json(await storage.getAllTransportCompanies()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/transport-companies", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertTransportCompanySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTransportCompany(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/master/transport-companies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertTransportCompanySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateTransportCompany(req.params.id as string, parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/master/transport-companies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteTransportCompany(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/transport-companies/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const data = coerceBooleans(req.body, ["isActive"]);
      const rows = z.array(insertTransportCompanySchema).safeParse(data);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateTransportCompanies(rows.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Master Data: Airline Agencies ----
  app.get("/api/master/airline-agencies", isAuthenticated, async (_req, res) => {
    try { res.json(await storage.getAllAirlineAgencies()); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/airline-agencies", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertAirlineAgencySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createAirlineAgency(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/master/airline-agencies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertAirlineAgencySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateAirlineAgency(req.params.id as string, parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/master/airline-agencies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteAirlineAgency(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/master/airline-agencies/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const data = coerceBooleans(req.body, ["isActive"]);
      const rows = z.array(insertAirlineAgencySchema).safeParse(data);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateAirlineAgencies(rows.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Helper: get transport manager's company ID (returns null for admin, enforces scope for transport_manager)
  async function getTransportScope(req: Request, res: Response): Promise<{ companyId: string | undefined; isAdmin: boolean } | null> {
    const userId = req.session.userId;
    if (!userId) { res.status(401).json({ message: "Unauthorized" }); return null; }
    const profile = await storage.getProfileByUserId(userId);
    if (!profile) { res.status(403).json({ message: "No profile" }); return null; }
    if (profile.role === "admin" || profile.role === "super_admin" || profile.role === "country_manager") return { companyId: req.query.companyId as string | undefined, isAdmin: true };
    if (profile.role === "transport_manager") {
      if (!profile.transportCompanyId) { res.status(403).json({ message: "Not linked to a transport company" }); return null; }
      return { companyId: profile.transportCompanyId, isAdmin: false };
    }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/transport/bus-types", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertBusTypeSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createBusType(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/transport/bus-types/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      res.json(await storage.updateBusType(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/transport/bus-types/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      await storage.deleteBusType(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Transport: Routes ----
  app.get("/api/transport/routes", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      if (scope.companyId) res.json(await storage.getTransportRoutes(scope.companyId));
      else if (scope.isAdmin) res.json(await storage.getAllTransportRoutes());
      else res.json([]);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/transport/routes", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportRouteSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createTransportRoute(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/transport/routes/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      res.json(await storage.updateTransportRoute(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/transport/routes/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      await storage.deleteTransportRoute(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/transport/route-pricing", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportRoutePricingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createRoutePricing(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/transport/route-pricing/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      res.json(await storage.updateRoutePricing(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/transport/route-pricing/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      await storage.deleteRoutePricing(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Transport: Bookings ----
  app.get("/api/transport/bookings", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      res.json(await storage.getTransportBookings(scope.companyId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.get("/api/transport/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const tb = await storage.getTransportBooking(req.params.id as string);
      if (!tb) return res.status(404).json({ message: "Not found" });
      if (!scope.isAdmin && tb.companyId !== scope.companyId) return res.status(403).json({ message: "Forbidden" });
      res.json(tb);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/transport/bookings", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportBookingSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createTransportBooking(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/transport/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const existing = await storage.getTransportBooking(req.params.id as string);
      if (!existing) return res.status(404).json({ message: "Not found" });
      if (!scope.isAdmin && existing.companyId !== scope.companyId) return res.status(403).json({ message: "Forbidden" });
      const data = { ...req.body };
      if (data.status === "confirmed" && !data.confirmedAt) {
        data.confirmedAt = new Date();
      }
      res.json(await storage.updateTransportBooking(req.params.id as string, data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Transport: Invoices ----
  app.get("/api/transport/invoices", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      res.json(await storage.getTransportInvoices(scope.companyId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/transport/invoices", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      const parsed = insertTransportInvoiceSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (!scope.isAdmin && parsed.data.companyId !== scope.companyId) return res.status(403).json({ message: "Cannot create for another company" });
      res.json(await storage.createTransportInvoice(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/transport/invoices/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const data = { ...req.body };
      if (data.status === "approved" && !data.approvedAt) {
        data.approvedAt = new Date();
      }
      res.json(await storage.updateTransportInvoice(req.params.id as string, data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Transport: Payments ----
  app.get("/api/transport/payments", isAuthenticated, async (req, res) => {
    try {
      const scope = await getTransportScope(req, res);
      if (!scope) return;
      res.json(await storage.getTransportPayments(scope.companyId));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/transport/payments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertTransportPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTransportPayment(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/transport/payments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.updateTransportPayment(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  const validRateStatuses = ["draft", "active", "archived"] as const;
  function sanitizeRateUpdate(body: any) {
    const { id, createdAt, ...rest } = body;
    if (rest.status && !validRateStatuses.includes(rest.status)) {
      return null;
    }
    return rest;
  }

  // ---- Rate Cards: Hotel Rates ----
  app.get("/api/rates/hotel", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      res.json(await storage.getHotelRates());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/hotel", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertHotelRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createHotelRate(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/hotel/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const rows = z.array(insertHotelRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateHotelRates(rows.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/rates/hotel/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateHotelRate(req.params.id as string, data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/rates/hotel/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteHotelRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Rate Cards: Transport Rates ----
  app.get("/api/rates/transport", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      res.json(await storage.getTransportRates());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/transport", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertTransportRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createTransportRate(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/transport/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const rows = z.array(insertTransportRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateTransportRates(rows.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/rates/transport/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateTransportRate(req.params.id as string, data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/rates/transport/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteTransportRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Rate Cards: Guide Rates ----
  app.get("/api/rates/guide", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      res.json(await storage.getGuideRates());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/guide", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertGuideRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createGuideRate(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/guide/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const rows = z.array(insertGuideRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateGuideRates(rows.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/rates/guide/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateGuideRate(req.params.id as string, data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/rates/guide/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteGuideRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Rate Cards: Sights Rates ----
  app.get("/api/rates/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      res.json(await storage.getSightsRates());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertSightsRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createSightsRate(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.post("/api/rates/sights/bulk", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const rows = z.array(insertSightsRateSchema).safeParse(req.body);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateSightsRates(rows.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.patch("/api/rates/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const data = sanitizeRateUpdate(req.body);
      if (!data) return res.status(400).json({ message: "Invalid status value" });
      res.json(await storage.updateSightsRate(req.params.id as string, data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  app.delete("/api/rates/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteSightsRate(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Seed default admin user if none exists
  try {
    const existingAdmin = await authStorage.getUserByUsername("admin");
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash("admin123", 10);
      const adminUser = await authStorage.upsertUser({
        username: "admin",
        passwordHash,
        firstName: "System",
        lastName: "Admin",
        email: "admin@tourops.com",
      });
      const profile = await storage.getOrCreateProfile(adminUser.id);
      if (profile.role !== "admin" && profile.role !== "super_admin") {
        await storage.updateProfile(profile.id, { role: "admin" });
      }
      console.log("Default admin user created: username=admin, password=admin123");
    }

    // Seed default pricing settings
    const taxSetting = await storage.getGlobalSettingByKey("sales_tax_percent");
    if (!taxSetting) await storage.updateGlobalSetting("sales_tax_percent", "11"); // 11% default
    
    const serviceFeeSetting = await storage.getGlobalSettingByKey("default_service_fee");
    if (!serviceFeeSetting) await storage.updateGlobalSetting("default_service_fee", "25"); // $25 default
  } catch (e) {
    console.error("Error seeding admin/settings:", e);
  }

  // ---- Notifications ----
  app.get("/api/notifications", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const list = await storage.getNotifications(userId);
      res.json(list.map(n => ({ ...n, read: n.isRead })));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
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
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Admin: Email Queue Diagnostics ----
  app.get("/api/admin/email-queue", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(getQueueStats());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/analytics", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["admin", "super_admin", "country_manager"])) return;
      const analytics = await storage.getAnalytics();
      res.json(analytics);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
  // ---- Pricing & Markups ----
  app.get("/api/admin/pricing/markup-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      res.json(await storage.getMarkupRules());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Affiliates ----
  app.get("/api/admin/affiliates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAffiliates());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/affiliates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertAffiliateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      res.json(await storage.createAffiliate(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Tracking referral clicks
  app.get("/ref/:code", async (req, res) => {
    try {
      const { code } = req.params;
      const affiliate = await storage.getAffiliates().then(list => list.find(a => a.code === code));
      if (affiliate) {
        await storage.createAffiliateReferral({
          affiliateId: affiliate.id,
          clickId: req.query.clickId as string || undefined,
          ipAddress: req.ip || undefined,
          userAgent: req.get('user-agent') || undefined,
        });
      }
      res.redirect("/?ref=" + code);
    } catch (e: any) { res.redirect("/"); }
  });

  app.get("/api/admin/stats", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      res.json(await storage.getGlobalSalesStats());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/audit-logs/:type/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAuditLogs(req.params.type as string, req.params.id as string));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Data Import & Scrapers ----
  app.get("/api/hotels/search", async (req, res) => {
    try {
      const { city, countryCode, from, to } = req.query;
      if (!city || !countryCode) return res.status(400).json({ message: "city and countryCode are required" });
      const hotels = await hotelService.searchPrices(city as string, countryCode as string, { 
        from: (from as string) || new Date().toISOString(), 
        to: (to as string) || new Date().toISOString() 
      });
      res.json(hotels);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/data-import/countries/run", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      if (!queues.countryImport) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.countryImport.add('import-countries', {});
      res.json({ message: "Country import started in background", jobId: job.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/data-import/cities/run", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { countryCode, countryId } = req.body;
      if (!countryCode || !countryId) return res.status(400).json({ message: "countryCode and countryId are required" });
      if (!queues.cityImport) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.cityImport.add('import-cities', { countryCode, countryId });
      res.json({ message: "City import started in background", jobId: job.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/data-import/sights/run", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { cityId, cityName, osmId } = req.body;
      if (!cityId || !cityName) return res.status(400).json({ message: "cityId and cityName are required" });
      if (!queues.sightDiscovery) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.sightDiscovery.add('import-sights', { cityId, cityName, osmId });
      res.json({ message: "Sight import started in background", jobId: job.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/sights/:id/enrich", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const sight = await storage.getSight(req.params.id as string);
      if (!sight) return res.status(404).json({ message: "Sight not found" });
      if (!queues.sightEnrichment) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.sightEnrichment.add('enrich-sight', { sightId: sight.id, sightName: sight.name });
      res.json({ message: "Sight enrichment started in background", jobId: job.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/hotels/search-prices", isAuthenticated, async (req, res) => {
    try {
      const { cityId, cityName } = req.body;
      if (!cityId || !cityName) return res.status(400).json({ message: "cityId and cityName are required" });
      
      // Scrape/Search hotels for this city
      const hotels = await hotelService.searchPrices(cityName, "US", { from: new Date().toISOString(), to: new Date().toISOString() });
      const result = await storage.bulkCreateHotels(hotels);
      
      // In a real scenario, we'd also create price snapshots here.
      // For now, returning the created/updated hotels.
      res.json({ message: `Found and updated ${result.length} hotels`, count: result.length, hotels: result });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/scraper/block", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ message: "domain is required" });
      scraperSafety.blockDomain(domain);
      res.json({ message: `Domain ${domain} blocked` });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/scraper/unblock", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ message: "domain is required" });
      scraperSafety.unblockDomain(domain);
      res.json({ message: `Domain ${domain} unblocked` });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/audit-logs", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAuditLogs());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/ai-consultant", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const stats = await storage.getGlobalSalesStats();
      const analysis = await aiService.analyzeBusinessPerformance(stats);
      res.json(analysis);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/flights/search", isAuthenticated, async (req, res) => {
    try {
      const { origin, destination, date, passengers, cabinClass } = req.query;
      if (!origin || !destination || !date) {
        return res.status(400).json({ message: "origin, destination, and date are required" });
      }

      const results = await airlineService.searchFlights({
        origin: origin as string,
        destination: destination as string,
        date: date as string,
        passengers: passengers ? parseInt(passengers as string) : 1,
        cabinClass: (cabinClass as any) || "economy"
      });

      res.json(results);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/tour-generator", isAuthenticated, async (req, res) => {
    try {
      const { destination, duration, travelerType, interests, budget, pace } = req.body;
      if (!destination || !duration) return res.status(400).json({ message: "destination and duration are required" });
      
      const itinerary = await aiService.generateItinerary({
        destination,
        duration: parseInt(duration),
        travelerType: travelerType || "solo",
        interests: interests || [],
        budget: budget || "medium",
        pace: pace || "normal"
      });
      
      res.json(itinerary);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/pricing/markup-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      const parsed = insertMarkupRuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createMarkupRule(parsed.data));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/admin/pricing/markup-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      res.json(await storage.updateMarkupRule(req.params.id as string, req.body));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/admin/pricing/markup-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      await storage.deleteMarkupRule(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/admin/pricing/settings", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getGlobalSettings());
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/admin/pricing/settings", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      res.json(await storage.updateGlobalSetting(req.body.key, req.body.value));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tours/:id/price-breakdown", isAuthenticated, async (req, res) => {
    try {
      const breakdown = await pricingService.calculateTourPrice(req.params.id as string);
      res.json(breakdown);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ---- Image Proxy & Optimization ----
  app.get("/api/images/proxy", isAuthenticated, async (req, res) => {
    try {
      const url = req.query.url as string;
      const width = req.query.width as string;
      const height = req.query.height as string;
      if (!url) return res.status(400).json({ message: "URL is required" });
      if (!(await isSafeImageUrl(url))) {
        return res.status(400).json({ message: "URL is not allowed" });
      }

      const result = await imageService.processImage(url as string, {
        width: width ? parseInt(width as string) : undefined,
        height: height ? parseInt(height as string) : undefined
      });

      if (typeof result === 'string') {
        return res.redirect(result);
      }

      // Serve the local file path
      res.redirect(result.path);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/tours/:id/pdf", isAuthenticated, async (req, res) => {
    try {
      const pdfBuffer = await pdfService.generateItinerary(req.params.id as string);
      res.contentType("application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="itinerary-${req.params.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  return httpServer;
}
