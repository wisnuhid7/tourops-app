import type { Express } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import { z } from "zod/v4";
import { logger } from "../lib/logger";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { pricingService } from "../lib/pricing";
import { aiService } from "../lib/ai";
import { autoFillTourTranslations, maybeAutoTranslateTourInBackground } from "../lib/tour-translation";
import { isAuthenticated } from "../replit_integrations/auth";
import { accommodationForTour, BOOKING_ROOM_TYPES, type BookingRoomType } from "../services/rate-resolver";
import { calculateBookingPrice, isUsableDeparturePrice, resolvePerPersonPrice } from "../services/booking-pricing";
import {
  bookings,
  countries,
  db,
  hotels,
  insertTourDayItemSchema,
  insertTourDaySchema,
  insertTourDepartureSchema,
  insertTourSchema,
  sights,
  tourDayItems,
  tourDays,
  tourDepartures,
  tours,
} from "@workspace/db";
import {
  ADMIN_ROLES,
  TOUR_BUILDER_ROLES,
  TOUR_CONTENT_ROLES,
  getUserId,
  isStaffViewer,
  requireRole,
} from "../middleware/auth";
import { ensureCityExists, getUserName, isSlugUniqueViolation, isUniqueViolation, publicTourPricing, toPublicTour } from "./shared";

// Tours catalogue + tour CRUD/import/export. Includes the local TOUR_PRICE_FIELDS,
// PRICE_STRING_RE, validateTourPricePatch, and IMPORT_ITEM_TYPES helpers.
// Extracted verbatim from routes.ts - behaviour and registration order unchanged.
export function registerToursRoutes(app: Express): void {
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
  // ROOM_TYPE_OCCUPANCY lives in services/booking-pricing.ts (imported above).


  app.get("/api/tours/public", async (_req, res) => {
    try {
      const tours = await storage.getPublishedTours();
      const enriched = await Promise.all(tours.map(async (t: any) => ({
        ...toPublicTour(t),
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
          const [days, items, departures] = await Promise.all([
            storage.getTourDays(tour.id),
            storage.getTourDayItemsByTourId(tour.id),
            storage.getDeparturesByTour(tour.id),
          ]);

          const itemsByDayId = new Map<string, typeof items>();
          for (const it of items) {
            const list = itemsByDayId.get(it.tourDayId) || [];
            list.push(it);
            itemsByDayId.set(it.tourDayId, list);
          }

          const sortedDays = [...days].sort((a, b) => (a.dayNumber ?? 0) - (b.dayNumber ?? 0));
          const sortedDepartures = [...departures].sort((a, b) => a.startDate.localeCompare(b.startDate));

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
            // Departures use the same field names the importer reads so the
            // JSON can round-trip directly without a client parseWorkbook step.
            departures: sortedDepartures.map((dep) => ({
              startDate: dep.startDate,
              endDate: dep.endDate,
              capacity: dep.capacityTotal ?? 20,
              allowPublicJoin: dep.publicJoinEnabled ?? true,
              pricePerPerson: dep.pricePerPerson ?? undefined,
              bookingCutoffDate: (dep as any).bookingCutoffDate ?? undefined,
              notes: (dep as any).notes ?? undefined,
            })),
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
      res.json({ ...toPublicTour(tour), publicPricing: await publicTourPricing(tour.id) });
    } catch (e: any) { routeError(res, e); }
  });

  /**
   * Price-preview — returns an itemised breakdown matching exactly what the
   * POST /api/bookings server computation will produce, so the booking dialog
   * can show confirmed numbers before the customer submits.
   *
   * GET /api/tours/:tourId/price-preview
   *   ?partySize=2          (default 1)
   *   &roomType=doble       (optional; one of matrimonial|doble|triple)
   *   &departureId=<uuid>   (optional; use departure price when supplied)
   */
  app.get("/api/tours/:tourId/price-preview", async (req, res) => {
    try {
      const { tourId } = req.params;

      // Only published tours are accessible to the public; staff may preview
      // any tour they can already see in the admin panel.
      const tourRow = await storage.getTour(tourId);
      if (!tourRow) return res.status(404).json({ message: "Tour not found" });
      // Use the established session-based staff guard — same as the tour detail route.
      if (!tourRow.isPublished && !(await isStaffViewer(req))) {
        return res.status(404).json({ message: "Tour not found" });
      }

      const partySize = Math.max(1, parseInt(String(req.query.partySize || "1")) || 1);
      const roomTypeRaw = req.query.roomType ? String(req.query.roomType) : undefined;
      const departureId = req.query.departureId ? String(req.query.departureId) : undefined;
      // Currency is NOT caller-controlled — the booking endpoint uses
      // req.body.currency || "USD" and the UI never sends a currency field,
      // so both sides always use USD.  Hard-coding it here ensures the preview
      // and POST /api/bookings compute accommodation identically.
      const bookingCurrency = "USD";

      // Per-person resolution is shared with POST /api/bookings via
      // services/booking-pricing.ts so both endpoints agree on precedence.
      let departurePrice: string | number | null = null;
      if (departureId) {
        const dep = await storage.getDeparture(departureId);
        // Reject a departure that doesn't belong to this tour — the booking
        // endpoint does the same (400), so we must never show a preview total
        // that the subsequent booking POST would refuse.
        if (!dep || dep.tourId !== tourId) {
          return res.status(400).json({ message: "Departure does not belong to this tour" });
        }
        departurePrice = dep.pricePerPerson;
      }

      let publicPerPersonBase: number | null = null;
      let tourBasePrice: string | number | null = null;
      if (!isUsableDeparturePrice(departurePrice)) {
        const pp = await publicTourPricing(tourId);
        if (pp && pp.perPersonBase > 0) publicPerPersonBase = pp.perPersonBase;
        else tourBasePrice = tourRow.basePrice;
      }
      const perPersonPrice = resolvePerPersonPrice({ departurePrice, publicPerPersonBase, tourBasePrice });

      const roomType =
        roomTypeRaw && BOOKING_ROOM_TYPES.includes(roomTypeRaw as BookingRoomType)
          ? (roomTypeRaw as BookingRoomType)
          : undefined;
      let accommodation: { total: string; currency: string } | null = null;
      if (roomType) {
        const acc = await accommodationForTour(db, tourId, roomType);
        accommodation = { total: acc.total, currency: acc.currency };
      }

      // Shared with POST /api/bookings (services/booking-pricing.ts) so the
      // preview total equals the persisted booking total. Accommodation is kept
      // at exact two decimals — it is NOT rounded to whole units before summing.
      const math = calculateBookingPrice({
        perPersonPrice,
        partySize,
        bookingCurrency,
        roomType,
        accommodation,
      });

      res.json({
        perPersonPrice,
        partySize,
        perPersonSubtotal: math.perPersonSubtotal,
        roomType: roomType ?? null,
        roomsNeeded: math.roomsNeeded,
        accommodationCost: math.accommodationCost.toNumber(),
        grandTotal: math.grandTotal.toNumber(),
        currency: bookingCurrency,
        currencyMismatch: math.currencyMismatch,
      });
    } catch (e: any) { routeError(res, e); }
  });


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
        
        if (!tour || typeof tour !== "object") {
          return res.status(400).json({ message: "Tour data is required" });
        }

        const payload = { ...tour };

        // Ensure title is present and trimmed
        const rawTitle = (payload.title && typeof payload.title === "string") ? payload.title.trim() : "";
        if (!rawTitle) {
          return res.status(400).json({ message: "Tour title is required" });
        }
        payload.title = rawTitle;

        // Preserve existing slug when editing, or generate a clean slug for new tour
        const isNew = !req.params.id || req.params.id === "new-tour";
        let existingTour: any = null;
        if (!isNew) {
          existingTour = await storage.getTour(req.params.id as string);
        }

        if (!payload.slug) {
          if (existingTour?.slug) {
            payload.slug = existingTour.slug;
          } else {
            const baseSlug = rawTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            payload.slug = (baseSlug || 'tour') + '-' + Date.now();
          }
        }

        payload.duration = Number(payload.duration) > 0 ? Number(payload.duration) : Math.max(1, (days || []).length);
        payload.category = payload.category || "cultural";

        // Normalize text fields that may arrive as arrays from AI generation
        if (Array.isArray(payload.highlights)) payload.highlights = payload.highlights.join("\n");
        if (Array.isArray(payload.inclusions)) payload.inclusions = payload.inclusions.join(", ");
        if (Array.isArray(payload.exclusions)) payload.exclusions = payload.exclusions.join(", ");
        if (Array.isArray(payload.internalNotes)) payload.internalNotes = payload.internalNotes.join("\n");
        if (typeof payload.tags === "string") payload.tags = payload.tags.split(",").map((t: string) => t.trim()).filter(Boolean);
        if (typeof payload.galleryUrls === "string") payload.galleryUrls = payload.galleryUrls.split(",").map((t: string) => t.trim()).filter(Boolean);
        if (!Array.isArray(payload.countries)) payload.countries = payload.countries ? [payload.countries] : [];

        // Normalize price fields to non-negative decimal strings
        const sanitizePrice = (val: any) => {
          if (val == null) return "0";
          const str = String(val).replace(/[^0-9.]/g, "").trim();
          return str && !isNaN(Number(str)) ? str : "0";
        };
        payload.basePrice = sanitizePrice(payload.basePrice);
        payload.childPrice = sanitizePrice(payload.childPrice);
        payload.singleSupplement = sanitizePrice(payload.singleSupplement);
        payload.markupAmount = sanitizePrice(payload.markupAmount);
        payload.totalPrice = sanitizePrice(payload.totalPrice);

        // Ensure child price never exceeds base price
        if (parseFloat(payload.childPrice) > parseFloat(payload.basePrice)) {
          payload.childPrice = payload.basePrice;
        }
        
        const parsedTour = insertTourSchema.safeParse(payload);
        if (!parsedTour.success) {
          console.error("PUT /api/tours/:id/full tour validation failed:", parsedTour.error.message);
          const first = parsedTour.error.issues?.[0];
          const field = first?.path?.join(".") || "Validation";
          return res.status(400).json({ message: `${field}: ${first?.message || parsedTour.error.message}` });
        }
        
        // Validation for days
        const itemSchema = insertTourDayItemSchema.omit({ tourDayId: true });
        const parsedDays = [];
        const daysList = Array.isArray(days) ? days : [];
        for (let i = 0; i < daysList.length; i++) {
          const d = daysList[i];
          const { items, ...dayFields } = d || {};

          // Normalize activities if array from AI
          if (Array.isArray(dayFields.activities)) {
            dayFields.activities = dayFields.activities.join(", ");
          } else if (dayFields.activities != null && typeof dayFields.activities !== "string") {
            dayFields.activities = String(dayFields.activities);
          }

          const dayNumber = Number(dayFields.dayNumber) > 0 ? Number(dayFields.dayNumber) : i + 1;
          const dayTitle = (dayFields.title && typeof dayFields.title === "string" && dayFields.title.trim())
            ? dayFields.title.trim()
            : `Day ${dayNumber}`;

          const dayPayload = {
            ...dayFields,
            tourId: req.params.id || "new-tour",
            dayNumber,
            title: dayTitle,
            city: dayFields.city ? String(dayFields.city).trim() : undefined,
            countryCode: dayFields.countryCode ? String(dayFields.countryCode).trim().toUpperCase() : undefined,
          };

          const parsed = insertTourDaySchema.safeParse(dayPayload);
          if (!parsed.success) {
            console.error("PUT /api/tours/:id/full day validation failed:", parsed.error.message);
            const first = parsed.error.issues?.[0];
            return res.status(400).json({ message: `Day ${dayNumber}: ${first?.message || parsed.error.message}` });
          }

          if (parsed.data.city) {
            try {
              await ensureCityExists(parsed.data.city, parsed.data.countryCode);
            } catch (cityErr) {
              console.warn("ensureCityExists warning:", cityErr);
            }
          }
          if (d.id) (parsed.data as any).id = d.id;

          const parsedItems = [];
          const itemsList = Array.isArray(items) ? items : [];
          for (let j = 0; j < itemsList.length; j++) {
            const it = itemsList[j];
            const normalizedItem = {
              ...it,
              itemType: (it.itemType && String(it.itemType).trim()) ? String(it.itemType).trim() : "custom",
              title: (it.title && String(it.title).trim()) ? String(it.title).trim() : `Activity ${j + 1}`,
              cost: sanitizePrice(it.cost),
              sortOrder: Number(it.sortOrder) >= 0 ? Number(it.sortOrder) : j,
              isOptional: Boolean(it.isOptional),
              bookingRequired: Boolean(it.bookingRequired),
            };
            const parsedItem = itemSchema.safeParse(normalizedItem);
            if (!parsedItem.success) {
              console.error("PUT /api/tours/:id/full item validation failed:", parsedItem.error.message);
              const first = parsedItem.error.issues?.[0];
              return res.status(400).json({ message: `Item on Day ${dayNumber}: ${first?.message || parsedItem.error.message}` });
            }
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
      const departureSchema = insertTourDepartureSchema.omit({ tourId: true });
      const results: any[] = [];
      for (const t of toursIn) {
        const ref = t?.ref || t?.title || "(untitled)";
        try {
          const { days: daysIn, departures: departuresIn, ref: _ref, ...tourFields } = t || {};
          const payload: any = { ...tourFields, isPublished: false }; // imports always land as drafts
          if (!payload.slug && payload.title) {
            payload.slug = String(payload.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '') + '-' + Date.now();
          }

          // ----------------------------------------------------------------
          // Normalise fields that differ between the XLSX-parsed client path
          // (handled by parseWorkbook) and a direct API round-trip (the raw
          // JSON the export endpoint returns).
          //
          // • countries / tags  — export joins array→comma string for the
          //   spreadsheet cell; insertTourSchema expects string[].
          // • childPrice / singleSupplement — export sends "" when the DB
          //   value is null; the nonNegativePriceString refiner rejects "".
          // ----------------------------------------------------------------
          if (typeof payload.countries === "string") {
            payload.countries = payload.countries.split(",").map((s: string) => s.trim()).filter(Boolean);
          }
          if (typeof payload.tags === "string") {
            payload.tags = payload.tags.split(",").map((s: string) => s.trim()).filter(Boolean);
          }
          for (const priceField of ["childPrice", "singleSupplement"] as const) {
            if (payload[priceField] === "") payload[priceField] = undefined;
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

          // Validate departure rows BEFORE writing anything, same strategy as days.
          const parsedDepartures: any[] = [];
          let depError: string | null = null;
          for (const dep of (Array.isArray(departuresIn) ? departuresIn : [])) {
            if (!dep || (!dep.startDate && !dep.endDate)) continue; // blank row
            const raw: any = {
              startDate: String(dep.startDate ?? "").trim(),
              endDate: String(dep.endDate ?? dep.startDate ?? "").trim(),
              capacityTotal: dep.capacity !== undefined && dep.capacity !== "" ? Number(dep.capacity) : 20,
              publicJoinEnabled: dep.allowPublicJoin !== undefined ? Boolean(dep.allowPublicJoin) : true,
            };
            if (dep.pricePerPerson !== undefined && dep.pricePerPerson !== "") {
              raw.pricePerPerson = Math.round(Number(dep.pricePerPerson));
            }
            if (!raw.startDate) { depError = `Departure row missing startDate`; break; }
            if (!raw.endDate) raw.endDate = raw.startDate;
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.startDate)) {
              depError = `Departure startDate "${raw.startDate}" must be YYYY-MM-DD`; break;
            }
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw.endDate)) {
              depError = `Departure endDate "${raw.endDate}" must be YYYY-MM-DD`; break;
            }
            if (raw.endDate < raw.startDate) {
              depError = `Departure endDate "${raw.endDate}" must not be earlier than startDate "${raw.startDate}"`; break;
            }
            if (!Number.isInteger(raw.capacityTotal) || raw.capacityTotal < 1) {
              depError = `Departure ${raw.startDate}: capacity must be a whole number ≥ 1 (got "${dep.capacity}")`; break;
            }
            if (raw.pricePerPerson !== undefined && (!Number.isInteger(raw.pricePerPerson) || raw.pricePerPerson < 0)) {
              depError = `Departure ${raw.startDate}: pricePerPerson must be a non-negative integer (got "${dep.pricePerPerson}")`; break;
            }
            const parsed = departureSchema.safeParse(raw);
            if (!parsed.success) {
              depError = `Departure ${raw.startDate}: ${parsed.error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ")}`; break;
            }
            parsedDepartures.push(parsed.data);
          }
          if (depError) { results.push({ ref, ok: false, error: depError }); continue; }

          // All-or-nothing per tour: if any day/item/departure write fails, remove
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
            for (const dep of parsedDepartures) {
              await storage.createDeparture({ ...dep, tourId: tour.id });
            }
            results.push({ ref, ok: true, tourId: tour.id, title: tour.title, days: parsedDays.length, departures: parsedDepartures.length });
          } catch (e: any) {
            if (createdTourId) {
              try {
                const dayRows = await db.select({ id: tourDays.id }).from(tourDays).where(eq(tourDays.tourId, createdTourId));
                const dayIds = dayRows.map((r) => r.id);
                if (dayIds.length) await db.delete(tourDayItems).where(inArray(tourDayItems.tourDayId, dayIds));
                await db.delete(tourDays).where(eq(tourDays.tourId, createdTourId));
                await db.delete(tourDepartures).where(eq(tourDepartures.tourId, createdTourId));
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
}
