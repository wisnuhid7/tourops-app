import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, boolean, timestamp, pgEnum, json, jsonb, index, uniqueIndex, numeric, decimal, check } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export * from "./auth";

// Drizzle numeric() columns are typed as string in insert schemas, and
// drizzle-zod does not check that the string is actually a valid number.
// Without this, "abc" passes zod validation and only fails at the database
// with a 500 that leaks the SQL statement, and "-5" is stored as a negative
// price. Use this for optional non-negative money fields on rate cards.
// Strict decimal grammar: only plain non-negative decimal literals valid as
// PostgreSQL `numeric` input (no hex/binary/octal/exponent/sign that Number() accepts).
const MONEY_RE = /^\d+(\.\d+)?$/;
const isMoney = (v: string) => MONEY_RE.test(v.trim());

const optionalMoneyString = z
  .string()
  .refine((v) => isMoney(v), { message: "must be a non-negative number" })
  .nullable()
  .optional();

const requiredMoneyString = z
  .string()
  .refine((v) => isMoney(v), { message: "must be a non-negative number" });

export const userRoleEnum = pgEnum("user_role", [
  "super_admin",
  "admin",
  // Legacy value kept so publish-time migration can cast old production rows;
  // remapped to "tour_leader" by POST /api/admin/migrate-legacy-roles.
  "travel_agent",
  "customer",
  "airline_supplier",
  "country_manager",
  "city_manager",
  "hotel_manager",
  "transport_manager",
  "guide_manager",
  "sights_manager",
  "content_editor",
  "flight_agent",
  "tour_builder",
  "supplier",
  "tour_leader",
  "accounting",
  "operations_manager",
  "support_agent",
]);

// Client account classification for customer-role profiles (who they book for).
export const clientAccountTypeEnum = pgEnum("client_account_type", [
  "individual",
  "family_organizer",
  "group_organizer",
  "tour_leader",
  "organization",
]);

export const userProfiles = pgTable("user_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull(),
  role: userRoleEnum("role").notNull().default("customer"),
  // Only meaningful for customer-role profiles; staff/supplier profiles leave it null.
  accountType: clientAccountTypeEnum("account_type"),
  phone: text("phone"),
  companyName: text("company_name"),
  countryCode: text("country_code"),
  cityId: varchar("city_id"),
  transportCompanyId: varchar("transport_company_id"),
  isTourLeader: boolean("is_tour_leader").default(false),
  isActive: boolean("is_active").default(true),
}, (table) => ({
  userIdIdx: index("user_profiles_user_id_idx").on(table.userId),
}));

export const insertUserProfileSchema = createInsertSchema(userProfiles).omit({ id: true });

export type InsertUserProfile = z.infer<typeof insertUserProfileSchema>;
export type UserProfile = typeof userProfiles.$inferSelect;

export const departureStatusEnum = pgEnum("departure_status", ["open", "closed", "sold_out", "cancelled"]);

export const tours = pgTable("tours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  slug: text("slug").unique().notNull(),
  description: text("description"),
  highlights: text("highlights"),
  inclusions: text("inclusions"),
  exclusions: text("exclusions"),
  imageUrl: text("image_url"),
  galleryUrls: text("gallery_urls").array(),
  duration: integer("duration").notNull().default(1),
  basePrice: numeric("base_price").notNull().default("0"),
  markupAmount: numeric("markup_amount").notNull().default("0"),
  totalPrice: numeric("total_price").notNull().default("0"),
  isPriceConfirmed: boolean("is_price_confirmed").notNull().default(false),
  childPrice: numeric("child_price"),
  singleSupplement: numeric("single_supplement"),
  countries: text("countries").array(),
  tags: text("tags").array(),
  category: text("category"),
  internalNotes: text("internal_notes"),
  translations: jsonb("translations"),
  isPublished: boolean("is_published").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  categoryIdx: index("tours_category_idx").on(table.category),
  publishedIdx: index("tours_published_idx").on(table.isPublished),
}));

/** Numeric columns serialize as strings; guard against negative price values (TOUR-01). */
const PRICE_STRING_RE = /^\d+(\.\d+)?$/; // strict non-negative decimal (rejects "12abc", "0x10", "-1")
const nonNegativePriceString = (s: z.ZodString) =>
  s.refine((v) => PRICE_STRING_RE.test(v), {
    message: "Price must be a non-negative number",
  });

export const insertTourSchema = createInsertSchema(tours, {
  basePrice: (s) => nonNegativePriceString(s),
  childPrice: (s) => nonNegativePriceString(s),
  markupAmount: (s) => nonNegativePriceString(s),
  totalPrice: (s) => nonNegativePriceString(s),
  singleSupplement: (s) => nonNegativePriceString(s),
})
  .omit({ id: true, createdAt: true, updatedAt: true })
  .superRefine((t, ctx) => {
    // TOUR-02: child price must never exceed adult (base) price at the data layer.
    const base = t.basePrice != null ? parseFloat(t.basePrice) : null;
    const child = t.childPrice != null ? parseFloat(t.childPrice) : null;
    if (base != null && child != null && Number.isFinite(base) && Number.isFinite(child) && child > base) {
      ctx.addIssue({
        code: "custom",
        path: ["childPrice"],
        message: "Child price cannot exceed the adult base price",
      });
    }
  });
export type InsertTour = z.infer<typeof insertTourSchema>;
export type Tour = typeof tours.$inferSelect;

export const tourDays = pgTable("tour_days", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tourId: varchar("tour_id").notNull(),
  dayNumber: integer("day_number").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  countryCode: text("country_code"),
  city: text("city"),
  activities: text("activities"),
  imageUrl: text("image_url"),
  translations: jsonb("translations"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tourIdIdx: index("tour_days_tour_id_idx").on(table.tourId),
}));

export const insertTourDaySchema = createInsertSchema(tourDays).omit({ id: true, createdAt: true });
export type InsertTourDay = z.infer<typeof insertTourDaySchema>;
export type TourDay = typeof tourDays.$inferSelect;

export const tourDayItems = pgTable("tour_day_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tourDayId: varchar("tour_day_id").notNull(),
  itemType: text("item_type").notNull(), // 'arrival', 'departure', 'sight', 'hotel', 'guide', 'meal', 'transport', 'flight', 'custom'
  startTime: text("start_time"),
  endTime: text("end_time"),
  title: text("title").notNull(),
  description: text("description"),
  cost: numeric("cost").notNull().default("0"),
  currency: text("currency").notNull().default("USD"),
  sightId: varchar("sight_id"),
  hotelId: varchar("hotel_id"),
  guideId: varchar("guide_id"),
  flightSnapshotId: varchar("flight_snapshot_id"),
  hotelSnapshotId: varchar("hotel_snapshot_id"),
  isOptional: boolean("is_optional").notNull().default(false),
  bookingRequired: boolean("booking_required").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  // Per-language translated copies of text fields: { es: { title, ... }, id: { ... } }
  translations: jsonb("translations"),
}, (table) => ({
  dayIdIdx: index("tour_day_items_day_id_idx").on(table.tourDayId),
}));

export const insertTourDayItemSchema = createInsertSchema(tourDayItems, {
  cost: () => z.union([z.string(), z.number()]).transform((v) => String(v)),
}).omit({ id: true });
export type InsertTourDayItem = z.infer<typeof insertTourDayItemSchema>;
export type TourDayItem = typeof tourDayItems.$inferSelect;

export const tourDepartures = pgTable("tour_departures", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tourId: varchar("tour_id").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  capacityTotal: integer("capacity_total").notNull().default(20),
  capacityBooked: integer("capacity_booked").default(0),
  departureAirportId: varchar("departure_airport_id"),
  arrivalAirportId: varchar("arrival_airport_id"),
  status: departureStatusEnum("status").default("open"),
  publicJoinEnabled: boolean("public_join_enabled").default(true),
  bookingCutoffDate: text("booking_cutoff_date"),
  pricePerPerson: integer("price_per_person"),
  notes: text("notes"),
}, (table) => ({
  tourIdIdx: index("tour_departures_tour_id_idx").on(table.tourId),
  statusIdx: index("tour_departures_status_idx").on(table.status),
  capacityCheck: check("tour_departures_capacity_check", sql`${table.capacityBooked} <= ${table.capacityTotal}`),
}));

export const insertTourDepartureSchema = createInsertSchema(tourDepartures, {
  // Data-integrity guards: capacity must be a positive seat count and price
  // (when set) must never be negative.
  capacityTotal: (s) => s.int().min(1),
  capacityBooked: (s) => s.int().min(0),
  pricePerPerson: (s) => s.int().min(0),
}).omit({ id: true });
export type InsertTourDeparture = z.infer<typeof insertTourDepartureSchema>;
export type TourDeparture = typeof tourDepartures.$inferSelect;

export const bookingTypeEnum = pgEnum("booking_type", [
  "leader_group",
  "join_leader_group",
  "join_public_group",
  "private_family",
  "custom_leader",
  "custom_family",
]);

export const bookingStatusEnum = pgEnum("booking_status", [
  "draft",
  "submitted",
  "pending_payment",
  "confirmed",
  "cancelled",
  "cancelled_unpaid",
  "cancelled_by_customer",
  "cancelled_by_operator",
  "expired",
  "completed",
]);
export const fulfillmentStatusEnum = pgEnum("fulfillment_status", ["pending", "in_progress", "blocked", "completed"]);

export type RoomAllocation = { roomType: string; count: number };

export const bookings = pgTable("bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingCode: text("booking_code").notNull().unique(),
  tourId: varchar("tour_id"),
  departureId: varchar("departure_id"),
  customerId: varchar("customer_id").notNull(),
  bookingType: bookingTypeEnum("booking_type").notNull(),
  groupName: text("group_name"),
  leaderUserId: varchar("leader_user_id"),
  // Professional tour leader (role=tour_leader) assigned by operations; distinct
  // from leaderUserId, which is the customer-side group leader.
  tourLeaderUserId: varchar("tour_leader_user_id"),
  joinCode: text("join_code").unique(),
  partySizeExpected: integer("party_size_expected").default(1),
  status: bookingStatusEnum("status").default("submitted"),
  fulfillmentStatus: fulfillmentStatusEnum("fulfillment_status").default("pending"),
  totalPrice: integer("total_price"),
  currency: text("currency").default("USD"),
  // Customer's chosen room type (matrimonial | doble | triple) and the
  // server-computed accommodation cost (selected room rate × tour nights).
  roomType: text("room_type"),
  accommodationCost: numeric("accommodation_cost"),
  notes: text("notes"),
  internalNotes: text("internal_notes"),
  isUrgent: boolean("is_urgent").default(false),
  affiliateId: varchar("affiliate_id"),
  departureCity: text("departure_city"),
  departureAirportId: varchar("departure_airport_id"),
  holdExpiresAt: timestamp("hold_expires_at"),
  idempotencyKey: varchar("idempotency_key"),
  requestHash: text("request_hash"),
  roomAllocations: jsonb("room_allocations").$type<Array<RoomAllocation>>(),
  singleSupplementCost: numeric("single_supplement_cost"),
  departureSurcharge: numeric("departure_surcharge"),
  discountAmount: numeric("discount_amount"),
  taxAmount: numeric("tax_amount"),
  serviceFeeAmount: numeric("service_fee_amount"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  customerIdIdx: index("bookings_customer_id_idx").on(table.customerId),
  tourIdIdx: index("bookings_tour_id_idx").on(table.tourId),
  departureIdIdx: index("bookings_departure_id_idx").on(table.departureId),
  codeIdx: index("bookings_code_idx").on(table.bookingCode),
  statusIdx: index("bookings_status_idx").on(table.status),
  idempotencyKeyIdx: uniqueIndex("bookings_idempotency_key_idx").on(table.idempotencyKey),
  holdExpiresAtIdx: index("bookings_hold_expires_at_idx").on(table.holdExpiresAt),
}));

export const insertBookingSchema = createInsertSchema(bookings).omit({ id: true, createdAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookings.$inferSelect;

export const travelers = pgTable("travelers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  dob: text("dob"),
  nationality: text("nationality"),
  passportNumber: text("passport_number"),
  passportExpiry: text("passport_expiry"),
  gender: text("gender"),
  specialNeeds: text("special_needs"),
  // Passenger portal / profile-completion fields
  email: text("email"),
  phone: text("phone"),
  dietaryNotes: text("dietary_notes"),
  mobilityNotes: text("mobility_notes"),
  emergencyContactName: text("emergency_contact_name"),
  emergencyContactPhone: text("emergency_contact_phone"),
  roomingPreference: text("rooming_preference"),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  // Linked passenger login account (users.id) once an invitation is accepted.
  userId: varchar("user_id"),
  // Assigned room (booking_rooms.id) on the rooming list.
  roomId: varchar("room_id"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  bookingIdIdx: index("travelers_booking_id_idx").on(table.bookingId),
  userIdIdx: index("travelers_user_id_idx").on(table.userId),
}));

export const insertTravelerSchema = createInsertSchema(travelers).omit({ id: true, createdAt: true });
export type InsertTraveler = z.infer<typeof insertTravelerSchema>;
export type Traveler = typeof travelers.$inferSelect;

export const serviceTypeEnum = pgEnum("service_type", ["airline", "hotel", "transport", "guide", "sights"]);
export const assignmentStatusEnum = pgEnum("assignment_status", ["assigned", "reassigned", "unassigned"]);

export const bookingAssignments = pgTable("booking_assignments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  countryCode: text("country_code"),
  serviceType: serviceTypeEnum("service_type").notNull(),
  assignedUserId: varchar("assigned_user_id"),
  assignedBy: varchar("assigned_by"),
  status: assignmentStatusEnum("assignment_status").default("assigned"),
  notes: text("notes"),
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => ({
  bookingIdIdx: index("booking_assignments_booking_id_idx").on(table.bookingId),
  assignedUserIdx: index("booking_assignments_assigned_user_id_idx").on(table.assignedUserId),
}));

export const insertBookingAssignmentSchema = createInsertSchema(bookingAssignments).omit({ id: true, assignedAt: true });
export type InsertBookingAssignment = z.infer<typeof insertBookingAssignmentSchema>;
export type BookingAssignment = typeof bookingAssignments.$inferSelect;

export const workflowStatusEnum = pgEnum("workflow_status", ["not_assigned", "assigned", "in_progress", "blocked", "completed", "cancelled"]);

export const bookingWorkflows = pgTable("booking_workflows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  countryCode: text("country_code"),
  serviceType: serviceTypeEnum("service_type").notNull(),
  assignedUserId: varchar("assigned_user_id"),
  status: workflowStatusEnum("workflow_status").default("not_assigned"),
  currentStep: text("current_step"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bookingIdIdx: index("booking_workflows_booking_id_idx").on(table.bookingId),
  assignedUserIdx: index("booking_workflows_assigned_user_id_idx").on(table.assignedUserId),
  statusIdx: index("booking_workflows_status_idx").on(table.status),
}));

export const insertBookingWorkflowSchema = createInsertSchema(bookingWorkflows).omit({ id: true, updatedAt: true });
export type InsertBookingWorkflow = z.infer<typeof insertBookingWorkflowSchema>;
export type BookingWorkflow = typeof bookingWorkflows.$inferSelect;

export const stepStatusEnum = pgEnum("step_status", ["pending", "done", "skipped", "blocked"]);

export const workflowSteps = pgTable("workflow_steps", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  workflowId: varchar("workflow_id").notNull(),
  stepOrder: integer("step_order").notNull(),
  stepCode: text("step_code").notNull(),
  stepName: text("step_name").notNull(),
  status: stepStatusEnum("step_status").default("pending"),
  updatedBy: varchar("updated_by"),
  notes: text("notes"),
  dueDate: text("due_date"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  workflowIdIdx: index("workflow_steps_workflow_id_idx").on(table.workflowId),
  statusIdx: index("workflow_steps_status_idx").on(table.status),
}));

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // e.g. 'booking', 'workflow', 'payment'
  entityId: varchar("entity_id").notNull(),
  action: text("action").notNull(), // e.g. 'status_changed', 'created', 'updated'
  changedBy: varchar("changed_by"),
  changedByName: text("changed_by_name"),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  entityTypeIdx: index("audit_logs_entity_type_idx").on(table.entityType),
  entityIdIdx: index("audit_logs_entity_id_idx").on(table.entityId),
}));
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const insertWorkflowStepSchema = createInsertSchema(workflowSteps).omit({ id: true, updatedAt: true });
export type InsertWorkflowStep = z.infer<typeof insertWorkflowStepSchema>;
export type WorkflowStep = typeof workflowSteps.$inferSelect;

export const docTypeEnum = pgEnum("doc_type", [
  "passport", "id_doc", "visa",
  "eticket", "pnr", "hotel_confirm", "voucher",
  "transport_confirm", "guide_confirm", "sight_ticket",
  "quote", "receipt", "other",
]);

export const docStatusEnum = pgEnum("doc_status", ["uploaded", "approved", "rejected"]);

export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  travelerId: varchar("traveler_id"),
  workflowStepId: varchar("workflow_step_id"),
  docType: docTypeEnum("doc_type").notNull(),
  fileName: text("file_name").notNull(),
  fileUrl: text("file_url"),
  uploadedBy: varchar("uploaded_by"),
  status: docStatusEnum("doc_status").default("uploaded"),
  reviewedBy: varchar("reviewed_by"),
  reviewNotes: text("review_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

export const messageVisibilityEnum = pgEnum("message_visibility", ["customer_visible", "internal_only"]);

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  workflowId: varchar("workflow_id"),
  senderUserId: varchar("sender_user_id").notNull(),
  senderName: text("sender_name"),
  visibility: messageVisibilityEnum("message_visibility").default("customer_visible"),
  messageText: text("message_text").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

// "processing" = provider is still working on it (async confirmation);
// "partially_refunded" complements the legacy "refunded" (full) value.
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "processing", "paid", "failed", "canceled", "refunded", "partially_refunded"]);
export const paymentMethodEnum = pgEnum("payment_method", ["bank_transfer", "card", "cash", "other"]);
export const refundStatusEnum = pgEnum("refund_status", ["none", "pending", "partial", "full", "failed"]);

// All monetary columns on payments/refunds match booking currency units (e.g. USD).
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  customerId: varchar("customer_id"),
  invoiceId: varchar("invoice_id"),
  provider: text("provider").default("manual"), // 'manual' | 'offline_test' | 'stripe' (future)
  paymentIntentId: text("payment_intent_id"),
  transactionId: text("transaction_id"),
  amount: integer("amount").notNull(), // grand total charged, whole currency units
  subtotal: integer("subtotal"),
  taxes: integer("taxes").default(0),
  fees: integer("fees").default(0),
  discount: integer("discount").default(0),
  refundedAmount: integer("refunded_amount").default(0),
  currency: text("currency").default("USD"),
  method: paymentMethodEnum("payment_method").default("bank_transfer"),
  status: paymentStatusEnum("payment_status").default("pending"),
  refundStatus: refundStatusEnum("refund_status").default("none"),
  receiptUrl: text("receipt_url"),
  metadata: jsonb("metadata"),
  notes: text("notes"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("payments_booking_idx").on(table.bookingId),
  intentIdx: index("payments_intent_idx").on(table.paymentIntentId),
}));

export const insertPaymentSchema = createInsertSchema(payments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

export const refundStateEnum = pgEnum("refund_state", ["pending", "succeeded", "failed"]);

export const refunds = pgTable("refunds", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  paymentId: varchar("payment_id").notNull(),
  bookingId: varchar("booking_id").notNull(),
  provider: text("provider").notNull(),
  providerRefundId: text("provider_refund_id"),
  amount: integer("amount").notNull(), // cents
  currency: text("currency").default("USD"),
  reason: text("reason").notNull(),
  notes: text("notes"),
  status: refundStateEnum("status").default("pending"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  paymentIdx: index("refunds_payment_idx").on(table.paymentId),
}));

export const insertRefundSchema = createInsertSchema(refunds).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRefund = z.infer<typeof insertRefundSchema>;
export type Refund = typeof refunds.$inferSelect;

// Webhook/event ledger: the (provider, eventId) unique key makes webhook
// processing idempotent — duplicate deliveries insert-conflict and are skipped.
export const paymentEvents = pgTable("payment_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  provider: text("provider").notNull(),
  eventId: text("event_id").notNull(),
  type: text("type").notNull(),
  paymentId: varchar("payment_id"),
  payload: jsonb("payload"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  providerEventUnique: uniqueIndex("payment_events_provider_event_unique").on(table.provider, table.eventId),
}));

export type PaymentEvent = typeof paymentEvents.$inferSelect;

export const countries = pgTable("countries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(), // ISO2
  iso3: text("iso3"),
  name: text("name").notNull(),
  capitalCity: text("capital_city"),
  continent: text("continent"),
  region: text("region"),
  subregion: text("subregion"),
  currencyCode: text("currency_code"),
  currencyName: text("currency_name"),
  languages: text("languages").array(),
  phoneCode: text("phone_code"),
  flagUrl: text("flag_url"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  population: integer("population"),
  sourceName: text("source_name"),
  sourceExternalId: text("source_external_id"),
  lastSyncedAt: timestamp("last_synced_at"),
  isActive: boolean("is_active").default(true),
});
export const insertCountrySchema = createInsertSchema(countries).omit({ id: true });
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type Country = typeof countries.$inferSelect;

export const cities = pgTable("cities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  asciiName: text("ascii_name"),
  alternateNames: text("alternate_names").array(),
  countryId: varchar("country_id").notNull(),
  population: integer("population"),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  timezone: text("timezone"),
  geonameId: text("geoname_id"),
  osmId: text("osm_id"),
  cityRank: integer("city_rank").default(0),
  isCapital: boolean("is_capital").default(false),
  isTourismCity: boolean("is_tourism_city").default(false),
  isAirportCity: boolean("is_airport_city").default(false),
  isActive: boolean("is_active").default(true),
  sourceName: text("source_name"),
  lastSyncedAt: timestamp("last_synced_at"),
});
export const insertCitySchema = createInsertSchema(cities).omit({ id: true });
export type InsertCity = z.infer<typeof insertCitySchema>;
export type City = typeof cities.$inferSelect;

export const airports = pgTable("airports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  cityId: varchar("city_id").notNull(),
  isActive: boolean("is_active").default(true),
});
export const insertAirportSchema = createInsertSchema(airports).omit({ id: true });
export type InsertAirport = z.infer<typeof insertAirportSchema>;
export type Airport = typeof airports.$inferSelect;

export const sightCategoryEnum = pgEnum("sight_category", ["museum", "landmark", "park", "religious", "entertainment", "nature", "historical", "other"]);

export const sights = pgTable("sights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").unique(),
  cityId: varchar("city_id").notNull(),
  status: varchar("status", { enum: ["draft", "approved", "published"] }).default("draft"),
  description: text("description"),
  descriptionShort: text("description_short"),
  longDescription: text("long_description"),
  category: sightCategoryEnum("sight_category").default("other"),
  subcategories: text("subcategories").array(),
  latitude: numeric("latitude"),
  longitude: numeric("longitude"),
  officialWebsite: text("official_website"),
  phone: text("phone"),
  email: text("email"),
  openingHoursRaw: text("opening_hours_raw"),
  openingHoursStructured: jsonb("opening_hours_structured"),
  ticketRequired: boolean("ticket_required").default(false),
  individualTicketCost: numeric("individual_ticket_cost"),
  ticketCostChild: numeric("ticket_cost_child"),
  groupTicketCost: numeric("group_ticket_cost"),
  ticketCurrency: text("ticket_currency").default("USD"),
  isFree: boolean("is_free").default(false),
  estimatedDuration: text("estimated_duration"),
  bestTimeToVisit: text("best_time_to_visit"),
  imageUrl: text("image_url"),
  address: text("address"),
  accessibilityNotes: text("accessibility_notes"),
  dressCode: text("dress_code"),
  safetyNotes: text("safety_notes"),
  bookingRequired: boolean("booking_required").default(false),
  sourceName: text("source_name"),
  sourceExternalId: text("source_external_id"),
  sourceUrl: text("source_url"),
  dataQualityScore: integer("data_quality_score").default(0),
  lastSyncedAt: timestamp("last_synced_at"),
  isActive: boolean("is_active").default(true),
});

export const insertSightSchema = createInsertSchema(sights).omit({ id: true });
export type InsertSight = z.infer<typeof insertSightSchema>;
export type Sight = typeof sights.$inferSelect;

export const hotels = pgTable("hotels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  cityId: varchar("city_id").notNull(),
  address: text("address"),
  googleMapsUrl: text("google_maps_url"),
  description: text("description"),
  slug: text("slug").unique(),
  status: varchar("status", { enum: ["draft", "approved", "published"] }).default("draft"),
  createdBy: varchar("created_by"), // owning hotel_manager; null = admin/unassigned
  starRating: integer("star_rating"),
  guestRating: numeric("guest_rating"),
  reviewCount: integer("review_count").default(0),
  amenities: text("amenities").array(),
  roomTypes: jsonb("room_types"),
  // Direct per-night room rates (registered by admin / hotel manager and
  // consumed by the pricing engine + customer-facing views).
  roomRateMatrimonial: numeric("room_rate_matrimonial"), // Habitación Matrimonial $/night
  roomRateDouble: numeric("room_rate_double"),           // Habitación Doble $/night
  roomRateTriple: numeric("room_rate_triple"),           // Habitación Triple $/night
  checkinTime: text("checkin_time"),
  checkoutTime: text("checkout_time"),
  hotelPolicy: text("hotel_policy"),
  cancellationPolicy: text("cancellation_policy"),
  basePrice: numeric("base_price"),
  estimatedPriceMin: numeric("estimated_price_min"),
  estimatedPriceMax: numeric("estimated_price_max"),
  currency: text("currency").default("USD"),
  imageUrl: text("image_url"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  website: text("website"),
  sourceHotelId: text("source_hotel_id"),
  affiliateUrl: text("affiliate_url"),
  lastPriceCheckedAt: timestamp("last_price_checked_at"),
  isActive: boolean("is_active").default(true),
  // Per-language translated copies of text fields: { es: { description, ... }, id: { ... } }
  translations: jsonb("translations"),
});

export const insertHotelSchema = createInsertSchema(hotels).omit({ id: true });
export type InsertHotel = z.infer<typeof insertHotelSchema>;
export type Hotel = typeof hotels.$inferSelect;

export const transportCompanies = pgTable("transport_companies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  countryId: varchar("country_id"),
  vehicleTypes: text("vehicle_types").array(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  bankName: text("bank_name"),
  bankAccountNumber: text("bank_account_number"),
  bankSwift: text("bank_swift"),
  bankIban: text("bank_iban"),
  taxId: text("tax_id"),
  notes: text("notes"),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by"),
});
export const insertTransportCompanySchema = createInsertSchema(transportCompanies).omit({ id: true });
export type InsertTransportCompany = z.infer<typeof insertTransportCompanySchema>;
export type TransportCompany = typeof transportCompanies.$inferSelect;

export const busTypes = pgTable("bus_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  name: text("name").notNull(),
  seats: integer("seats").notNull(),
  costPerDay: numeric("cost_per_day"),
  costPerMile: numeric("cost_per_mile"),
  description: text("description"),
  isActive: boolean("is_active").default(true),
}, (table) => ({
  companyIdIdx: index("bus_types_company_id_idx").on(table.companyId),
}));
export const insertBusTypeSchema = createInsertSchema(busTypes).omit({ id: true });
export type InsertBusType = z.infer<typeof insertBusTypeSchema>;
export type BusType = typeof busTypes.$inferSelect;

export const transportRoutes = pgTable("transport_routes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  fromCity: text("from_city"),
  toCity: text("to_city"),
  distanceMiles: numeric("distance_miles"),
  isActive: boolean("is_active").default(true),
}, (table) => ({
  companyIdIdx: index("transport_routes_company_id_idx").on(table.companyId),
}));
export const insertTransportRouteSchema = createInsertSchema(transportRoutes).omit({ id: true });
export type InsertTransportRoute = z.infer<typeof insertTransportRouteSchema>;
export type TransportRoute = typeof transportRoutes.$inferSelect;

export const transportRoutePricing = pgTable("transport_route_pricing", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  routeId: varchar("route_id").notNull(),
  busTypeId: varchar("bus_type_id").notNull(),
  costPerTrip: numeric("cost_per_trip").notNull(),
  notes: text("notes"),
}, (table) => ({
  routeIdIdx: index("transport_route_pricing_route_id_idx").on(table.routeId),
}));
export const insertTransportRoutePricingSchema = createInsertSchema(transportRoutePricing).omit({ id: true });
export type InsertTransportRoutePricing = z.infer<typeof insertTransportRoutePricingSchema>;
export type TransportRoutePricing = typeof transportRoutePricing.$inferSelect;

export const transportBookingStatusEnum = pgEnum("transport_booking_status", ["requested", "confirmed", "cancelled", "completed"]);

export const transportBookings = pgTable("transport_bookings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id"),
  tourId: varchar("tour_id"),
  companyId: varchar("company_id").notNull(),
  routeId: varchar("route_id"),
  busTypeId: varchar("bus_type_id"),
  serviceDate: text("service_date"),
  serviceEndDate: text("service_end_date"),
  status: transportBookingStatusEnum("status").default("requested"),
  costQuoted: numeric("cost_quoted"),
  confirmedAt: timestamp("confirmed_at"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("transport_bookings_company_id_idx").on(table.companyId),
  createdAtIdx: index("transport_bookings_created_at_idx").on(table.createdAt),
}));
export const insertTransportBookingSchema = createInsertSchema(transportBookings).omit({ id: true, createdAt: true, confirmedAt: true });
export type InsertTransportBooking = z.infer<typeof insertTransportBookingSchema>;
export type TransportBooking = typeof transportBookings.$inferSelect;

export const transportInvoiceStatusEnum = pgEnum("transport_invoice_status", ["submitted", "approved", "paid", "rejected"]);

export const transportInvoices = pgTable("transport_invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  transportBookingId: varchar("transport_booking_id"),
  invoiceNumber: text("invoice_number").notNull(),
  serviceDetails: text("service_details"),
  amount: numeric("amount").notNull(),
  status: transportInvoiceStatusEnum("status").default("submitted"),
  submittedAt: timestamp("submitted_at").defaultNow(),
  approvedAt: timestamp("approved_at"),
  notes: text("notes"),
}, (table) => ({
  companyIdIdx: index("transport_invoices_company_id_idx").on(table.companyId),
  submittedAtIdx: index("transport_invoices_submitted_at_idx").on(table.submittedAt),
}));
export const insertTransportInvoiceSchema = createInsertSchema(transportInvoices).omit({ id: true, submittedAt: true, approvedAt: true });
export type InsertTransportInvoice = z.infer<typeof insertTransportInvoiceSchema>;
export type TransportInvoice = typeof transportInvoices.$inferSelect;

export const transportPayments = pgTable("transport_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyId: varchar("company_id").notNull(),
  invoiceId: varchar("invoice_id"),
  tourId: varchar("tour_id"),
  amount: numeric("amount").notNull(),
  paymentDate: text("payment_date"),
  paymentMethod: text("payment_method"),
  reference: text("reference"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  companyIdIdx: index("transport_payments_company_id_idx").on(table.companyId),
  createdAtIdx: index("transport_payments_created_at_idx").on(table.createdAt),
}));
export const insertTransportPaymentSchema = createInsertSchema(transportPayments).omit({ id: true, createdAt: true });
export type InsertTransportPayment = z.infer<typeof insertTransportPaymentSchema>;
export type TransportPayment = typeof transportPayments.$inferSelect;

export const airlineAgencies = pgTable("airline_agencies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  countryIds: text("country_ids").array(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  website: text("website"),
  specializations: text("specializations").array(),
  isActive: boolean("is_active").default(true),
  createdBy: varchar("created_by"),
});
export const insertAirlineAgencySchema = createInsertSchema(airlineAgencies).omit({ id: true });
export type InsertAirlineAgency = z.infer<typeof insertAirlineAgencySchema>;
export type AirlineAgency = typeof airlineAgencies.$inferSelect;

export const rateStatusEnum = pgEnum("rate_status", ["draft", "active", "archived"]);

export const hotelRates = pgTable("hotel_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: text("country_code"),
  city: text("city"),
  hotelId: varchar("hotel_id").references(() => hotels.id, { onDelete: "set null" }),
  hotelName: text("hotel_name").notNull(),
  hotelCode: text("hotel_code"),
  roomType: text("room_type"),
  mealPlan: text("meal_plan"),
  currency: text("currency").default("USD"),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  pricePerRoomPerNight: numeric("price_per_room_per_night"),
  taxIncluded: boolean("tax_included").default(false),
  minNights: integer("min_nights"),
  blackoutDates: text("blackout_dates"),
  notes: text("notes"),
  status: rateStatusEnum("status").default("draft"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertHotelRateSchema = createInsertSchema(hotelRates).omit({ id: true, createdAt: true }).extend({ pricePerRoomPerNight: optionalMoneyString });
export type InsertHotelRate = z.infer<typeof insertHotelRateSchema>;
export type HotelRate = typeof hotelRates.$inferSelect;

export const transportRates = pgTable("transport_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: text("country_code"),
  cityBase: text("city_base"),
  vendorName: text("vendor_name").notNull(),
  vendorCode: text("vendor_code"),
  vehicleType: text("vehicle_type"),
  seatCapacity: integer("seat_capacity"),
  rateMode: text("rate_mode"),
  currency: text("currency").default("USD"),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  basePrice: numeric("base_price"),
  includedHours: integer("included_hours"),
  includedKm: integer("included_km"),
  overtimePerHour: numeric("overtime_per_hour"),
  extraPerKm: numeric("extra_per_km"),
  routeFromCity: text("route_from_city"),
  routeToCity: text("route_to_city"),
  notes: text("notes"),
  status: rateStatusEnum("status").default("draft"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertTransportRateSchema = createInsertSchema(transportRates).omit({ id: true, createdAt: true }).extend({ basePrice: optionalMoneyString, overtimePerHour: optionalMoneyString, extraPerKm: optionalMoneyString });
export type InsertTransportRate = z.infer<typeof insertTransportRateSchema>;
export type TransportRate = typeof transportRates.$inferSelect;

export const guideRates = pgTable("guide_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: text("country_code"),
  cityBase: text("city_base"),
  guideName: text("guide_name").notNull(),
  guideCode: text("guide_code"),
  language: text("language"),
  email: text("email"),
  phone: text("phone"),
  photoUrl: text("photo_url"),
  age: integer("age"),
  rateUnit: text("rate_unit"),
  currency: text("currency").default("USD"),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  price: numeric("price"),
  licenseLevel: text("license_level"),
  notes: text("notes"),
  status: rateStatusEnum("status").default("draft"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  // Per-language translated copies of text fields: { es: { language, notes }, id: { ... } }
  translations: jsonb("translations"),
});
export const insertGuideRateSchema = createInsertSchema(guideRates).omit({ id: true, createdAt: true }).extend({ price: optionalMoneyString });
export type InsertGuideRate = z.infer<typeof insertGuideRateSchema>;
export type GuideRate = typeof guideRates.$inferSelect;

export const sightsRates = pgTable("sights_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: text("country_code"),
  city: text("city"),
  attractionName: text("attraction_name").notNull(),
  attractionCode: text("attraction_code"),
  ticketType: text("ticket_type"),
  currency: text("currency").default("USD"),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  pricePerPerson: numeric("price_per_person"),
  requiresTimeslot: boolean("requires_timeslot").default(false),
  notes: text("notes"),
  status: rateStatusEnum("status").default("draft"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertSightsRateSchema = createInsertSchema(sightsRates).omit({ id: true, createdAt: true }).extend({ pricePerPerson: optionalMoneyString });
export type InsertSightsRate = z.infer<typeof insertSightsRateSchema>;
export type SightsRate = typeof sightsRates.$inferSelect;

export const airlineRates = pgTable("airline_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryCode: text("country_code"),
  routeFrom: text("route_from"),
  routeTo: text("route_to"),
  airlineName: text("airline_name").notNull(),
  airlineCode: text("airline_code"),
  cabinClass: text("cabin_class"),
  currency: text("currency").default("USD"),
  validFrom: text("valid_from"),
  validTo: text("valid_to"),
  price: numeric("price"),
  baggageAllowance: text("baggage_allowance"),
  notes: text("notes"),
  status: rateStatusEnum("status").default("draft"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});
export const insertAirlineRateSchema = createInsertSchema(airlineRates).omit({ id: true, createdAt: true }).extend({ price: optionalMoneyString });
export type InsertAirlineRate = z.infer<typeof insertAirlineRateSchema>;
export type AirlineRate = typeof airlineRates.$inferSelect;

export const invoiceStatusEnum = pgEnum("invoice_status", ["draft", "sent", "paid", "cancelled"]);

export const invoices = pgTable("invoices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  amount: integer("amount").notNull(),
  currency: text("currency").default("USD"),
  status: invoiceStatusEnum("status").default("draft"),
  dueDate: text("due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertInvoiceSchema = createInsertSchema(invoices).omit({ id: true, createdAt: true });
export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = z.infer<typeof insertInvoiceSchema>;

export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  type: text("type").notNull(), // 'booking_update', 'payment_received', 'document_action', 'system'
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export const hotelPriceSnapshots = pgTable("hotel_price_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hotelId: varchar("hotel_id").notNull(),
  checkInDate: text("check_in_date").notNull(),
  checkOutDate: text("check_out_date").notNull(),
  adults: integer("adults").default(2),
  rooms: integer("rooms").default(1),
  priceTotal: numeric("price_total").notNull(),
  currency: text("currency").default("USD"),
  supplierName: text("supplier_name"),
  searchedAt: timestamp("searched_at").defaultNow(),
});

export const flightPriceSnapshots = pgTable("flight_price_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  originAirport: text("origin_airport").notNull(),
  destinationAirport: text("destination_airport").notNull(),
  departureDate: text("departure_date").notNull(),
  returnDate: text("return_date"),
  airline: text("airline"),
  priceTotal: numeric("price_total").notNull(),
  currency: text("currency").default("USD"),
  supplierName: text("supplier_name"),
  searchedAt: timestamp("searched_at").defaultNow(),
});

export const importJobs = pgTable("import_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // 'country', 'city', 'sight'
  status: text("status").notNull(), // 'pending', 'running', 'completed', 'failed'
  totalRecords: integer("total_records").default(0),
  processedRecords: integer("processed_records").default(0),
  errors: text("errors"),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
});


export const dataSources = pgTable("data_sources", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  baseUrl: text("base_url"),
  apiKey: text("api_key"),
  isActive: boolean("is_active").default(true),
  lastUsedAt: timestamp("last_used_at"),
});

export type HotelPriceSnapshot = typeof hotelPriceSnapshots.$inferSelect;
export type FlightPriceSnapshot = typeof flightPriceSnapshots.$inferSelect;
export type ImportJob = typeof importJobs.$inferSelect;
export type DataSource = typeof dataSources.$inferSelect;

export const markupRules = pgTable("markup_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryId: varchar("country_id"), // Null means global
  serviceType: text("service_type"), // 'hotel', 'flight', 'transport', 'sight', 'all'
  markupPercentage: numeric("markup_percentage").notNull(),
  minProfit: numeric("min_profit").default("0"),
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const globalSettings = pgTable("global_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  key: text("key").notNull().unique(), // e.g. 'default_service_fee'
  value: text("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type MarkupRule = typeof markupRules.$inferSelect;
export type InsertMarkupRule = z.infer<typeof insertMarkupRuleSchema>;
export const insertMarkupRuleSchema = createInsertSchema(markupRules).omit({ id: true, createdAt: true }).extend({ markupPercentage: requiredMoneyString, minProfit: optionalMoneyString });

export type GlobalSetting = typeof globalSettings.$inferSelect;
export type InsertGlobalSetting = z.infer<typeof insertGlobalSettingSchema>;
export const insertGlobalSettingSchema = createInsertSchema(globalSettings).omit({ id: true, updatedAt: true });
export const affiliates = pgTable("affiliates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  email: text("email"),
  commissionRate: numeric("commission_rate").default("10"), // Percentage
  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
});

export const affiliatePayouts = pgTable("affiliate_payouts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateId: varchar("affiliate_id").notNull(),
  bookingId: varchar("booking_id"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  status: text("status").default("pending"), // pending, paid
  createdAt: timestamp("created_at").defaultNow(),
});

export const affiliateReferrals = pgTable("affiliate_referrals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  affiliateId: varchar("affiliate_id").notNull(),
  clickId: text("click_id"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  converted: boolean("converted").default(false),
  bookingId: varchar("booking_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAffiliateSchema = createInsertSchema(affiliates).omit({ id: true, createdAt: true });
export type Affiliate = typeof affiliates.$inferSelect;
export type InsertAffiliate = z.infer<typeof insertAffiliateSchema>;

export const insertAffiliatePayoutSchema = createInsertSchema(affiliatePayouts).omit({ id: true, createdAt: true });
export type AffiliatePayout = typeof affiliatePayouts.$inferSelect;
export type InsertAffiliatePayout = z.infer<typeof insertAffiliatePayoutSchema>;

// ---- ADDED FROM GAP ANALYSIS ----

export const sightImages = pgTable("sight_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sightId: varchar("sight_id").notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  licenseRaw: text("license_raw"),
  author: text("author"),
  width: integer("width"),
  height: integer("height"),
  dominantColor: text("dominant_color"),
});

export const sightHours = pgTable("sight_hours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sightId: varchar("sight_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0-6
  openTime: text("open_time"), // HH:MM
  closeTime: text("close_time"), // HH:MM
  isClosed: boolean("is_closed").default(false),
});

export const sightTicketPrices = pgTable("sight_ticket_prices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sightId: varchar("sight_id").notNull(),
  ticketType: text("ticket_type").notNull(), // e.g. adult, child, senior, group
  price: numeric("price").notNull(),
  currency: text("currency").default("USD"),
  description: text("description"),
});

export const hotelImages = pgTable("hotel_images", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hotelId: varchar("hotel_id").notNull(),
  url: text("url").notNull(),
  caption: text("caption"),
  dominantColor: text("dominant_color"),
});

export const hotelAmenities = pgTable("hotel_amenities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hotelId: varchar("hotel_id").notNull(),
  amenity: text("amenity").notNull(),
});

export const hotelRoomTypes = pgTable("hotel_room_types", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  hotelId: varchar("hotel_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  capacity: integer("capacity"),
  basePrice: numeric("base_price"),
});

export const flightOfferDetails = pgTable("flight_offer_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id"),
  airline: text("airline"),
  flightNumber: text("flight_number"),
  departureAirport: text("departure_airport"),
  arrivalAirport: text("arrival_airport"),
  departureTime: timestamp("departure_time"),
  arrivalTime: timestamp("arrival_time"),
  price: numeric("price"),
  currency: text("currency"),
  rawOfferData: jsonb("raw_offer_data"),
});

export const customTours = pgTable("custom_tours", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customerId: varchar("customer_id").notNull(),
  title: text("title").notNull(),
  status: text("status").default("draft"), // draft, requested, quoted, accepted, rejected
  budget: numeric("budget"),
  pax: integer("pax"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const customTourDays = pgTable("custom_tour_days", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customTourId: varchar("custom_tour_id").notNull(),
  dayNumber: integer("day_number").notNull(),
  title: text("title"),
});

export const customTourDayItems = pgTable("custom_tour_day_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customTourDayId: varchar("custom_tour_day_id").notNull(),
  type: text("type").notNull(), // sight, hotel, transport
  referenceId: varchar("reference_id"), // id of the sight/hotel etc
  notes: text("notes"),
});

export const tourQuotes = pgTable("tour_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  customTourId: varchar("custom_tour_id").notNull(),
  supplierId: varchar("supplier_id"),
  totalPrice: numeric("total_price"),
  status: text("status").default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const tourQuoteItems = pgTable("tour_quote_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull(),
  description: text("description"),
  price: numeric("price"),
});

export const importJobLogs = pgTable("import_job_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobType: text("job_type").notNull(), // countries, cities, sights
  status: text("status").notNull(), // running, completed, failed
  recordsProcessed: integer("records_processed").default(0),
  errors: jsonb("errors"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const scraperRuns = pgTable("scraper_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceName: text("source_name").notNull(),
  target: text("target").notNull(),
  status: text("status"),
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
});

export const scraperErrors = pgTable("scraper_errors", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: varchar("run_id").notNull(),
  url: text("url"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const dataQualityReviews = pgTable("data_quality_reviews", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityType: text("entity_type").notNull(), // sight, hotel
  entityId: varchar("entity_id").notNull(),
  score: integer("score"),
  issues: jsonb("issues"), // list of issues found
  status: text("status").default("pending"), // pending, reviewed, fixed
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiGenerationJobs = pgTable("ai_generation_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  prompt: text("prompt"),
  status: text("status").default("pending"),
  resultItineraryId: varchar("result_itinerary_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiGeneratedItineraries = pgTable("ai_generated_itineraries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  jobId: varchar("job_id"),
  title: text("title"),
  content: jsonb("content"), // the generated JSON
  createdAt: timestamp("created_at").defaultNow(),
});

export const aiPromptLogs = pgTable("ai_prompt_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id"),
  prompt: text("prompt"),
  responseTokens: integer("response_tokens"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const regions = pgTable("regions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryId: varchar("country_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
});

// Insert schemas and Types for new tables
export const insertSightImageSchema = createInsertSchema(sightImages).omit({ id: true });
export type InsertSightImage = z.infer<typeof insertSightImageSchema>;
export type SightImage = typeof sightImages.$inferSelect;

export const insertSightHourSchema = createInsertSchema(sightHours).omit({ id: true });
export type InsertSightHour = z.infer<typeof insertSightHourSchema>;
export type SightHour = typeof sightHours.$inferSelect;

export const insertSightTicketPriceSchema = createInsertSchema(sightTicketPrices).omit({ id: true });
export type InsertSightTicketPrice = z.infer<typeof insertSightTicketPriceSchema>;
export type SightTicketPrice = typeof sightTicketPrices.$inferSelect;

export const insertHotelImageSchema = createInsertSchema(hotelImages).omit({ id: true });
export type InsertHotelImage = z.infer<typeof insertHotelImageSchema>;
export type HotelImage = typeof hotelImages.$inferSelect;

export const insertHotelAmenitySchema = createInsertSchema(hotelAmenities).omit({ id: true });
export type InsertHotelAmenity = z.infer<typeof insertHotelAmenitySchema>;
export type HotelAmenity = typeof hotelAmenities.$inferSelect;

export const insertHotelRoomTypeSchema = createInsertSchema(hotelRoomTypes).omit({ id: true });
export type InsertHotelRoomType = z.infer<typeof insertHotelRoomTypeSchema>;
export type HotelRoomType = typeof hotelRoomTypes.$inferSelect;

export const insertFlightOfferDetailSchema = createInsertSchema(flightOfferDetails).omit({ id: true });
export type InsertFlightOfferDetail = z.infer<typeof insertFlightOfferDetailSchema>;
export type FlightOfferDetail = typeof flightOfferDetails.$inferSelect;

export const insertCustomTourSchema = createInsertSchema(customTours).omit({ id: true, createdAt: true });
export type InsertCustomTour = z.infer<typeof insertCustomTourSchema>;
export type CustomTour = typeof customTours.$inferSelect;

export const insertCustomTourDaySchema = createInsertSchema(customTourDays).omit({ id: true });
export type InsertCustomTourDay = z.infer<typeof insertCustomTourDaySchema>;
export type CustomTourDay = typeof customTourDays.$inferSelect;

export const insertCustomTourDayItemSchema = createInsertSchema(customTourDayItems).omit({ id: true });
export type InsertCustomTourDayItem = z.infer<typeof insertCustomTourDayItemSchema>;
export type CustomTourDayItem = typeof customTourDayItems.$inferSelect;

export const insertTourQuoteSchema = createInsertSchema(tourQuotes).omit({ id: true, createdAt: true });
export type InsertTourQuote = z.infer<typeof insertTourQuoteSchema>;
export type TourQuote = typeof tourQuotes.$inferSelect;

export const insertTourQuoteItemSchema = createInsertSchema(tourQuoteItems).omit({ id: true });
export type InsertTourQuoteItem = z.infer<typeof insertTourQuoteItemSchema>;
export type TourQuoteItem = typeof tourQuoteItems.$inferSelect;

export const insertImportJobLogSchema = createInsertSchema(importJobLogs).omit({ id: true, startedAt: true });
export type InsertImportJobLog = z.infer<typeof insertImportJobLogSchema>;
export type ImportJobLog = typeof importJobLogs.$inferSelect;

export const insertScraperRunSchema = createInsertSchema(scraperRuns).omit({ id: true, startedAt: true });
export type InsertScraperRun = z.infer<typeof insertScraperRunSchema>;
export type ScraperRun = typeof scraperRuns.$inferSelect;

export const insertScraperErrorSchema = createInsertSchema(scraperErrors).omit({ id: true, createdAt: true });
export type InsertScraperError = z.infer<typeof insertScraperErrorSchema>;
export type ScraperError = typeof scraperErrors.$inferSelect;

export const insertDataQualityReviewSchema = createInsertSchema(dataQualityReviews).omit({ id: true, createdAt: true });
export type InsertDataQualityReview = z.infer<typeof insertDataQualityReviewSchema>;
export type DataQualityReview = typeof dataQualityReviews.$inferSelect;

export const insertAiGenerationJobSchema = createInsertSchema(aiGenerationJobs).omit({ id: true, createdAt: true });
export type InsertAiGenerationJob = z.infer<typeof insertAiGenerationJobSchema>;
export type AiGenerationJob = typeof aiGenerationJobs.$inferSelect;

export const insertAiGeneratedItinerarySchema = createInsertSchema(aiGeneratedItineraries).omit({ id: true, createdAt: true });
export type InsertAiGeneratedItinerary = z.infer<typeof insertAiGeneratedItinerarySchema>;
export type AiGeneratedItinerary = typeof aiGeneratedItineraries.$inferSelect;

export const insertAiPromptLogSchema = createInsertSchema(aiPromptLogs).omit({ id: true, createdAt: true });
export type InsertAiPromptLog = z.infer<typeof insertAiPromptLogSchema>;
export type AiPromptLog = typeof aiPromptLogs.$inferSelect;

export const insertAffiliateReferralSchema = createInsertSchema(affiliateReferrals).omit({ id: true, createdAt: true });
export type InsertAffiliateReferral = z.infer<typeof insertAffiliateReferralSchema>;
export type AffiliateReferral = typeof affiliateReferrals.$inferSelect;

export const insertRegionSchema = createInsertSchema(regions).omit({ id: true });
export type InsertRegion = z.infer<typeof insertRegionSchema>;
export type Region = typeof regions.$inferSelect;

// --- Pricing Engine (Phase 1 & 2) -----------------------------------------
// Centralized group-tour pricing: group size bands with assistance rules,
// pricing rules (margin + free-passenger policy), airfare rates, and
// computed quotes with per-hotel/per-occupancy line items.

export const assistanceTypeEnum = pgEnum("assistance_type", [
  "driver_chaperone",      // 1–15 passengers
  "professional_guide",    // 16+ passengers
]);
export const marginTypeEnum = pgEnum("margin_type", ["fixed", "percentage"]);
export const occupancyTypeEnum = pgEnum("occupancy_type", [
  "double", "single", "third_person", "child", "matrimonial", "infant",
]);
// Rounding applied to the customer-facing selling price only (internal
// breakdown figures stay at 2dp). Configurable per pricing rule.
export const roundingRuleEnum = pgEnum("rounding_rule", [
  "cent",          // round to 2 decimals (default, legacy behavior)
  "unit_nearest",  // round to nearest whole currency unit
  "unit_up",       // round up to next whole unit
  "five_up",       // round up to next multiple of 5
  "ten_up",        // round up to next multiple of 10
]);
// Approval workflow. Values are ADD-ONLY (prod rows may hold any of them).
// "final" is the legacy pre-workflow value and is treated as approved.
export const pricingQuoteStatusEnum = pgEnum("pricing_quote_status", [
  "draft", "final", "archived",
  "pending_approval", "approved", "rejected",
  "sent", "viewed", "accepted", "expired", "cancelled",
]);

export const groupSizeBands = pgTable("group_size_bands", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  label: text("label").notNull(),                    // e.g. "2-5"
  minPax: integer("min_pax").notNull(),
  maxPax: integer("max_pax").notNull(),
  assistanceType: assistanceTypeEnum("assistance_type").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
}, (table) => ({
  labelIdx: uniqueIndex("group_size_bands_label_idx").on(table.label),
}));

export const pricingRules = pgTable("pricing_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  tourId: varchar("tour_id"),                        // null = global default rule
  marginType: marginTypeEnum("margin_type").notNull().default("percentage"),
  // percentage: "20" = +20%; fixed: flat amount per paying passenger
  marginValue: numeric("margin_value").notNull().default("20"),
  // Free-passenger policy: freeCount free per payingCount paying
  // (1 per 3 => group revenue must cover pax*(1+1/3) => factor 4/3).
  freePassengerPaying: integer("free_passenger_paying").notNull().default(3),
  freePassengerFree: integer("free_passenger_free").notNull().default(1),
  // Customer-price rounding policy (selling price only; internals stay 2dp).
  roundingRule: roundingRuleEnum("rounding_rule").notNull().default("cent"),
  currency: text("currency").notNull().default("USD"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tourIdIdx: index("pricing_rules_tour_id_idx").on(table.tourId),
}));

export const airfareRates = pgTable("airfare_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  origin: text("origin").notNull(),                  // IATA code or city name
  destination: text("destination").notNull(),
  airline: text("airline"),
  ratePerPerson: numeric("rate_per_person").notNull(),
  childRate: numeric("child_rate"),                  // null = same as adult
  infantRate: numeric("infant_rate"),                // null = no infant fare on file
  currency: text("currency").notNull().default("USD"),
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  routeIdx: index("airfare_rates_route_idx").on(table.origin, table.destination),
}));

// Quote header: one computed pricing run for a tour/departure + group size.
// Internal-only money fields (group cost, margin, adjustment factor) must
// never be exposed to customers — customer views read line-item selling
// prices only.
export const pricingQuotes = pgTable("pricing_quotes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tourId: varchar("tour_id").notNull(),
  departureId: varchar("departure_id"),
  pricingRuleId: varchar("pricing_rule_id"),
  groupSizeBandId: varchar("group_size_band_id"),
  paxCount: integer("pax_count").notNull(),
  nights: integer("nights").notNull().default(0),
  assistanceType: assistanceTypeEnum("assistance_type").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: pricingQuoteStatusEnum("status").notNull().default("draft"),
  // Internal per-person component costs (equal shares of group costs)
  transportationShare: numeric("transportation_share").notNull().default("0"),
  guideDriverShare: numeric("guide_driver_share").notNull().default("0"),
  sightseeingShare: numeric("sightseeing_share").notNull().default("0"),
  airfarePerPerson: numeric("airfare_per_person").notNull().default("0"),
  // Internal aggregates (base = per-person before hotel; hotel varies by choice/occupancy)
  baseCostPerPerson: numeric("base_cost_per_person").notNull().default("0"),
  totalGroupCost: numeric("total_group_cost").notNull().default("0"),
  freeAdjustmentFactor: numeric("free_adjustment_factor").notNull().default("1"),
  marginType: marginTypeEnum("margin_type").notNull().default("percentage"),
  marginValue: numeric("margin_value").notNull().default("0"),
  notes: text("notes"),
  // Rate-driven costing: which rate records/warnings produced the inputs
  // (null for manually entered quotes).
  calculationMeta: jsonb("calculation_meta"),
  // Customer visibility: a quote is only readable by its assigned customer
  // (customerId) or via its unguessable share token, and only once `final`.
  customerId: varchar("customer_id"),
  shareToken: varchar("share_token").notNull().default(sql`gen_random_uuid()`),
  // Approval workflow: who approved (or rejected) and when. Set exactly once
  // when the quote transitions to approved; cleared if re-drafted.
  approvedBy: varchar("approved_by"),
  approvedAt: timestamp("approved_at"),
  // Expiry: set to now+30d when approved; expired quotes can't be sent/accepted
  // without recalculation (move back to draft and re-approve).
  validUntil: timestamp("valid_until"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tourIdIdx: index("pricing_quotes_tour_id_idx").on(table.tourId),
  departureIdIdx: index("pricing_quotes_departure_id_idx").on(table.departureId),
  shareTokenIdx: uniqueIndex("pricing_quotes_share_token_idx").on(table.shareToken),
}));

// One row per hotel choice (1–3) × occupancy type. sellingPrice is the only
// money field customers may see.
export const pricingQuoteLineItems = pgTable("pricing_quote_line_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull(),
  hotelChoice: integer("hotel_choice").notNull(),    // 1..3
  hotelId: varchar("hotel_id"),
  hotelName: text("hotel_name"),
  occupancy: occupancyTypeEnum("occupancy").notNull(),
  // Internal cost breakdown (per person)
  hotelNightlyRate: numeric("hotel_nightly_rate").notNull().default("0"),
  hotelCostTotal: numeric("hotel_cost_total").notNull().default("0"), // nightly * nights
  baseCost: numeric("base_cost").notNull().default("0"),              // step 1
  marginAmount: numeric("margin_amount").notNull().default("0"),      // step 2 delta
  freeAdjustmentAmount: numeric("free_adjustment_amount").notNull().default("0"), // step 3 delta
  // Per-rule adjustment breakdown: [{ruleId, name, type, appliedAmount}]
  // appliedAmount is the per-person monetary delta (negative for discounts).
  adjustmentItems: jsonb("adjustment_items"),
  // Customer-visible
  sellingPrice: numeric("selling_price").notNull().default("0"),      // final rounded
  // Pre-rounding-rule value (2dp). Kept so configurable rounding is auditable.
  sellingPriceExact: numeric("selling_price_exact"),
}, (table) => ({
  quoteIdIdx: index("pricing_quote_line_items_quote_id_idx").on(table.quoteId),
  quoteChoiceOccIdx: uniqueIndex("pricing_quote_line_items_choice_occ_idx")
    .on(table.quoteId, table.hotelChoice, table.occupancy),
}));

// Insert schemas + types
export const insertGroupSizeBandSchema = createInsertSchema(groupSizeBands)
  .omit({ id: true })
  .superRefine((v, ctx) => {
    if (v.minPax < 1) ctx.addIssue({ code: "custom", path: ["minPax"], message: "minPax must be at least 1" });
    if (v.maxPax < v.minPax) ctx.addIssue({ code: "custom", path: ["maxPax"], message: "maxPax must be >= minPax" });
  });
export type InsertGroupSizeBand = z.infer<typeof insertGroupSizeBandSchema>;
export type GroupSizeBand = typeof groupSizeBands.$inferSelect;

export const insertPricingRuleSchema = createInsertSchema(pricingRules, {
  marginValue: (s: z.ZodString) => nonNegativePriceString(s),
})
  .omit({ id: true, createdAt: true, updatedAt: true })
  .superRefine((v, ctx) => {
    if (v.freePassengerPaying !== undefined && v.freePassengerPaying < 1)
      ctx.addIssue({ code: "custom", path: ["freePassengerPaying"], message: "freePassengerPaying must be at least 1" });
    if (v.freePassengerFree !== undefined && v.freePassengerFree < 0)
      ctx.addIssue({ code: "custom", path: ["freePassengerFree"], message: "freePassengerFree must be non-negative" });
  });
export type InsertPricingRule = z.infer<typeof insertPricingRuleSchema>;
export type PricingRule = typeof pricingRules.$inferSelect;

export const insertAirfareRateSchema = createInsertSchema(airfareRates, {
  ratePerPerson: (s: z.ZodString) => nonNegativePriceString(s),
  childRate: (s: z.ZodString) => nonNegativePriceString(s),
  infantRate: (s: z.ZodString) => nonNegativePriceString(s),
  validFrom: () => z.coerce.date().nullable().optional(),
  validTo: () => z.coerce.date().nullable().optional(),
})
  .omit({ id: true, createdAt: true })
  .superRefine((v, ctx) => {
    if (v.validFrom && v.validTo && v.validFrom > v.validTo)
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "validTo must be on or after validFrom" });
  });
export type InsertAirfareRate = z.infer<typeof insertAirfareRateSchema>;
export type AirfareRate = typeof airfareRates.$inferSelect;

export const insertPricingQuoteSchema = createInsertSchema(pricingQuotes)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPricingQuote = z.infer<typeof insertPricingQuoteSchema>;
export type PricingQuote = typeof pricingQuotes.$inferSelect;

export const insertPricingQuoteLineItemSchema = createInsertSchema(pricingQuoteLineItems)
  .omit({ id: true })
  .superRefine((v, ctx) => {
    if (v.hotelChoice < 1 || v.hotelChoice > 3)
      ctx.addIssue({ code: "custom", path: ["hotelChoice"], message: "hotelChoice must be between 1 and 3" });
  });
export type InsertPricingQuoteLineItem = z.infer<typeof insertPricingQuoteLineItemSchema>;
export type PricingQuoteLineItem = typeof pricingQuoteLineItems.$inferSelect;

export const adjustmentTypeEnum = pgEnum("pricing_adjustment_type", [
  "tax", "service_fee", "booking_fee", "surcharge", "discount",
]);

// Manual currency conversion rates for supplier costs quoted in a different
// currency than the quote currency. Approved quotes never re-convert — the
// rate used is frozen into calculationMeta at computation time.
export const exchangeRates = pgTable("exchange_rates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  sourceCurrency: text("source_currency").notNull(),  // e.g. "IDR"
  targetCurrency: text("target_currency").notNull(),  // e.g. "USD"
  rate: numeric("rate").notNull(),                    // target per 1 source
  validFrom: timestamp("valid_from"),
  validTo: timestamp("valid_to"),
  isActive: boolean("is_active").notNull().default(true),
  enteredBy: varchar("entered_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  pairIdx: index("exchange_rates_pair_idx").on(table.sourceCurrency, table.targetCurrency),
}));

const CURRENCY_RE = /^[A-Z]{3}$/;
export const insertExchangeRateSchema = createInsertSchema(exchangeRates, {
  validFrom: () => z.coerce.date().nullable().optional(),
  validTo: () => z.coerce.date().nullable().optional(),
})
  .omit({ id: true, createdAt: true, updatedAt: true, enteredBy: true })
  .superRefine((v, ctx) => {
    // FX rate must be a strictly positive plain decimal (0 would zero out
    // costs). Bounded digits so it fits Postgres numeric without a DB error;
    // positivity is checked on the string (no float round-trip).
    if (v.rate !== undefined) {
      const s = String(v.rate).trim();
      if (!/^\d{1,12}(\.\d{1,12})?$/.test(s) || !/[1-9]/.test(s))
        ctx.addIssue({ code: "custom", path: ["rate"], message: "rate must be a positive decimal number" });
    }
    if (v.sourceCurrency !== undefined && !CURRENCY_RE.test(v.sourceCurrency))
      ctx.addIssue({ code: "custom", path: ["sourceCurrency"], message: "sourceCurrency must be a 3-letter ISO code" });
    if (v.targetCurrency !== undefined && !CURRENCY_RE.test(v.targetCurrency))
      ctx.addIssue({ code: "custom", path: ["targetCurrency"], message: "targetCurrency must be a 3-letter ISO code" });
    if (v.sourceCurrency && v.targetCurrency && v.sourceCurrency === v.targetCurrency)
      ctx.addIssue({ code: "custom", path: ["targetCurrency"], message: "source and target currencies must differ" });
    if (v.validFrom && v.validTo && v.validFrom > v.validTo)
      ctx.addIssue({ code: "custom", path: ["validTo"], message: "validTo must be on or after validFrom" });
  });
export type InsertExchangeRate = z.infer<typeof insertExchangeRateSchema>;
export type ExchangeRate = typeof exchangeRates.$inferSelect;

// Manual selling-price overrides on quote line items. The original value is
// preserved here; the line item carries the override. Reason is mandatory.
export const pricingQuoteOverrides = pgTable("pricing_quote_overrides", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull(),
  lineItemId: varchar("line_item_id").notNull(),
  fieldName: text("field_name").notNull().default("selling_price"),
  originalValue: numeric("original_value").notNull(),
  overrideValue: numeric("override_value").notNull(),
  reason: text("reason").notNull(),
  createdBy: varchar("created_by"),
  approvedBy: varchar("approved_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  quoteIdIdx: index("pricing_quote_overrides_quote_id_idx").on(table.quoteId),
}));

export const insertPricingQuoteOverrideSchema = createInsertSchema(pricingQuoteOverrides, {
  overrideValue: (s: z.ZodString) => nonNegativePriceString(s),
})
  .omit({ id: true, createdAt: true, originalValue: true, createdBy: true, approvedBy: true })
  .superRefine((v, ctx) => {
    if (v.reason !== undefined && v.reason.trim().length < 5)
      ctx.addIssue({ code: "custom", path: ["reason"], message: "reason is required (min 5 characters)" });
    // Bound digits so the value fits Postgres numeric without a DB error.
    if (v.overrideValue !== undefined && !/^\d{1,12}(\.\d{1,6})?$/.test(String(v.overrideValue).trim()))
      ctx.addIssue({ code: "custom", path: ["overrideValue"], message: "overrideValue must be a plain decimal with at most 12 integer and 6 fraction digits" });
  });
export type InsertPricingQuoteOverride = z.infer<typeof insertPricingQuoteOverrideSchema>;
export type PricingQuoteOverride = typeof pricingQuoteOverrides.$inferSelect;

// Immutable calculation snapshots — one per approval/recalculation cycle.
// Captures every input, output, and rule used so the price can be reproduced
// exactly, even if the underlying pricing rule is later changed or deleted.
// Rows are INSERT-only: never updated or deleted.
export const quotePricingSnapshots = pgTable("quote_pricing_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  quoteId: varchar("quote_id").notNull(),
  // Monotonically increasing within a quote. Version 1 = first approval;
  // increments each time the quote is re-approved after a re-draft cycle.
  version: integer("version").notNull().default(1),
  // Full inputs to computeQuote: pax, nights, component costs, rule values,
  // adjustment rule snapshots, and the rate-resolver calculationMeta.
  calculationInput: jsonb("calculation_input").notNull(),
  // Full outputs: assistanceType, baseCostPerPerson, totalGroupCost,
  // freeAdjustmentFactor, and the complete per-hotel/occupancy line items.
  calculationOutput: jsonb("calculation_output").notNull(),
  // The pricing rule record (values copied at snapshot time) plus the IDs of
  // all active adjustment rules applied.
  rulesUsed: jsonb("rules_used").notNull(),
  // Why the snapshot was created: "approved", "re_approved", etc.
  reason: text("reason").notNull().default("approved"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  quoteIdIdx: index("quote_pricing_snapshots_quote_id_idx").on(table.quoteId),
  quoteVersionIdx: uniqueIndex("quote_pricing_snapshots_quote_version_idx")
    .on(table.quoteId, table.version),
}));

export type QuotePricingSnapshot = typeof quotePricingSnapshots.$inferSelect;

// --- Supplier service requests (per-booking, per-supplier work orders) ---

export const serviceRequestStatusEnum = pgEnum("service_request_status", [
  "pending",     // created by ops, not yet sent
  "sent",        // visible to the supplier
  "confirmed",
  "rejected",
  "changes_requested",
  "cancelled",
]);

// A single service Tourops asks one supplier to deliver for a booking.
// Suppliers see ONLY their own rows and never selling prices/margins:
// agreedRate is the supplier's own cost rate, entered by ops.
export const bookingServiceRequests = pgTable("booking_service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  serviceType: serviceTypeEnum("service_type").notNull(),
  supplierUserId: varchar("supplier_user_id").notNull(), // user_profiles.userId of the supplier account
  serviceDate: timestamp("service_date"),
  location: text("location"),
  quantity: integer("quantity").default(1),
  paxCount: integer("pax_count"),
  agreedRate: numeric("agreed_rate"),
  currency: text("currency").default("USD"),
  status: serviceRequestStatusEnum("status").notNull().default("pending"),
  notesForSupplier: text("notes_for_supplier"),
  supplierResponse: text("supplier_response"),
  respondedAt: timestamp("responded_at"),
  createdBy: varchar("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("booking_service_requests_booking_idx").on(table.bookingId),
  supplierIdx: index("booking_service_requests_supplier_idx").on(table.supplierUserId),
}));

export const insertBookingServiceRequestSchema = createInsertSchema(bookingServiceRequests, {
  serviceDate: () => z.coerce.date().nullable().optional(),
})
  .omit({ id: true, createdAt: true, updatedAt: true, createdBy: true, respondedAt: true, supplierResponse: true, status: true })
  .superRefine((v, ctx) => {
    if (v.agreedRate !== undefined && v.agreedRate !== null && !/^\d{1,12}(\.\d{1,6})?$/.test(String(v.agreedRate).trim()))
      ctx.addIssue({ code: "custom", path: ["agreedRate"], message: "agreedRate must be a plain non-negative decimal" });
    if (v.quantity !== undefined && v.quantity !== null && v.quantity < 1)
      ctx.addIssue({ code: "custom", path: ["quantity"], message: "quantity must be at least 1" });
    if (v.paxCount !== undefined && v.paxCount !== null && v.paxCount < 0)
      ctx.addIssue({ code: "custom", path: ["paxCount"], message: "paxCount must be non-negative" });
  });
export type InsertBookingServiceRequest = z.infer<typeof insertBookingServiceRequestSchema>;
export type BookingServiceRequest = typeof bookingServiceRequests.$inferSelect;

// --- Client payment schedules (deposit + installments per booking) ---

export const paymentScheduleStatusEnum = pgEnum("payment_schedule_status", [
  "pending",
  "paid",
  "partially_paid",
  "late",
  "cancelled",
]);

export const bookingPaymentSchedules = pgTable("booking_payment_schedules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  installmentNumber: integer("installment_number").notNull(),
  label: text("label").notNull(),           // e.g. "Deposit", "Second Payment"
  labelEn: text("label_en"),
  labelId: text("label_id"),
  percentage: numeric("percentage").notNull(), // of booking total, decimal string e.g. "20"
  amount: numeric("amount").notNull(),         // decimal-string money in booking currency
  currency: text("currency").notNull().default("USD"),
  dueDate: timestamp("due_date").notNull(),
  paidAmount: numeric("paid_amount").notNull().default("0"),
  status: paymentScheduleStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("booking_payment_schedules_booking_idx").on(table.bookingId),
  uniqueInstallment: uniqueIndex("booking_payment_schedules_unique_installment").on(table.bookingId, table.installmentNumber),
}));

export const insertBookingPaymentScheduleSchema = createInsertSchema(bookingPaymentSchedules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBookingPaymentSchedule = z.infer<typeof insertBookingPaymentScheduleSchema>;
export type BookingPaymentSchedule = typeof bookingPaymentSchedules.$inferSelect;

// --- Test-data seed runs (staging only; report of each seed execution) ---

export const seedRuns = pgTable("seed_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),          // full_seed | reset | validate | phase:<name>
  status: text("status").notNull(),          // running | completed | failed
  report: jsonb("report"),                   // per-phase created/updated/skipped/failed + validation results
  error: text("error"),
  startedBy: varchar("started_by"),
  startedAt: timestamp("started_at").defaultNow(),
  finishedAt: timestamp("finished_at"),
});
export type SeedRun = typeof seedRuns.$inferSelect;

// --- Passenger portal: invitations linking traveler records to login accounts ---

export const travelerInvitationStatusEnum = pgEnum("traveler_invitation_status", [
  "pending",
  "accepted",
  "expired",
  "revoked",
]);

// One invitation per send; token is stored ONLY as a sha256 hash (raw token is
// e-mailed / shown once). Accepting creates or links a users row and sets
// travelers.userId. Single-use: usedAt set atomically on accept.
export const travelerInvitations = pgTable("traveler_invitations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  travelerId: varchar("traveler_id").notNull(),
  bookingId: varchar("booking_id").notNull(),
  email: text("email").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  status: travelerInvitationStatusEnum("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  invitedBy: varchar("invited_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  travelerIdx: index("traveler_invitations_traveler_idx").on(table.travelerId),
  bookingIdx: index("traveler_invitations_booking_idx").on(table.bookingId),
}));
export type TravelerInvitation = typeof travelerInvitations.$inferSelect;

// --- Booking status history (audit of workflow transitions) ---

export const bookingStatusHistory = pgTable("booking_status_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  fromStatus: text("from_status"),
  toStatus: text("to_status").notNull(),
  changedBy: varchar("changed_by"),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("booking_status_history_booking_idx").on(table.bookingId),
}));
export type BookingStatusHistoryEntry = typeof bookingStatusHistory.$inferSelect;

// --- Rooming list (rooms per booking; travelers.roomId points here) ---

export const bookingRooms = pgTable("booking_rooms", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  label: text("label").notNull(),          // e.g. "Room 101"
  roomType: text("room_type").notNull(),   // single | double | triple
  capacity: integer("capacity").notNull().default(2),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("booking_rooms_booking_idx").on(table.bookingId),
  uniqueLabel: uniqueIndex("booking_rooms_unique_label").on(table.bookingId, table.label),
}));
export type BookingRoom = typeof bookingRooms.$inferSelect;

// --- Change requests (client asks to modify a booking; ops approves/rejects) ---

export const changeRequestStatusEnum = pgEnum("change_request_status", [
  "pending",
  "approved",
  "rejected",
  "cancelled",
]);

export const bookingChangeRequests = pgTable("booking_change_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  requestedBy: varchar("requested_by").notNull(),
  requestType: text("request_type").notNull(), // add_passengers | remove_passengers | date_change | other
  details: text("details").notNull(),
  paxDelta: integer("pax_delta"),              // +N / -N passengers for passenger-count changes
  status: changeRequestStatusEnum("status").notNull().default("pending"),
  resolutionNotes: text("resolution_notes"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("booking_change_requests_booking_idx").on(table.bookingId),
}));
export type BookingChangeRequest = typeof bookingChangeRequests.$inferSelect;

// --- Incident reports (tour leader / ops during operation) ---

export const incidentStatusEnum = pgEnum("incident_status", ["open", "acknowledged", "resolved"]);
export const incidentSeverityEnum = pgEnum("incident_severity", ["low", "medium", "high", "critical"]);

export const incidentReports = pgTable("incident_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  bookingId: varchar("booking_id").notNull(),
  reportedBy: varchar("reported_by").notNull(),
  severity: incidentSeverityEnum("severity").notNull().default("low"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  status: incidentStatusEnum("status").notNull().default("open"),
  resolutionNotes: text("resolution_notes"),
  resolvedBy: varchar("resolved_by"),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  bookingIdx: index("incident_reports_booking_idx").on(table.bookingId),
}));
export type IncidentReport = typeof incidentReports.$inferSelect;

// --- New Table for Generic Dashboard Master Records ---

export const masterRecords = pgTable("master_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordType: text("record_type").notNull(), // city, article, flight, itinerary, supply, agent
  title: text("title").notNull(),
  status: text("status").default("draft"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMasterRecordSchema = createInsertSchema(masterRecords).omit({ id: true, createdAt: true });
export type InsertMasterRecord = z.infer<typeof insertMasterRecordSchema>;
export type MasterRecord = typeof masterRecords.$inferSelect;

export const pricingSeasons = pgTable("pricing_seasons", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),                    // e.g. "Christmas High Season"
  /** null = global (applies to all tours); non-null = scoped to this country */
  destinationId: varchar("destination_id").references(() => countries.id, { onDelete: "set null" }),
  /** ISO date string "YYYY-MM-DD" — inclusive start of the season window */
  startDate: text("start_date").notNull(),
  /** ISO date string "YYYY-MM-DD" — inclusive end of the season window */
  endDate: text("end_date").notNull(),
  /** Higher number = higher priority; wins when multiple seasons overlap. */
  priority: integer("priority").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  dateRangeIdx: index("pricing_seasons_date_range_idx").on(table.startDate, table.endDate),
  priorityIdx: index("pricing_seasons_priority_idx").on(table.priority),
}));
export const adjustmentStageEnum = pgEnum("pricing_adjustment_stage", [
  "before_margin", "after_margin", "after_free_policy",
]);

export const pricingAdjustmentRules = pgTable("pricing_adjustment_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: adjustmentTypeEnum("type").notNull(),
  /** reuses marginTypeEnum: "fixed" = flat per-person, "percentage" = % of running total at that stage */
  amountType: marginTypeEnum("amount_type").notNull().default("percentage"),
  amount: numeric("amount").notNull(),
  applicationOrder: integer("application_order").notNull().default(0),
  appliesToStage: adjustmentStageEnum("applies_to_stage").notNull().default("after_free_policy"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  orderIdx: index("pricing_adjustment_rules_order_idx").on(table.applicationOrder),
}));

export type PricingAdjustmentRule = typeof pricingAdjustmentRules.$inferSelect;

export const insertPricingAdjustmentRuleSchema = createInsertSchema(pricingAdjustmentRules, {
  amount: (s: z.ZodString) => nonNegativePriceString(s),
}).omit({ id: true, createdAt: true, updatedAt: true });

export type InsertPricingAdjustmentRule = z.infer<typeof insertPricingAdjustmentRuleSchema>;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const validateSeasonDate = (field: string) =>
  z.string().refine((v) => DATE_RE.test(v), { message: `${field} must be YYYY-MM-DD` });

export const insertPricingSeasonSchema = createInsertSchema(pricingSeasons)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .extend({
    startDate: validateSeasonDate("startDate"),
    endDate: validateSeasonDate("endDate"),
  })
  .superRefine((v, ctx) => {
    if (v.startDate > v.endDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must be on or after startDate" });
  });

export type InsertPricingSeason = z.infer<typeof insertPricingSeasonSchema>;

/**
 * Safe partial schema for PATCH /api/pricing/seasons/:id.
 * All fields optional; date format and ordering only validated when the
 * relevant field(s) are actually supplied — avoids the full insert
 * schema's superRefine firing on absent fields.
 */
export const patchPricingSeasonSchema = z.object({
  name: z.string().min(1).optional(),
  destinationId: z.string().nullable().optional(),
  startDate: validateSeasonDate("startDate").optional(),
  endDate: validateSeasonDate("endDate").optional(),
  priority: z.number().int().optional(),
  isActive: z.boolean().optional(),
}).superRefine((v, ctx) => {
  if (v.startDate !== undefined && v.endDate !== undefined && v.startDate > v.endDate)
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "endDate must be on or after startDate" });
});

export type PatchPricingSeason = z.infer<typeof patchPricingSeasonSchema>;
export type PricingSeason = typeof pricingSeasons.$inferSelect;

export const schemaMigrations = pgTable("schema_migrations", {
  version: text("version").primaryKey(),
  appliedAt: timestamp("applied_at").defaultNow(),
});
