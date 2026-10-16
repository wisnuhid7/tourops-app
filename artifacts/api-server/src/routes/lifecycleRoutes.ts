/**
 * Full booking-lifecycle features:
 *  - Passenger invitations (secure single-use hashed tokens) + passenger portal
 *  - Passenger profile completion tracking
 *  - Rooming list management + export
 *  - Booking status workflow (with history) incl. in_operation
 *  - Tour leader assignment (bookings.tourLeaderUserId)
 *  - Change requests (client asks; ops approves with seat checks)
 *  - Incident reports (tour leader / ops)
 *  - Operational document generators (confirmation, rooming list, manifest,
 *    emergency contacts) — client documents never include internal costs.
 *
 * Access model mirrors serviceOpsRoutes.ts: staff role allowlists via
 * requireRole; customer/leader access via canAccessBooking; passengers access
 * ONLY the traveler row linked to their user id; 404 (not 403) for rows that
 * belong to someone else so ids can't be probed.
 */
import type { Express, Request, Response } from "express";
import { z } from "zod/v4";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import {
  db, bookings, travelers, travelerInvitations, bookingStatusHistory,
  bookingRooms, bookingChangeRequests, incidentReports, tours, tourDays,
  tourDepartures, bookingPaymentSchedules, userProfiles,
} from "@workspace/db";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { storage } from "../storage";
import { routeError } from "../lib/routeError";
import { isAuthenticated } from "../replit_integrations/auth";
import { authStorage } from "../replit_integrations/auth/storage";
import { enqueueEmail } from "../lib/emailQueue";
import { canAccessBooking } from "./shared";
import { getUserId, requireRole } from "../middleware/auth";

const OPS_ROLES = ["super_admin", "admin", "operations_manager"];
const BOOKING_READ_STAFF = ["super_admin", "admin", "operations_manager", "support_agent", "accounting"];
const INCIDENT_CREATE_STAFF = ["super_admin", "admin", "operations_manager", "support_agent"];

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

async function getProfileRole(userId: string): Promise<string | null> {
  try { return (await storage.getOrCreateProfile(userId)).role; } catch { return null; }
}

/** Staff (allowlist) OR the booking's customer/group-leader. Returns booking or null (already responded). */
async function staffOrOwnerBooking(req: Request, res: Response, staffRoles: string[]) {
  const userId = getUserId(req)!;
  const bookingId = req.params.id as string;
  const role = await getProfileRole(userId);
  const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
  if (role && staffRoles.includes(role)) {
    if (!booking) { res.status(404).json({ message: "Booking not found" }); return null; }
    return booking;
  }
  // Assigned professional tour leader can read operational booking data too.
  if (booking && role === "tour_leader" && booking.tourLeaderUserId === userId) return booking;
  const own = await canAccessBooking(userId, bookingId);
  if (!own) { res.status(404).json({ message: "Booking not found" }); return null; }
  return own;
}

/** Per-traveler profile completion flags used by the tracking dashboard. */
export function travelerCompletion(t: typeof travelers.$inferSelect, invited: boolean) {
  const flags = {
    invited,
    activated: !!t.userId,
    contactComplete: !!(t.email && t.phone),
    passportComplete: !!(t.passportNumber && t.passportExpiry),
    emergencyComplete: !!(t.emergencyContactName && t.emergencyContactPhone),
    notesComplete: t.dietaryNotes !== null && t.mobilityNotes !== null,
    termsAccepted: !!t.termsAcceptedAt,
  };
  const missing: string[] = [];
  if (!flags.contactComplete) missing.push("contact info");
  if (!flags.passportComplete) missing.push("passport details");
  if (!flags.emergencyComplete) missing.push("emergency contact");
  if (!flags.termsAccepted) missing.push("terms acceptance");
  return { ...flags, complete: missing.length === 0, missing };
}

/** Booking status transitions ops may perform. */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["confirmed", "cancelled"],
  confirmed: ["in_operation", "cancelled"],
  in_operation: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function csv(rows: (string | number | null | undefined)[][]): string {
  return rows.map(r => r.map(v => {
    let s = v === null || v === undefined ? "" : String(v);
    // Neutralize spreadsheet formula injection from passenger-controlled text.
    if (/^[\s]*[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

export function registerLifecycleRoutes(app: Express): void {
  // =========================================================================
  // Passenger invitations
  // =========================================================================

  // Owner (customer/leader) or ops sends an invitation for a traveler.
  app.post("/api/bookings/:id/travelers/:travelerId/invite", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, OPS_ROLES);
      if (!booking) return;
      const [traveler] = await db.select().from(travelers)
        .where(and(eq(travelers.id, req.params.travelerId as string), eq(travelers.bookingId, booking.id)));
      if (!traveler) return res.status(404).json({ message: "Traveler not found" });
      if (traveler.userId) return res.status(409).json({ message: "Traveler already has an active account" });
      const parsed = z.object({ email: z.string().email().optional() }).safeParse(req.body ?? {});
      if (!parsed.success) return res.status(400).json({ message: "Invalid email" });
      const email = (parsed.data.email ?? traveler.email ?? "").trim().toLowerCase();
      if (!email) return res.status(400).json({ message: "Traveler has no email; provide one" });
      if (email !== traveler.email) {
        await db.update(travelers).set({ email }).where(eq(travelers.id, traveler.id));
      }
      // Revoke earlier pending invites so only the newest link works.
      await db.update(travelerInvitations)
        .set({ status: "revoked" })
        .where(and(eq(travelerInvitations.travelerId, traveler.id), eq(travelerInvitations.status, "pending")));
      const raw = crypto.randomBytes(32).toString("hex");
      const [invite] = await db.insert(travelerInvitations).values({
        travelerId: traveler.id, bookingId: booking.id, email,
        tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedBy: getUserId(req) ?? null,
      }).returning();
      const base = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "";
      const inviteUrl = `${base}/passenger/accept-invite?token=${raw}`;
      enqueueEmail(email, "Your TourOps trip invitation",
        `<p>Hello ${traveler.firstName},</p><p>You have been added to booking ${booking.bookingCode}. Create your passenger account here:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>This link expires in 7 days and can be used once.</p>`);
      await storage.createAuditLog({
        entityType: "traveler_invitation", entityId: invite.id, action: "sent",
        changedBy: getUserId(req), newValue: JSON.stringify({ travelerId: traveler.id, email }),
      }).catch(() => {});
      // Raw link returned to the inviter so they can share it directly.
      res.status(201).json({ id: invite.id, email, expiresAt: invite.expiresAt, inviteUrl });
    } catch (e) { routeError(res, e); }
  });

  // Public: preview an invitation (no auth — token IS the credential).
  app.get("/api/passenger-invitations/:token", async (req, res) => {
    try {
      const [invite] = await db.select().from(travelerInvitations)
        .where(eq(travelerInvitations.tokenHash, hashToken(req.params.token as string)));
      if (!invite || invite.status !== "pending" || invite.expiresAt.getTime() < Date.now())
        return res.status(404).json({ message: "Invitation is invalid or has expired" });
      const [traveler] = await db.select().from(travelers).where(eq(travelers.id, invite.travelerId));
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, invite.bookingId));
      const tour = booking?.tourId ? await storage.getTour(booking.tourId).catch(() => null) : null;
      res.json({
        email: invite.email,
        firstName: traveler?.firstName ?? "", lastName: traveler?.lastName ?? "",
        bookingCode: booking?.bookingCode ?? null, tourName: (tour as any)?.title ?? (tour as any)?.name ?? null,
        expiresAt: invite.expiresAt,
      });
    } catch (e) { routeError(res, e); }
  });

  // Public: accept the invitation — creates the passenger account and logs in.
  app.post("/api/passenger-invitations/:token/accept", async (req, res) => {
    try {
      const parsed = z.object({ password: z.string().min(8).max(200) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Password must be at least 8 characters" });
      const tokenHash = hashToken(req.params.token as string);
      // Atomic consume: only one accept can flip pending -> accepted.
      const [invite] = await db.update(travelerInvitations)
        .set({ status: "accepted", usedAt: new Date() })
        .where(and(eq(travelerInvitations.tokenHash, tokenHash), eq(travelerInvitations.status, "pending")))
        .returning();
      if (!invite || invite.expiresAt.getTime() < Date.now())
        return res.status(404).json({ message: "Invitation is invalid or has expired" });
      const [traveler] = await db.select().from(travelers).where(eq(travelers.id, invite.travelerId));
      if (!traveler) return res.status(404).json({ message: "Traveler record no longer exists" });
      if (traveler.userId) return res.status(409).json({ message: "Traveler already has an account" });
      const existingByEmail = await authStorage.getUserByEmail(invite.email);
      if (existingByEmail) {
        // Do NOT link silently: that would hand this booking to whoever owns
        // the email account without proving they hold the mailbox. They can
        // ask the organizer to re-invite a different address.
        return res.status(409).json({ message: "An account with this email already exists. Log in instead, then ask your organizer to link you." });
      }
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const baseUsername = invite.email.split("@")[0].replace(/[^a-z0-9._-]/gi, "").slice(0, 40) || "passenger";
      let username = baseUsername;
      for (let i = 0; await authStorage.getUserByUsername(username); i++) username = `${baseUsername}${i + 1}`;
      const user = await authStorage.upsertUser({
        username, email: invite.email, passwordHash,
        firstName: traveler.firstName, lastName: traveler.lastName, emailVerified: true,
      });
      await authStorage.ensureProfile(user.id, "individual");
      const [linked] = await db.update(travelers)
        .set({ userId: user.id })
        .where(and(eq(travelers.id, traveler.id), isNull(travelers.userId)))
        .returning();
      if (!linked) return res.status(409).json({ message: "Traveler was linked concurrently" });
      await new Promise<void>((resolve, reject) =>
        (req as any).session.regenerate((err: any) => err ? reject(err) : resolve()));
      (req as any).session.userId = user.id;
      await storage.createAuditLog({
        entityType: "traveler_invitation", entityId: invite.id, action: "accepted",
        changedBy: user.id, newValue: JSON.stringify({ travelerId: traveler.id }),
      }).catch(() => {});
      res.status(201).json({ user: { id: user.id, username: user.username, email: user.email, firstName: user.firstName, lastName: user.lastName } });
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Passenger portal
  // =========================================================================

  // Dashboard: every trip the logged-in passenger is a traveler on.
  app.get("/api/passenger/dashboard", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const myTravelers = await db.select().from(travelers).where(eq(travelers.userId, userId));
      const trips = [] as any[];
      for (const t of myTravelers) {
        const [booking] = await db.select().from(bookings).where(eq(bookings.id, t.bookingId));
        if (!booking) continue;
        const tour = booking.tourId ? await storage.getTour(booking.tourId).catch(() => null) : null;
        const [departure] = booking.departureId
          ? await db.select().from(tourDepartures).where(eq(tourDepartures.id, booking.departureId))
          : [null as any];
        const itinerary = booking.tourId
          ? await db.select().from(tourDays).where(eq(tourDays.tourId, booking.tourId)).orderBy(asc(tourDays.dayNumber))
          : [];
        const schedule = await db.select().from(bookingPaymentSchedules)
          .where(eq(bookingPaymentSchedules.bookingId, booking.id))
          .orderBy(bookingPaymentSchedules.installmentNumber);
        const room = t.roomId ? (await db.select().from(bookingRooms).where(eq(bookingRooms.id, t.roomId)))[0] : null;
        trips.push({
          traveler: t,
          completion: travelerCompletion(t, true),
          booking: {
            id: booking.id, bookingCode: booking.bookingCode, status: booking.status,
            groupName: booking.groupName, partySizeExpected: booking.partySizeExpected,
            currency: booking.currency,
          },
          tour: tour ? { id: (tour as any).id, title: (tour as any).title ?? (tour as any).name, destination: (tour as any).destination ?? null } : null,
          departure: departure ? { id: departure.id, startDate: departure.startDate, endDate: departure.endDate, status: departure.status } : null,
          itinerary: itinerary.map(d => ({ dayNumber: d.dayNumber, title: d.title, description: d.description, city: d.city })),
          paymentStatus: {
            installments: schedule.length,
            paid: schedule.filter(s => s.status === "paid").length,
            fullyPaid: schedule.length > 0 && schedule.every(s => s.status === "paid"),
          },
          room: room ? { label: room.label, roomType: room.roomType } : null,
        });
      }
      res.json({ trips });
    } catch (e) { routeError(res, e); }
  });

  // Passenger updates their own profile fields (allowlist).
  app.patch("/api/passenger/profile/:travelerId", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const [t] = await db.select().from(travelers).where(eq(travelers.id, req.params.travelerId as string));
      if (!t || t.userId !== userId) return res.status(404).json({ message: "Traveler profile not found" });
      const parsed = z.object({
        phone: z.string().trim().max(40).optional(),
        dob: z.string().trim().max(20).optional(),
        gender: z.string().trim().max(20).optional(),
        nationality: z.string().trim().max(60).optional(),
        passportNumber: z.string().trim().max(40).optional(),
        passportExpiry: z.string().trim().max(20).optional(),
        dietaryNotes: z.string().trim().max(500).optional(),
        mobilityNotes: z.string().trim().max(500).optional(),
        emergencyContactName: z.string().trim().max(120).optional(),
        emergencyContactPhone: z.string().trim().max(40).optional(),
        roomingPreference: z.string().trim().max(200).optional(),
        acceptTerms: z.boolean().optional(),
      }).strict().safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
      const { acceptTerms, ...fields } = parsed.data;
      const patch: Record<string, unknown> = { ...fields };
      if (acceptTerms) patch.termsAcceptedAt = new Date();
      const [row] = await db.update(travelers).set(patch).where(eq(travelers.id, t.id)).returning();
      res.json({ ...row, completion: travelerCompletion(row, true) });
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Passenger completion tracking (staff + owner)
  // =========================================================================
  app.get("/api/bookings/:id/passenger-completion", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, BOOKING_READ_STAFF);
      if (!booking) return;
      const rows = await db.select().from(travelers).where(eq(travelers.bookingId, booking.id));
      const invites = await db.select().from(travelerInvitations).where(eq(travelerInvitations.bookingId, booking.id));
      const invitedIds = new Set(invites.map(i => i.travelerId));
      const passengers = rows.map(t => ({
        id: t.id, firstName: t.firstName, lastName: t.lastName, email: t.email,
        ...travelerCompletion(t, invitedIds.has(t.id)),
      }));
      res.json({
        passengers,
        expectedCount: booking.partySizeExpected,
        actualCount: rows.length,
        allComplete: passengers.length > 0 && passengers.every(p => p.complete),
      });
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Rooming list
  // =========================================================================

  app.get("/api/bookings/:id/rooms", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, BOOKING_READ_STAFF);
      if (!booking) return;
      const rooms = await db.select().from(bookingRooms).where(eq(bookingRooms.bookingId, booking.id)).orderBy(asc(bookingRooms.label));
      const paxRows = await db.select().from(travelers).where(eq(travelers.bookingId, booking.id));
      res.json(rooms.map(r => ({
        ...r,
        occupants: paxRows.filter(t => t.roomId === r.id).map(t => ({ id: t.id, firstName: t.firstName, lastName: t.lastName })),
      })));
    } catch (e) { routeError(res, e); }
  });

  app.post("/api/bookings/:id/rooms", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, OPS_ROLES);
      if (!booking) return;
      const parsed = z.object({
        label: z.string().trim().min(1).max(60),
        roomType: z.enum(["single", "double", "triple"]),
        capacity: z.number().int().min(1).max(4).optional(),
        notes: z.string().trim().max(500).optional(),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid room" });
      const capacity = parsed.data.capacity ?? (parsed.data.roomType === "single" ? 1 : parsed.data.roomType === "double" ? 2 : 3);
      const [row] = await db.insert(bookingRooms)
        .values({ bookingId: booking.id, label: parsed.data.label, roomType: parsed.data.roomType, capacity, notes: parsed.data.notes ?? null })
        .onConflictDoNothing()
        .returning();
      if (!row) return res.status(409).json({ message: "A room with this label already exists on the booking" });
      res.status(201).json(row);
    } catch (e) { routeError(res, e); }
  });

  app.delete("/api/rooms/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const id = req.params.id as string;
      const [room] = await db.select().from(bookingRooms).where(eq(bookingRooms.id, id));
      if (!room) return res.status(404).json({ message: "Room not found" });
      await db.update(travelers).set({ roomId: null }).where(eq(travelers.roomId, id));
      await db.delete(bookingRooms).where(eq(bookingRooms.id, id));
      res.json({ deleted: true });
    } catch (e) { routeError(res, e); }
  });

  // Assign / unassign a traveler to a room (travelerId with roomId=null unassigns).
  app.post("/api/bookings/:id/rooms/assign", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, OPS_ROLES);
      if (!booking) return;
      const parsed = z.object({ travelerId: z.string().min(1), roomId: z.string().min(1).nullable() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "travelerId and roomId are required" });
      const [t] = await db.select().from(travelers)
        .where(and(eq(travelers.id, parsed.data.travelerId), eq(travelers.bookingId, booking.id)));
      if (!t) return res.status(404).json({ message: "Traveler not found on this booking" });
      if (parsed.data.roomId) {
        // Lock the room row so concurrent assignments into the last free slot
        // serialize; the occupancy count is then race-free.
        const result = await db.transaction(async (tx) => {
          const locked = await tx.execute(sql`SELECT id, label, capacity FROM booking_rooms WHERE id = ${parsed.data.roomId} AND booking_id = ${booking.id} FOR UPDATE`);
          const room = (locked.rows ?? [])[0] as { id: string; label: string; capacity: number } | undefined;
          if (!room) return { status: 404, message: "Room not found on this booking" };
          const occupants = await tx.select().from(travelers).where(eq(travelers.roomId, room.id));
          if (occupants.filter(o => o.id !== t.id).length >= room.capacity)
            return { status: 409, message: `Room ${room.label} is full (capacity ${room.capacity})` };
          const [row] = await tx.update(travelers).set({ roomId: room.id }).where(eq(travelers.id, t.id)).returning();
          return { status: 200, row };
        });
        if (result.status !== 200) return res.status(result.status).json({ message: result.message });
        return res.json({ id: result.row!.id, roomId: result.row!.roomId });
      }
      const [row] = await db.update(travelers).set({ roomId: null }).where(eq(travelers.id, t.id)).returning();
      res.json({ id: row.id, roomId: row.roomId });
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Booking status workflow + tour leader assignment
  // =========================================================================

  app.patch("/api/bookings/:id/status", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const parsed = z.object({
        status: z.enum(["draft", "submitted", "confirmed", "in_operation", "completed", "cancelled"]),
        reason: z.string().trim().max(500).optional(),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Invalid status" });
      const id = req.params.id as string;
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const from = booking.status ?? "submitted";
      if (!(STATUS_TRANSITIONS[from] ?? []).includes(parsed.data.status))
        return res.status(409).json({ message: `Cannot move a ${from} booking to ${parsed.data.status}` });
      const [row] = await db.update(bookings)
        .set({ status: parsed.data.status })
        .where(and(eq(bookings.id, id), eq(bookings.status, from as any)))
        .returning();
      if (!row) return res.status(409).json({ message: "Booking was updated concurrently; reload and retry" });
      // Cancellation releases seats.
      if (parsed.data.status === "cancelled") {
        if (booking.departureId && booking.partySizeExpected) {
          const [dep] = await db.select().from(tourDepartures).where(eq(tourDepartures.id, booking.departureId));
          if (dep) {
            const newBooked = Math.max(0, (dep.capacityBooked ?? 0) - booking.partySizeExpected);
            await db.update(tourDepartures)
              .set({ capacityBooked: newBooked, status: dep.status === "sold_out" ? "open" : dep.status })
              .where(eq(tourDepartures.id, dep.id));
          }
        }
        await storage.cancelBookingWorkflows(id, parsed.data.reason || "Status changed to cancelled by ops");
      }
      await db.insert(bookingStatusHistory).values({
        bookingId: id, fromStatus: from, toStatus: parsed.data.status,
        changedBy: getUserId(req) ?? null, reason: parsed.data.reason ?? null,
      });
      await storage.createNotification({
        userId: booking.customerId, type: "booking_update",
        title: "Booking status updated",
        message: `Booking ${booking.bookingCode} is now ${parsed.data.status.replace("_", " ")}.`,
      }).catch(() => {});
      res.json(row);
    } catch (e) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/status-history", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, BOOKING_READ_STAFF);
      if (!booking) return;
      const rows = await db.select().from(bookingStatusHistory)
        .where(eq(bookingStatusHistory.bookingId, booking.id))
        .orderBy(desc(bookingStatusHistory.createdAt));
      res.json(rows);
    } catch (e) { routeError(res, e); }
  });

  // Ops assigns / clears the professional tour leader.
  app.patch("/api/bookings/:id/tour-leader", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const parsed = z.object({ tourLeaderUserId: z.string().min(1).nullable() }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "tourLeaderUserId is required (or null to unassign)" });
      const id = req.params.id as string;
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      if (parsed.data.tourLeaderUserId) {
        const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, parsed.data.tourLeaderUserId));
        if (!profile || profile.role !== "tour_leader")
          return res.status(400).json({ message: "tourLeaderUserId must reference a tour_leader account" });
      }
      const [row] = await db.update(bookings).set({ tourLeaderUserId: parsed.data.tourLeaderUserId }).where(eq(bookings.id, id)).returning();
      if (parsed.data.tourLeaderUserId) {
        await storage.createNotification({
          userId: parsed.data.tourLeaderUserId, type: "booking_update",
          title: "Tour assignment",
          message: `You have been assigned as tour leader for booking ${booking.bookingCode}.`,
        }).catch(() => {});
      }
      await storage.createAuditLog({
        entityType: "booking", entityId: id, action: "tour_leader_assigned",
        changedBy: getUserId(req), previousValue: booking.tourLeaderUserId ?? undefined,
        newValue: parsed.data.tourLeaderUserId ?? "unassigned",
      }).catch(() => {});
      res.json(row);
    } catch (e) { routeError(res, e); }
  });

  // Tour leader: my assigned bookings (operational view).
  app.get("/api/tour-leader/assignments", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ["tour_leader", ...OPS_ROLES])) return;
      const userId = getUserId(req)!;
      const rows = await db.select().from(bookings).where(eq(bookings.tourLeaderUserId, userId));
      const out = [] as any[];
      for (const b of rows) {
        const tour = b.tourId ? await storage.getTour(b.tourId).catch(() => null) : null;
        const [dep] = b.departureId ? await db.select().from(tourDepartures).where(eq(tourDepartures.id, b.departureId)) : [null as any];
        const pax = await db.select().from(travelers).where(eq(travelers.bookingId, b.id));
        // Operational data only — no prices/margins for the tour leader view.
        out.push({
          booking: { id: b.id, bookingCode: b.bookingCode, status: b.status, groupName: b.groupName, partySizeExpected: b.partySizeExpected, notes: b.notes },
          tour: tour ? { id: (tour as any).id, title: (tour as any).title ?? (tour as any).name } : null,
          departure: dep ? { startDate: dep.startDate, endDate: dep.endDate } : null,
          passengers: pax.map(t => ({
            id: t.id, firstName: t.firstName, lastName: t.lastName,
            dietaryNotes: t.dietaryNotes, mobilityNotes: t.mobilityNotes,
            emergencyContactName: t.emergencyContactName, emergencyContactPhone: t.emergencyContactPhone,
          })),
        });
      }
      res.json(out);
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Change requests
  // =========================================================================

  // Client (booking owner) files a change request.
  app.post("/api/my-bookings/:id/change-requests", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const booking = await canAccessBooking(userId, req.params.id as string);
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const parsed = z.object({
        requestType: z.enum(["add_passengers", "remove_passengers", "date_change", "other"]),
        details: z.string().trim().min(1).max(2000),
        paxDelta: z.number().int().min(-100).max(100).optional(),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid request" });
      // Bind paxDelta semantics to the request type: additions must be
      // positive, removals negative, and no other type may carry a delta.
      if (parsed.data.requestType === "add_passengers" && !(parsed.data.paxDelta && parsed.data.paxDelta > 0))
        return res.status(400).json({ message: "add_passengers requires a positive paxDelta" });
      if (parsed.data.requestType === "remove_passengers" && !(parsed.data.paxDelta && parsed.data.paxDelta < 0))
        return res.status(400).json({ message: "remove_passengers requires a negative paxDelta" });
      if (parsed.data.requestType !== "add_passengers" && parsed.data.requestType !== "remove_passengers" && parsed.data.paxDelta != null)
        return res.status(400).json({ message: "paxDelta is only valid for passenger-count changes" });
      const [row] = await db.insert(bookingChangeRequests).values({
        bookingId: booking.id, requestedBy: userId,
        requestType: parsed.data.requestType, details: parsed.data.details,
        paxDelta: parsed.data.paxDelta ?? null,
      }).returning();
      res.status(201).json(row);
    } catch (e) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/change-requests", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, BOOKING_READ_STAFF);
      if (!booking) return;
      const rows = await db.select().from(bookingChangeRequests)
        .where(eq(bookingChangeRequests.bookingId, booking.id))
        .orderBy(desc(bookingChangeRequests.createdAt));
      res.json(rows);
    } catch (e) { routeError(res, e); }
  });

  // Ops resolves a change request. Approving a pax change applies seats + price.
  app.patch("/api/change-requests/:id/resolve", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const parsed = z.object({
        decision: z.enum(["approved", "rejected"]),
        resolutionNotes: z.string().trim().max(2000).optional(),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "decision must be approved or rejected" });
      const id = req.params.id as string;
      const [cr] = await db.select().from(bookingChangeRequests).where(eq(bookingChangeRequests.id, id));
      if (!cr) return res.status(404).json({ message: "Change request not found" });
      if (cr.status !== "pending") return res.status(409).json({ message: `Change request is already ${cr.status}` });
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, cr.bookingId));
      if (!booking) return res.status(404).json({ message: "Booking not found" });

      // Single transaction: claim the pending request first (CAS), then apply
      // capacity + price atomically. Any conflict rolls the whole thing back.
      class ResolveConflict extends Error { constructor(public code: number, message: string) { super(message); } }
      let row;
      try {
        row = await db.transaction(async (tx) => {
          const [claimed] = await tx.update(bookingChangeRequests)
            .set({
              status: parsed.data.decision, resolutionNotes: parsed.data.resolutionNotes ?? null,
              resolvedBy: getUserId(req) ?? null, resolvedAt: new Date(),
            })
            .where(and(eq(bookingChangeRequests.id, id), eq(bookingChangeRequests.status, "pending")))
            .returning();
          if (!claimed) throw new ResolveConflict(409, "Change request was resolved concurrently");

          if (parsed.data.decision === "approved" && cr.paxDelta) {
            const [bkg] = await tx.select().from(bookings).where(eq(bookings.id, cr.bookingId));
            if (!bkg) throw new ResolveConflict(404, "Booking not found");
            const oldPax = bkg.partySizeExpected ?? 0;
            const newPax = oldPax + cr.paxDelta;
            if (newPax < 1) throw new ResolveConflict(400, "Resulting passenger count would be below 1");
            if (bkg.departureId) {
              // Conditional atomic seat update: guards against overselling even
              // when two approvals for the same departure race each other.
              const [dep] = await tx.update(tourDepartures)
                .set({ capacityBooked: sql`GREATEST(0, COALESCE(${tourDepartures.capacityBooked}, 0) + ${cr.paxDelta})` })
                .where(and(
                  eq(tourDepartures.id, bkg.departureId),
                  sql`COALESCE(${tourDepartures.capacityBooked}, 0) + ${cr.paxDelta} <= COALESCE(${tourDepartures.capacityTotal}, 0)`,
                ))
                .returning();
              if (!dep) throw new ResolveConflict(409, "Not enough seats remain on this departure for the requested change");
              const nowBooked = dep.capacityBooked ?? 0;
              const nextStatus = nowBooked >= (dep.capacityTotal ?? 0)
                ? "sold_out"
                : (dep.status === "sold_out" ? "open" : dep.status);
              if (nextStatus !== dep.status)
                await tx.update(tourDepartures).set({ status: nextStatus }).where(eq(tourDepartures.id, dep.id));
            }
            // Scale the total per-person so deposits/balances stay consistent.
            const newTotal = bkg.totalPrice && oldPax > 0
              ? Math.round(bkg.totalPrice * (newPax / oldPax))
              : bkg.totalPrice;
            await tx.update(bookings)
              .set({ partySizeExpected: newPax, totalPrice: newTotal })
              .where(eq(bookings.id, bkg.id));
          }
          return claimed;
        });
      } catch (err) {
        if (err instanceof ResolveConflict) return res.status(err.code).json({ message: err.message });
        throw err;
      }
      await storage.createNotification({
        userId: cr.requestedBy, type: "booking_update",
        title: `Change request ${parsed.data.decision}`,
        message: `Your change request for booking ${booking.bookingCode} was ${parsed.data.decision}.`,
      }).catch(() => {});
      await storage.createAuditLog({
        entityType: "booking_change_request", entityId: id, action: parsed.data.decision,
        changedBy: getUserId(req), previousValue: "pending", newValue: parsed.data.decision,
      }).catch(() => {});
      res.json(row);
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Incident reports
  // =========================================================================

  app.post("/api/bookings/:id/incidents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const bookingId = req.params.id as string;
      const role = await getProfileRole(userId);
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const isStaff = role != null && INCIDENT_CREATE_STAFF.includes(role);
      const isAssignedLeader = role === "tour_leader" && booking.tourLeaderUserId === userId;
      if (!isStaff && !isAssignedLeader) return res.status(404).json({ message: "Booking not found" });
      const parsed = z.object({
        title: z.string().trim().min(1).max(200),
        description: z.string().trim().min(1).max(4000),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid incident" });
      const [row] = await db.insert(incidentReports).values({
        bookingId, reportedBy: userId, title: parsed.data.title,
        description: parsed.data.description, severity: parsed.data.severity ?? "low",
      }).returning();
      // Alert operations staff.
      const opsProfiles = await db.select().from(userProfiles).where(inArray(userProfiles.role, ["operations_manager", "admin"] as any));
      for (const p of opsProfiles.slice(0, 20)) {
        await storage.createNotification({
          userId: p.userId, type: "system",
          title: `Incident: ${parsed.data.title}`,
          message: `New ${row.severity} incident on booking ${booking.bookingCode}.`,
        }).catch(() => {});
      }
      res.status(201).json(row);
    } catch (e) { routeError(res, e); }
  });

  app.get("/api/bookings/:id/incidents", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const bookingId = req.params.id as string;
      const role = await getProfileRole(userId);
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const isStaff = role != null && INCIDENT_CREATE_STAFF.includes(role);
      const isAssignedLeader = role === "tour_leader" && booking.tourLeaderUserId === userId;
      if (!isStaff && !isAssignedLeader) return res.status(404).json({ message: "Booking not found" });
      const rows = await db.select().from(incidentReports)
        .where(eq(incidentReports.bookingId, bookingId))
        .orderBy(desc(incidentReports.createdAt));
      res.json(rows);
    } catch (e) { routeError(res, e); }
  });

  app.patch("/api/incidents/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, OPS_ROLES)) return;
      const parsed = z.object({
        status: z.enum(["acknowledged", "resolved"]),
        resolutionNotes: z.string().trim().max(2000).optional(),
      }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "status must be acknowledged or resolved" });
      const id = req.params.id as string;
      const [existing] = await db.select().from(incidentReports).where(eq(incidentReports.id, id));
      if (!existing) return res.status(404).json({ message: "Incident not found" });
      if (existing.status === "resolved") return res.status(409).json({ message: "Incident is already resolved" });
      const [row] = await db.update(incidentReports)
        .set({
          status: parsed.data.status,
          resolutionNotes: parsed.data.resolutionNotes ?? existing.resolutionNotes,
          ...(parsed.data.status === "resolved" ? { resolvedBy: getUserId(req) ?? null, resolvedAt: new Date() } : {}),
        })
        .where(and(eq(incidentReports.id, id), eq(incidentReports.status, existing.status)))
        .returning();
      if (!row) return res.status(409).json({ message: "Incident was updated concurrently" });
      res.json(row);
    } catch (e) { routeError(res, e); }
  });

  // =========================================================================
  // Operational documents
  // =========================================================================

  // Client-safe booking confirmation (no internal costs / supplier rates).
  app.get("/api/bookings/:id/documents/booking-confirmation", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, BOOKING_READ_STAFF);
      if (!booking) return;
      const tour = booking.tourId ? await storage.getTour(booking.tourId).catch(() => null) : null;
      const [dep] = booking.departureId ? await db.select().from(tourDepartures).where(eq(tourDepartures.id, booking.departureId)) : [null as any];
      const pax = await db.select().from(travelers).where(eq(travelers.bookingId, booking.id));
      const schedule = await db.select().from(bookingPaymentSchedules)
        .where(eq(bookingPaymentSchedules.bookingId, booking.id))
        .orderBy(bookingPaymentSchedules.installmentNumber);
      res.json({
        documentType: "booking_confirmation",
        generatedAt: new Date().toISOString(),
        bookingCode: booking.bookingCode,
        status: booking.status,
        groupName: booking.groupName,
        tour: tour ? { title: (tour as any).title ?? (tour as any).name } : null,
        departure: dep ? { startDate: dep.startDate, endDate: dep.endDate } : null,
        passengerCount: booking.partySizeExpected,
        passengers: pax.map(t => ({ firstName: t.firstName, lastName: t.lastName })),
        totalPrice: booking.totalPrice, currency: booking.currency,
        paymentSchedule: schedule.map(s => ({ label: s.label, amount: s.amount, dueDate: s.dueDate, status: s.status })),
      });
    } catch (e) { routeError(res, e); }
  });

  // Rooming list (staff / assigned tour leader); ?format=csv for export.
  app.get("/api/bookings/:id/documents/rooming-list", isAuthenticated, async (req, res) => {
    try {
      const booking = await staffOrOwnerBooking(req, res, BOOKING_READ_STAFF);
      if (!booking) return;
      const rooms = await db.select().from(bookingRooms).where(eq(bookingRooms.bookingId, booking.id)).orderBy(asc(bookingRooms.label));
      const pax = await db.select().from(travelers).where(eq(travelers.bookingId, booking.id));
      const list = rooms.map(r => ({
        label: r.label, roomType: r.roomType, capacity: r.capacity, notes: r.notes,
        occupants: pax.filter(t => t.roomId === r.id).map(t => `${t.firstName} ${t.lastName}`),
      }));
      const unassigned = pax.filter(t => !t.roomId).map(t => `${t.firstName} ${t.lastName}`);
      if (req.query.format === "csv") {
        const rows = [["Room", "Type", "Capacity", "Occupants", "Notes"],
          ...list.map(r => [r.label, r.roomType, r.capacity, r.occupants.join("; "), r.notes ?? ""])];
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="rooming-list-${booking.bookingCode}.csv"`);
        return res.send(csv(rows));
      }
      res.json({ documentType: "rooming_list", bookingCode: booking.bookingCode, rooms: list, unassigned });
    } catch (e) { routeError(res, e); }
  });

  // Passenger manifest (staff / assigned tour leader); ?format=csv for export.
  app.get("/api/bookings/:id/documents/passenger-manifest", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req)!;
      const role = await getProfileRole(userId);
      const bookingId = req.params.id as string;
      const [booking] = await db.select().from(bookings).where(eq(bookings.id, bookingId));
      if (!booking) return res.status(404).json({ message: "Booking not found" });
      const isStaff = role != null && BOOKING_READ_STAFF.includes(role);
      const isAssignedLeader = role === "tour_leader" && booking.tourLeaderUserId === userId;
      if (!isStaff && !isAssignedLeader) return res.status(404).json({ message: "Booking not found" });
      const pax = await db.select().from(travelers).where(eq(travelers.bookingId, bookingId));
      const manifest = pax.map(t => ({
        firstName: t.firstName, lastName: t.lastName, dob: t.dob, gender: t.gender,
        nationality: t.nationality, passportNumber: t.passportNumber, passportExpiry: t.passportExpiry,
        dietaryNotes: t.dietaryNotes, mobilityNotes: t.mobilityNotes,
        emergencyContactName: t.emergencyContactName, emergencyContactPhone: t.emergencyContactPhone,
      }));
      if (req.query.format === "csv") {
        const rows = [["First name", "Last name", "DOB", "Nationality", "Passport", "Passport expiry", "Dietary", "Mobility", "Emergency contact", "Emergency phone"],
          ...manifest.map(m => [m.firstName, m.lastName, m.dob, m.nationality, m.passportNumber, m.passportExpiry, m.dietaryNotes, m.mobilityNotes, m.emergencyContactName, m.emergencyContactPhone])];
        res.setHeader("Content-Type", "text/csv");
        res.setHeader("Content-Disposition", `attachment; filename="manifest-${booking.bookingCode}.csv"`);
        return res.send(csv(rows));
      }
      res.json({ documentType: "passenger_manifest", bookingCode: booking.bookingCode, passengers: manifest });
    } catch (e) { routeError(res, e); }
  });
}
