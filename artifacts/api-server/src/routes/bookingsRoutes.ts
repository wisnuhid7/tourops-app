import type { Express } from "express";
import Decimal from "decimal.js";
import { and, eq, or, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { generateCode, generateCode as genCode, computePayloadHash } from "../lib/utils";
import { pdfService } from "../lib/pdf";
import { sendNewBookingNotification } from "../lib/email";
import { isAuthenticated } from "../replit_integrations/auth";
import { accommodationForTour, tourOffersRoomTypes, BOOKING_ROOM_TYPES, type BookingRoomType } from "../services/rate-resolver";
import { calculateBookingPrice, isUsableDeparturePrice, resolvePerPersonPrice } from "../services/booking-pricing";
import { generateInstallmentSchedule } from "../services/installment-generator";
import {
  bookings,
  bookingPaymentSchedules,
  db,
  documents,
  insertDocumentSchema,
  messages,
  notifications,
  payments,
  tourDepartures,
  tours,
  travelers,
} from "@workspace/db";
import {
  ADMIN_ROLES,
  ALL_STAFF_ROLES,
  BOOKING_READ_ROLES,
  OPS_DISPATCH_ROLES,
  PLATFORM_WIDE_READ_ROLES,
  getUserId,
  requireRole,
} from "../middleware/auth";
import { canAccessBooking, confirmBookingSideEffects, getUserName, initializeBookingWorkflows, publicTourPricing, upload } from "./shared";

// Bookings and everything that hangs off a booking: customer-facing booking
// routes, documents, payments, leader group participants, self-cancellation,
// public groups, and audit logs. Extracted verbatim from routes.ts.
export function registerBookingsRoutes(app: Express): void {
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

      // Validate Idempotency-Key header (US-03)
      const idempotencyKey = req.header("idempotency-key");
      const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!idempotencyKey || !UUID_REGEX.test(idempotencyKey)) {
        return res.status(400).json({
          message: "Idempotency-Key header is required and must be a valid UUID",
          code: "INVALID_IDEMPOTENCY_KEY",
        });
      }

      // Compute deterministic payload hash for replay/conflict detection
      const requestHash = computePayloadHash(req.body);

      // Check existing booking with this idempotency key (valid within 24h)
      if (typeof storage.getBookingByIdempotencyKey === "function") {
        const existingBooking = await storage.getBookingByIdempotencyKey(idempotencyKey);
        if (existingBooking) {
          const ageMs = existingBooking.createdAt
            ? Date.now() - new Date(existingBooking.createdAt).getTime()
            : 0;
          if (ageMs <= 24 * 60 * 60 * 1000) {
            if (existingBooking.requestHash === requestHash) {
              res.setHeader("Idempotent-Replay", "true");
              return res.status(200).json(existingBooking);
            } else {
              return res.status(422).json({
                message: "Idempotency key already used with differing payload",
                code: "IDEMPOTENCY_CONFLICT",
              });
            }
          }
        }
      }

      const bookingCode = `BK-${generateCode(8)}`;
      const joinCode = req.body.bookingType === "leader_group" ? genCode(6) : undefined;
      const leaderUserId = (req.body.bookingType === "leader_group" || req.body.bookingType === "private_family") ? customerId : undefined;
      let affiliateId = undefined;
      if (req.body.referralCode) {
        const aff = await storage.getAffiliateByCode(req.body.referralCode);
        if (aff) affiliateId = aff.id;
      }

      // ---- Server-authoritative pricing & capacity hold ----------------
      // The client's totalPrice is display-only and NEVER trusted (except an
      // explicit staff override). Per-person price is resolved server-side:
      // departure price when set, otherwise the computed full selling price
      // (base + components + markup + fee), otherwise the tour base price.
      const partySize = Math.max(1, Number(req.body.partySizeExpected) || 1);

      const runTransaction = async <T>(callback: (tx: any) => Promise<T>): Promise<T> => {
        if (typeof (db as any).transaction === "function") {
          return (db as any).transaction(callback);
        }
        return callback(db);
      };

      const booking = await runTransaction(async (tx) => {
        let perPersonPrice: number | undefined;
        let departurePrice: string | number | null = null;
        let dep: any;

        if (req.body.tourId) {
          if (req.body.departureId) {
            // Lock target tour_departures row using SELECT ... FOR UPDATE
            if (typeof tx.select === "function") {
              const q = tx.select().from(tourDepartures).where(eq(tourDepartures.id, req.body.departureId));
              const rows = typeof (q as any).for === "function" ? await (q as any).for("update") : await q;
              dep = rows?.[0];
            }
            if (!dep && typeof storage.getDeparture === "function") {
              dep = await storage.getDeparture(req.body.departureId);
            }
            if (!dep || dep.tourId !== req.body.tourId) {
              const err: any = new Error("Departure does not belong to this tour");
              err.statusCode = 400;
              throw err;
            }

            // Atomic capacity seat hold validation (US-03)
            const capacityTotal = Number(dep.capacityTotal ?? 20);
            const capacityBooked = Number(dep.capacityBooked ?? 0);
            const capacityRemaining = Math.max(0, capacityTotal - capacityBooked);

            if (capacityBooked + partySize > capacityTotal) {
              const err: any = new Error("Not enough capacity remaining on this departure");
              err.statusCode = 409;
              err.code = "CAPACITY_EXCEEDED";
              err.capacityTotal = capacityTotal;
              err.capacityBooked = capacityBooked;
              err.capacityRemaining = capacityRemaining;
              throw err;
            }

            // Increment capacityBooked and mark sold_out if capacity met
            const newBooked = capacityBooked + partySize;
            const newStatus = newBooked >= capacityTotal ? "sold_out" : dep.status;

            if (typeof tx.update === "function") {
              await tx.update(tourDepartures)
                .set({
                  capacityBooked: newBooked,
                  ...(newStatus !== dep.status ? { status: newStatus } : {}),
                })
                .where(eq(tourDepartures.id, dep.id));
            } else if (typeof storage.updateDeparture === "function") {
              await storage.updateDeparture(dep.id, {
                capacityBooked: newBooked,
                ...(newStatus !== dep.status ? { status: newStatus } : {}),
              }, tx);
            }

            departurePrice = dep.pricePerPerson;
          }

          let publicPerPersonBase: number | null = null;
          let tourBasePrice: string | number | null = null;
          if (!isUsableDeparturePrice(departurePrice)) {
            const pp = await publicTourPricing(req.body.tourId);
            if (pp && pp.perPersonBase > 0) publicPerPersonBase = pp.perPersonBase;
            else {
              const tourRow = await storage.getTour(req.body.tourId);
              tourBasePrice = tourRow?.basePrice ?? null;
            }
          }
          // Shared precedence with GET /api/tours/:tourId/price-preview
          // (services/booking-pricing.ts).
          perPersonPrice = resolvePerPersonPrice({ departurePrice, publicPerPersonBase, tourBasePrice });
        }

        // Room-type selection: accommodation is priced server-side from the
        // hotel's registered nightly rate × the tour's hotel nights, for as
        // many rooms as the party needs. Never trust a client-provided figure.
        let roomType: BookingRoomType | undefined;
        let accommodationCost: string | undefined;
        let totalPrice: number | undefined;
        let bookingCurrency: string | undefined;
        if (req.body.roomType != null && req.body.roomType !== "") {
          if (!BOOKING_ROOM_TYPES.includes(req.body.roomType)) {
            const err: any = new Error(`roomType must be one of: ${BOOKING_ROOM_TYPES.join(", ")}`);
            err.statusCode = 400;
            throw err;
          }
          if (!req.body.tourId) {
            const err: any = new Error("roomType requires a tourId");
            err.statusCode = 400;
            throw err;
          }
          roomType = req.body.roomType;
          const acc = await accommodationForTour(db, req.body.tourId, roomType!);
          // Only add accommodation when its currency matches the booking currency
          // (no FX conversion yet) — never sum mixed currencies.
          const bodyCurrency = (req.body.currency || "USD").toUpperCase();
          if (new Decimal(acc.total).greaterThan(0) && acc.currency.toUpperCase() !== bodyCurrency) {
            const err: any = new Error(`Accommodation is priced in ${acc.currency} but the booking is in ${bodyCurrency}; currency conversion is not supported yet.`);
            err.statusCode = 400;
            throw err;
          }
          // Shared math with GET /api/tours/:tourId/price-preview so the persisted
          // total equals the quoted preview total (services/booking-pricing.ts).
          const math = calculateBookingPrice({
            perPersonPrice: perPersonPrice ?? 0,
            partySize,
            bookingCurrency: bodyCurrency,
            roomType,
            accommodation: { total: acc.total, currency: acc.currency },
          });
          accommodationCost = math.accommodationCost.toFixed(2);
          bookingCurrency = acc.currency;
          totalPrice = math.grandTotal.toNumber();
        } else {
          if (req.body.tourId && req.body.bookingType !== "join_leader_group") {
            // Customers starting a booking on a tour that offers room types must
            // pick one. (join_leader_group participants share the leader's rooms;
            // accommodation is billed on the leader's booking.)
            if (await tourOffersRoomTypes(db, req.body.tourId)) {
              const err: any = new Error("Please select a room type (matrimonial, doble, or triple) for this tour.");
              err.statusCode = 400;
              throw err;
            }
          }
          if (perPersonPrice !== undefined) {
            // Tour-derived total, finalized to a whole currency unit (shared with
            // the price-preview endpoint via services/booking-pricing.ts).
            totalPrice = calculateBookingPrice({
              perPersonPrice,
              partySize,
              bookingCurrency: (req.body.currency || "USD").toUpperCase(),
            }).grandTotal.toNumber();
          } else if (isStaff) {
            totalPrice = req.body.totalPrice;
          }
        }

        const initialStatus = req.body.status || ("pending_payment" as const);
        const holdExpiresAt = initialStatus === "pending_payment"
          ? (req.body.holdExpiresAt ? new Date(req.body.holdExpiresAt) : new Date(Date.now() + 30 * 60 * 1000))
          : (req.body.holdExpiresAt ? new Date(req.body.holdExpiresAt) : null);

        const created = await storage.createBooking({
          ...req.body, 
          customerId, 
          bookingCode, 
          joinCode, 
          leaderUserId, 
          affiliateId,
          departureCity: req.body.departureCity || (req.body.isLandOnly ? "Land Only (Self Arrival)" : null),
          departureAirportId: req.body.departureAirportId || null,
          roomType: roomType ?? null,
          accommodationCost: accommodationCost ?? null,
          currency: bookingCurrency ?? req.body.currency ?? "USD",
          totalPrice,
          status: initialStatus, 
          holdExpiresAt,
          idempotencyKey,
          requestHash,
          fulfillmentStatus: req.body.fulfillmentStatus || ("pending" as const),
        }, tx);

        // Generate and persist installment schedule snapshot (US-04)
        if (created.totalPrice && Number(created.totalPrice) > 0) {
          let departureStartDate = dep?.startDate ?? null;
          if (!departureStartDate && req.body.departureId) {
            const [dRow] = typeof tx.select === "function"
              ? await tx.select().from(tourDepartures).where(eq(tourDepartures.id, req.body.departureId))
              : [];
            if (dRow?.startDate) departureStartDate = dRow.startDate;
          }
          const schedules = generateInstallmentSchedule({
            totalPrice: created.totalPrice,
            currency: created.currency ?? "USD",
            bookingDate: created.createdAt ? new Date(created.createdAt) : new Date(),
            departureDate: departureStartDate ? new Date(departureStartDate) : null,
            bookingId: created.id,
            plan: req.body.paymentPlan,
          });

          if (schedules.length > 0) {
            if (typeof storage.createPaymentSchedules === "function") {
              await storage.createPaymentSchedules(
                schedules.map((s) => ({
                  bookingId: created.id,
                  installmentNumber: s.installmentNumber,
                  label: s.label,
                  labelEn: s.labelEn,
                  labelId: s.labelId,
                  percentage: s.percentage,
                  amount: s.amount,
                  paidAmount: s.paidAmount,
                  currency: s.currency,
                  dueDate: s.dueDate,
                  status: s.status,
                })),
                tx
              );
            } else if (typeof tx?.insert === "function") {
              await tx.insert(bookingPaymentSchedules).values(
                schedules.map((s) => ({
                  bookingId: created.id,
                  installmentNumber: s.installmentNumber,
                  label: s.label,
                  labelEn: s.labelEn,
                  labelId: s.labelId,
                  percentage: s.percentage,
                  amount: s.amount,
                  paidAmount: s.paidAmount,
                  currency: s.currency,
                  dueDate: s.dueDate,
                  status: s.status,
                }))
              );
            }
          }
        }

        return created;
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
    } catch (e: any) {
      const idempotencyKey = req.header("idempotency-key");
      // Handle concurrent duplicate key race condition
      if (
        (e.code === "23505" || e.message?.includes("duplicate key") || e.message?.includes("bookings_idempotency_key_idx")) &&
        idempotencyKey &&
        typeof storage.getBookingByIdempotencyKey === "function"
      ) {
        const winner = await storage.getBookingByIdempotencyKey(idempotencyKey);
        if (winner) {
          const reqHash = computePayloadHash(req.body);
          if (winner.requestHash === reqHash) {
            res.setHeader("Idempotent-Replay", "true");
            return res.status(200).json(winner);
          } else {
            return res.status(422).json({
              message: "Idempotency key already used with differing payload",
              code: "IDEMPOTENCY_CONFLICT",
            });
          }
        }
      }

      if (
        e.statusCode === 409 ||
        e.code === "CAPACITY_EXCEEDED" ||
        (typeof e.message === "string" && e.message.includes("tour_departures_capacity_check"))
      ) {
        return res.status(409).json({
          message: e.message || "Not enough capacity remaining on this departure",
          code: "CAPACITY_EXCEEDED",
          capacityTotal: e.capacityTotal,
          capacityBooked: e.capacityBooked,
          capacityRemaining: e.capacityRemaining,
        });
      }
      if (e.statusCode === 400) {
        return res.status(400).json({ message: e.message });
      }
      routeError(res, e);
    }
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
      if (!oldBooking) return res.status(404).json({ message: "Booking not found" });

      if (oldBooking.status === "cancelled" && req.body.status && req.body.status !== "cancelled") {
        return res.status(400).json({ message: "Cannot change the status of a cancelled booking." });
      }
      if (oldBooking.status === "cancelled" && req.body.fulfillmentStatus && req.body.fulfillmentStatus !== oldBooking.fulfillmentStatus) {
        return res.status(400).json({ message: "Cannot change fulfillment status of a cancelled booking." });
      }

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
        await confirmBookingSideEffects(req.params.id as string, updated);
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

      if (req.body.status === "cancelled" && oldBooking?.status !== "cancelled") {
        await storage.cancelBookingWorkflows(req.params.id as string, req.body.reason || "Booking status cancelled");
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

  app.post("/api/bookings/join", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const joinSchema = z.object({
        joinCode: z.string().min(1),
        partySizeExpected: z.number().int().min(1).max(50).optional(),
        departureCity: z.string().optional(),
        departureAirportId: z.string().optional(),
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
          departureCity: parsed.data.departureCity ?? original.departureCity ?? null,
          departureAirportId: parsed.data.departureAirportId ?? original.departureAirportId ?? null,
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

  app.post("/api/my-bookings/:id/payment-schedule/select-plan", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(403).json({ message: "Forbidden" });
      if (["cancelled", "completed"].includes(booking.status || "")) {
        return res.status(409).json({ message: "Cannot change payment plan for this booking" });
      }
      if (!booking.totalPrice || booking.totalPrice <= 0) {
        return res.status(400).json({ message: "Booking has no total price" });
      }

      const parsed = z.object({
        plan: z.enum(["full", "two_stage", "three_stage", "staged", "auto"]),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid plan" });

      const existing = await db.select().from(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.bookingId, booking.id));
      if (existing.some((s) => s.status === "paid" || s.status === "partially_paid" || new Decimal(s.paidAmount || 0).greaterThan(0))) {
        return res.status(409).json({ message: "Payments have already been made; payment schedule cannot be modified" });
      }

      let depDate: Date | null = null;
      if (booking.departureId) {
        const [dep] = await db.select().from(tourDepartures).where(eq(tourDepartures.id, booking.departureId));
        if (dep?.startDate) depDate = new Date(dep.startDate);
      }

      const planOpt = parsed.data.plan === "full" ? "full" : "staged";
      const schedules = generateInstallmentSchedule({
        totalPrice: booking.totalPrice,
        currency: booking.currency ?? "USD",
        bookingDate: booking.createdAt ? new Date(booking.createdAt) : new Date(),
        departureDate: depDate,
        bookingId: booking.id,
        plan: planOpt,
      });

      const rows = await db.transaction(async (tx) => {
        await tx.delete(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.bookingId, booking.id));
        if (schedules.length === 0) return [];
        if (typeof storage.createPaymentSchedules === "function") {
          return storage.createPaymentSchedules(
            schedules.map((s) => ({
              bookingId: booking.id,
              installmentNumber: s.installmentNumber,
              label: s.label,
              labelEn: s.labelEn,
              labelId: s.labelId,
              percentage: s.percentage,
              amount: s.amount,
              paidAmount: s.paidAmount,
              currency: s.currency,
              dueDate: s.dueDate,
              status: s.status,
            })),
            tx
          );
        } else if (typeof tx?.insert === "function") {
          return tx.insert(bookingPaymentSchedules).values(
            schedules.map((s) => ({
              bookingId: booking.id,
              installmentNumber: s.installmentNumber,
              label: s.label,
              labelEn: s.labelEn,
              labelId: s.labelId,
              percentage: s.percentage,
              amount: s.amount,
              paidAmount: s.paidAmount,
              currency: s.currency,
              dueDate: s.dueDate,
              status: s.status,
            }))
          ).returning();
        }
        return [];
      });

      await storage.createAuditLog({
        entityType: "booking_payment_schedule",
        entityId: booking.id,
        action: "plan_selected",
        changedBy: userId,
        newValue: parsed.data.plan,
        note: `Customer selected ${parsed.data.plan} plan`,
      }).catch(() => {});

      res.status(200).json({ success: true, plan: parsed.data.plan, schedules: rows });
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

      // Guard: Participant cannot be cancelled if payment has already been made
      const participantPmts = await storage.getPayments(participant.id);
      const participantSched = await db.select().from(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.bookingId, participant.id));
      if (participantPmts.some(p => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded") || participantSched.some(s => s.status === "paid" || Number(s.paidAmount || 0) > 0)) {
        return res.status(400).json({ message: "Cannot cancel participant: payment has already been received." });
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

      // Guard: If payment has already been received, booking cannot be self-cancelled by customer
      const pmts = await storage.getPayments(booking.id);
      const hasPaidPayment = pmts.some(p => p.status === "paid" || p.status === "partially_refunded" || p.status === "refunded");
      const schedRows = await db.select().from(bookingPaymentSchedules).where(eq(bookingPaymentSchedules.bookingId, booking.id));
      const hasPaidSchedule = schedRows.some(s => s.status === "paid" || Number(s.paidAmount || 0) > 0);

      if (hasPaidPayment || hasPaidSchedule) {
        return res.status(400).json({
          message: "Cannot cancel booking: payment has already been received. Please contact operations or support for cancellation assistance."
        });
      }

      const previousStatus = booking.status;
      const updated = await storage.updateBooking(req.params.id as string, { status: "cancelled" });

      // Restore tour departure capacity if booking was confirmed
      if (booking.departureId && booking.partySizeExpected && previousStatus === "confirmed") {
        const partySize = booking.partySizeExpected;
        await db.transaction(async (tx) => {
          await tx.update(tourDepartures)
            .set({
              capacityBooked: sql`GREATEST(0, COALESCE(${tourDepartures.capacityBooked}, 0) - ${partySize})`
            })
            .where(eq(tourDepartures.id, booking.departureId!));
          const [dep] = await tx.select().from(tourDepartures).where(eq(tourDepartures.id, booking.departureId!));
          if (dep && dep.status === "sold_out" && (dep.capacityBooked || 0) < (dep.capacityTotal || 0)) {
            await tx.update(tourDepartures).set({ status: "open" }).where(eq(tourDepartures.id, dep.id));
          }
        });
      }

      // Cascade cancel all service workflows and steps
      await storage.cancelBookingWorkflows(req.params.id as string, req.body.reason || "Customer self-cancelled");

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
}
