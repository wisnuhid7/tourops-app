/**
 * Shared helpers for the route modules.
 *
 * Extracted verbatim from routes.ts so the per-domain route modules (and the
 * sibling registrars) can reuse them without importing the monolith.
 * Behaviour is unchanged.
 */
import type { Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "../storage";
import { authStorage } from "../replit_integrations/auth/storage";
import { getUserId, isStaffViewer } from "../middleware/auth";
import { and, eq, sql } from "drizzle-orm";
import { cities, countries, db, tourDepartures, bookings, bookingPaymentSchedules, bookingStatusHistory, payments } from "@workspace/db";
import { pricingService } from "../lib/pricing";
import { BOOKING_ROOM_TYPES, accommodationForTour } from "../services/rate-resolver";
import { ROOM_TYPE_OCCUPANCY } from "../services/booking-pricing";

// Shape a raw `translations` jsonb blob down to public-safe fields only, so
// public endpoints never leak translated copies of non-public columns
// (e.g. guide notes, hotel policies).
export function pickPublicTranslations(translations: any, allowedKeys: string[]) {
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

// Internal-only tour columns that must never reach a public / unauthenticated
// response. Public tour reads previously spread the whole DB row (`{...tour}`),
// leaking supplier cost/margin (markupAmount) and private staff notes
// (internalNotes) to anonymous callers (F-04 / OWASP A01/A02).
export const INTERNAL_TOUR_FIELDS = ["markupAmount", "internalNotes"] as const;

/**
 * Strip internal-only columns from a tour row before it is returned from a
 * public/unauthenticated endpoint. Every public field is preserved.
 */
export function toPublicTour<T extends Record<string, any>>(
  tour: T,
): Omit<T, "markupAmount" | "internalNotes"> {
  if (!tour || typeof tour !== "object") return tour;
  const clone: Record<string, any> = { ...tour };
  for (const key of INTERNAL_TOUR_FIELDS) delete clone[key];
  return clone as Omit<T, "markupAmount" | "internalNotes">;
}

// Strict raster-image allowlist. SVG is intentionally excluded: it can embed
// <script> and, if served inline, execute in our origin (stored XSS). The
// stored extension is derived from the validated MIME type — never from the
// user-supplied filename — so a spoofed extension can't be smuggled onto disk.
export const ALLOWED_IMAGE_MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};
export const upload = multer({
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

// Magic-byte signatures for the allowed raster formats. The client-declared
// Content-Type is attacker-controlled, so the ACTUAL bytes must also match the
// declared image type (F-05 / OWASP A05/A08). An HTML/PDF/polyglot payload
// labelled image/png or image/jpeg is rejected here.
const IMAGE_SIGNATURES: Record<string, (b: Buffer) => boolean> = {
  "image/png": (b) =>
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  "image/jpeg": (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/gif": (b) =>
    b.length >= 6 && (b.toString("ascii", 0, 6) === "GIF87a" || b.toString("ascii", 0, 6) === "GIF89a"),
  "image/webp": (b) =>
    b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP",
};

/** True when `buffer`'s real signature matches the declared image MIME type. */
export function sniffImageMime(buffer: Buffer, declaredMime: string): boolean {
  const check = IMAGE_SIGNATURES[declaredMime];
  if (!check) return false;
  try {
    return check(buffer);
  } catch {
    return false;
  }
}

export async function getUserName(req: Request): Promise<string> {
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

export async function initializeBookingWorkflows(bookingId: string) {
  // Keep workflow creation in storage so initialization is idempotent and uses
  // the canonical service-specific steps. It checks each service type
  // independently, allowing partially initialized bookings to be repaired.
  await storage.initializeBookingWorkflows(bookingId);
}

export async function confirmBookingSideEffects(bookingId: string, updatedBooking?: any) {
  const booking = updatedBooking || await storage.getBooking(bookingId);
  if (!booking) return;

  // 1. Initialize 5 workflows (idempotent)
  await storage.initializeBookingWorkflows(booking.id);

  // 2. Auto-payout for affiliate
  if (booking.affiliateId) {
    try {
      const aff = await storage.getAffiliates().then(list => list.find(a => a.id === booking.affiliateId));
      if (aff) {
        const commRate = parseFloat(aff.commissionRate?.toString() || "10");
        const commAmount = (booking.totalPrice || 0) * (commRate / 100);
        await storage.createAffiliatePayout({
          affiliateId: aff.id,
          bookingId: booking.id,
          amount: commAmount.toString(),
          status: "pending"
        });
      }
    } catch (affErr) {
      console.error("Affiliate payout error:", affErr);
    }
  }

  // 3. Automated Document Delivery: Generate Itinerary PDF & Notify Customer
  if (booking.tourId) {
    try {
      const { pdfService } = await import("../lib/pdf");
      await pdfService.generateItinerary(booking.tourId);
      await storage.createDocument({
        bookingId: booking.id,
        docType: "voucher",
        fileName: `Itinerary_${booking.bookingCode}.pdf`,
        fileUrl: `/api/tours/${booking.tourId}/pdf`,
        status: "approved"
      });

      await storage.createNotification({
        userId: booking.customerId,
        title: "Booking Confirmed! ✨",
        message: `Your booking ${booking.bookingCode} is confirmed. Your official itinerary PDF is now available in your documents.`,
        type: "booking_update"
      });
    } catch (pdfErr) {
      console.error("Automated PDF generation failed:", pdfErr);
    }
  }

  // 4. Auto capacity management (deduct seats atomically)
  if (booking.departureId) {
    const partySize = booking.partySizeExpected || 0;
    try {
      await db.transaction(async (tx) => {
        await tx.update(tourDepartures)
          .set({
            capacityBooked: sql`LEAST(${tourDepartures.capacityTotal}, COALESCE(${tourDepartures.capacityBooked}, 0) + ${partySize})`
          })
          .where(eq(tourDepartures.id, booking.departureId!));
        const [dep] = await tx.select().from(tourDepartures).where(eq(tourDepartures.id, booking.departureId!));
        if (dep && (dep.capacityBooked || 0) >= (dep.capacityTotal || 0)) {
          await tx.update(tourDepartures).set({ status: "sold_out" }).where(eq(tourDepartures.id, dep.id));
        }
      });
    } catch (capErr) {
      console.error("Capacity deduction error:", capErr);
    }
  }
}

export async function syncBookingPaymentSchedules(bookingId: string) {
  try {
    const schedules = await db.select().from(bookingPaymentSchedules)
      .where(eq(bookingPaymentSchedules.bookingId, bookingId))
      .orderBy(bookingPaymentSchedules.installmentNumber);

    if (!schedules || schedules.length === 0) return;

    const allPaidPayments = await db.select().from(payments)
      .where(and(
        eq(payments.bookingId, bookingId),
        eq(payments.status, "paid")
      ));

    let unallocatedFunds = allPaidPayments.reduce((sum, p) => sum + (Number(p.amount) - Number(p.refundedAmount || 0)), 0);
    const now = new Date();

    for (const sched of schedules) {
      if (sched.status === "cancelled") continue;
      const targetAmount = parseFloat(sched.amount?.toString() || "0");
      const allocated = Math.min(targetAmount, Math.max(0, unallocatedFunds));
      unallocatedFunds -= allocated;

      const isPaid = allocated >= targetAmount;
      const isPartiallyPaid = allocated > 0 && !isPaid;
      const dueDate = new Date(sched.dueDate);
      const isOverdue = dueDate < now;

      let newStatus: "pending" | "paid" | "partially_paid" | "late" | "cancelled" = "pending";
      if (isPaid) {
        newStatus = "paid";
      } else if (isPartiallyPaid) {
        newStatus = "partially_paid";
      } else if (isOverdue) {
        newStatus = "late";
      } else {
        newStatus = "pending";
      }

      const formattedPaid = allocated.toFixed(2);
      if (sched.paidAmount !== formattedPaid || sched.status !== newStatus) {
        await db.update(bookingPaymentSchedules).set({
          paidAmount: formattedPaid,
          status: newStatus,
          updatedAt: new Date(),
        }).where(eq(bookingPaymentSchedules.id, sched.id));
      }
    }
  } catch (err) {
    console.error("Failed to sync booking payment schedules:", err);
  }
}

export async function recordSchedulePayment(scheduleId: string, amount: number) {
  try {
    const [sched] = await db.select().from(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.id, scheduleId));
    if (!sched) return;
    const currentPaid = parseFloat(sched.paidAmount?.toString() || "0");
    const targetAmount = parseFloat(sched.amount?.toString() || "0");
    const newPaid = currentPaid + amount;
    const isPaid = newPaid >= targetAmount;
    await db.update(bookingPaymentSchedules).set({
      paidAmount: newPaid.toString(),
      status: isPaid ? "paid" : "partially_paid",
      updatedAt: new Date(),
    }).where(eq(bookingPaymentSchedules.id, sched.id));
    await syncBookingPaymentSchedules(sched.bookingId);
  } catch (err) {
    console.error("Failed to record schedule payment:", err);
  }
}

export async function autoConfirmBookingIfEligible(bookingId: string, note = "Payment received") {
  const booking = await storage.getBooking(bookingId);
  if (!booking) return;
  if (["submitted", "draft"].includes(booking.status || "")) {
    const fromStatus = booking.status ?? "submitted";
    await db.update(bookings).set({ status: "confirmed" }).where(eq(bookings.id, booking.id));
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus,
      toStatus: "confirmed",
      changedBy: null,
      reason: note,
    }).catch(() => {});
    await storage.createAuditLog({
      entityType: "booking",
      entityId: booking.id,
      action: "status_changed",
      previousValue: booking.status,
      newValue: "confirmed",
      note,
    }).catch(() => {});
    await confirmBookingSideEffects(booking.id, { ...booking, status: "confirmed" });
  }
}

// Guard for public-facing tour sub-resources: an unpublished (draft) tour and
// its nested resources (days, items, guides, hotels, departures) must never be
// readable by anonymous or customer callers — only by authenticated staff.
// Responds 404 (indistinguishable from "not found") and returns false when the
// caller may not view the tour.
export async function ensureTourViewable(req: Request, res: Response, tourId: string): Promise<boolean> {
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
export async function ownerScope(
  req: Request,
  scopedRoles: string[],
): Promise<{ userId: string; role: string; ownerId: string | null; transportCompanyId: string | null }> {
  const userId = getUserId(req) as string;
  const profile = await storage.getOrCreateProfile(userId);
  const ownerId = scopedRoles.includes(profile.role) ? userId : null;
  return { userId, role: profile.role, ownerId, transportCompanyId: (profile as any).transportCompanyId ?? null };
}

export function coerceBooleans(data: any[], booleanFields: string[]) {
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

/** PG unique-constraint violation (code 23505), possibly wrapped by the driver. */
export function isUniqueViolation(e: any): boolean {
  return e?.code === "23505" || e?.cause?.code === "23505";
}
/** True only for the tours.slug unique constraint (don't mislabel other 23505s). */
export function isSlugUniqueViolation(e: any): boolean {
  if (!isUniqueViolation(e)) return false;
  const constraint = e?.constraint ?? e?.cause?.constraint ?? "";
  const detail = e?.detail ?? e?.cause?.detail ?? "";
  return /slug/i.test(constraint) || /slug/i.test(detail);
}

// Public per-person selling price for a tour: full price (base + day items +
// markup + service fee) plus the cheapest same-currency per-person hotel
// accommodation. Short-TTL cached; never throws (pricing enrichment must not
// break public catalog reads).
export type PublicTourPricing = { perPersonBase: number; accommodationFrom: number; perPersonFrom: number; currency: string };
  // Short-TTL cache: catalog pages fan out to per-tour pricing queries; 60s
  // bounds both the DB amplification and the staleness after a price edit.
  const publicPricingCache = new Map<string, { value: PublicTourPricing | null; expires: number }>();
  const PUBLIC_PRICING_TTL_MS = 60_000;

// The cache is per-server: registerRoutes() clears it on (re)registration so a
// freshly registered server never serves another instance's cached prices.
export function resetPublicTourPricingCache(): void {
  publicPricingCache.clear();
}

export async function publicTourPricing(tourId: string): Promise<PublicTourPricing | null> {
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

// Best-effort: make sure a city row exists for the given name/country so
// tour day locations link to a real city. Silently no-ops when it cannot
// resolve a country.
export async function ensureCityExists(cityName: string | null | undefined, countryCode: string | null | undefined) {
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

/** All money is integer units. Booking.totalPrice is whole currency units. */
export async function computeCheckoutSummary(booking: {
  totalPrice: number | null;
  currency: string | null;
  taxAmount?: string | number | null;
  serviceFeeAmount?: string | number | null;
}) {
  const subtotal = Math.round(booking.totalPrice || 0);
  const feeSetting = await storage.getGlobalSettingByKey?.("default_service_fee");
  const fees = booking.serviceFeeAmount != null
    ? Math.round(Number(booking.serviceFeeAmount))
    : Math.round(Number(feeSetting?.value || 0));
  const taxSetting = await storage.getGlobalSettingByKey?.("checkout_tax_rate_percent");
  const taxRate = Number(taxSetting?.value || 0);
  const taxes = booking.taxAmount != null
    ? Math.round(Number(booking.taxAmount))
    : Math.round((subtotal * taxRate) / 100);
  const discount = 0; // promo codes not supported yet
  return {
    subtotal,
    taxes,
    fees,
    discount,
    total: subtotal + taxes + fees - discount,
    currency: booking.currency || "USD",
    taxRate,
  };
}
