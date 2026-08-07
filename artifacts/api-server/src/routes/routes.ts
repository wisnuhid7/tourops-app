import type { Express, Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { routeError } from "../lib/routeError";
import Decimal from "decimal.js";
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
import { autoFillTourTranslations, maybeAutoTranslateTourInBackground } from "../lib/tour-translation";
import { maybeAutoTranslateEntitiesInBackground } from "../lib/entity-translation";

// Shape a raw `translations` jsonb blob down to public-safe fields only, so
// public endpoints never leak translated copies of non-public columns
// (e.g. guide notes, hotel policies).
function pickPublicTranslations(translations: any, allowedKeys: string[]) {
  if (!translations || typeof translations !== "object") return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [lang, fields] of Object.entries(translations)) {
    if (!fields || typeof fields !== "object") continue;
    const shaped: Record<string, string> = {};
    for (const key of allowedKeys) {
      const v = (fields as any)[key];
      if (typeof v === "string") shaped[key] = v;
    }
    if (Object.keys(shaped).length > 0) out[lang] = shaped;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
import { queues } from "../lib/workers";
import { scraperSafety } from "../lib/scraperSafety";
import { setupAuth, isAuthenticated } from "../replit_integrations/auth";
import { registerPaymentRoutes } from "./paymentRoutes";
import { registerServiceOpsRoutes } from "./serviceOpsRoutes";
import { registerLifecycleRoutes } from "./lifecycleRoutes";
import { registerAuthRoutes, passwordSchema } from "../replit_integrations/auth";
import { authStorage } from "../replit_integrations/auth/storage";
import { db } from "@workspace/db";
import { countries, cities, tours, tourDays, tourDayItems, tourDepartures } from "@workspace/db";
import { eq, and, sql, isNull, desc, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

// Strict raster-image allowlist. SVG is intentionally excluded: it can embed
// <script> and, if served inline, execute in our origin (stored XSS). The
// stored extension is derived from the validated MIME type — never from the
// user-supplied filename — so a spoofed extension can't be smuggled onto disk.
const ALLOWED_IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "images");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (req, file, cb) => {
      const ext = ALLOWED_IMAGE_MIME_EXT[file.mimetype] ?? ".bin";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME_EXT[file.mimetype]) {
      return cb(new Error("Only PNG, JPEG, WebP, or GIF images are allowed"));
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
  insertHotelRateSchema, insertTransportRateSchema, insertGuideRateSchema, insertSightsRateSchema, insertAirlineRateSchema,
  insertBookingWorkflowSchema, insertWorkflowStepSchema, insertInvoiceSchema,
  insertAffiliateSchema, insertMarkupRuleSchema, userRoleEnum,
  groupSizeBands, pricingRules, airfareRates, pricingQuotes, pricingQuoteLineItems,
  pricingAdjustmentRules,
  insertGroupSizeBandSchema, insertPricingRuleSchema, insertAirfareRateSchema,
  insertPricingAdjustmentRuleSchema,
  exchangeRates, pricingQuoteOverrides, quotePricingSnapshots,
  insertExchangeRateSchema, insertPricingQuoteOverrideSchema
} from "@workspace/db";
import { computeQuote, assistanceTypeForPax, PricingInputError, OCCUPANCY_TYPES, type HotelChoiceInput } from "../services/pricing-engine";
import { resolveTourComponents, accommodationForTour, tourOffersRoomTypes, BOOKING_ROOM_TYPES, type BookingRoomType } from "../services/rate-resolver";

import { sendWhatsApp, sendSMS, MESSAGE_TEMPLATES } from "../lib/messaging";
import { generateCode as genCode } from "../lib/utils";

const ALL_STAFF_ROLES = [
  "admin", "super_admin",
  "airline_supplier", "country_manager", "city_manager",
  "hotel_manager", "transport_manager", "guide_manager",
  "sights_manager", "content_editor", "flight_agent",
  "tour_builder", "supplier", "tour_leader", "accounting",
  "operations_manager", "support_agent",
];

// Both admin and super_admin have full administrative access
const ADMIN_ROLES = ["admin", "super_admin"];

// Internal staff = all staff EXCEPT external supplier roles. External suppliers
// (airline_supplier) must not see the staff directory, global assignments,
// hotels, or mutate global master data (countries/cities/airports) — they only
// manage their own airline domain (per role spec).
const EXTERNAL_SUPPLIER_ROLES = ["airline_supplier"];
const INTERNAL_STAFF_ROLES = ALL_STAFF_ROLES.filter(r => !EXTERNAL_SUPPLIER_ROLES.includes(r));
// city_manager's remit is a single assigned city (user_profiles.city_id) and
// content_editor's remit is descriptive tour content (per role specs): neither
// may read platform-wide bookings, the staff directory, assignments, or the
// full hotel list — their dashboards don't need them.
// guide_manager is likewise limited to its own guide domain (own-scoped guide
// rates + assigned workflows via /api/supplier/*): no platform-wide reads.
// hotel_manager is scoped to hotels it registered (hotels.created_by).
// The generic "supplier" role is an external vendor: it only sees its own
// assigned workflows via /api/supplier/* — no platform-wide reads and no
// master-data mutations (supplier-tenant isolation per role spec).
// tour_leader only sees its own led/created bookings (scoped in the bookings
// GET handlers below) — never the whole platform.
const PLATFORM_WIDE_READ_ROLES = INTERNAL_STAFF_ROLES.filter(r => !["city_manager", "content_editor", "guide_manager", "hotel_manager", "sights_manager", "accounting", "supplier", "support_agent", "tour_leader", "transport_manager"].includes(r));
// support_agent assists customers on their bookings: read bookings, read the
// booking conversation, see payment status — never mutate finance or operations.
const SUPPORT_READ_ROLES = [...ADMIN_ROLES, "support_agent"];
// accounting handles the financial lifecycle: bookings (read), invoices and
// payments (read + record/confirm). No operational or master-data authority.
export const FINANCE_ROLES = ["super_admin", "admin", "accounting"];
// Who may read the full customer booking book: management/oversight roles plus
// finance (accounting) and support (support_agent). Deliberately EXCLUDES
// flight_agent and tour_builder — their dashboards read workflows/tours, not
// bookings — to avoid over-exposing customer PII. tour_leader is handled
// separately above with row scoping to their own/led bookings.
const BOOKING_READ_ROLES = ["super_admin", "admin", "country_manager", "operations_manager", "accounting", "support_agent"];
// Master records (countries/cities/airports and other global reference data)
// may only be mutated by operational manager roles — not by city_manager
// (single-city remit) or content_editor (content-only remit).
const MASTER_RECORDS_MANAGE_ROLES = INTERNAL_STAFF_ROLES.filter(r => !["city_manager", "content_editor", "guide_manager", "hotel_manager", "sights_manager", "accounting", "operations_manager", "supplier", "support_agent", "tour_leader", "transport_manager"].includes(r));
// operations_manager dispatches resources: broad operational reads plus
// assignment/workflow management, but no pricing, finance, master-data or
// user administration authority.
const OPS_DISPATCH_ROLES = [...ADMIN_ROLES, "operations_manager"];

// Catalog/master-data managers: base staff plus per-domain supplier roles.
// Each supplier role manages its own catalog category (rates + master records).
const CATALOG_BASE_ROLES = ["super_admin", "admin", "country_manager"];
const HOTEL_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "hotel_manager"];
// Who may register (submit) a master hotel record. Hotel managers can submit,
// but their submissions stay in "draft" until an admin/super_admin approves.
const HOTEL_REGISTER_ROLES = [...ADMIN_ROLES, "hotel_manager"];
// Who may edit/delete a master hotel record: admins plus hotel managers.
// (Approval status changes remain admin-only — enforced in the PATCH handler.)
const HOTEL_EDIT_ROLES = [...ADMIN_ROLES, "hotel_manager"];
const GUIDE_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "guide_manager"];
const SIGHTS_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "sights_manager"];
const AIRLINE_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "airline_supplier"];
const TRANSPORT_COMPANY_MANAGE_ROLES = [...CATALOG_BASE_ROLES, "transport_manager"];
// Finance mutations (invoices/payments): admins + transport_manager only — country_manager excluded.
const TRANSPORT_FINANCE_ROLES = [...ADMIN_ROLES, "transport_manager"];

// Tour builders assemble itineraries (days/items) and can create/edit tour structure & pricing
const TOUR_BUILDER_ROLES = [...ADMIN_ROLES, "tour_builder"];
// Content editors + tour builders can edit tour marketing/content fields
const TOUR_CONTENT_ROLES = [...ADMIN_ROLES, "tour_builder", "content_editor"];

export function getUserId(req: Request): string | undefined {
  return req.session?.userId;
}

async function getUserName(req: Request): Promise<string> {
  const userId = req.session?.userId;
  if (!userId) return "User";
  const user = await authStorage.getUser(userId);
  if (user?.firstName) return `${user.firstName} ${user.lastName || ""}`.trim();
  return user?.username || "User";
}

export async function canAccessBooking(userId: string, bookingId: string) {
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

export async function requireRole(req: Request, res: Response, roles: string[]): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) { res.status(401).json({ message: "Unauthorized" }); return false; }
  let profile;
  try {
    profile = await storage.getOrCreateProfile(userId);
  } catch (e: any) {
    // AUTHZ-02: unprovisioned account — fail closed with a clear message.
    res.status(e?.statusCode || 403).json({ message: e?.message || "Forbidden" });
    return false;
  }
  if (!roles.includes(profile.role)) {
    res.status(403).json({ message: "Forbidden: insufficient role" });
    return false;
  }
  return true;
}

// Returns true when the request carries a valid session whose profile role is
// internal/external staff (i.e. not a customer / not anonymous). Used to gate
// otherwise-public tour detail reads so drafts stay staff-only (AUTHZ-01).
async function isStaffViewer(req: Request): Promise<boolean> {
  const userId = getUserId(req);
  if (!userId) return false;
  try {
    const profile = await storage.getOrCreateProfile(userId);
    return ALL_STAFF_ROLES.includes(profile.role as any);
  } catch { return false; }
}

// Guard for public-facing tour sub-resources: an unpublished (draft) tour and
// its nested resources (days, items, guides, hotels, departures) must never be
// readable by anonymous or customer callers — only by authenticated staff.
// Responds 404 (indistinguishable from "not found") and returns false when the
// caller may not view the tour.
async function ensureTourViewable(req: Request, res: Response, tourId: string): Promise<boolean> {
  const tour = await storage.getTour(tourId);
  if (!tour) { res.status(404).json({ message: "Tour not found" }); return false; }
  if (!tour.isPublished && !(await isStaffViewer(req))) {
    res.status(404).json({ message: "Tour not found" });
    return false;
  }
  return true;
}

// Per-supplier data isolation. When the caller's role is one of `scopedRoles`
// (a supplier role that must only see its own records), returns ownerId = their
// userId; for full-access / other staff roles returns ownerId = null (see all).
async function ownerScope(
  req: Request,
  scopedRoles: string[],
): Promise<{ userId: string; role: string; ownerId: string | null; transportCompanyId: string | null }> {
  const userId = getUserId(req) as string;
  const profile = await storage.getOrCreateProfile(userId);
  const ownerId = scopedRoles.includes(profile.role) ? userId : null;
  return { userId, role: profile.role, ownerId, transportCompanyId: (profile as any).transportCompanyId ?? null };
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
  registerPaymentRoutes(app);
  registerServiceOpsRoutes(app);
  registerLifecycleRoutes(app);

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
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/user-profiles", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PLATFORM_WIDE_READ_ROLES)) return;
      const requester = await storage.getOrCreateProfile(getUserId(req)!);
      const all = await storage.getAllProfiles();
      // country_manager only sees users assigned to its own country (per role spec).
      if (requester.role === "country_manager") {
        return res.json(all.filter(p => p.countryCode && requester.countryCode && p.countryCode.toUpperCase() === requester.countryCode.toUpperCase()));
      }
      res.json(all);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/user-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const updateSchema = z.object({ role: z.enum(userRoleEnum.enumValues).optional(), phone: z.string().optional(), companyName: z.string().optional(), countryCode: z.string().optional(), cityId: z.string().nullable().optional(), isTourLeader: z.boolean().optional(), isActive: z.boolean().optional() });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateProfile(req.params.id as string, parsed.data as any));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const createSchema = z.object({
        username: z.string().min(3).max(50),
        password: passwordSchema,
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        role: z.enum(userRoleEnum.enumValues),
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

      // Explicit provisioning (getOrCreateProfile is fail-closed and never creates)
      let profile = await authStorage.ensureProfile(user.id);
      if (profile) {
        profile = (await storage.updateProfile(profile.id, {
          role: parsed.data.role as any,
          phone: parsed.data.phone || null,
          companyName: parsed.data.companyName || null,
          countryCode: parsed.data.countryCode || null,
        })) ?? profile;
      }

      res.json({ user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email }, profile });
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/admin/users/:id/password", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const pwSchema = z.object({ password: passwordSchema });
      const parsed = pwSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await authStorage.getUser(req.params.id as string);
      if (!user) return res.status(404).json({ message: "User not found" });
      await authStorage.upsertUser({ ...user, passwordHash, updatedAt: new Date() });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Tours ----
  app.get("/api/tours", isAuthenticated, async (req, res) => {
    try {
      // operations_manager needs the tour list for the pricing quote builder.
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "tour_builder", "content_editor", "operations_manager"])) return;
      res.json(await storage.getAllTours());
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/tours/accommodation-summary", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      res.json(await storage.getTourAccommodationSummary());
    } catch (e: any) { routeError(res, e); }
  });

  // -------------------------------------------------------------------------
  // Public selling price: the advertised per-person price is the FULL price —
  // base + day-item costs + markup + service fee (pricingService), plus the
  // cheapest per-person hotel accommodation across room types. Staff-set
  // departure prices (pricePerPerson) still take precedence client-side.
  // -------------------------------------------------------------------------
  const ROOM_TYPE_OCCUPANCY: Record<BookingRoomType, number> = { matrimonial: 2, doble: 2, triple: 3 };

  type PublicTourPricing = { perPersonBase: number; accommodationFrom: number; perPersonFrom: number; currency: string };
  // Short-TTL cache: catalog pages fan out to per-tour pricing queries; 60s
  // bounds both the DB amplification and the staleness after a price edit.
  const publicPricingCache = new Map<string, { value: PublicTourPricing | null; expires: number }>();
  const PUBLIC_PRICING_TTL_MS = 60_000;

  async function publicTourPricing(tourId: string): Promise<PublicTourPricing | null> {
    const cached = publicPricingCache.get(tourId);
    if (cached && cached.expires > Date.now()) return cached.value;
    let value: PublicTourPricing | null = null;
    try {
      const pricing = await pricingService.calculateTourPrice(tourId);
      const perPersonBase = Math.round(pricing.totalPrice);
      // Cheapest per-person accommodation among room types priced in the tour
      // currency (no FX conversion yet — foreign-currency rooms are ignored,
      // not allowed to zero out a same-currency option).
      let accommodationFrom = 0;
      for (const rt of BOOKING_ROOM_TYPES) {
        const acc = await accommodationForTour(db, tourId, rt);
        const total = Number(acc.total);
        if (!Number.isFinite(total) || total <= 0) continue;
        if (acc.currency.toUpperCase() !== pricing.currency.toUpperCase()) continue;
        const perPerson = Math.round(total / ROOM_TYPE_OCCUPANCY[rt]);
        if (accommodationFrom === 0 || perPerson < accommodationFrom) accommodationFrom = perPerson;
      }
      value = {
        perPersonBase,
        accommodationFrom,
        perPersonFrom: perPersonBase + accommodationFrom,
        currency: pricing.currency,
      };
    } catch {
      value = null; // never let pricing enrichment break public catalog reads
    }
    publicPricingCache.set(tourId, { value, expires: Date.now() + PUBLIC_PRICING_TTL_MS });
    return value;
  }

  app.get("/api/tours/public", async (_req, res) => {
    try {
      const tours = await storage.getPublishedTours();
      const enriched = await Promise.all(tours.map(async (t: any) => ({
        ...t,
        publicPricing: await publicTourPricing(t.id),
      })));
      res.json(enriched);
    }
    catch (e: any) { routeError(res, e); }
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
      routeError(res, e);
    }
  });

  // Export tours as JSON payload that the client turns into an Excel file
  // matching the Master Tour Template import format.  GET /api/tours/export
  // accepts an optional ?ids=id1,id2,... query param; omitting it exports all
  // tours visible to the caller.  Hotel and sight IDs are resolved to names so
  // the resulting file round-trips cleanly through import.
  app.get("/api/tours/export", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;

      const rawIds = typeof req.query.ids === "string" ? req.query.ids : "";
      const requestedIds = rawIds ? rawIds.split(",").map((s) => s.trim()).filter(Boolean) : [];

      const allTours = await storage.getAllTours();
      const toursToExport = requestedIds.length
        ? allTours.filter((t) => requestedIds.includes(t.id))
        : allTours;

      if (toursToExport.length === 0) {
        return res.status(404).json({ message: "No tours found to export" });
      }

      const [allHotels, allSights, allGuideRates] = await Promise.all([
        storage.getAllHotels(),
        storage.getAllSights(),
        storage.getGuideRates(),
      ]);
      const hotelNameById = new Map(allHotels.map((h: any) => [h.id, String(h.name || "").trim()]));
      const sightNameById  = new Map(allSights.map((s: any) => [s.id, String(s.name || "").trim()]));
      const guideNameById  = new Map(allGuideRates.map((g: any) => [g.id, String(g.guideName || "").trim()]));

      const exportTours = await Promise.all(
        toursToExport.map(async (tour, idx) => {
          const ref = `T${idx + 1}`;
          const days = await storage.getTourDays(tour.id);
          const items = await storage.getTourDayItemsByTourId(tour.id);

          const itemsByDayId = new Map<string, typeof items>();
          for (const it of items) {
            const list = itemsByDayId.get(it.tourDayId) || [];
            list.push(it);
            itemsByDayId.set(it.tourDayId, list);
          }

          const sortedDays = [...days].sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0));

          return {
            ref,
            title: tour.title ?? "",
            description: tour.description ?? "",
            category: tour.category ?? "",
            countries: (tour.countries ?? []).join(", "),
            highlights: tour.highlights ?? "",
            inclusions: tour.inclusions ?? "",
            exclusions: tour.exclusions ?? "",
            tags: (tour.tags ?? []).join(", "),
            imageUrl: tour.imageUrl ?? "",
            basePrice: tour.basePrice ?? "",
            childPrice: tour.childPrice ?? "",
            singleSupplement: tour.singleSupplement ?? "",
            duration: tour.duration ?? 1,
            days: sortedDays.map((d) => ({
              dayNumber: d.dayNumber ?? 0,
              title: d.title ?? "",
              countryCode: (d as any).countryCode ?? "",
              city: (d as any).city ?? "",
              description: (d as any).description ?? "",
              activities: (d as any).activities ?? "",
              imageUrl: (d as any).imageUrl ?? "",
              items: (itemsByDayId.get(d.id) ?? [])
                .sort((a, b) => ((a as any).sortOrder ?? 0) - ((b as any).sortOrder ?? 0))
                .map((it) => ({
                  itemType: it.itemType ?? "custom",
                  title: it.title ?? "",
                  startTime: (it as any).startTime ?? "",
                  endTime: (it as any).endTime ?? "",
                  cost: it.cost ?? "",
                  currency: (it as any).currency ?? "USD",
                  isOptional: (it as any).isOptional ?? false,
                  bookingRequired: (it as any).bookingRequired ?? false,
                  hotelName: it.hotelId ? (hotelNameById.get(it.hotelId) ?? "") : "",
                  sightName: it.sightId ? (sightNameById.get(it.sightId) ?? "") : "",
                  guideName: it.guideId ? (guideNameById.get(it.guideId) ?? "") : "",
                  sortOrder: (it as any).sortOrder ?? 0,
                  description: (it as any).description ?? "",
                })),
            })),
          };
        })
      );

      res.json({ tours: exportTours });
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/tours/:id", async (req, res) => {
    try {
      const tour = await storage.getTour(req.params.id as string);
      if (!tour) return res.status(404).json({ message: "Tour not found" });
      // Draft (unpublished) tours are staff-only (AUTHZ-01).
      if (!tour.isPublished && !(await isStaffViewer(req))) {
        return res.status(404).json({ message: "Tour not found" });
      }
      // If ES/ID translations are missing for this tour's content, fill them in
      // the background so the next view renders translated (fire-and-forget,
      // deduped + failure-cooldown inside the helper).
      maybeAutoTranslateTourInBackground(tour as any);
      res.json({ ...tour, publicPricing: await publicTourPricing(tour.id) });
    } catch (e: any) { routeError(res, e); }
  });

  /** PG unique-constraint violation (code 23505), possibly wrapped by the driver. */
  function isUniqueViolation(e: any): boolean {
    return e?.code === "23505" || e?.cause?.code === "23505";
  }
  /** True only for the tours.slug unique constraint (don't mislabel other 23505s). */
  function isSlugUniqueViolation(e: any): boolean {
    if (!isUniqueViolation(e)) return false;
    const constraint = e?.constraint ?? e?.cause?.constraint ?? "";
    const detail = e?.detail ?? e?.cause?.detail ?? "";
    return /slug/i.test(constraint) || /slug/i.test(detail);
  }

  /**
   * TOUR-01/02 guards for PATCH (which bypasses the insert schema): price
   * fields must be non-negative and childPrice must not exceed basePrice
   * (checked against the merged state of the existing tour + patch).
   */
  const TOUR_PRICE_FIELDS = ["basePrice", "childPrice", "markupAmount", "totalPrice", "singleSupplement"] as const;
  const PRICE_STRING_RE = /^\d+(\.\d+)?$/; // strict non-negative decimal (rejects "12abc", "0x10", "-1")
  function validateTourPricePatch(body: Record<string, any>, existing: { basePrice: string | null; childPrice: string | null }): string | null {
    for (const f of TOUR_PRICE_FIELDS) {
      if (body[f] === undefined || body[f] === null) continue;
      if (!PRICE_STRING_RE.test(String(body[f]))) return `${f} must be a non-negative number`;
    }
    // Only enforce the cross-field rule when the patch actually touches a
    // price involved in it — content-only edits must not be blocked by
    // legacy rows that predate the child<=base guard.
    if (body.basePrice === undefined && body.childPrice === undefined) return null;
    const base = parseFloat(body.basePrice ?? existing.basePrice ?? "");
    const child = parseFloat(body.childPrice ?? existing.childPrice ?? "");
    if (Number.isFinite(base) && Number.isFinite(child) && child > base) {
      return "Child price cannot exceed the adult base price";
    }
    return null;
  }

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
    } catch (e: any) {
      // TOUR-04: translate unique-slug violations into a clean 409.
      if (isSlugUniqueViolation(e)) return res.status(409).json({ message: "A tour with this slug already exists" });
        if (isUniqueViolation(e)) return res.status(409).json({ message: "Duplicate value violates a unique constraint" });
      routeError(res, e);
    }
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
        const existing = await storage.getTour(req.params.id as string);
        if (!existing) return res.status(404).json({ message: "Tour not found" });
        const priceError = validateTourPricePatch(body, existing);
        if (priceError) return res.status(400).json({ message: priceError });
        res.json(await storage.updateTour(req.params.id as string, body, getUserId(req), await getUserName(req)));
      } catch (e: any) {
        if (isSlugUniqueViolation(e)) return res.status(409).json({ message: "A tour with this slug already exists" });
        if (isUniqueViolation(e)) return res.status(409).json({ message: "Duplicate value violates a unique constraint" });
        routeError(res, e);
      }
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
      } catch (e: any) {
        if (isSlugUniqueViolation(e)) return res.status(409).json({ message: "A tour with this slug already exists" });
        if (isUniqueViolation(e)) return res.status(409).json({ message: "Duplicate value violates a unique constraint" });
        routeError(res, e);
      }
    });

  // Bulk import from the "Master Tour Template" spreadsheet. The client
  // parses the XLSX and posts structured JSON; each tour succeeds or fails
  // independently so one bad row never blocks the rest of the file.
  const IMPORT_ITEM_TYPES = ["arrival", "departure", "sight", "hotel", "guide", "meal", "transport", "flight", "custom"];
  app.post("/api/tours/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      const toursIn = req.body?.tours;
      if (!Array.isArray(toursIn) || toursIn.length === 0) {
        return res.status(400).json({ message: "No tours found in the uploaded file" });
      }
      if (toursIn.length > 100) {
        return res.status(400).json({ message: "Too many tours in one file (max 100)" });
      }

      // Name → catalog lookups so the sheet can reference hotels/sights/guides by name.
      const [allHotels, allSights, allGuides] = await Promise.all([
        storage.getAllHotels(),
        storage.getAllSights(),
        storage.getGuideRates(),
      ]);
      const hotelByName = new Map(allHotels.map((h: any) => [String(h.name).trim().toLowerCase(), h]));
      const sightByName = new Map(allSights.map((s: any) => [String(s.name).trim().toLowerCase(), s]));
      const guideByName = new Map(allGuides.map((g: any) => [String(g.guideName || "").trim().toLowerCase(), g]));

      const itemSchema = insertTourDayItemSchema.omit({ tourDayId: true });
      const results: any[] = [];
      for (const t of toursIn) {
        const ref = t?.ref || t?.title || "(untitled)";
        try {
          const { days: daysIn, ref: _ref, ...tourFields } = t || {};
          const payload: any = { ...tourFields, isPublished: false }; // imports always land as drafts
          if (!payload.slug && payload.title) {
            payload.slug = String(payload.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();
          }
          // Preserve explicit duration from the sheet (e.g. 7 nights for a
          // 5-day itinerary); only fall back to day count when not provided
          // or when it's less than the actual number of day rows.
          if (Array.isArray(daysIn)) {
            const sheetDuration = Number(payload.duration);
            const dayCount = Math.max(1, daysIn.length);
            payload.duration = (!isNaN(sheetDuration) && sheetDuration >= dayCount) ? sheetDuration : dayCount;
          }
          const parsedTour = insertTourSchema.safeParse(payload);
          if (!parsedTour.success) {
            results.push({ ref, ok: false, error: parsedTour.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") });
            continue;
          }

          // Validate all days/items BEFORE creating the tour, so a failed
          // tour doesn't leave a half-imported shell behind.
          const parsedDays: any[] = [];
          let dayError: string | null = null;
          for (const d of daysIn || []) {
            const { items: itemsIn, ...dayFields } = d || {};
            const parsedDay = insertTourDaySchema.omit({ tourId: true }).safeParse(dayFields);
            if (!parsedDay.success) {
              dayError = `Day ${d?.dayNumber ?? "?"}: ${parsedDay.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
              break;
            }
            const parsedItems: any[] = [];
            for (const it of itemsIn || []) {
              const raw: any = { ...it };
              if (!IMPORT_ITEM_TYPES.includes(raw.itemType)) {
                dayError = `Day ${d?.dayNumber ?? "?"} item "${raw.title || "?"}": itemType must be one of ${IMPORT_ITEM_TYPES.join(", ")}`;
                break;
              }
              // Resolve catalog references by name; fill cost from catalog when the sheet leaves it blank.
              if (raw.hotelName) {
                const h = hotelByName.get(String(raw.hotelName).trim().toLowerCase());
                if (!h) { dayError = `Day ${d?.dayNumber ?? "?"}: hotel "${raw.hotelName}" not found in the hotel catalog`; break; }
                raw.hotelId = h.id;
                if ((raw.cost === undefined || raw.cost === null || raw.cost === "") && h.basePrice != null) raw.cost = String(h.basePrice);
                delete raw.hotelName;
              }
              if (raw.sightName) {
                const s = sightByName.get(String(raw.sightName).trim().toLowerCase());
                if (!s) { dayError = `Day ${d?.dayNumber ?? "?"}: sight "${raw.sightName}" not found in the sights catalog`; break; }
                raw.sightId = s.id;
                if ((raw.cost === undefined || raw.cost === null || raw.cost === "") && (s as any).ticketPrice != null) raw.cost = String((s as any).ticketPrice);
                delete raw.sightName;
              }
              if (raw.guideName) {
                const g = guideByName.get(String(raw.guideName).trim().toLowerCase());
                if (!g) { dayError = `Day ${d?.dayNumber ?? "?"}: guide "${raw.guideName}" not found in the guide catalog`; break; }
                raw.guideId = g.id;
                if ((raw.cost === undefined || raw.cost === null || raw.cost === "") && (g as any).price != null) raw.cost = String((g as any).price);
                if (!raw.currency && (g as any).currency) raw.currency = (g as any).currency;
                delete raw.guideName;
              }
              if (raw.cost !== undefined && raw.cost !== null && raw.cost !== "") {
                raw.cost = String(raw.cost).trim();
                // Strict non-negative decimal — the insert schema does not
                // validate numeric parseability, so bad values would 500 at
                // the DB after earlier writes.
                if (!/^\d+(\.\d+)?$/.test(raw.cost)) {
                  dayError = `Day ${d?.dayNumber ?? "?"} item "${raw.title || "?"}": cost must be a non-negative number (got "${raw.cost}")`;
                  break;
                }
              } else delete raw.cost;
              const parsedItem = itemSchema.safeParse(raw);
              if (!parsedItem.success) {
                dayError = `Day ${d?.dayNumber ?? "?"} item "${raw.title || "?"}": ${parsedItem.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`;
                break;
              }
              parsedItems.push(parsedItem.data);
            }
            if (dayError) break;
            parsedDays.push({ day: parsedDay.data, items: parsedItems });
          }
          if (dayError) { results.push({ ref, ok: false, error: dayError }); continue; }

          // All-or-nothing per tour: if any day/item write fails, remove
          // everything created for this tour so no half-imported shell remains.
          let createdTourId: string | null = null;
          try {
            const tour = await storage.createTour(parsedTour.data);
            createdTourId = tour.id;
            for (const { day, items } of parsedDays) {
              const createdDay = await storage.createTourDay({ ...day, tourId: tour.id });
              let sortOrder = 0;
              for (const item of items) {
                await storage.createTourDayItem({ ...item, tourDayId: createdDay.id, sortOrder: item.sortOrder ?? sortOrder++ });
              }
            }
            results.push({ ref, ok: true, tourId: tour.id, title: tour.title, days: parsedDays.length });
          } catch (e: any) {
            if (createdTourId) {
              try {
                const dayRows = await db.select({ id: tourDays.id }).from(tourDays).where(eq(tourDays.tourId, createdTourId));
                const dayIds = dayRows.map((r) => r.id);
                if (dayIds.length) await db.delete(tourDayItems).where(inArray(tourDayItems.tourDayId, dayIds));
                await db.delete(tourDays).where(eq(tourDays.tourId, createdTourId));
                await db.delete(tours).where(eq(tours.id, createdTourId));
              } catch (cleanupErr) {
                logger.error({ err: cleanupErr, tourId: createdTourId }, "tour import cleanup failed");
              }
            }
            throw e;
          }
        } catch (e: any) {
          results.push({ ref, ok: false, error: isSlugUniqueViolation(e) ? "A tour with this slug already exists" : "Failed to create tour" });
        }
      }
      const created = results.filter(r => r.ok).length;
      res.json({ created, failed: results.length - created, results });
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/tours/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteTour(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/ai/generate-itinerary", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const itinerary = await aiService.generateItinerary(req.body);
      res.json(itinerary);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/ai/translate-content", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const translated = await aiService.translateTourContent(req.body);
      res.json(translated);
    } catch (e: any) { routeError(res, e); }
  });

  // Auto-fill ES/ID translations for a tour and all of its itinerary days using
  // AI, then persist them to the translations jsonb columns. Anyone who can edit
  // tour content can trigger this.
  app.post("/api/ai/translate-tour/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_CONTENT_ROLES)) return;
      const result = await autoFillTourTranslations(req.params.id as string, {
        userId: getUserId(req),
        userName: await getUserName(req),
      });
      res.json({ success: true, tour: result.tour, days: result.days });
    } catch (e: any) {
      if (e.message === "Tour not found") return res.status(404).json({ message: e.message });
      routeError(res, e);
    }
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

  // ---- Bookings ----
  app.get("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      const profile = userId ? await storage.getOrCreateProfile(userId) : null;
      if (profile?.role === "tour_leader") {
        // Tour leaders see only the bookings they lead or created for clients.
        const all = await storage.getAllBookings();
        return res.json(all.filter(b => b.customerId === userId || b.leaderUserId === userId));
      }
      // Booking read is limited to management + finance/support roles who have a
      // genuine need for the customer booking book. Operational/builder roles
      // (flight_agent works off /api/flight-agent/workflows; tour_builder off
      // /api/tours) are intentionally excluded — their dashboards never consume
      // this endpoint, so granting the full list is unnecessary PII exposure.
      if (!await requireRole(req, res, BOOKING_READ_ROLES)) return;
      res.json(await storage.getAllBookings());
    } catch (e: any) { routeError(res, e); }
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
        // Prospective joiners hold the code, so give them just enough to render
        // the join dialog — never the leader's full booking (contact/payment data).
        return res.json({
          id: booking.id,
          tourId: booking.tourId,
          departureId: booking.departureId,
          customerId: booking.customerId, // leader id (needed to label the group)
          groupName: booking.groupName,
          partySizeExpected: booking.partySizeExpected,
          status: booking.status,
        });
      }
      res.json(booking);
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      // Suppliers use the assignment-scoped /api/supplier/bookings/:id instead.
      const userId = getUserId(req);
      const profile = userId ? await storage.getOrCreateProfile(userId) : null;
      if (profile?.role === "tour_leader") {
        const booking = await storage.getBooking(req.params.id as string);
        if (!booking) return res.status(404).json({ message: "Booking not found" });
        if (booking.customerId !== userId && booking.leaderUserId !== userId) {
          return res.status(403).json({ message: "Forbidden" });
        }
        return res.json(booking);
      }
      if (!await requireRole(req, res, [...PLATFORM_WIDE_READ_ROLES, "accounting", "support_agent"])) return;
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      res.json(booking);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });

      const profile = await storage.getOrCreateProfile(userId);
      const isStaff = ALL_STAFF_ROLES.includes(profile.role);
      const customerId = (isStaff && req.body.customerId) ? req.body.customerId : userId;

      // Group joins must go through POST /api/bookings/join, which resolves
      // leader/group/price from the join code and enforces membership rules
      // (group active, no self-join, no duplicates). Accepting them here
      // would bypass all of those guards.
      if (req.body.bookingType === "join_leader_group") {
        return res.status(400).json({ message: "Use the join code flow (POST /api/bookings/join) to join a group" });
      }

      const bookingCode = `BK-${generateCode(8)}`;
      const joinCode = req.body.bookingType === "leader_group" ? genCode(6) : undefined;
      const leaderUserId = (req.body.bookingType === "leader_group" || req.body.bookingType === "private_family") ? customerId : undefined;
      let affiliateId = undefined;
      if (req.body.referralCode) {
        const aff = await storage.getAffiliateByCode(req.body.referralCode);
        if (aff) affiliateId = aff.id;
      }

      // ---- Server-authoritative pricing --------------------------------
      // The client's totalPrice is display-only and NEVER trusted (except an
      // explicit staff override). Per-person price is resolved server-side:
      // departure price when set, otherwise the computed full selling price
      // (base + components + markup + fee), otherwise the tour base price.
      const partySize = Math.max(1, Number(req.body.partySizeExpected) || 1);
      let perPersonPrice: number | undefined;
      if (req.body.tourId) {
        if (req.body.departureId) {
          const dep = await storage.getDeparture(req.body.departureId);
          if (!dep || dep.tourId !== req.body.tourId) {
            return res.status(400).json({ message: "Departure does not belong to this tour" });
          }
          const depPrice = Number(dep.pricePerPerson);
          if (Number.isFinite(depPrice) && depPrice > 0) perPersonPrice = depPrice;
        }
        if (perPersonPrice === undefined) {
          const pp = await publicTourPricing(req.body.tourId);
          if (pp && pp.perPersonBase > 0) perPersonPrice = pp.perPersonBase;
          else {
            const tourRow = await storage.getTour(req.body.tourId);
            perPersonPrice = Number(tourRow?.basePrice) || 0;
          }
        }
      }

      // Room-type selection: accommodation is priced server-side from the
      // hotel's registered nightly rate × the tour's hotel nights, for as
      // many rooms as the party needs. Never trust a client-provided figure.
      let roomType: BookingRoomType | undefined;
      let accommodationCost: string | undefined;
      let totalPrice: number | undefined =
        perPersonPrice !== undefined ? perPersonPrice * partySize
        : (isStaff ? req.body.totalPrice : undefined);
      let bookingCurrency: string | undefined;
      if (req.body.roomType != null && req.body.roomType !== "") {
        if (!BOOKING_ROOM_TYPES.includes(req.body.roomType)) {
          return res.status(400).json({ message: `roomType must be one of: ${BOOKING_ROOM_TYPES.join(", ")}` });
        }
        if (!req.body.tourId) return res.status(400).json({ message: "roomType requires a tourId" });
        roomType = req.body.roomType;
        const acc = await accommodationForTour(db, req.body.tourId, roomType!);
        // Only add accommodation when its currency matches the booking currency
        // (no FX conversion yet) — never sum mixed currencies.
        const bodyCurrency = (req.body.currency || "USD").toUpperCase();
        if (new Decimal(acc.total).greaterThan(0) && acc.currency.toUpperCase() !== bodyCurrency) {
          return res.status(400).json({
            message: `Accommodation is priced in ${acc.currency} but the booking is in ${bodyCurrency}; currency conversion is not supported yet.`,
          });
        }
        // Rooms needed for the whole party, not a single room.
        const roomsNeeded = Math.max(1, Math.ceil(partySize / ROOM_TYPE_OCCUPANCY[roomType!]));
        const accTotal = new Decimal(acc.total).mul(roomsNeeded);
        accommodationCost = accTotal.toFixed(2);
        bookingCurrency = acc.currency;
        totalPrice = new Decimal(totalPrice ?? 0).plus(accTotal).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
      } else if (req.body.tourId && req.body.bookingType !== "join_leader_group") {
        // Customers starting a booking on a tour that offers room types must
        // pick one. (join_leader_group participants share the leader's rooms;
        // accommodation is billed on the leader's booking.)
        if (await tourOffersRoomTypes(db, req.body.tourId)) {
          return res.status(400).json({ message: "Please select a room type (matrimonial, doble, or triple) for this tour." });
        }
      }

      const booking = await storage.createBooking({
        ...req.body, 
        customerId, 
        bookingCode, 
        joinCode, 
        leaderUserId, 
        affiliateId,
        roomType: roomType ?? null,
        accommodationCost: accommodationCost ?? null,
        currency: bookingCurrency ?? req.body.currency ?? "USD",
        totalPrice,
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
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_DISPATCH_ROLES)) return;
      const userId = getUserId(req);
      const profile = await storage.getProfileByUserIdWithEmail(userId!);
      // operations_manager handles delivery, not commercial terms: restrict to
      // operational fields (no price/currency/customer/tour changes).
      if (profile?.role === "operations_manager") {
        const OPS_FIELDS = ["status", "fulfillmentStatus", "notes", "internalNotes", "isUrgent"];
        for (const key of Object.keys(req.body || {})) {
          if (!OPS_FIELDS.includes(key)) delete req.body[key];
        }
      }
      // Room type & accommodation cost are server-computed at booking time;
      // never accept them on generic edits (use a recalculation flow instead).
      delete req.body.roomType;
      delete req.body.accommodationCost;
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
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/bookings/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      await storage.deleteBooking(req.params.id as string);
      res.json({ success: true, message: "Booking deleted" });
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/bookings/join", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const joinSchema = z.object({
        joinCode: z.string().min(1),
        partySizeExpected: z.number().int().min(1).max(50).optional(),
      });
      const parsed = joinSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Join code required" });
      const original = await storage.getBookingByJoinCode(parsed.data.joinCode);
      if (!original) return res.status(404).json({ message: "Invalid join code" });
      // Only active (not cancelled/rejected/completed) groups can be joined
      if (["cancelled", "rejected", "completed"].includes(original.status || "")) {
        return res.status(409).json({ message: "This group is no longer accepting members" });
      }
      if (original.customerId === userId) {
        return res.status(400).json({ message: "You are the leader of this group" });
      }
      // Prevent duplicate joins of the same group
      const myBookings = await storage.getBookingsByCustomer(userId);
      const alreadyJoined = myBookings.some(b =>
        b.bookingType === "join_leader_group" &&
        b.leaderUserId === original.customerId &&
        b.tourId === original.tourId &&
        b.departureId === original.departureId &&
        !["cancelled", "rejected"].includes(b.status || "")
      );
      if (alreadyJoined) {
        return res.status(409).json({ message: "You have already joined this group" });
      }
      if (original.departureId) {
        const departure = await storage.getDeparture(original.departureId);
        if (departure && (departure.capacityBooked || 0) >= (departure.capacityTotal || 0)) {
          return res.status(409).json({ message: "No spots available for this departure" });
        }
      }
      const partySize = parsed.data.partySizeExpected ?? 1;
      // Price is derived server-side from the departure (never client input).
      let totalPrice: number | undefined;
      if (original.departureId) {
        const departure = await storage.getDeparture(original.departureId);
        const perPerson = Number(departure?.pricePerPerson);
        if (Number.isFinite(perPerson) && perPerson > 0) totalPrice = perPerson * partySize;
      }
      const bookingCode = `BK-${generateCode(8)}`;
      try {
        const booking = await storage.createBooking({
          tourId: original.tourId, departureId: original.departureId,
          customerId: userId, bookingType: "join_leader_group", bookingCode,
          groupName: original.groupName, leaderUserId: original.customerId,
          partySizeExpected: partySize, totalPrice,
          status: "submitted", fulfillmentStatus: "pending",
        });
        return res.json(booking);
      } catch (insertErr: any) {
        // Partial unique index uniq_active_group_membership guards the
        // read-then-insert race: concurrent duplicate joins surface here.
        if (insertErr?.code === "23505") {
          return res.status(409).json({ message: "You have already joined this group" });
        }
        throw insertErr;
      }
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Customer booking routes ----
  app.get("/api/my-bookings", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      res.json(await storage.getBookingsByCustomer(userId));
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/my-bookings/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (booking.customerId !== userId) return res.status(403).json({ message: "Not your booking" });
      res.json(booking);
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/my-bookings/:id/workflows", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking || booking.customerId !== userId) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getWorkflows(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/my-bookings/:id/messages", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await storage.getBooking(req.params.id as string);
      if (!booking || booking.customerId !== userId) return res.status(403).json({ message: "Forbidden" });
      const msgs = await storage.getMessages(req.params.id as string);
      res.json(msgs.filter(m => m.visibility === "customer_visible"));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Customer Documents ----
  app.get("/api/my-bookings/:id/documents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getDocuments(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Customer Payments ----
  app.get("/api/my-bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      res.json(await storage.getPayments(req.params.id as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/my-bookings/:id/payments", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      // Customers may only RECORD an offline payment (e.g. bank transfer with
      // a receipt) — never mark anything paid or touch provider/refund
      // fields. Online card payments must go through /api/checkout.
      const customerPaymentSchema = z.object({
        amount: z.number().int().positive(),
        method: z.enum(["bank_transfer", "cash", "other"]).default("bank_transfer"),
        currency: z.string().max(8).optional(),
        receiptUrl: z.string().max(2000).optional(),
        notes: z.string().max(2000).optional(),
      }).strict();
      const parsed = customerPaymentSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Only amount, method (bank_transfer/cash/other), currency, receiptUrl and notes are accepted; use the checkout flow for card payments" });
      res.json(await storage.createPayment({
        ...parsed.data,
        bookingId: req.params.id as string,
        customerId: booking.customerId,
        provider: "manual",
        status: "pending",
        createdBy: userId,
      }));
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/public-groups", async (req, res) => {
    try {
      const publicGroups = await storage.getPublicGroups();
      res.json(publicGroups);
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Audit Logs ----
  app.get("/api/audit-logs/:entityType/:entityId", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAuditLogs(req.params.entityType as string, req.params.entityId as string));
    } catch (e: any) { routeError(res, e); }
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
      routeError(res, e); 
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
      routeError(res, e); 
    }
  });

  app.post("/api/admin/scrape/sights/:cityId", isAuthenticated, async (req, res) => {
    let job;
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
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
      routeError(res, e); 
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
      routeError(res, e); 
    }
  });

  // ---- AI Features ----
  app.post("/api/admin/ai/generate-tour", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const itinerary = await aiService.generateItinerary(req.body);
      res.json(itinerary);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/ai/enrich-sight/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const sight = await storage.getSight(req.params.id as string);
      if (!sight) return res.status(404).json({ message: "Sight not found" });
      const enriched = await aiService.enrichSightDescription(sight.name, sight.description || "");
      const updated = await storage.updateSight(sight.id, { longDescription: enriched });
      res.json(updated);
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Tour Day Items ----
  app.get("/api/tour-days/:dayId/items", async (req, res) => {
    try {
      const items = await storage.getTourDayItems(req.params.dayId as string);
      maybeAutoTranslateEntitiesInBackground("tourDayItem", items as any);
      res.json(items);
    }
    catch (e: any) { routeError(res, e); }
  });

  app.post("/api/tour-days/:dayId/items", isAuthenticated, async (req, res) => {
    try {
      const data = { ...req.body, tourDayId: req.params.dayId };
      const item = await storage.createTourDayItem(data);
      res.status(201).json(item);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/tour-day-items/:id", isAuthenticated, async (req, res) => {
    try { res.json(await storage.updateTourDayItem(req.params.id as string, req.body)); }
    catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/tour-day-items/:id", isAuthenticated, async (req, res) => {
    try {
      await storage.deleteTourDayItem(req.params.id as string);
      res.sendStatus(204);
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Master Records ----
  app.get("/api/master-records", isAuthenticated, async (req, res) => {
    try {
      res.json(await storage.getMasterRecords(req.query.type as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/master-records", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, MASTER_RECORDS_MANAGE_ROLES)) return;
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
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/master-records/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, MASTER_RECORDS_MANAGE_ROLES)) return;
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
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/master-records/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, MASTER_RECORDS_MANAGE_ROLES)) return;
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
    } catch (e: any) { routeError(res, e); }
  });

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
      res.json(updated);
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/assignments/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_DISPATCH_ROLES)) return;
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
      const isFlightAgentOnAirlineWf = profile.role === "flight_agent" && wf.serviceType === "airline";
      if (profile.role === "admin" || profile.role === "super_admin" || profile.role === "operations_manager") {
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
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/workflow-steps/:id", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      const isStaff = ALL_STAFF_ROLES.includes(profile.role as any);
      if (!isStaff) return res.status(403).json({ message: "Forbidden" });
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
      res.json(await storage.getAllPayments());
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
        amount: z.number().int().positive(),
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
      res.json(await storage.createPayment({
        ...parsed.data,
        bookingId: targetBooking.id,
        customerId: targetBooking.customerId,
        provider: "manual",
        createdBy: userId,
      }));
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
        receiptUrl: z.string().max(2000).nullable().optional(),
        notes: z.string().max(2000).nullable().optional(),
        invoiceId: z.string().nullable().optional(),
      }).strict();
      const parsedPatch = patchSchema.safeParse(req.body);
      if (!parsedPatch.success) {
        return res.status(400).json({ message: "Only status, method, receiptUrl, notes and invoiceId can be updated" });
      }
      const updated = await storage.updatePayment(req.params.id as string, parsedPatch.data);
      
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
    } catch (e: any) { routeError(res, e); }
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

  // ---- Master Data: Countries ----
  // country_manager is scoped to ONE assigned country (user_profiles.country_code,
  // per role spec): it may edit that country's row and manage cities inside it,
  // but cannot create/delete countries or touch other countries' data.
  async function getAssignedCountryScope(req: Request): Promise<{ isScoped: boolean; countryId: string | null }> {
    const profile = await storage.getOrCreateProfile(getUserId(req)!);
    if (profile.role !== "country_manager") return { isScoped: false, countryId: null };
    if (!profile.countryCode) return { isScoped: true, countryId: null };
    const [row] = await db.select().from(countries).where(eq(countries.code, profile.countryCode.toUpperCase())).limit(1);
    return { isScoped: true, countryId: row?.id ?? null };
  }

  app.get("/api/master/countries", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllCountries());
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/countries", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin"])) return;
      const parsed = insertCountrySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createCountry(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/master/countries/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const scope = await getAssignedCountryScope(req);
      if (scope.isScoped && scope.countryId !== req.params.id) {
        return res.status(403).json({ message: "Country managers can only edit their assigned country" });
      }
      const parsed = insertCountrySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateCountry(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/master/countries/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin"])) return;
      await storage.deleteCountry(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/master/countries/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin"])) return;
      const data = coerceBooleans(req.body, ["isActive"]);
      const rows = z.array(insertCountrySchema).safeParse(data);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      res.json(await storage.bulkCreateCountries(rows.data));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Master Data: Cities ----
  // Cities master table: super_admin/admin/country_manager manage all rows.
  // city_manager is row-scoped — it may only PATCH its single assigned city
  // (user_profiles.city_id) and cannot create or delete cities (per role spec).
  app.get("/api/master/cities", isAuthenticated, async (_req, res) => {
    try {
      res.json(await storage.getAllCities());
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/master/cities", isAuthenticated, async (req, res) => {
    try {
      // city_manager manages ONLY its assigned city — cannot create new cities.
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertCitySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const scope = await getAssignedCountryScope(req);
      if (scope.isScoped && parsed.data.countryId !== scope.countryId) {
        return res.status(403).json({ message: "Country managers can only create cities in their assigned country" });
      }
      res.json(await storage.createCity(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/master/cities/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager", "city_manager"])) return;
      // city_manager is row-scoped to its assigned city (user_profiles.city_id).
      const cmProfile = await storage.getOrCreateProfile(getUserId(req)!);
      if (cmProfile.role === "city_manager" && cmProfile.cityId !== req.params.id) {
        return res.status(403).json({ message: "City managers can only edit their assigned city" });
      }
      const scope = await getAssignedCountryScope(req);
      if (scope.isScoped) {
        const target = (await storage.getAllCities()).find(c => c.id === req.params.id);
        if (!target || target.countryId !== scope.countryId) {
          return res.status(403).json({ message: "Country managers can only edit cities in their assigned country" });
        }
      }
      const parsed = insertCitySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateCity(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/master/cities/:id", isAuthenticated, async (req, res) => {
    try {
      // city_manager cannot delete cities (only edit its own assigned city).
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const scope = await getAssignedCountryScope(req);
      if (scope.isScoped) {
        const target = (await storage.getAllCities()).find(c => c.id === req.params.id);
        if (!target || target.countryId !== scope.countryId) {
          return res.status(403).json({ message: "Country managers can only delete cities in their assigned country" });
        }
      }
      await storage.deleteCity(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/cities/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin"])) return;
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
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Master Data: Airports ----
  app.get("/api/master/airports", isAuthenticated, async (_req, res) => {
    try { res.json(await storage.getAllAirports()); }
    catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/airports", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertAirportSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createAirport(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/master/airports/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      const parsed = insertAirportSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateAirport(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/master/airports/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["super_admin", "admin", "country_manager"])) return;
      await storage.deleteAirport(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Master Data: Sights ----
  app.get("/api/master/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      res.json(await storage.getAllSights());
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/sights", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      const parsed = insertSightSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createSight(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/master/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      const parsed = insertSightSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateSight(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/master/sights/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
      await storage.deleteSight(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/sights/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, SIGHTS_MANAGE_ROLES)) return;
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
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Master Data: Transport Companies ----
  app.get("/api/master/transport-companies", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      // Transport companies are shared/global by design: no per-owner filtering.
      res.json(await storage.getAllTransportCompanies());
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/transport-companies", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_COMPANY_MANAGE_ROLES)) return;
      const parsed = insertTransportCompanySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { userId } = await ownerScope(req, ["transport_manager"]);
      res.json(await storage.createTransportCompany({ ...parsed.data, createdBy: userId }));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/master/transport-companies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_COMPANY_MANAGE_ROLES)) return;
      // Transport companies are shared/global by design: no ownership check.
      const parsed = insertTransportCompanySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { createdBy: _ignoredCb, ...updateData } = parsed.data;
      res.json(await storage.updateTransportCompany(req.params.id as string, updateData));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/master/transport-companies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_COMPANY_MANAGE_ROLES)) return;
      await storage.deleteTransportCompany(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/transport-companies/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TRANSPORT_COMPANY_MANAGE_ROLES)) return;
      const data = coerceBooleans(req.body, ["isActive"]);
      const rows = z.array(insertTransportCompanySchema).safeParse(data);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const { userId } = await ownerScope(req, ["transport_manager"]);
      res.json(await storage.bulkCreateTransportCompanies(rows.data.map(r => ({ ...r, createdBy: userId }))));
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Master Data: Airline Agencies ----
  app.get("/api/master/airline-agencies", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      // Airlines catalog is shared/global by design: no per-owner filtering.
      res.json(await storage.getAllAirlineAgencies());
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/airline-agencies", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      const parsed = insertAirlineAgencySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { userId } = await ownerScope(req, ["airline_supplier"]);
      res.json(await storage.createAirlineAgency({ ...parsed.data, createdBy: userId }));
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/master/airline-agencies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      // Airlines catalog is shared/global by design: no ownership check.
      const parsed = insertAirlineAgencySchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const { createdBy: _ignoredCb, ...updateData } = parsed.data;
      res.json(await storage.updateAirlineAgency(req.params.id as string, updateData));
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/master/airline-agencies/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      // Airlines catalog is shared/global by design: no ownership check.
      await storage.deleteAirlineAgency(req.params.id as string);
      res.json({ ok: true });
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/master/airline-agencies/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, AIRLINE_MANAGE_ROLES)) return;
      const data = coerceBooleans(req.body, ["isActive"]);
      const rows = z.array(insertAirlineAgencySchema).safeParse(data);
      if (!rows.success) return res.status(400).json({ message: rows.error.message });
      const { userId } = await ownerScope(req, ["airline_supplier"]);
      res.json(await storage.bulkCreateAirlineAgencies(rows.data.map(r => ({ ...r, createdBy: userId }))));
    } catch (e: any) { routeError(res, e); }
  });

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
      res.json(await storage.updateBusType(req.params.id as string, req.body));
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
      res.json(await storage.updateTransportRoute(req.params.id as string, req.body));
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
      res.json(await storage.updateRoutePricing(req.params.id as string, req.body));
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
      res.json(await storage.getTransportBookings(scope.companyId));
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
      const data = { ...req.body };
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
      res.json(await storage.getTransportInvoices(scope.companyId));
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/transport/invoices", isAuthenticated, async (req, res) => {
    try {
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
      const data = { ...req.body };
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
      res.json(await storage.getTransportPayments(scope.companyId));
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
      res.json(await storage.updateTransportPayment(req.params.id as string, req.body));
    } catch (e: any) { routeError(res, e); }
  });

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
      res.json(await storage.createHotelRate({ ...parsed.data, createdBy: userId }));
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
      if (!await requireRole(req, res, GUIDE_MANAGE_ROLES)) return;
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

  app.get("/api/admin/analytics", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["admin", "super_admin", "country_manager"])) return;
      const analytics = await storage.getAnalytics();
      res.json(analytics);
    } catch (e: any) { routeError(res, e); }
  });
  // ---- Pricing & Markups ----
  app.get("/api/admin/pricing/markup-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      res.json(await storage.getMarkupRules());
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Affiliates ----
  app.get("/api/admin/affiliates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAffiliates());
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/affiliates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertAffiliateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid data" });
      res.json(await storage.createAffiliate(parsed.data));
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Data Import & Scrapers ----
  app.get("/api/hotels/search", isAuthenticated, async (req, res) => {
    try {
      // Triggers external hotel-price searches — staff tooling only.
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const { city, countryCode, from, to } = req.query;
      if (!city || !countryCode) return res.status(400).json({ message: "city and countryCode are required" });
      const hotels = await hotelService.searchPrices(city as string, countryCode as string, { 
        from: (from as string) || new Date().toISOString(), 
        to: (to as string) || new Date().toISOString() 
      });
      res.json(hotels);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/data-import/countries/run", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      if (!queues.countryImport) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.countryImport.add('import-countries', {});
      res.json({ message: "Country import started in background", jobId: job.id });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/data-import/cities/run", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { countryCode, countryId } = req.body;
      if (!countryCode || !countryId) return res.status(400).json({ message: "countryCode and countryId are required" });
      if (!queues.cityImport) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.cityImport.add('import-cities', { countryCode, countryId });
      res.json({ message: "City import started in background", jobId: job.id });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/data-import/sights/run", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { cityId, cityName, osmId } = req.body;
      if (!cityId || !cityName) return res.status(400).json({ message: "cityId and cityName are required" });
      if (!queues.sightDiscovery) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.sightDiscovery.add('import-sights', { cityId, cityName, osmId });
      res.json({ message: "Sight import started in background", jobId: job.id });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/sights/:id/enrich", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const sight = await storage.getSight(req.params.id as string);
      if (!sight) return res.status(404).json({ message: "Sight not found" });
      if (!queues.sightEnrichment) return res.status(503).json({ message: "Background queues are not available" });
      const job = await queues.sightEnrichment.add('enrich-sight', { sightId: sight.id, sightName: sight.name });
      res.json({ message: "Sight enrichment started in background", jobId: job.id });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/hotels/search-prices", isAuthenticated, async (req, res) => {
    try {
      // Writes scraped hotels into the catalog — staff tooling, not for customers.
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const { cityId, cityName } = req.body;
      if (!cityId || !cityName) return res.status(400).json({ message: "cityId and cityName are required" });
      
      // Scrape/Search hotels for this city
      const hotels = await hotelService.searchPrices(cityName, "US", { from: new Date().toISOString(), to: new Date().toISOString() });
      const result = await storage.bulkCreateHotels(hotels);
      
      // In a real scenario, we'd also create price snapshots here.
      // For now, returning the created/updated hotels.
      res.json({ message: `Found and updated ${result.length} hotels`, count: result.length, hotels: result });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/scraper/block", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ message: "domain is required" });
      scraperSafety.blockDomain(domain);
      res.json({ message: `Domain ${domain} blocked` });
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/scraper/unblock", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const { domain } = req.body;
      if (!domain) return res.status(400).json({ message: "domain is required" });
      scraperSafety.unblockDomain(domain);
      res.json({ message: `Domain ${domain} unblocked` });
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/admin/audit-logs", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getAuditLogs());
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/ai-consultant", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const stats = await storage.getGlobalSalesStats();
      const analysis = await aiService.analyzeBusinessPerformance(stats);
      res.json(analysis);
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/flights/search", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "flight_agent", "airline_supplier", "country_manager"])) return;
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
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/ai/tour-generator", isAuthenticated, async (req, res) => {
    try {
      // AI tour generation is an internal staff tool (admin Tour Generator page).
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
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
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/pricing/markup-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      const parsed = insertMarkupRuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.createMarkupRule(parsed.data));
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/admin/pricing/markup-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      const parsed = insertMarkupRuleSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateMarkupRule(req.params.id as string, parsed.data));
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/admin/pricing/markup-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      await storage.deleteMarkupRule(req.params.id as string);
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/admin/pricing/settings", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      res.json(await storage.getGlobalSettings());
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/pricing/settings", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, [...ADMIN_ROLES, "country_manager"])) return;
      res.json(await storage.updateGlobalSetting(req.body.key, req.body.value));
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/tours/:id/price-breakdown", isAuthenticated, async (req, res) => {
    try {
      const breakdown = await pricingService.calculateTourPrice(req.params.id as string);
      res.json(breakdown);
    } catch (e: any) { routeError(res, e); }
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
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/tours/:id/pdf", isAuthenticated, async (req, res) => {
    try {
      const pdfBuffer = await pdfService.generateItinerary(req.params.id as string);
      res.contentType("application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="itinerary-${req.params.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (e: any) { routeError(res, e); }
  });

  // ==== Pricing Engine (Phase 1 & 2) ====
  // Internal pricing data (costs, margins, adjustment factors) is restricted
  // to admin/super_admin/operations_manager. Customers only ever receive the
  // final selling prices per hotel choice & occupancy.
  const PRICING_INTERNAL_ROLES = [...ADMIN_ROLES, "operations_manager"];

  // Integrity guard: active group size bands must not overlap.
  async function findBandOverlap(minPax: number, maxPax: number, excludeId?: string) {
    const bands = await db.select().from(groupSizeBands).where(eq(groupSizeBands.isActive, true));
    return bands.find((b) => b.id !== excludeId && minPax <= b.maxPax && maxPax >= b.minPax) ?? null;
  }
  // Integrity guard: keep exactly one active global pricing rule — activating
  // a new one deactivates the others inside the same transaction.
  async function deactivateOtherGlobalRules(tx: any, keepId: string) {
    await tx.update(pricingRules).set({ isActive: false, updatedAt: new Date() })
      .where(and(isNull(pricingRules.tourId), eq(pricingRules.isActive, true), sql`${pricingRules.id} != ${keepId}`));
  }

  // ---- Group size bands ----
  app.get("/api/pricing/group-size-bands", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const bands = await db.select().from(groupSizeBands).orderBy(groupSizeBands.sortOrder);
      res.json(bands);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/group-size-bands", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertGroupSizeBandSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      if (parsed.data.isActive !== false) {
        const overlap = await findBandOverlap(parsed.data.minPax, parsed.data.maxPax);
        if (overlap) return res.status(409).json({ message: `Band overlaps existing active band ${overlap.label}` });
      }
      const [band] = await db.insert(groupSizeBands).values(parsed.data).returning();
      res.json(band);
    } catch (e: any) {
      if (isUniqueViolation(e)) return res.status(409).json({ message: "A band with this label already exists" });
      routeError(res, e);
    }
  });
  app.patch("/api/pricing/group-size-bands/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertGroupSizeBandSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [existing] = await db.select().from(groupSizeBands)
        .where(eq(groupSizeBands.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Band not found" });
      const merged = { ...existing, ...parsed.data };
      if (merged.maxPax < merged.minPax)
        return res.status(400).json({ message: "maxPax must be >= minPax" });
      if (merged.isActive) {
        const overlap = await findBandOverlap(merged.minPax, merged.maxPax, existing.id);
        if (overlap) return res.status(409).json({ message: `Band overlaps existing active band ${overlap.label}` });
      }
      const [band] = await db.update(groupSizeBands).set(parsed.data)
        .where(eq(groupSizeBands.id, req.params.id as string)).returning();
      if (!band) return res.status(404).json({ message: "Band not found" });
      res.json(band);
    } catch (e: any) {
      if (isUniqueViolation(e)) return res.status(409).json({ message: "A band with this label already exists" });
      routeError(res, e);
    }
  });
  app.delete("/api/pricing/group-size-bands/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [{ count: refs }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(pricingQuotes).where(eq(pricingQuotes.groupSizeBandId, req.params.id as string));
      if (refs > 0) return res.status(409).json({ message: `Cannot delete: ${refs} quote(s) reference this band. Deactivate it instead.` });
      const [band] = await db.delete(groupSizeBands)
        .where(eq(groupSizeBands.id, req.params.id as string)).returning();
      if (!band) return res.status(404).json({ message: "Band not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Pricing rules ----
  app.get("/api/pricing/rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rules = await db.select().from(pricingRules).orderBy(desc(pricingRules.createdAt));
      res.json(rules);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertPricingRuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const rule = await db.transaction(async (tx) => {
        const [r] = await tx.insert(pricingRules).values(parsed.data).returning();
        if (!r.tourId && r.isActive) await deactivateOtherGlobalRules(tx, r.id);
        return r;
      });
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/pricing/rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertPricingRuleSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const rule = await db.transaction(async (tx) => {
        const [r] = await tx.update(pricingRules).set({ ...parsed.data, updatedAt: new Date() })
          .where(eq(pricingRules.id, req.params.id as string)).returning();
        if (r && !r.tourId && r.isActive) await deactivateOtherGlobalRules(tx, r.id);
        return r;
      });
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/pricing/rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [{ count: refs }] = await db.select({ count: sql<number>`count(*)::int` })
        .from(pricingQuotes).where(eq(pricingQuotes.pricingRuleId, req.params.id as string));
      if (refs > 0) return res.status(409).json({ message: `Cannot delete: ${refs} quote(s) reference this rule. Deactivate it instead.` });
      const [rule] = await db.delete(pricingRules)
        .where(eq(pricingRules.id, req.params.id as string)).returning();
      if (!rule) return res.status(404).json({ message: "Rule not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Airfare rates ----
  app.get("/api/pricing/airfare-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rates = await db.select().from(airfareRates).orderBy(airfareRates.origin, airfareRates.destination);
      res.json(rates);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/airfare-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertAirfareRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rate] = await db.insert(airfareRates).values(parsed.data).returning();
      res.json(rate);
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/pricing/airfare-rates/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [existing] = await db.select().from(airfareRates)
        .where(eq(airfareRates.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Airfare rate not found" });
      // Validate the merged state so a partial patch can't produce an
      // invalid interval (e.g. validFrom moved past an existing validTo).
      const { id: _id, createdAt: _ca, ...existingRest } = existing;
      const parsed = insertAirfareRateSchema.safeParse({ ...existingRest, ...req.body });
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rate] = await db.update(airfareRates).set(parsed.data)
        .where(eq(airfareRates.id, req.params.id as string)).returning();
      if (!rate) return res.status(404).json({ message: "Airfare rate not found" });
      res.json(rate);
    } catch (e: any) { routeError(res, e); }
  });
  app.delete("/api/pricing/airfare-rates/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [rate] = await db.delete(airfareRates)
        .where(eq(airfareRates.id, req.params.id as string)).returning();
      if (!rate) return res.status(404).json({ message: "Airfare rate not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // Bulk import airfare rates from the Excel template (client parses xlsx →
  // JSON, same pattern as /api/tours/import). All-or-nothing: every row is
  // validated first; any bad row rejects the whole file so a typo can't
  // silently skip a season.
  app.post("/api/pricing/airfare-rates/import", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const rows = req.body?.rates;
      if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ message: "No airfare rows to import" });
      if (rows.length > 500) return res.status(400).json({ message: "Maximum 500 airfare rates per import" });
      const errors: string[] = [];
      const parsedRows: any[] = [];
      rows.forEach((raw: any, i: number) => {
        const label = `Row ${i + 2} (${raw?.origin || "?"} → ${raw?.destination || "?"})`;
        const parsed = insertAirfareRateSchema.safeParse(raw);
        if (!parsed.success) {
          const first = parsed.error.issues[0];
          errors.push(`${label}: ${first ? `${first.path.join(".")} — ${first.message}` : "invalid data"}`);
          return;
        }
        parsedRows.push({ ...parsed.data, isActive: true });
      });
      // Duplicate route+season rows make fare selection nondeterministic —
      // reject them both within the file and against existing active rates.
      const seasonKey = (r: { origin: string; destination: string; airline?: string | null; validFrom?: Date | string | null; validTo?: Date | string | null }) => {
        const d = (v: any) => (v ? new Date(v).toISOString().slice(0, 10) : "");
        return `${r.origin.trim().toLowerCase()}|${r.destination.trim().toLowerCase()}|${(r.airline ?? "").trim().toLowerCase()}|${d(r.validFrom)}|${d(r.validTo)}`;
      };
      if (parsedRows.length) {
        const seen = new Map<string, number>();
        parsedRows.forEach((r, i) => {
          const key = seasonKey(r);
          if (seen.has(key)) errors.push(`Row ${i + 2} (${r.origin} → ${r.destination}): duplicate of row ${seen.get(key)! + 2} — same route, airline, and season`);
          else seen.set(key, i);
        });
        const existing = await db.select().from(airfareRates).where(eq(airfareRates.isActive, true));
        const existingKeys = new Set(existing.map(seasonKey));
        parsedRows.forEach((r, i) => {
          if (existingKeys.has(seasonKey(r))) errors.push(`Row ${i + 2} (${r.origin} → ${r.destination}): an active rate for this route, airline, and season already exists — edit it instead`);
        });
      }
      if (errors.length) {
        return res.status(400).json({ message: errors.slice(0, 10).join(" • ") + (errors.length > 10 ? ` • …and ${errors.length - 10} more` : "") });
      }
      const created = await db.insert(airfareRates).values(parsedRows).returning();
      res.json({ created: created.length });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Pricing adjustment rules (taxes, fees, discounts) ----
  app.get("/api/pricing/adjustment-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rows = await db.select().from(pricingAdjustmentRules)
        .orderBy(pricingAdjustmentRules.applicationOrder, pricingAdjustmentRules.createdAt);
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/pricing/adjustment-rules", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertPricingAdjustmentRuleSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rule] = await db.insert(pricingAdjustmentRules).values(parsed.data).returning();
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/pricing/adjustment-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const patchSchema = insertPricingAdjustmentRuleSchema.partial();
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [rule] = await db.update(pricingAdjustmentRules)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(pricingAdjustmentRules.id, req.params.id as string)).returning();
      if (!rule) return res.status(404).json({ message: "Adjustment rule not found" });
      res.json(rule);
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/pricing/adjustment-rules/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const [rule] = await db.delete(pricingAdjustmentRules)
        .where(eq(pricingAdjustmentRules.id, req.params.id as string)).returning();
      if (!rule) return res.status(404).json({ message: "Adjustment rule not found" });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Quotes: compute + persist ----
  const quoteRequestSchema = z.object({
    tourId: z.string().min(1),
    departureId: z.string().optional(),
    pricingRuleId: z.string().optional(),   // default: active global rule
    airfareRateId: z.string().optional(),   // alternative to components.airfarePerPerson
    paxCount: z.number().int().min(1).max(200),
    nights: z.number().int().min(0).max(120),
    currency: z.string().optional(),
    notes: z.string().optional(),
    components: z.object({
      transportationShare: z.string(),
      guideDriverShare: z.string(),
      sightseeingShare: z.string(),
      airfarePerPerson: z.string().optional(),
      // Occupancy-specific fares (child/infant); fall back to airfarePerPerson.
      airfareByOccupancy: z.partialRecord(z.enum(["child", "infant"]), z.string()).optional(),
    }),
    hotels: z.array(z.object({
      hotelChoice: z.number().int().min(1).max(3),
      hotelId: z.string().optional(),
      hotelName: z.string().optional(),
      // partialRecord: enum-keyed z.record in zod v4 makes every key required
      nightlyRates: z.partialRecord(z.enum(["matrimonial", "double", "single", "third_person", "child", "infant"]), z.string()),
    })).min(1).max(3),
  });

  type QuoteRequest = z.infer<typeof quoteRequestSchema>;
  class QuoteError extends Error { constructor(public statusCode: number, message: string) { super(message); } }

  // Shared by the manual quote endpoint and the rate-driven from-tour
  // endpoint. Resolves rule/airfare/band, computes and persists the quote.
  async function createPricingQuote(body: QuoteRequest, userId: string | null, calculationMeta?: unknown) {
      const [tour] = await db.select().from(tours).where(eq(tours.id, body.tourId));
      if (!tour) throw new QuoteError(404, "Tour not found");

      // Resolve pricing rule. Explicit id must be active and applicable to
      // this tour (its own rule or a global one). Otherwise precedence is:
      // newest active tour-specific rule, then newest active global rule.
      let rule;
      if (body.pricingRuleId) {
        [rule] = await db.select().from(pricingRules).where(eq(pricingRules.id, body.pricingRuleId));
        if (!rule) throw new QuoteError(404, "Pricing rule not found");
        if (!rule.isActive) throw new QuoteError(400, "Pricing rule is inactive");
        if (rule.tourId && rule.tourId !== body.tourId)
          throw new QuoteError(400, "Pricing rule belongs to a different tour");
      } else {
        [rule] = await db.select().from(pricingRules)
          .where(and(eq(pricingRules.tourId, body.tourId), eq(pricingRules.isActive, true)))
          .orderBy(desc(pricingRules.createdAt)).limit(1);
        if (!rule) {
          [rule] = await db.select().from(pricingRules)
            .where(and(isNull(pricingRules.tourId), eq(pricingRules.isActive, true)))
            .orderBy(desc(pricingRules.createdAt)).limit(1);
        }
        if (!rule) throw new QuoteError(400, "No active pricing rule configured");
      }

      // Resolve airfare: explicit per-person value wins, else an active,
      // date-valid airfare rate record, else 0.
      let airfarePerPerson = body.components.airfarePerPerson;
      if (airfarePerPerson === undefined && body.airfareRateId) {
        const [rate] = await db.select().from(airfareRates).where(eq(airfareRates.id, body.airfareRateId));
        if (!rate) throw new QuoteError(404, "Airfare rate not found");
        if (!rate.isActive) throw new QuoteError(400, "Airfare rate is inactive");
        const now = new Date();
        if ((rate.validFrom && now < rate.validFrom) || (rate.validTo && now > rate.validTo))
          throw new QuoteError(400, "Airfare rate is outside its validity period");
        airfarePerPerson = rate.ratePerPerson;
      }
      airfarePerPerson = airfarePerPerson ?? "0";

      // Resolve group size band (informational; assistance rule is pax-based).
      const bands = await db.select().from(groupSizeBands)
        .where(eq(groupSizeBands.isActive, true)).orderBy(groupSizeBands.sortOrder);
      const band = bands.find((b) => body.paxCount >= b.minPax && body.paxCount <= b.maxPax) ?? null;

      // Load active adjustment rules (taxes, fees, discounts) for this quote.
      // Order by applicationOrder then id so ties are broken deterministically.
      const activeAdjRules = await db.select().from(pricingAdjustmentRules)
        .where(eq(pricingAdjustmentRules.isActive, true))
        .orderBy(pricingAdjustmentRules.applicationOrder, pricingAdjustmentRules.id);

      // Snapshot every input used in computeQuote at creation time.
      // This is the only moment the exact rule values and adjustment rules are
      // known; by approval time they may have changed. Stored under
      // _computeInputs inside calculationMeta so the approval transaction can
      // read them without re-querying mutable tables.
      const computeInputsSnapshot = {
        paxCount: body.paxCount,
        nights: body.nights,
        currency: body.currency ?? rule.currency,
        components: {
          transportationShare: body.components.transportationShare,
          guideDriverShare: body.components.guideDriverShare,
          sightseeingShare: body.components.sightseeingShare,
          airfarePerPerson,
          airfareByOccupancy: body.components.airfareByOccupancy ?? null,
        },
        hotels: (body.hotels as HotelChoiceInput[]).map((h) => ({
          hotelChoice: h.hotelChoice,
          hotelId: (h as any).hotelId ?? null,
          hotelName: (h as any).hotelName ?? null,
          nightlyRates: h.nightlyRates,
        })),
        rule: {
          id: rule.id,
          name: rule.name,
          marginType: rule.marginType,
          marginValue: rule.marginValue,
          freePassengerPaying: rule.freePassengerPaying,
          freePassengerFree: rule.freePassengerFree,
          roundingRule: rule.roundingRule ?? "cent",
          currency: rule.currency,
        },
        adjustmentRules: activeAdjRules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          amountType: r.amountType,
          amount: r.amount,
          appliesToStage: r.appliesToStage,
          applicationOrder: r.applicationOrder,
        })),
      };
      // Merge _computeInputs with any caller-supplied calculationMeta (e.g.
      // rate-resolver sources and warnings from the from-tour endpoint).
      const mergedMeta: Record<string, unknown> = {
        ...(calculationMeta && typeof calculationMeta === "object" ? calculationMeta as Record<string, unknown> : {}),
        _computeInputs: computeInputsSnapshot,
      };

      const result = computeQuote({
        paxCount: body.paxCount,
        nights: body.nights,
        components: {
          transportationShare: body.components.transportationShare,
          guideDriverShare: body.components.guideDriverShare,
          sightseeingShare: body.components.sightseeingShare,
          airfarePerPerson,
          airfareByOccupancy: body.components.airfareByOccupancy,
        },
        hotels: body.hotels as HotelChoiceInput[],
        rule: {
          marginType: rule.marginType,
          marginValue: rule.marginValue,
          freePassengerPaying: rule.freePassengerPaying,
          freePassengerFree: rule.freePassengerFree,
          roundingRule: rule.roundingRule ?? "cent",
        },
        adjustmentRules: activeAdjRules.map((r) => ({
          id: r.id,
          name: r.name,
          type: r.type,
          amountType: r.amountType as "fixed" | "percentage",
          amount: r.amount,
          appliesToStage: r.appliesToStage as "before_margin" | "after_margin" | "after_free_policy",
          applicationOrder: r.applicationOrder,
        })),
      });

      const quote = await db.transaction(async (tx) => {
        const [q] = await tx.insert(pricingQuotes).values({
          tourId: body.tourId,
          departureId: body.departureId ?? null,
          pricingRuleId: rule.id,
          groupSizeBandId: band?.id ?? null,
          paxCount: body.paxCount,
          nights: body.nights,
          assistanceType: result.assistanceType,
          currency: body.currency ?? rule.currency,
          transportationShare: body.components.transportationShare,
          guideDriverShare: body.components.guideDriverShare,
          sightseeingShare: body.components.sightseeingShare,
          airfarePerPerson,
          baseCostPerPerson: result.baseCostPerPerson,
          totalGroupCost: result.totalGroupCost,
          freeAdjustmentFactor: result.freeAdjustmentFactor,
          marginType: rule.marginType,
          marginValue: rule.marginValue,
          notes: body.notes ?? null,
          calculationMeta: mergedMeta,
          createdBy: userId,
        }).returning();
        if (result.lineItems.length > 0) {
          await tx.insert(pricingQuoteLineItems).values(
            result.lineItems.map((li) => ({
              ...li,
              quoteId: q.id,
              // adjustmentItems is a JSONB column; store as-is.
              adjustmentItems: li.adjustmentItems.length > 0 ? li.adjustmentItems : null,
            })),
          );
        }
        return q;
      });

      // Permanent trail: every quote computation is audit-logged.
      await storage.createAuditLog({
        entityType: "pricing_quote", entityId: quote.id, action: "created",
        changedBy: userId ?? undefined,
        newValue: JSON.stringify({ tourId: body.tourId, paxCount: body.paxCount, currency: quote.currency, ruleId: rule.id, roundingRule: rule.roundingRule ?? "cent" }),
      }).catch(() => { /* audit failure must not block quoting */ });

      return { ...quote, groupSizeBand: band?.label ?? null, lineItems: result.lineItems };
  }

  const quoteErrorResponse = (res: Response, e: any) => {
    if (e instanceof QuoteError) return res.status(e.statusCode).json({ message: e.message });
    if (e instanceof PricingInputError) return res.status(400).json({ message: e.message });
    return routeError(res, e);
  };

  app.post("/api/pricing/quotes", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const parsed = quoteRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await createPricingQuote(parsed.data, (req.session as any).userId ?? null));
    } catch (e: any) { quoteErrorResponse(res, e); }
  });

  // ---- Rate-driven costing ----
  const resolveRequestSchema = z.object({
    tourId: z.string().min(1),
    paxCount: z.number().int().min(1).max(200),
    departureDate: z.string().optional(),
    origin: z.string().optional(),
    destination: z.string().optional(),
    currency: z.string().optional(), // rates in other currencies are skipped (no conversion yet)
  });

  // Preview: resolve component costs + hotel choices from supplier rate
  // cards without persisting anything. Staff can adjust before quoting.
  app.post("/api/pricing/resolve", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const parsed = resolveRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await resolveTourComponents(db, parsed.data));
    } catch (e: any) { quoteErrorResponse(res, e); }
  });

  // One-shot: resolve from rate cards and persist the quote, recording the
  // rate sources + warnings in calculationMeta.
  const fromTourRequestSchema = resolveRequestSchema.extend({
    departureId: z.string().optional(),
    pricingRuleId: z.string().optional(),
    currency: z.string().optional(),
    notes: z.string().optional(),
  });
  app.post("/api/pricing/quotes/from-tour", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const parsed = fromTourRequestSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const body = parsed.data;
      // A departure must belong to the tour; its start date drives rate
      // validity when no explicit departureDate is supplied.
      let departureDate = body.departureDate;
      if (body.departureId) {
        const [dep] = await db.select().from(tourDepartures).where(eq(tourDepartures.id, body.departureId));
        if (!dep) return res.status(404).json({ message: "Departure not found" });
        if (dep.tourId !== body.tourId)
          return res.status(400).json({ message: "Departure belongs to a different tour" });
        departureDate = departureDate ?? dep.startDate;
      }
      const resolved = await resolveTourComponents(db, { ...body, departureDate });
      if (resolved.hotels.length === 0)
        return res.status(422).json({ message: "No priceable hotel choices found on this tour", warnings: resolved.warnings });
      const quote = await createPricingQuote({
        tourId: body.tourId,
        departureId: body.departureId,
        pricingRuleId: body.pricingRuleId,
        paxCount: body.paxCount,
        nights: resolved.nights,
        currency: body.currency,
        notes: body.notes,
        components: resolved.components,
        hotels: resolved.hotels.map((h) => ({
          hotelChoice: h.hotelChoice, hotelId: h.hotelId, hotelName: h.hotelName,
          nightlyRates: h.nightlyRates,
        })),
      }, (req.session as any).userId ?? null, { ...resolved.meta, warnings: resolved.warnings });
      res.json({ ...quote, warnings: resolved.warnings });
    } catch (e: any) { quoteErrorResponse(res, e); }
  });

  app.get("/api/pricing/quotes", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const tourId = typeof req.query.tourId === "string" ? req.query.tourId : undefined;
      const rows = await db.select().from(pricingQuotes)
        .where(tourId ? eq(pricingQuotes.tourId, tourId) : undefined)
        .orderBy(desc(pricingQuotes.createdAt));
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });

  // Internal breakdown view: full cost/margin/adjustment detail.
  app.get("/api/pricing/quotes/:id/internal", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const [quote] = await db.select().from(pricingQuotes)
        .where(eq(pricingQuotes.id, req.params.id as string));
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      const lineItems = await db.select().from(pricingQuoteLineItems)
        .where(eq(pricingQuoteLineItems.quoteId, quote.id))
        .orderBy(pricingQuoteLineItems.hotelChoice);
      const band = quote.groupSizeBandId
        ? (await db.select().from(groupSizeBands).where(eq(groupSizeBands.id, quote.groupSizeBandId)))[0] ?? null
        : null;
      res.json({ ...quote, groupSizeBand: band, lineItems });
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Quote approval workflow ----
  // "final" is the legacy value and is treated exactly like "approved".
  // Allowed transitions (from → to). Approve/reject require an admin role;
  // everything else needs PRICING_INTERNAL_ROLES.
  const QUOTE_TRANSITIONS: Record<string, string[]> = {
    draft: ["pending_approval", "cancelled", "archived"],
    pending_approval: ["approved", "rejected", "draft", "cancelled"],
    rejected: ["draft", "cancelled", "archived"],
    approved: ["sent", "draft", "cancelled", "archived"],
    sent: ["viewed", "accepted", "expired", "cancelled"],
    viewed: ["accepted", "expired", "cancelled"],
    accepted: ["archived"],
    expired: ["draft", "archived"],
    cancelled: ["archived"],
    archived: [],
  };
  const QUOTE_APPROVAL_ACTIONS = new Set(["approved", "rejected"]);
  // Legacy pre-workflow value: treat stored/requested "final" as approved.
  const normalizeQuoteStatus = (s: string) => (s === "final" ? "approved" : s);
  // Statuses a customer may see (assigned or via share token). "approved" is
  // NOT visible — publication happens only via the explicit "sent" handoff.
  // Legacy "final" quotes stay visible: their share links pre-date the
  // workflow and were published under the old final-only rule.
  const CUSTOMER_VISIBLE_QUOTE_STATUSES = new Set(["final", "sent", "viewed", "accepted"]);
  // Selling prices may only be overridden before approval is granted.
  const OVERRIDABLE_QUOTE_STATUSES = new Set(["draft", "pending_approval", "rejected"]);

  // Update quote status / customer assignment / notes (internal only).
  app.patch("/api/pricing/quotes/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const patchSchema = z.object({
        status: z.enum([
          "draft", "final", "archived", "pending_approval", "approved",
          "rejected", "sent", "viewed", "accepted", "expired", "cancelled",
        ]).optional(),
        customerId: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      }).strict();
      const parsed = patchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const [existing] = await db.select().from(pricingQuotes)
        .where(eq(pricingQuotes.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Quote not found" });

      const userId = (req.session as any).userId as string;
      const update: Record<string, unknown> = { ...parsed.data, updatedAt: new Date() };
      const from = normalizeQuoteStatus(existing.status);
      const to = parsed.data.status ? normalizeQuoteStatus(parsed.data.status) : undefined;
      const isTransition = to !== undefined && to !== from;
      if (to !== undefined) update.status = to;
      if (isTransition) {
        const allowed = QUOTE_TRANSITIONS[from] ?? [];
        if (!allowed.includes(to))
          return res.status(409).json({ message: `Cannot move a ${from} quote to ${to}` });
        if (QUOTE_APPROVAL_ACTIONS.has(to)) {
          // Only admins approve/reject; the requester may not approve their own quote.
          if (!await requireRole(req, res, ADMIN_ROLES)) return;
          if (existing.createdBy && existing.createdBy === userId)
            return res.status(403).json({ message: "Quotes must be approved by someone other than their creator" });
        }
        if (to === "approved") {
          update.approvedBy = userId;
          update.approvedAt = new Date();
          // Set 30-day expiry from approval time.
          const expiry = new Date();
          expiry.setDate(expiry.getDate() + 30);
          update.validUntil = expiry;
        }
        if (to === "draft") {
          update.approvedBy = null;
          update.approvedAt = null;
          update.validUntil = null;
        }
        // Block sending/accepting an expired quote — must be re-approved first.
        if ((to === "sent" || to === "accepted") && existing.validUntil && existing.validUntil < new Date())
          return res.status(409).json({ message: "Quote has expired; move it back to draft and re-approve before sending" });
      }
      // Perform the status update and, when approving, the immutable pricing
      // snapshot in a single atomic transaction. A snapshot failure rolls back
      // the approval so a quote can never exist in "approved" state without
      // a complete audit record.
      const quote = await db.transaction(async (tx) => {
        // Compare-and-swap: fail if a concurrent transition already moved the
        // quote away from the status we validated against.
        const [q] = await tx.update(pricingQuotes)
          .set(update)
          .where(and(
            eq(pricingQuotes.id, req.params.id as string),
            eq(pricingQuotes.status, existing.status),
          )).returning();
        if (!q) return null; // concurrent update detected

        if (isTransition && to === "approved") {
          // Lock all line items for this quote so no concurrent price override
          // can commit after we read them. The UPDATE on pricing_quotes above
          // implicitly holds a row lock on the quote; the SELECT FOR UPDATE
          // below extends that to the line items.  Any concurrent override that
          // already holds a line item lock will cause this SELECT to wait; once
          // it releases, we read the post-override prices (the correct final
          // values).  Any override that tries to lock a line item AFTER this
          // point will block until this transaction commits, then see status
          // "approved" in its own status check and fail with 409.
          await tx.execute(
            sql`SELECT id FROM pricing_quote_line_items WHERE quote_id = ${q.id} FOR UPDATE`,
          );
          const lineItems = await tx.select().from(pricingQuoteLineItems)
            .where(eq(pricingQuoteLineItems.quoteId, q.id))
            .orderBy(pricingQuoteLineItems.hotelChoice);

          // Retrieve the inputs captured at computation time. These are the
          // exact rule values / hotel inputs / adjustment rules that were used
          // when computeQuote was called — not re-queried mutable live records.
          const computeInputs = (q.calculationMeta as any)?._computeInputs ?? null;

          // Concurrency-safe version number: query max inside the same
          // transaction; the unique index on (quote_id, version) will reject
          // a second concurrent insert for the same version.
          const vrows = await tx.execute<{ maxver: string }>(
            sql`SELECT COALESCE(MAX(version), 0)::text AS maxver
                FROM quote_pricing_snapshots
                WHERE quote_id = ${q.id}`,
          );
          const nextVersion = parseInt(vrows.rows[0]?.maxver ?? "0", 10) + 1;

          await tx.insert(quotePricingSnapshots).values({
            quoteId: q.id,
            version: nextVersion,
            // calculationInput: exact inputs used in computeQuote at creation
            // time, plus quote-header values as a fallback for legacy quotes
            // created before _computeInputs was recorded.
            calculationInput: computeInputs ?? {
              paxCount: q.paxCount,
              nights: q.nights,
              currency: q.currency,
              components: {
                transportationShare: q.transportationShare,
                guideDriverShare: q.guideDriverShare,
                sightseeingShare: q.sightseeingShare,
                airfarePerPerson: q.airfarePerPerson,
              },
              note: "legacy_quote_inputs_unavailable",
            },
            // calculationOutput: the committed line items at approval time,
            // including any price overrides applied during the review cycle.
            calculationOutput: {
              baseCostPerPerson: q.baseCostPerPerson,
              totalGroupCost: q.totalGroupCost,
              freeAdjustmentFactor: q.freeAdjustmentFactor,
              marginType: q.marginType,
              marginValue: q.marginValue,
              lineItems: lineItems.map((li) => ({
                id: li.id,
                hotelChoice: li.hotelChoice,
                hotelId: li.hotelId,
                hotelName: li.hotelName,
                occupancy: li.occupancy,
                hotelNightlyRate: li.hotelNightlyRate,
                hotelCostTotal: li.hotelCostTotal,
                baseCost: li.baseCost,
                marginAmount: li.marginAmount,
                freeAdjustmentAmount: li.freeAdjustmentAmount,
                adjustmentItems: li.adjustmentItems,
                sellingPrice: li.sellingPrice,
                sellingPriceExact: li.sellingPriceExact,
              })),
            },
            // rulesUsed: the rule and adjustment rules frozen at creation time
            // (from _computeInputs) so reproduction is possible even if rules
            // are later edited or deleted.
            rulesUsed: computeInputs
              ? { pricingRule: computeInputs.rule ?? null, adjustmentRules: computeInputs.adjustmentRules ?? [] }
              : { note: "legacy_quote_rules_unavailable" },
            reason: nextVersion > 1 ? "re_approved" : "approved",
            createdBy: userId,
          });
        }

        return q;
      });

      if (!quote)
        return res.status(409).json({ message: "Quote was updated concurrently; reload and retry" });
      if (isTransition) {
        await storage.createAuditLog({
          entityType: "pricing_quote", entityId: quote.id, action: "status_changed",
          changedBy: userId, previousValue: existing.status, newValue: quote.status,
        }).catch(() => {});
      }
      res.json(quote);
    } catch (e: any) { routeError(res, e); }
  });

  // Manual selling-price override on a line item. Admins only; reason is
  // mandatory; the original price and the override are kept permanently.
  app.post("/api/pricing/quotes/:id/override", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const bodySchema = z.object({
        lineItemId: z.string().min(1),
        overrideValue: z.string(),
        reason: z.string(),
      }).strict();
      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const check = insertPricingQuoteOverrideSchema.safeParse({
        quoteId: req.params.id, ...parsed.data,
      });
      if (!check.success) return res.status(400).json({ message: check.error.issues.map((i) => i.message).join("; ") });
      const [quote] = await db.select().from(pricingQuotes)
        .where(eq(pricingQuotes.id, req.params.id as string));
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      // Price-lock invariant: once approved (or sent/viewed/accepted), prices
      // are frozen — overriding requires sending the quote back to draft and
      // through a fresh approval cycle.
      if (!OVERRIDABLE_QUOTE_STATUSES.has(quote.status))
        return res.status(409).json({ message: `Cannot override prices on a ${quote.status} quote; move it back to draft first` });
      const [li] = await db.select().from(pricingQuoteLineItems)
        .where(eq(pricingQuoteLineItems.id, parsed.data.lineItemId));
      if (!li || li.quoteId !== quote.id)
        return res.status(404).json({ message: "Line item not found on this quote" });
      const userId = (req.session as any).userId as string;
      const override = await db.transaction(async (tx) => {
        // Lock the quote row first so the status cannot be changed to
        // "approved" concurrently (the approval UPDATE also locks the row).
        // After getting the lock we re-read the status to confirm the quote
        // is still in an overridable state — it may have been approved while
        // we were outside this transaction.
        const lockedRows = await tx.execute<{ status: string }>(
          sql`SELECT status FROM pricing_quotes WHERE id = ${quote.id} FOR UPDATE`,
        );
        const lockedStatus = lockedRows.rows[0]?.status;
        if (!lockedStatus || !OVERRIDABLE_QUOTE_STATUSES.has(lockedStatus))
          throw Object.assign(new Error(`Cannot override prices on a ${lockedStatus ?? "unknown"} quote; move it back to draft first`), { statusCode: 409 });

        // Re-read the current line item price inside the lock in case another
        // override committed after our outer SELECT but before this transaction.
        const [freshLi] = await tx.select().from(pricingQuoteLineItems)
          .where(eq(pricingQuoteLineItems.id, li.id));
        if (!freshLi || freshLi.quoteId !== quote.id)
          throw Object.assign(new Error("Line item not found on this quote"), { statusCode: 404 });

        const [ov] = await tx.insert(pricingQuoteOverrides).values({
          quoteId: quote.id, lineItemId: freshLi.id, fieldName: "selling_price",
          originalValue: freshLi.sellingPrice, overrideValue: parsed.data.overrideValue,
          reason: parsed.data.reason.trim(), createdBy: userId, approvedBy: userId,
        }).returning();
        await tx.update(pricingQuoteLineItems)
          .set({ sellingPrice: parsed.data.overrideValue })
          .where(eq(pricingQuoteLineItems.id, freshLi.id));
        await tx.update(pricingQuotes).set({ updatedAt: new Date() })
          .where(eq(pricingQuotes.id, quote.id));
        return ov;
      });
      await storage.createAuditLog({
        entityType: "pricing_quote", entityId: quote.id, action: "price_overridden",
        changedBy: userId, previousValue: li.sellingPrice, newValue: parsed.data.overrideValue,
        note: `${li.hotelChoice}/${li.occupancy}: ${parsed.data.reason.trim()}`,
      }).catch(() => {});
      res.json(override);
    } catch (e: any) { routeError(res, e); }
  });

  // Override history for a quote (internal only).
  app.get("/api/pricing/quotes/:id/overrides", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rows = await db.select().from(pricingQuoteOverrides)
        .where(eq(pricingQuoteOverrides.quoteId, req.params.id as string))
        .orderBy(desc(pricingQuoteOverrides.createdAt));
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });

  // Immutable pricing snapshots for a quote (internal only). Returns all
  // versions in ascending order; version 1 = first approval.
  app.get("/api/pricing/quotes/:id/snapshots", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const [quote] = await db.select().from(pricingQuotes)
        .where(eq(pricingQuotes.id, req.params.id as string));
      if (!quote) return res.status(404).json({ message: "Quote not found" });
      const rows = await db.select().from(quotePricingSnapshots)
        .where(eq(quotePricingSnapshots.quoteId, req.params.id as string))
        .orderBy(quotePricingSnapshots.version);
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });

  // ---- Exchange rates (manual currency conversion table) ----
  app.get("/api/pricing/exchange-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PRICING_INTERNAL_ROLES)) return;
      const rows = await db.select().from(exchangeRates).orderBy(desc(exchangeRates.createdAt));
      res.json(rows);
    } catch (e: any) { routeError(res, e); }
  });
  app.post("/api/pricing/exchange-rates", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertExchangeRateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map((i) => i.message).join("; ") });
      const userId = (req.session as any).userId as string;
      const [row] = await db.insert(exchangeRates)
        .values({ ...parsed.data, enteredBy: userId }).returning();
      await storage.createAuditLog({
        entityType: "exchange_rate", entityId: row.id, action: "created",
        changedBy: userId, newValue: JSON.stringify({ pair: `${row.sourceCurrency}/${row.targetCurrency}`, rate: row.rate }),
      }).catch(() => {});
      res.status(201).json(row);
    } catch (e: any) { routeError(res, e); }
  });
  app.patch("/api/pricing/exchange-rates/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const parsed = insertExchangeRateSchema.partial().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues.map((i) => i.message).join("; ") });
      const [existing] = await db.select().from(exchangeRates).where(eq(exchangeRates.id, req.params.id as string));
      if (!existing) return res.status(404).json({ message: "Exchange rate not found" });
      const [row] = await db.update(exchangeRates)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(exchangeRates.id, req.params.id as string)).returning();
      const userId = (req.session as any).userId as string;
      await storage.createAuditLog({
        entityType: "exchange_rate", entityId: row.id, action: "updated",
        changedBy: userId,
        previousValue: JSON.stringify({ rate: existing.rate, isActive: existing.isActive }),
        newValue: JSON.stringify({ rate: row.rate, isActive: row.isActive }),
      }).catch(() => {});
      res.json(row);
    } catch (e: any) { routeError(res, e); }
  });

  // Shape a quote for customer eyes: ONLY final selling prices per hotel
  // choice & occupancy. Never costs, margins, or multiplication factors.
  async function customerQuoteView(quote: typeof pricingQuotes.$inferSelect) {
    const lineItems = await db.select().from(pricingQuoteLineItems)
      .where(eq(pricingQuoteLineItems.quoteId, quote.id))
      .orderBy(pricingQuoteLineItems.hotelChoice);
    const hotelChoices: Record<number, { hotelChoice: number; hotelName: string | null; prices: Record<string, string> }> = {};
    for (const li of lineItems) {
      hotelChoices[li.hotelChoice] ??= { hotelChoice: li.hotelChoice, hotelName: li.hotelName, prices: {} };
      hotelChoices[li.hotelChoice].prices[li.occupancy] = li.sellingPrice;
    }
    return {
      id: quote.id,
      tourId: quote.tourId,
      departureId: quote.departureId,
      paxCount: quote.paxCount,
      nights: quote.nights,
      currency: quote.currency,
      status: quote.status,
      hotelChoices: Object.values(hotelChoices).sort((a, b) => a.hotelChoice - b.hotelChoice),
    };
  }

  // Customer quote view. Access: internal pricing roles (preview any state),
  // or the assigned customer — final quotes only. 404 (not 403) on
  // unauthorized so quote existence isn't disclosed.
  app.get("/api/pricing/quotes/:id/customer", isAuthenticated, async (req, res) => {
    try {
      let [quote] = await db.select().from(pricingQuotes)
        .where(eq(pricingQuotes.id, req.params.id as string));
      if (!quote) return res.status(404).json({ message: "Quote not found" });

      const profile = await storage.getOrCreateProfile((req.session as any).userId);
      const isInternal = !!profile && PRICING_INTERNAL_ROLES.includes(profile.role);
      const isAssignedCustomer = !!quote.customerId
        && quote.customerId === (req.session as any).userId
        && CUSTOMER_VISIBLE_QUOTE_STATUSES.has(quote.status);
      if (!isInternal && !isAssignedCustomer)
        return res.status(404).json({ message: "Quote not found" });

      // First customer look at a sent quote marks it viewed. If a concurrent
      // request already transitioned it, keep the quote we loaded.
      if (isAssignedCustomer && quote.status === "sent") {
        const [updated] = await db.update(pricingQuotes)
          .set({ status: "viewed", updatedAt: new Date() })
          .where(and(eq(pricingQuotes.id, quote.id), eq(pricingQuotes.status, "sent")))
          .returning();
        if (updated) {
          quote = updated;
          await storage.createAuditLog({
            entityType: "pricing_quote", entityId: quote.id, action: "status_changed",
            changedBy: (req.session as any).userId, previousValue: "sent", newValue: "viewed",
          }).catch(() => {});
        }
      }
      res.json(await customerQuoteView(quote));
    } catch (e: any) { routeError(res, e); }
  });

  // Share-token access: unguessable link for customers without an assigned
  // account. Final quotes only.
  // Public by design (task #25): the unguessable token is the credential.
  // Only final quotes resolve, and the response is shaped to selling
  // prices only via customerQuoteView.
  app.get("/api/pricing/quotes/shared/:token", async (req, res) => {
    try {
      let [quote] = await db.select().from(pricingQuotes)
        .where(eq(pricingQuotes.shareToken, req.params.token as string));
      if (!quote || !CUSTOMER_VISIBLE_QUOTE_STATUSES.has(quote.status))
        return res.status(404).json({ message: "Quote not found" });
      if (quote.status === "sent") {
        const [updated] = await db.update(pricingQuotes)
          .set({ status: "viewed", updatedAt: new Date() })
          .where(and(eq(pricingQuotes.id, quote.id), eq(pricingQuotes.status, "sent")))
          .returning();
        if (updated) {
          quote = updated;
          await storage.createAuditLog({
            entityType: "pricing_quote", entityId: quote.id, action: "status_changed",
            previousValue: "sent", newValue: "viewed", note: "Viewed via share link",
          }).catch(() => {});
        }
      }
      res.json(await customerQuoteView(quote));
    } catch (e: any) { routeError(res, e); }
  });

  return httpServer;
}
