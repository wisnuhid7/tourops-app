import { db } from "@workspace/db";
import { eq, and, desc, sql, or, not, isNotNull, inArray, count } from "drizzle-orm";
import { users } from "@workspace/db";
import {
  userProfiles, tours, tourDays, tourDepartures,
  bookings, travelers, bookingAssignments,
  bookingWorkflows, workflowSteps, documents, messages, payments,
  countries, cities, airports, sights, hotels, transportCompanies, airlineAgencies,
  busTypes, transportRoutes, transportRoutePricing,
  transportBookings, transportInvoices, transportPayments,
  auditLogs, notifications, invoices,
  type UserProfile, type InsertUserProfile,
  type Tour, type InsertTour,
  type TourDay, type InsertTourDay,
  type TourDeparture, type InsertTourDeparture,
  type Booking, type InsertBooking,
  type Traveler, type InsertTraveler,
  type BookingAssignment, type InsertBookingAssignment,
  type BookingWorkflow, type InsertBookingWorkflow,
  type WorkflowStep, type InsertWorkflowStep,
  type Document, type InsertDocument,
  type Message, type InsertMessage,
  type Payment, type InsertPayment,
  type Country, type InsertCountry,
  type City, type InsertCity,
  type Airport, type InsertAirport,
  type Sight, type InsertSight,
  type Hotel, type InsertHotel,
  type TransportCompany, type InsertTransportCompany,
  type AirlineAgency, type InsertAirlineAgency,
  type BusType, type InsertBusType,
  type TransportRoute, type InsertTransportRoute,
  type TransportRoutePricing, type InsertTransportRoutePricing,
  type TransportBooking, type InsertTransportBooking,
  type TransportInvoice, type InsertTransportInvoice,
  type TransportPayment, type InsertTransportPayment,
  hotelRates, transportRates, guideRates, sightsRates, airlineRates,
  tourDayItems, markupRules, globalSettings, importJobs, dataSources,
  hotelPriceSnapshots, flightPriceSnapshots, affiliates, affiliatePayouts,
  type HotelRate, type InsertHotelRate,
  type TransportRate, type InsertTransportRate,
  type GuideRate, type InsertGuideRate,
  type SightsRate, type InsertSightsRate,
  type AirlineRate, type InsertAirlineRate,
  sightImages, sightHours, sightTicketPrices,
  hotelImages, hotelAmenities, hotelRoomTypes,
  flightOfferDetails, customTours, customTourDays, customTourDayItems,
  tourQuotes, tourQuoteItems, importJobLogs,
  scraperRuns, scraperErrors, dataQualityReviews,
  aiGenerationJobs, aiGeneratedItineraries, aiPromptLogs,
  regions, affiliateReferrals, masterRecords,
  type SightImage, type InsertSightImage,
  type SightHour, type InsertSightHour,
  type SightTicketPrice, type InsertSightTicketPrice,
  type HotelImage, type InsertHotelImage,
  type HotelAmenity, type InsertHotelAmenity,
  type HotelRoomType, type InsertHotelRoomType,
  type FlightOfferDetail, type InsertFlightOfferDetail,
  type CustomTour, type InsertCustomTour,
  type CustomTourDay, type InsertCustomTourDay,
  type CustomTourDayItem, type InsertCustomTourDayItem,
  type TourQuote, type InsertTourQuote,
  type TourQuoteItem, type InsertTourQuoteItem,
  type ImportJobLog, type InsertImportJobLog,
  type ScraperRun, type InsertScraperRun,
  type ScraperError, type InsertScraperError,
  type DataQualityReview, type InsertDataQualityReview,
  type AiGenerationJob, type InsertAiGenerationJob,
  type AiGeneratedItinerary, type InsertAiGeneratedItinerary,
  type AiPromptLog, type InsertAiPromptLog,
  type Region, type InsertRegion,
  type AffiliateReferral, type InsertAffiliateReferral,
  type AuditLog, type InsertAuditLog,
  type Notification, type InsertNotification,
  type Invoice, type InsertInvoice,
  type TourDayItem, type InsertTourDayItem,
  type MarkupRule, type InsertMarkupRule,
  type GlobalSetting, type InsertGlobalSetting,
  type ImportJob, type DataSource,
  type HotelPriceSnapshot, type FlightPriceSnapshot,
  type Affiliate, type InsertAffiliate,
  type AffiliatePayout, type InsertAffiliatePayout, type MasterRecord, type InsertMasterRecord,
} from "@workspace/db";

const DEFAULT_WORKFLOW_STEPS: Record<string, Array<{ code: string; name: string }>> = {
  airline: [
    { code: "waiting_docs", name: "Waiting on Documents" },
    { code: "quote_submitted", name: "Quote Submitted" },
    { code: "quote_approved", name: "Quote Approved" },
    { code: "ticketed", name: "Tickets Issued" },
    { code: "completed", name: "Completed" },
  ],
  hotel: [
    { code: "request_sent", name: "Request Sent" },
    { code: "confirmation_received", name: "Confirmation Received" },
    { code: "approved", name: "Approved" },
    { code: "voucher_uploaded", name: "Voucher Uploaded" },
    { code: "completed", name: "Completed" },
  ],
  transport: [
    { code: "request_sent", name: "Route Plan Requested" },
    { code: "proposed", name: "Vehicle Allocation Proposed" },
    { code: "approved", name: "Approved" },
    { code: "details_submitted", name: "Details Submitted" },
    { code: "completed", name: "Completed" },
  ],
  guide: [
    { code: "needed", name: "Guide Needed" },
    { code: "proposed", name: "Guide Options Proposed" },
    { code: "approved", name: "Approved" },
    { code: "confirmed", name: "Guide Confirmed" },
    { code: "completed", name: "Completed" },
  ],
  sights: [
    { code: "reservation_required", name: "Reservation Required" },
    { code: "slot_returned", name: "Slot Options Returned" },
    { code: "approved", name: "Approved" },
    { code: "tickets_uploaded", name: "Tickets Uploaded" },
    { code: "completed", name: "Completed" },
  ],
};

export interface IStorage {
  remapLegacyRoles(fromRole: string, toRole: string): Promise<number>;
  getOrCreateProfile(userId: string): Promise<UserProfile>;
  getProfile(id: string): Promise<UserProfile | undefined>;
  getProfileByUserId(userId: string): Promise<UserProfile | undefined>;
  getProfileByUserIdWithEmail(userId: string): Promise<(UserProfile & { user?: { email: string | null; firstName: string | null; lastName: string | null; username: string | null } }) | undefined>;
  getAllProfiles(): Promise<(UserProfile & { user?: { email: string | null; firstName: string | null; lastName: string | null; username: string | null } })[]>;

  getAllTours(): Promise<Tour[]>;
  getTourAccommodationSummary(): Promise<Record<string, { hotels: string[]; guides: string[] }>>;
  getPublishedTours(): Promise<Tour[]>;
  getTour(id: string): Promise<Tour | undefined>;
  createTour(data: InsertTour): Promise<Tour>;
  updateTour(id: string, data: Partial<Tour>): Promise<Tour>;
  deleteTour(id: string): Promise<void>;
  upsertTourFull(id: string | "new-tour", tourData: InsertTour, daysData: InsertTourDay[], userId?: string, userName?: string): Promise<Tour>;

  getTourDays(tourId: string): Promise<TourDay[]>;
  createTourDay(data: InsertTourDay): Promise<TourDay>;
  updateTourDay(id: string, data: Partial<TourDay>): Promise<TourDay>;
  deleteTourDay(id: string): Promise<void>;

  getTourDayItems(dayId: string): Promise<TourDayItem[]>;
  getTourDayItemsByTourId(tourId: string): Promise<TourDayItem[]>;
  createTourDayItem(data: InsertTourDayItem): Promise<TourDayItem>;
  updateTourDayItem(id: string, data: Partial<TourDayItem>): Promise<TourDayItem>;
  deleteTourDayItem(id: string): Promise<void>;

  getAllDepartures(): Promise<TourDeparture[]>;
  getDeparturesByTour(tourId: string): Promise<TourDeparture[]>;
  getDeparture(id: string): Promise<TourDeparture | undefined>;
  createDeparture(data: InsertTourDeparture): Promise<TourDeparture>;
  updateDeparture(id: string, data: Partial<TourDeparture>, tx?: any): Promise<TourDeparture>;
  deleteDeparture(id: string): Promise<void>;
  getBookingsByDeparture(departureId: string): Promise<Booking[]>;

  getAllBookings(): Promise<Booking[]>;
  getBooking(id: string): Promise<Booking | undefined>;
  getBookingsByCustomer(customerId: string): Promise<Booking[]>;
  getBookingByJoinCode(code: string): Promise<Booking | undefined>;
  createBooking(data: InsertBooking, tx?: any): Promise<Booking>;
  updateBooking(id: string, data: Partial<Booking>): Promise<Booking>;
  deleteBooking(id: string): Promise<void>;

  getTraveler(id: string): Promise<Traveler | undefined>;
  getTravelers(bookingId: string): Promise<Traveler[]>;
  createTraveler(data: InsertTraveler): Promise<Traveler>;
  updateTraveler(id: string, data: Partial<Traveler>): Promise<Traveler>;
  deleteTraveler(id: string): Promise<void>;

  getAllAssignments(): Promise<BookingAssignment[]>;
  getAssignments(bookingId: string): Promise<BookingAssignment[]>;
  createAssignment(data: InsertBookingAssignment): Promise<BookingAssignment>;
  updateAssignment(id: string, data: Partial<BookingAssignment>): Promise<BookingAssignment>;
  deleteAssignment(id: string): Promise<void>;

  getAllWorkflows(): Promise<BookingWorkflow[]>;
  getWorkflows(bookingId: string): Promise<BookingWorkflow[]>;
  getWorkflowsByUser(userId: string): Promise<(BookingWorkflow & { booking?: Booking })[]>;
  getWorkflow(id: string): Promise<BookingWorkflow | undefined>;
  createWorkflow(data: InsertBookingWorkflow): Promise<BookingWorkflow>;
  updateWorkflow(id: string, data: Partial<BookingWorkflow>): Promise<BookingWorkflow>;

  getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]>;
  getWorkflowStep(id: string): Promise<WorkflowStep | undefined>;
  createWorkflowStep(data: InsertWorkflowStep): Promise<WorkflowStep>;
  updateWorkflowStep(id: string, data: Partial<WorkflowStep>): Promise<WorkflowStep>;

  getAllDocuments(): Promise<Document[]>;
  getDocuments(bookingId: string): Promise<Document[]>;
  createDocument(data: InsertDocument): Promise<Document>;
  updateDocument(id: string, data: Partial<Document>): Promise<Document>;

  getAllMessages(): Promise<Message[]>;
  getMessages(bookingId: string): Promise<Message[]>;
  createMessage(data: InsertMessage): Promise<Message>;

  getAllPayments(): Promise<Payment[]>;
  getPayments(bookingId: string): Promise<Payment[]>;
  createPayment(data: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<Payment>): Promise<Payment>;

  getGroupParticipants(leaderBookingId: string): Promise<Booking[]>;
  getBookingsByLeader(leaderUserId: string): Promise<Booking[]>;

  getAllCountries(): Promise<Country[]>;
  getCountry(id: string): Promise<Country | undefined>;
  createCountry(data: InsertCountry): Promise<Country>;
  updateCountry(id: string, data: Partial<Country>): Promise<Country>;
  deleteCountry(id: string): Promise<void>;
  bulkCreateCountries(data: InsertCountry[]): Promise<Country[]>;

  getAllCities(): Promise<City[]>;
  getCity(id: string): Promise<City | undefined>;
  createCity(data: InsertCity): Promise<City>;
  updateCity(id: string, data: Partial<City>): Promise<City>;
  deleteCity(id: string): Promise<void>;
  bulkCreateCities(data: InsertCity[]): Promise<City[]>;

  getAllAirports(): Promise<Airport[]>;
  getAirport(id: string): Promise<Airport | undefined>;
  createAirport(data: InsertAirport): Promise<Airport>;
  updateAirport(id: string, data: Partial<Airport>): Promise<Airport>;
  deleteAirport(id: string): Promise<void>;
  bulkCreateAirports(data: InsertAirport[]): Promise<Airport[]>;

  getAllSights(): Promise<Sight[]>;
  getSight(id: string): Promise<Sight | undefined>;
  createSight(data: InsertSight): Promise<Sight>;
  updateSight(id: string, data: Partial<Sight>): Promise<Sight>;
  deleteSight(id: string): Promise<void>;
  bulkCreateSights(data: InsertSight[]): Promise<Sight[]>;

  getAllHotels(): Promise<Hotel[]>;
  getHotelsByCity(cityId: string): Promise<Hotel[]>;
  getHotel(id: string): Promise<Hotel | undefined>;
  createHotel(data: InsertHotel): Promise<Hotel>;
  updateHotel(id: string, data: Partial<Hotel>): Promise<Hotel>;
  deleteHotel(id: string): Promise<void>;
  bulkCreateHotels(data: InsertHotel[]): Promise<Hotel[]>;

  getAllTransportCompanies(): Promise<TransportCompany[]>;
  getTransportCompany(id: string): Promise<TransportCompany | undefined>;
  createTransportCompany(data: InsertTransportCompany): Promise<TransportCompany>;
  updateTransportCompany(id: string, data: Partial<TransportCompany>): Promise<TransportCompany>;
  deleteTransportCompany(id: string): Promise<void>;
  bulkCreateTransportCompanies(data: InsertTransportCompany[]): Promise<TransportCompany[]>;

  getAllAirlineAgencies(): Promise<AirlineAgency[]>;
  getAirlineAgency(id: string): Promise<AirlineAgency | undefined>;
  createAirlineAgency(data: InsertAirlineAgency): Promise<AirlineAgency>;
  updateAirlineAgency(id: string, data: Partial<AirlineAgency>): Promise<AirlineAgency>;
  deleteAirlineAgency(id: string): Promise<void>;
  bulkCreateAirlineAgencies(data: InsertAirlineAgency[]): Promise<AirlineAgency[]>;

  getBusTypes(companyId: string): Promise<BusType[]>;
  getAllBusTypes(): Promise<BusType[]>;
  createBusType(data: InsertBusType): Promise<BusType>;
  updateBusType(id: string, data: Partial<BusType>): Promise<BusType>;
  deleteBusType(id: string): Promise<void>;

  getTransportRoutes(companyId: string): Promise<TransportRoute[]>;
  getAllTransportRoutes(): Promise<TransportRoute[]>;
  createTransportRoute(data: InsertTransportRoute): Promise<TransportRoute>;
  updateTransportRoute(id: string, data: Partial<TransportRoute>): Promise<TransportRoute>;
  deleteTransportRoute(id: string): Promise<void>;

  getRoutePricing(routeId: string): Promise<TransportRoutePricing[]>;
  getAllRoutePricing(): Promise<TransportRoutePricing[]>;
  createRoutePricing(data: InsertTransportRoutePricing): Promise<TransportRoutePricing>;
  updateRoutePricing(id: string, data: Partial<TransportRoutePricing>): Promise<TransportRoutePricing>;
  deleteRoutePricing(id: string): Promise<void>;

  getTransportBookings(companyId?: string): Promise<TransportBooking[]>;
  getTransportBookingsPage(companyId: string | undefined, page: number, pageSize: number): Promise<{ rows: TransportBooking[]; total: number }>;
  getTransportBooking(id: string): Promise<TransportBooking | undefined>;
  createTransportBooking(data: InsertTransportBooking): Promise<TransportBooking>;
  updateTransportBooking(id: string, data: Partial<TransportBooking>): Promise<TransportBooking>;

  getTransportInvoices(companyId?: string): Promise<TransportInvoice[]>;
  getTransportInvoicesPage(companyId: string | undefined, page: number, pageSize: number): Promise<{ rows: TransportInvoice[]; total: number }>;
  getTransportInvoice(id: string): Promise<TransportInvoice | undefined>;
  createTransportInvoice(data: InsertTransportInvoice): Promise<TransportInvoice>;
  updateTransportInvoice(id: string, data: Partial<TransportInvoice>): Promise<TransportInvoice>;

  getTransportPayments(companyId?: string): Promise<TransportPayment[]>;
  getTransportPaymentsPage(companyId: string | undefined, page: number, pageSize: number): Promise<{ rows: TransportPayment[]; total: number }>;
  createTransportPayment(data: InsertTransportPayment): Promise<TransportPayment>;

  // Newly Added Tables
  getSightImages(sightId: string): Promise<SightImage[]>;
  createSightImage(data: InsertSightImage): Promise<SightImage>;
  getSightHours(sightId: string): Promise<SightHour[]>;
  createSightHour(data: InsertSightHour): Promise<SightHour>;
  getSightTicketPrices(sightId: string): Promise<SightTicketPrice[]>;
  createSightTicketPrice(data: InsertSightTicketPrice): Promise<SightTicketPrice>;

  getHotelImages(hotelId: string): Promise<HotelImage[]>;
  createHotelImage(data: InsertHotelImage): Promise<HotelImage>;
  getHotelAmenities(hotelId: string): Promise<HotelAmenity[]>;
  createHotelAmenity(data: InsertHotelAmenity): Promise<HotelAmenity>;
  getHotelRoomTypes(hotelId: string): Promise<HotelRoomType[]>;
  createHotelRoomType(data: InsertHotelRoomType): Promise<HotelRoomType>;

  getCustomTours(customerId: string): Promise<CustomTour[]>;
  getCustomTour(id: string): Promise<CustomTour | undefined>;
  createCustomTour(data: InsertCustomTour): Promise<CustomTour>;
  updateCustomTour(id: string, data: Partial<CustomTour>): Promise<CustomTour>;

  getCustomTourDays(customTourId: string): Promise<CustomTourDay[]>;
  createCustomTourDay(data: InsertCustomTourDay): Promise<CustomTourDay>;

  getCustomTourDayItems(customTourDayId: string): Promise<CustomTourDayItem[]>;
  createCustomTourDayItem(data: InsertCustomTourDayItem): Promise<CustomTourDayItem>;

  getTourQuotes(customTourId: string): Promise<TourQuote[]>;
  createTourQuote(data: InsertTourQuote): Promise<TourQuote>;
  getTourQuoteItems(quoteId: string): Promise<TourQuoteItem[]>;
  createTourQuoteItem(data: InsertTourQuoteItem): Promise<TourQuoteItem>;

  createScraperRun(data: InsertScraperRun): Promise<ScraperRun>;
  updateScraperRun(id: string, data: Partial<ScraperRun>): Promise<ScraperRun>;
  createScraperError(data: InsertScraperError): Promise<ScraperError>;

  createAiGenerationJob(data: InsertAiGenerationJob): Promise<AiGenerationJob>;
  updateAiGenerationJob(id: string, data: Partial<AiGenerationJob>): Promise<AiGenerationJob>;
  getAiGenerationJob(id: string): Promise<AiGenerationJob | undefined>;

  createAiGeneratedItinerary(data: InsertAiGeneratedItinerary): Promise<AiGeneratedItinerary>;
  getAiGeneratedItineraryByJob(jobId: string): Promise<AiGeneratedItinerary | undefined>;

  getRegionsByCountry(countryId: string): Promise<Region[]>;
  createRegion(data: InsertRegion): Promise<Region>;
  updateTransportPayment(id: string, data: Partial<TransportPayment>): Promise<TransportPayment>;

  getHotelRates(): Promise<HotelRate[]>;
  getHotelRate(id: string): Promise<HotelRate | undefined>;
  createHotelRate(data: InsertHotelRate): Promise<HotelRate>;
  bulkCreateHotelRates(data: InsertHotelRate[]): Promise<HotelRate[]>;
  updateHotelRate(id: string, data: Partial<HotelRate>): Promise<HotelRate>;
  deleteHotelRate(id: string): Promise<void>;

  getTransportRates(): Promise<TransportRate[]>;
  getTransportRate(id: string): Promise<TransportRate | undefined>;
  createTransportRate(data: InsertTransportRate): Promise<TransportRate>;
  bulkCreateTransportRates(data: InsertTransportRate[]): Promise<TransportRate[]>;
  updateTransportRate(id: string, data: Partial<TransportRate>): Promise<TransportRate>;
  deleteTransportRate(id: string): Promise<void>;

  getGuideRates(): Promise<GuideRate[]>;
  getGuideRate(id: string): Promise<GuideRate | undefined>;
  createGuideRate(data: InsertGuideRate): Promise<GuideRate>;
  bulkCreateGuideRates(data: InsertGuideRate[]): Promise<GuideRate[]>;
  updateGuideRate(id: string, data: Partial<GuideRate>): Promise<GuideRate>;
  deleteGuideRate(id: string): Promise<void>;

  getSightsRates(): Promise<SightsRate[]>;
  getSightsRate(id: string): Promise<SightsRate | undefined>;
  createSightsRate(data: InsertSightsRate): Promise<SightsRate>;
  bulkCreateSightsRates(data: InsertSightsRate[]): Promise<SightsRate[]>;
  updateSightsRate(id: string, data: Partial<SightsRate>): Promise<SightsRate>;
  deleteSightsRate(id: string): Promise<void>;
  deleteSightsRate(id: string): Promise<void>;

  getAirlineRates(): Promise<AirlineRate[]>;
  getAirlineRate(id: string): Promise<AirlineRate | undefined>;
  createAirlineRate(data: InsertAirlineRate): Promise<AirlineRate>;
  bulkCreateAirlineRates(data: InsertAirlineRate[]): Promise<AirlineRate[]>;
  updateAirlineRate(id: string, data: Partial<AirlineRate>): Promise<AirlineRate>;
  deleteAirlineRate(id: string): Promise<void>;

  getInvoices(bookingId?: string): Promise<Invoice[]>;
  getInvoice(id: string): Promise<Invoice | undefined>;
  createInvoice(data: InsertInvoice): Promise<Invoice>;
  updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice>;
  deleteInvoice(id: string): Promise<void>;

  getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]>;
  createAuditLog(data: InsertAuditLog): Promise<AuditLog>;

  getNotifications(userId: string): Promise<Notification[]>;
  getNotification(id: string): Promise<Notification | undefined>;
  createNotification(data: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification>;

  initializeBookingWorkflows(bookingId: string): Promise<void>;
  cancelBookingWorkflows(bookingId: string, reason?: string): Promise<void>;
  getBookingByJoinCode(code: string): Promise<Booking | undefined>;
  getPublicGroupsByDeparture(departureId: string): Promise<Booking[]>;
  getPublicGroups(): Promise<any[]>;
  getLeaderDashboardAlerts(bookingIds: string[]): Promise<{ missingDocs: number; pendingPayments: number; unreadMessages: number }>;
  getLeaderPaymentsReport(userId: string, bookings: Booking[]): Promise<any[]>;
  getAnalytics(): Promise<any>;

  // Markup Rules
  getMarkupRules(): Promise<MarkupRule[]>;
  createMarkupRule(data: InsertMarkupRule): Promise<MarkupRule>;
  updateMarkupRule(id: string, data: Partial<MarkupRule>): Promise<MarkupRule>;
  deleteMarkupRule(id: string): Promise<void>;

  // Global Settings
  getGlobalSettings(): Promise<GlobalSetting[]>;
  getGlobalSettingByKey(key: string): Promise<GlobalSetting | undefined>;
  updateGlobalSetting(key: string, value: string): Promise<GlobalSetting>;

  // Import Jobs & Data Sources
  getImportJobs(): Promise<ImportJob[]>;
  getImportJob(id: string): Promise<ImportJob | undefined>;
  createImportJob(data: any): Promise<ImportJob>;
  updateImportJob(id: string, data: any): Promise<ImportJob>;
  
  getDataSources(): Promise<DataSource[]>;
  createDataSource(data: any): Promise<DataSource>;

  // Price Snapshots
  createHotelPriceSnapshot(data: any): Promise<HotelPriceSnapshot>;
  getHotelPriceSnapshots(hotelId: string): Promise<HotelPriceSnapshot[]>;
  createFlightPriceSnapshot(data: any): Promise<FlightPriceSnapshot>;
  getFlightPriceSnapshots(origin: string, destination: string): Promise<FlightPriceSnapshot[]>;
  getAffiliate(id: string): Promise<Affiliate | undefined>;
  createAffiliate(data: InsertAffiliate): Promise<Affiliate>;
  updateAffiliate(id: string, data: Partial<Affiliate>): Promise<Affiliate>;

  // Master Records (Generic Dashboard)
  getMasterRecords(type?: string): Promise<MasterRecord[]>;
  getMasterRecord(id: string): Promise<MasterRecord | undefined>;
  createMasterRecord(data: InsertMasterRecord): Promise<MasterRecord>;
  updateMasterRecord(id: string, data: Partial<MasterRecord>): Promise<MasterRecord>;
  deleteMasterRecord(id: string): Promise<void>;
  
  // Affiliates
  createAffiliatePayout(data: InsertAffiliatePayout): Promise<AffiliatePayout>;
  createAffiliateReferral(data: InsertAffiliateReferral): Promise<AffiliateReferral>;
  
  // Stats
  getGlobalSalesStats(): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  // One-time maintenance: remap a legacy role enum value to its replacement.
  async remapLegacyRoles(fromRole: string, toRole: string): Promise<number> {
    const rows = await db
      .update(userProfiles)
      .set({ role: toRole as any })
      .where(eq(userProfiles.role, fromRole as any))
      .returning({ userId: userProfiles.userId });
    return rows.length;
  }

  /**
   * AUTHZ-02 (fixed): no longer auto-creates a profile. Every legitimate
   * session acquires a profile at registration or customer-portal login
   * (authStorage.ensureProfile); a session whose user has NO profile means a
   * provisioning gap (e.g. staff account never set up) and must fail closed
   * instead of being silently treated as a fresh "customer".
   */
  async getOrCreateProfile(userId: string): Promise<UserProfile> {
    const existing = await this.getProfileByUserId(userId);
    if (existing) return existing;
    console.warn(`[authz] no profile provisioned for user ${userId} — refusing access (was previously auto-created)`);
    const err: any = new Error("Account profile is not provisioned. Contact an administrator.");
    err.statusCode = 403;
    throw err;
  }

  async getProfile(id: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.id, id));
    return profile;
  }

  async getProfileByUserId(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async getProfileByUserIdWithEmail(userId: string): Promise<(UserProfile & { user?: { email: string | null; firstName: string | null; lastName: string | null; username: string | null } }) | undefined> {
    const [row] = await db.select({
      profile: userProfiles,
      user: { email: users.email, firstName: users.firstName, lastName: users.lastName, username: users.username },
    }).from(userProfiles).where(eq(userProfiles.userId, userId)).leftJoin(users, eq(userProfiles.userId, users.id));
    if (!row) return undefined;
    return { ...row.profile, user: row.user || undefined };
  }

  async getAllProfiles(): Promise<(UserProfile & { user?: { email: string | null; firstName: string | null; lastName: string | null; username: string | null } })[]> {
    const rows = await db.select({
      profile: userProfiles,
      user: { email: users.email, firstName: users.firstName, lastName: users.lastName, username: users.username },
    }).from(userProfiles).leftJoin(users, eq(userProfiles.userId, users.id));
    return rows.map(r => ({ ...r.profile, user: r.user || undefined }));
  }

  async updateProfile(id: string, data: Partial<UserProfile>): Promise<UserProfile> {
    const [profile] = await db.update(userProfiles).set(data).where(eq(userProfiles.id, id)).returning();
    return profile;
  }

  async getAllTours(): Promise<Tour[]> {
    return db.select().from(tours).orderBy(desc(tours.createdAt));
  }

  async getTourAccommodationSummary(): Promise<Record<string, { hotels: string[]; guides: string[] }>> {
    const rows = await db
      .select({
        tourId: tourDays.tourId,
        hotelName: hotels.name,
        guideName: guideRates.guideName,
      })
      .from(tourDayItems)
      .innerJoin(tourDays, eq(tourDayItems.tourDayId, tourDays.id))
      .leftJoin(hotels, eq(tourDayItems.hotelId, hotels.id))
      .leftJoin(guideRates, eq(tourDayItems.guideId, guideRates.id))
      .where(or(isNotNull(tourDayItems.hotelId), isNotNull(tourDayItems.guideId)));

    const summary: Record<string, { hotels: string[]; guides: string[] }> = {};
    for (const row of rows) {
      const entry = summary[row.tourId] || (summary[row.tourId] = { hotels: [], guides: [] });
      if (row.hotelName && !entry.hotels.includes(row.hotelName)) entry.hotels.push(row.hotelName);
      if (row.guideName && !entry.guides.includes(row.guideName)) entry.guides.push(row.guideName);
    }
    return summary;
  }

  async getPublishedTours(): Promise<(Tour & { minDate?: string; maxDate?: string })[]> {
    const publishedTours = await db.select().from(tours).where(eq(tours.isPublished, true)).orderBy(desc(tours.createdAt));
    const allDepartures = await db.select().from(tourDepartures).where(eq(tourDepartures.status, "open"));

    return publishedTours.map(tour => {
      const tourDeps = allDepartures.filter(d => d.tourId === tour.id);
      if (tourDeps.length === 0) return tour;

      const dates = tourDeps.map(d => new Date(d.startDate).getTime());
      return {
        ...tour,
        minDate: tourDeps.reduce((min, d) => !min || d.startDate < min ? d.startDate : min, ""),
        maxDate: tourDeps.reduce((max, d) => !max || d.startDate > max ? d.startDate : max, ""),
      };
    });
  }

  async getTour(id: string): Promise<Tour | undefined> {
    const [tour] = await db.select().from(tours).where(eq(tours.id, id));
    return tour;
  }

  async createTour(data: InsertTour): Promise<Tour> {
    const [tour] = await db.insert(tours).values(data).returning();
    return tour;
  }

  async updateTour(id: string, data: Partial<Tour>, userId?: string, userName?: string): Promise<Tour> {
    const current = await this.getTour(id);
    const [tour] = await db.update(tours).set(data).where(eq(tours.id, id)).returning();
    if (current) await this.logChange("tour", id, "updated", current, data, userId, userName);
    return tour;
  }

  async upsertTourFull(id: string | "new-tour", tourData: InsertTour, daysData: InsertTourDay[], userId?: string, userName?: string): Promise<Tour> {
    return await db.transaction(async (tx) => {
      let tourId = id;
      let tourRes: Tour;

      if (id === "new-tour") {
        const [created] = await tx.insert(tours).values(tourData).returning();
        tourId = created.id;
        tourRes = created;
      } else {
        const currentArr = await tx.select().from(tours).where(eq(tours.id, id));
        const current = currentArr[0];
        const [updated] = await tx.update(tours).set(tourData).where(eq(tours.id, id)).returning();
        tourRes = updated;
        
        if (current && userId && userName) {
          const diff: any = {};
          let changed = false;
          for (const key in tourData) {
            if (JSON.stringify((current as any)[key]) !== JSON.stringify((tourData as any)[key])) {
              diff[key] = { from: (current as any)[key], to: (tourData as any)[key] };
              changed = true;
            }
          }
          if (changed) {
            await tx.insert(auditLogs).values({
              entityType: "tour",
              entityId: id,
              action: "updated",
              changedBy: userId,
              changedByName: userName,
              note: JSON.stringify(diff),
            });
          }
        }
      }

      const existingDays = id === "new-tour" ? [] : await tx.select().from(tourDays).where(eq(tourDays.tourId, tourId));
      const incomingDayIds = daysData.filter(d => (d as any).id).map(d => (d as any).id);

      for (const existing of existingDays) {
        if (!incomingDayIds.includes(existing.id)) {
          await tx.delete(tourDayItems).where(eq(tourDayItems.tourDayId, existing.id));
          await tx.delete(tourDays).where(eq(tourDays.id, existing.id));
        }
      }

      for (const d of daysData) {
        const { items, id: dayId, ...dayFields } = d as any;
        let resolvedDayId: string;

        if (dayId && existingDays.some(ex => ex.id === dayId)) {
          await tx.update(tourDays).set({ ...dayFields, tourId }).where(eq(tourDays.id, dayId));
          resolvedDayId = dayId;
        } else {
          const [createdDay] = await tx.insert(tourDays).values({ ...dayFields, tourId }).returning();
          resolvedDayId = createdDay.id;
        }

        const existingItems = await tx.select().from(tourDayItems).where(eq(tourDayItems.tourDayId, resolvedDayId));
        const incomingItemIds = (items || []).filter((it: any) => it.id).map((it: any) => it.id);

        for (const exItem of existingItems) {
          if (!incomingItemIds.includes(exItem.id)) {
            await tx.delete(tourDayItems).where(eq(tourDayItems.id, exItem.id));
          }
        }

        for (const it of (items || [])) {
          const { id: itemId, ...itemFields } = it;
          if (itemId && existingItems.some(ex => ex.id === itemId)) {
            await tx.update(tourDayItems).set({ ...itemFields, tourDayId: resolvedDayId }).where(eq(tourDayItems.id, itemId));
          } else {
            await tx.insert(tourDayItems).values({ ...itemFields, tourDayId: resolvedDayId });
          }
        }
      }

      return tourRes;
    });
  }

  async deleteTour(id: string): Promise<void> {
    await db.delete(tours).where(eq(tours.id, id));
  }

  async getTourDays(tourId: string): Promise<TourDay[]> {
    return db.select().from(tourDays).where(eq(tourDays.tourId, tourId));
  }

  async createTourDay(data: InsertTourDay): Promise<TourDay> {
    const [day] = await db.insert(tourDays).values(data).returning();
    return day;
  }

  async updateTourDay(id: string, data: Partial<TourDay>): Promise<TourDay> {
    const [day] = await db.update(tourDays).set(data).where(eq(tourDays.id, id)).returning();
    return day;
  }

  async deleteTourDay(id: string): Promise<void> {
    await db.delete(tourDays).where(eq(tourDays.id, id));
  }

  async getAllDepartures(): Promise<TourDeparture[]> {
    return db.select().from(tourDepartures);
  }

  async getDeparturesByTour(tourId: string): Promise<TourDeparture[]> {
    return db.select().from(tourDepartures).where(eq(tourDepartures.tourId, tourId));
  }

  async getDeparture(id: string): Promise<TourDeparture | undefined> {
    const [dep] = await db.select().from(tourDepartures).where(eq(tourDepartures.id, id));
    return dep;
  }

  async createDeparture(data: InsertTourDeparture): Promise<TourDeparture> {
    const [dep] = await db.insert(tourDepartures).values(data).returning();
    return dep;
  }

  async updateDeparture(id: string, data: Partial<TourDeparture>, tx?: any): Promise<TourDeparture> {
    const client = tx || db;
    const [dep] = await client.update(tourDepartures).set(data).where(eq(tourDepartures.id, id)).returning();
    return dep;
  }

  async deleteDeparture(id: string): Promise<void> {
    await db.delete(tourDepartures).where(eq(tourDepartures.id, id));
  }

  async getBookingsByDeparture(departureId: string): Promise<Booking[]> {
    return db.select().from(bookings).where(eq(bookings.departureId, departureId));
  }

  async getAllBookings(): Promise<Booking[]> {
    return db.select().from(bookings).orderBy(desc(bookings.createdAt));
  }

  async getBooking(id: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.id, id));
    return booking;
  }

  async getBookingsByCustomer(customerId: string): Promise<Booking[]> {
    return db.select().from(bookings).where(eq(bookings.customerId, customerId)).orderBy(desc(bookings.createdAt));
  }

  async getBookingByJoinCode(code: string): Promise<Booking | undefined> {
    const [booking] = await db.select().from(bookings).where(eq(bookings.joinCode, code));
    return booking;
  }

  async createBooking(data: InsertBooking, tx?: any): Promise<Booking> {
    const client = tx || db;
    const [booking] = await client.insert(bookings).values(data).returning();
    return booking;
  }

  async updateBooking(id: string, data: Partial<Booking>, userId?: string, userName?: string): Promise<Booking> {
    const current = await this.getBooking(id);
    const [booking] = await db.update(bookings).set(data).where(eq(bookings.id, id)).returning();
    if (current) await this.logChange("booking", id, "updated", current, data, userId, userName);
    return booking;
  }

  async deleteBooking(id: string): Promise<void> {
    await db.transaction(async (tx) => {
      // Cascade delete manually since schema lacks onDelete: "cascade"
      await tx.delete(travelers).where(eq(travelers.bookingId, id));
      await tx.delete(documents).where(eq(documents.bookingId, id));
      await tx.delete(payments).where(eq(payments.bookingId, id));
      await tx.delete(messages).where(eq(messages.bookingId, id));
      await tx.delete(bookingAssignments).where(eq(bookingAssignments.bookingId, id));

      const wfList = await tx.select().from(bookingWorkflows).where(eq(bookingWorkflows.bookingId, id));
      for (const wf of wfList) {
        await tx.delete(workflowSteps).where(eq(workflowSteps.workflowId, wf.id));
      }
      await tx.delete(bookingWorkflows).where(eq(bookingWorkflows.bookingId, id));

      await tx.delete(bookings).where(eq(bookings.id, id));
    });
  }

  async getTraveler(id: string): Promise<Traveler | undefined> {
    const [traveler] = await db.select().from(travelers).where(eq(travelers.id, id));
    return traveler;
  }

  async getTravelers(bookingId: string): Promise<Traveler[]> {
    return db.select().from(travelers).where(eq(travelers.bookingId, bookingId));
  }

  async createTraveler(data: InsertTraveler): Promise<Traveler> {
    const [traveler] = await db.insert(travelers).values(data).returning();
    return traveler;
  }

  async updateTraveler(id: string, data: Partial<Traveler>): Promise<Traveler> {
    const [traveler] = await db.update(travelers).set(data).where(eq(travelers.id, id)).returning();
    return traveler;
  }

  async deleteTraveler(id: string): Promise<void> {
    await db.delete(travelers).where(eq(travelers.id, id));
  }

  async getAllAssignments(): Promise<BookingAssignment[]> {
    return db.select().from(bookingAssignments).orderBy(desc(bookingAssignments.assignedAt));
  }

  async getAssignments(bookingId: string): Promise<BookingAssignment[]> {
    return db.select().from(bookingAssignments).where(eq(bookingAssignments.bookingId, bookingId));
  }

  async createAssignment(data: InsertBookingAssignment): Promise<BookingAssignment> {
    const [assignment] = await db.insert(bookingAssignments).values(data).returning();
    
    // Auto-Notify Supplier
    if (assignment.assignedUserId) {
      const booking = await this.getBooking(assignment.bookingId);
      await this.createNotification({
        userId: assignment.assignedUserId,
        title: "New Service Assignment 📋",
        message: `You have been assigned to handle the ${assignment.serviceType} for booking ${booking?.bookingCode || assignment.bookingId}.`,
        type: "assignment"
      });
    }
    
    return assignment;
  }

  async updateAssignment(id: string, data: Partial<BookingAssignment>): Promise<BookingAssignment> {
    const [assignment] = await db.update(bookingAssignments).set(data).where(eq(bookingAssignments.id, id)).returning();
    return assignment;
  }

  async deleteAssignment(id: string): Promise<void> {
    await db.delete(bookingAssignments).where(eq(bookingAssignments.id, id));
  }

  async getAllWorkflows(): Promise<BookingWorkflow[]> {
    return db.select().from(bookingWorkflows).orderBy(desc(bookingWorkflows.updatedAt));
  }

  async getWorkflows(bookingId: string): Promise<BookingWorkflow[]> {
    return db.select().from(bookingWorkflows).where(eq(bookingWorkflows.bookingId, bookingId));
  }

  async getWorkflowsByUser(userId: string): Promise<(BookingWorkflow & { booking?: Booking })[]> {
    const rows = await db
      .select({ workflow: bookingWorkflows, booking: bookings })
      .from(bookingWorkflows)
      .leftJoin(bookings, eq(bookingWorkflows.bookingId, bookings.id))
      .where(eq(bookingWorkflows.assignedUserId, userId));
    return rows.map(r => ({ ...r.workflow, booking: r.booking ?? undefined }));
  }

  async getWorkflow(id: string): Promise<BookingWorkflow | undefined> {
    const [wf] = await db.select().from(bookingWorkflows).where(eq(bookingWorkflows.id, id));
    return wf;
  }

  async createWorkflow(data: InsertBookingWorkflow): Promise<BookingWorkflow> {
    const [wf] = await db.insert(bookingWorkflows).values(data).returning();
    return wf;
  }

  async updateWorkflow(id: string, data: Partial<BookingWorkflow>): Promise<BookingWorkflow> {
    const old = await this.getWorkflow(id);
    const [wf] = await db.update(bookingWorkflows).set({ ...data, updatedAt: new Date() }).where(eq(bookingWorkflows.id, id)).returning();
    
    // Notify Supplier on Status Change or Reassignment
    if (wf.assignedUserId && (data.status || data.assignedUserId)) {
      await this.createNotification({
        userId: wf.assignedUserId,
        title: "Workflow Update 🔄",
        message: `Your assignment for ${wf.serviceType} has been updated to: ${wf.status}.`,
        type: "assignment"
      });
    }

    return wf;
  }

  async getWorkflowSteps(workflowId: string): Promise<WorkflowStep[]> {
    return db.select().from(workflowSteps).where(eq(workflowSteps.workflowId, workflowId));
  }

  async getWorkflowStep(id: string): Promise<WorkflowStep | undefined> {
    const [step] = await db.select().from(workflowSteps).where(eq(workflowSteps.id, id));
    return step;
  }

  async createWorkflowStep(data: InsertWorkflowStep): Promise<WorkflowStep> {
    const [step] = await db.insert(workflowSteps).values(data).returning();
    return step;
  }

  async updateWorkflowStep(id: string, data: Partial<WorkflowStep>): Promise<WorkflowStep> {
    const [step] = await db.update(workflowSteps).set({ ...data, updatedAt: new Date() }).where(eq(workflowSteps.id, id)).returning();
    return step;
  }

  async getAllDocuments(): Promise<Document[]> {
    return db.select().from(documents).orderBy(desc(documents.createdAt));
  }

  async getDocuments(bookingId: string): Promise<Document[]> {
    return db.select().from(documents).where(eq(documents.bookingId, bookingId));
  }

  async createDocument(data: InsertDocument): Promise<Document> {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
  }

  async updateDocument(id: string, data: Partial<Document>): Promise<Document> {
    const [doc] = await db.update(documents).set(data).where(eq(documents.id, id)).returning();
    return doc;
  }

  async getAllMessages(): Promise<Message[]> {
    return db.select().from(messages).orderBy(desc(messages.createdAt));
  }

  async getMessages(bookingId: string): Promise<Message[]> {
    return db.select().from(messages).where(eq(messages.bookingId, bookingId)).orderBy(desc(messages.createdAt));
  }

  async createMessage(data: InsertMessage): Promise<Message> {
    const [msg] = await db.insert(messages).values(data).returning();
    return msg;
  }

  async getAllPayments(): Promise<Payment[]> {
    return db.select().from(payments).orderBy(desc(payments.createdAt));
  }

  async getPayments(bookingId: string): Promise<Payment[]> {
    return db.select().from(payments).where(eq(payments.bookingId, bookingId));
  }

  async createPayment(data: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(data).returning();
    return payment;
  }

  async updatePayment(id: string, data: Partial<Payment>): Promise<Payment> {
    const [payment] = await db.update(payments).set(data).where(eq(payments.id, id)).returning();
    return payment;
  }

  async getGroupParticipants(leaderBookingId: string): Promise<Booking[]> {
    const leaderBooking = await this.getBooking(leaderBookingId);
    if (!leaderBooking) return [];
    return db.select().from(bookings)
      .where(and(
        eq(bookings.bookingType, "join_leader_group"),
        eq(bookings.leaderUserId, leaderBooking.customerId)
      ))
      .orderBy(desc(bookings.createdAt));
  }

  async getBookingsByLeader(leaderUserId: string): Promise<Booking[]> {
    return db.select().from(bookings)
      .where(eq(bookings.leaderUserId, leaderUserId))
      .orderBy(desc(bookings.createdAt));
  }

  // Countries
  async getAllCountries(): Promise<Country[]> {
    return db.select().from(countries);
  }

  async getCountry(id: string): Promise<Country | undefined> {
    const [country] = await db.select().from(countries).where(eq(countries.id, id));
    return country;
  }

  async createCountry(data: InsertCountry): Promise<Country> {
    const [country] = await db.insert(countries).values(data).returning();
    return country;
  }

  async updateCountry(id: string, data: Partial<Country>): Promise<Country> {
    const [country] = await db.update(countries).set(data).where(eq(countries.id, id)).returning();
    return country;
  }

  async deleteCountry(id: string): Promise<void> {
    await db.delete(countries).where(eq(countries.id, id));
  }

  async bulkCreateCountries(data: InsertCountry[]): Promise<Country[]> {
    if (!data || data.length === 0) return [];
    return db.insert(countries).values(data).onConflictDoUpdate({
      target: countries.code,
      set: {
        iso3: sql`EXCLUDED.iso3`,
        name: sql`EXCLUDED.name`,
        capitalCity: sql`EXCLUDED.capital_city`,
        continent: sql`EXCLUDED.continent`,
        region: sql`EXCLUDED.region`,
        subregion: sql`EXCLUDED.subregion`,
        currencyCode: sql`EXCLUDED.currency_code`,
        currencyName: sql`EXCLUDED.currency_name`,
        languages: sql`EXCLUDED.languages`,
        phoneCode: sql`EXCLUDED.phone_code`,
        flagUrl: sql`EXCLUDED.flag_url`,
        latitude: sql`EXCLUDED.latitude`,
        longitude: sql`EXCLUDED.longitude`,
        population: sql`EXCLUDED.population`,
        lastSyncedAt: sql`EXCLUDED.last_synced_at`,
      }
    }).returning();
  }

  // Cities
  async getAllCities(): Promise<City[]> {
    return db.select().from(cities);
  }

  async getCity(id: string): Promise<City | undefined> {
    const [city] = await db.select().from(cities).where(eq(cities.id, id));
    return city;
  }

  async createCity(data: InsertCity): Promise<City> {
    const [city] = await db.insert(cities).values(data).returning();
    return city;
  }

  async updateCity(id: string, data: Partial<City>): Promise<City> {
    const [city] = await db.update(cities).set(data).where(eq(cities.id, id)).returning();
    return city;
  }

  async deleteCity(id: string): Promise<void> {
    await db.delete(cities).where(eq(cities.id, id));
  }

  async deleteInvoice(id: string): Promise<void> {
    await db.delete(invoices).where(eq(invoices.id, id));
  }

  async bulkCreateCities(data: InsertCity[]): Promise<City[]> {
    if (!data || data.length === 0) return [];
    return db.insert(cities).values(data).onConflictDoNothing().returning();
  }

  // Airports
  async getAllAirports(): Promise<Airport[]> {
    return db.select().from(airports);
  }

  async getAirport(id: string): Promise<Airport | undefined> {
    const [airport] = await db.select().from(airports).where(eq(airports.id, id));
    return airport;
  }

  async createAirport(data: InsertAirport): Promise<Airport> {
    const [airport] = await db.insert(airports).values(data).returning();
    return airport;
  }

  async updateAirport(id: string, data: Partial<Airport>): Promise<Airport> {
    const [airport] = await db.update(airports).set(data).where(eq(airports.id, id)).returning();
    return airport;
  }

  async deleteAirport(id: string): Promise<void> {
    await db.delete(airports).where(eq(airports.id, id));
  }

  async bulkCreateAirports(data: InsertAirport[]): Promise<Airport[]> {
    if (!data || data.length === 0) return [];
    return db.insert(airports).values(data).onConflictDoNothing().returning();
  }

  // Sights
  async getAllSights(): Promise<Sight[]> {
    return db.select().from(sights);
  }

  async getSight(id: string): Promise<Sight | undefined> {
    const [sight] = await db.select().from(sights).where(eq(sights.id, id));
    return sight;
  }

  private calculateQualityScore(sight: Partial<Sight>): number {
    let score = 0;
    if (sight.description && sight.description.length > 50) score += 20;
    if (sight.imageUrl) score += 20;
    if (sight.latitude && sight.longitude) score += 20;
    if (sight.openingHoursRaw) score += 10;
    if (sight.individualTicketCost !== undefined && sight.individualTicketCost !== null) score += 20;
    // Add 10 if we have contact info (website or phone)
    if (sight.officialWebsite || sight.phone) score += 10;
    return score;
  }

  async createSight(data: InsertSight): Promise<Sight> {
    const qualityScore = this.calculateQualityScore(data as any);
    const [sight] = await db.insert(sights).values({ ...data, dataQualityScore: qualityScore } as any).returning();
    
    // Auto-Enrichment Hook
    if (qualityScore < 40) {
      this.triggerSightEnrichment(sight.id, sight.name);
    }
    
    return sight;
  }

  async updateSight(id: string, data: Partial<Sight>): Promise<Sight> {
    const current = await this.getSight(id);
    const merged = { ...current, ...data };
    const qualityScore = this.calculateQualityScore(merged as any);
    
    const [sight] = await db.update(sights).set({ ...data, dataQualityScore: qualityScore }).where(eq(sights.id, id)).returning();
    
    if (qualityScore < 40) {
      this.triggerSightEnrichment(sight.id, sight.name);
    }

    return sight;
  }

  private async triggerSightEnrichment(id: string, name: string) {
    // Non-blocking background task
    setTimeout(async () => {
      try {
        console.log(`[Background] Starting enrichment for ${name}`);
        const { scraperService } = await import("./lib/scrapers");
        const enriched = await scraperService.enrichSightData(name);
        await db.update(sights).set(enriched).where(eq(sights.id, id));
        console.log(`[Background] Finished enrichment for ${name}`);
      } catch (e) {
        console.error(`[Background] Enrichment failed for ${name}:`, e);
      }
    }, 1000);
  }

  async deleteSight(id: string): Promise<void> {
    await db.delete(sights).where(eq(sights.id, id));
  }

  async bulkCreateSights(data: InsertSight[]): Promise<Sight[]> {
    if (!data || data.length === 0) return [];
    const enriched = data.map(d => ({
      ...d,
      dataQualityScore: this.calculateQualityScore(d as any)
    }));
    return db.insert(sights).values(enriched as any).onConflictDoNothing().returning();
  }

  // Hotels
  async getAllHotels(): Promise<Hotel[]> {
    return db.select().from(hotels);
  }

  async getHotelsByCity(cityId: string): Promise<Hotel[]> {
    return db.select().from(hotels).where(eq(hotels.cityId, cityId));
  }

  async getHotel(id: string): Promise<Hotel | undefined> {
    const [hotel] = await db.select().from(hotels).where(eq(hotels.id, id));
    return hotel;
  }

  async createHotel(data: InsertHotel): Promise<Hotel> {
    const [hotel] = await db.insert(hotels).values(data).returning();
    return hotel;
  }

  async updateHotel(id: string, data: Partial<Hotel>, userId?: string, userName?: string): Promise<Hotel> {
    const current = await this.getHotel(id);
    const [hotel] = await db.update(hotels).set(data).where(eq(hotels.id, id)).returning();
    if (current) await this.logChange("hotel", id, "updated", current, data, userId, userName);
    return hotel;
  }

  async deleteHotel(id: string): Promise<void> {
    await db.delete(hotels).where(eq(hotels.id, id));
  }

  async bulkCreateHotels(data: InsertHotel[]): Promise<Hotel[]> {
    if (!data || data.length === 0) return [];
    return db.insert(hotels).values(data).onConflictDoNothing().returning();
  }

  // Transport Companies
  async getAllTransportCompanies(): Promise<TransportCompany[]> {
    return db.select().from(transportCompanies);
  }

  async getTransportCompany(id: string): Promise<TransportCompany | undefined> {
    const [company] = await db.select().from(transportCompanies).where(eq(transportCompanies.id, id));
    return company;
  }

  async createTransportCompany(data: InsertTransportCompany): Promise<TransportCompany> {
    const [company] = await db.insert(transportCompanies).values(data).returning();
    return company;
  }

  async updateTransportCompany(id: string, data: Partial<TransportCompany>): Promise<TransportCompany> {
    const [company] = await db.update(transportCompanies).set(data).where(eq(transportCompanies.id, id)).returning();
    return company;
  }

  async deleteTransportCompany(id: string): Promise<void> {
    await db.delete(transportCompanies).where(eq(transportCompanies.id, id));
  }

  async bulkCreateTransportCompanies(data: InsertTransportCompany[]): Promise<TransportCompany[]> {
    if (!data || data.length === 0) return [];
    return db.insert(transportCompanies).values(data).returning();
  }

  // Airline Agencies
  async getAllAirlineAgencies(): Promise<AirlineAgency[]> {
    return db.select().from(airlineAgencies);
  }

  async getAirlineAgency(id: string): Promise<AirlineAgency | undefined> {
    const [agency] = await db.select().from(airlineAgencies).where(eq(airlineAgencies.id, id));
    return agency;
  }

  async createAirlineAgency(data: InsertAirlineAgency): Promise<AirlineAgency> {
    const [agency] = await db.insert(airlineAgencies).values(data).returning();
    return agency;
  }

  async updateAirlineAgency(id: string, data: Partial<AirlineAgency>): Promise<AirlineAgency> {
    const [agency] = await db.update(airlineAgencies).set(data).where(eq(airlineAgencies.id, id)).returning();
    return agency;
  }

  async deleteAirlineAgency(id: string): Promise<void> {
    await db.delete(airlineAgencies).where(eq(airlineAgencies.id, id));
  }

  async bulkCreateAirlineAgencies(data: InsertAirlineAgency[]): Promise<AirlineAgency[]> {
    if (!data || data.length === 0) return [];
    return db.insert(airlineAgencies).values(data).returning();
  }

  // Bus Types
  async getBusTypes(companyId: string): Promise<BusType[]> {
    return db.select().from(busTypes).where(eq(busTypes.companyId, companyId));
  }
  async getAllBusTypes(): Promise<BusType[]> {
    return db.select().from(busTypes);
  }
  async createBusType(data: InsertBusType): Promise<BusType> {
    const [bt] = await db.insert(busTypes).values(data).returning();
    return bt;
  }
  async updateBusType(id: string, data: Partial<BusType>): Promise<BusType> {
    const [bt] = await db.update(busTypes).set(data).where(eq(busTypes.id, id)).returning();
    return bt;
  }
  async deleteBusType(id: string): Promise<void> {
    await db.delete(busTypes).where(eq(busTypes.id, id));
  }

  // Transport Routes
  async getTransportRoutes(companyId: string): Promise<TransportRoute[]> {
    return db.select().from(transportRoutes).where(eq(transportRoutes.companyId, companyId));
  }
  async getAllTransportRoutes(): Promise<TransportRoute[]> {
    return db.select().from(transportRoutes);
  }
  async createTransportRoute(data: InsertTransportRoute): Promise<TransportRoute> {
    const [route] = await db.insert(transportRoutes).values(data).returning();
    return route;
  }
  async updateTransportRoute(id: string, data: Partial<TransportRoute>): Promise<TransportRoute> {
    const [route] = await db.update(transportRoutes).set(data).where(eq(transportRoutes.id, id)).returning();
    return route;
  }
  async deleteTransportRoute(id: string): Promise<void> {
    await db.delete(transportRoutes).where(eq(transportRoutes.id, id));
  }

  // Transport Route Pricing
  async getRoutePricing(routeId: string): Promise<TransportRoutePricing[]> {
    return db.select().from(transportRoutePricing).where(eq(transportRoutePricing.routeId, routeId));
  }
  async getAllRoutePricing(): Promise<TransportRoutePricing[]> {
    return db.select().from(transportRoutePricing);
  }
  async createRoutePricing(data: InsertTransportRoutePricing): Promise<TransportRoutePricing> {
    const [pricing] = await db.insert(transportRoutePricing).values(data).returning();
    return pricing;
  }
  async updateRoutePricing(id: string, data: Partial<TransportRoutePricing>): Promise<TransportRoutePricing> {
    const [pricing] = await db.update(transportRoutePricing).set(data).where(eq(transportRoutePricing.id, id)).returning();
    return pricing;
  }
  async deleteRoutePricing(id: string): Promise<void> {
    await db.delete(transportRoutePricing).where(eq(transportRoutePricing.id, id));
  }

  // Transport Bookings
  async getTransportBookings(companyId?: string): Promise<TransportBooking[]> {
    if (companyId) return db.select().from(transportBookings).where(eq(transportBookings.companyId, companyId)).orderBy(desc(transportBookings.createdAt));
    return db.select().from(transportBookings).orderBy(desc(transportBookings.createdAt));
  }
  async getTransportBookingsPage(companyId: string | undefined, page: number, pageSize: number): Promise<{ rows: TransportBooking[]; total: number }> {
    const offset = (page - 1) * pageSize;
    if (companyId) {
      const where = eq(transportBookings.companyId, companyId);
      const rows = await db.select().from(transportBookings).where(where).orderBy(desc(transportBookings.createdAt)).limit(pageSize).offset(offset);
      const totalRows = await db.select({ value: count() }).from(transportBookings).where(where);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    }
    const rows = await db.select().from(transportBookings).orderBy(desc(transportBookings.createdAt)).limit(pageSize).offset(offset);
    const totalRows = await db.select({ value: count() }).from(transportBookings);
    return { rows, total: Number(totalRows[0]?.value ?? 0) };
  }
  async getTransportBooking(id: string): Promise<TransportBooking | undefined> {
    const [tb] = await db.select().from(transportBookings).where(eq(transportBookings.id, id));
    return tb;
  }
  async createTransportBooking(data: InsertTransportBooking): Promise<TransportBooking> {
    const [tb] = await db.insert(transportBookings).values(data).returning();
    return tb;
  }
  async updateTransportBooking(id: string, data: Partial<TransportBooking>): Promise<TransportBooking> {
    const [tb] = await db.update(transportBookings).set(data).where(eq(transportBookings.id, id)).returning();
    return tb;
  }

  // Transport Invoices
  async getTransportInvoices(companyId?: string): Promise<TransportInvoice[]> {
    if (companyId) return db.select().from(transportInvoices).where(eq(transportInvoices.companyId, companyId)).orderBy(desc(transportInvoices.submittedAt));
    return db.select().from(transportInvoices).orderBy(desc(transportInvoices.submittedAt));
  }
  async getTransportInvoicesPage(companyId: string | undefined, page: number, pageSize: number): Promise<{ rows: TransportInvoice[]; total: number }> {
    const offset = (page - 1) * pageSize;
    if (companyId) {
      const where = eq(transportInvoices.companyId, companyId);
      const rows = await db.select().from(transportInvoices).where(where).orderBy(desc(transportInvoices.submittedAt)).limit(pageSize).offset(offset);
      const totalRows = await db.select({ value: count() }).from(transportInvoices).where(where);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    }
    const rows = await db.select().from(transportInvoices).orderBy(desc(transportInvoices.submittedAt)).limit(pageSize).offset(offset);
    const totalRows = await db.select({ value: count() }).from(transportInvoices);
    return { rows, total: Number(totalRows[0]?.value ?? 0) };
  }
  async getTransportInvoice(id: string): Promise<TransportInvoice | undefined> {
    const [inv] = await db.select().from(transportInvoices).where(eq(transportInvoices.id, id));
    return inv;
  }
  async createTransportInvoice(data: InsertTransportInvoice): Promise<TransportInvoice> {
    const [inv] = await db.insert(transportInvoices).values(data).returning();
    return inv;
  }
  async updateTransportInvoice(id: string, data: Partial<TransportInvoice>): Promise<TransportInvoice> {
    const [inv] = await db.update(transportInvoices).set(data).where(eq(transportInvoices.id, id)).returning();
    return inv;
  }

  // Transport Payments
  async getTransportPayments(companyId?: string): Promise<TransportPayment[]> {
    if (companyId) return db.select().from(transportPayments).where(eq(transportPayments.companyId, companyId)).orderBy(desc(transportPayments.createdAt));
    return db.select().from(transportPayments).orderBy(desc(transportPayments.createdAt));
  }
  async getTransportPaymentsPage(companyId: string | undefined, page: number, pageSize: number): Promise<{ rows: TransportPayment[]; total: number }> {
    const offset = (page - 1) * pageSize;
    if (companyId) {
      const where = eq(transportPayments.companyId, companyId);
      const rows = await db.select().from(transportPayments).where(where).orderBy(desc(transportPayments.createdAt)).limit(pageSize).offset(offset);
      const totalRows = await db.select({ value: count() }).from(transportPayments).where(where);
      return { rows, total: Number(totalRows[0]?.value ?? 0) };
    }
    const rows = await db.select().from(transportPayments).orderBy(desc(transportPayments.createdAt)).limit(pageSize).offset(offset);
    const totalRows = await db.select({ value: count() }).from(transportPayments);
    return { rows, total: Number(totalRows[0]?.value ?? 0) };
  }
  async createTransportPayment(data: InsertTransportPayment): Promise<TransportPayment> {
    const [pmt] = await db.insert(transportPayments).values(data).returning();
    return pmt;
  }
  async updateTransportPayment(id: string, data: Partial<TransportPayment>): Promise<TransportPayment> {
    const [pmt] = await db.update(transportPayments).set(data).where(eq(transportPayments.id, id)).returning();
    return pmt;
  }

  // Hotel Rates
  async getHotelRates(): Promise<HotelRate[]> {
    return db.select().from(hotelRates).orderBy(desc(hotelRates.createdAt));
  }
  async getHotelRate(id: string): Promise<HotelRate | undefined> {
    const [r] = await db.select().from(hotelRates).where(eq(hotelRates.id, id));
    return r;
  }
  async createHotelRate(data: InsertHotelRate): Promise<HotelRate> {
    const [r] = await db.insert(hotelRates).values({ ...data, status: "draft" }).returning();
    return r;
  }
  async bulkCreateHotelRates(data: InsertHotelRate[]): Promise<HotelRate[]> {
    if (!data.length) return [];
    return db.insert(hotelRates).values(data.map(d => ({ ...d, status: "draft" as const }))).returning();
  }
  async updateHotelRate(id: string, data: Partial<HotelRate>): Promise<HotelRate> {
    const [r] = await db.update(hotelRates).set(data).where(eq(hotelRates.id, id)).returning();
    return r;
  }
  async deleteHotelRate(id: string): Promise<void> {
    await db.delete(hotelRates).where(eq(hotelRates.id, id));
  }

  // Transport Rates
  async getTransportRates(): Promise<TransportRate[]> {
    return db.select().from(transportRates).orderBy(desc(transportRates.createdAt));
  }
  async getTransportRate(id: string): Promise<TransportRate | undefined> {
    const [r] = await db.select().from(transportRates).where(eq(transportRates.id, id));
    return r;
  }
  async createTransportRate(data: InsertTransportRate): Promise<TransportRate> {
    const [r] = await db.insert(transportRates).values({ ...data, status: "draft" }).returning();
    return r;
  }
  async bulkCreateTransportRates(data: InsertTransportRate[]): Promise<TransportRate[]> {
    if (!data.length) return [];
    return db.insert(transportRates).values(data.map(d => ({ ...d, status: "draft" as const }))).returning();
  }
  async updateTransportRate(id: string, data: Partial<TransportRate>): Promise<TransportRate> {
    const [r] = await db.update(transportRates).set(data).where(eq(transportRates.id, id)).returning();
    return r;
  }
  async deleteTransportRate(id: string): Promise<void> {
    await db.delete(transportRates).where(eq(transportRates.id, id));
  }

  // Guide Rates
  async getGuideRates(): Promise<GuideRate[]> {
    return db.select().from(guideRates).orderBy(desc(guideRates.createdAt));
  }
  async createGuideRate(data: InsertGuideRate): Promise<GuideRate> {
    const [r] = await db.insert(guideRates).values({ ...data, status: "draft" }).returning();
    return r;
  }
  async getGuideRate(id: string): Promise<GuideRate | undefined> {
    const [r] = await db.select().from(guideRates).where(eq(guideRates.id, id));
    return r;
  }
  async bulkCreateGuideRates(data: InsertGuideRate[]): Promise<GuideRate[]> {
    if (!data.length) return [];
    return db.insert(guideRates).values(data.map(d => ({ ...d, status: "draft" as const }))).returning();
  }
  async updateGuideRate(id: string, data: Partial<GuideRate>): Promise<GuideRate> {
    const [r] = await db.update(guideRates).set(data).where(eq(guideRates.id, id)).returning();
    return r;
  }
  async deleteGuideRate(id: string): Promise<void> {
    await db.delete(guideRates).where(eq(guideRates.id, id));
  }

  // Sights Rates
  async getSightsRates(): Promise<SightsRate[]> {
    return db.select().from(sightsRates).orderBy(desc(sightsRates.createdAt));
  }
  async getSightsRate(id: string): Promise<SightsRate | undefined> {
    const [r] = await db.select().from(sightsRates).where(eq(sightsRates.id, id));
    return r;
  }
  async createSightsRate(data: InsertSightsRate): Promise<SightsRate> {
    const [r] = await db.insert(sightsRates).values({ ...data, status: "draft" }).returning();
    return r;
  }
  async bulkCreateSightsRates(data: InsertSightsRate[]): Promise<SightsRate[]> {
    if (!data.length) return [];
    return db.insert(sightsRates).values(data.map(d => ({ ...d, status: "draft" as const }))).returning();
  }
  async updateSightsRate(id: string, data: Partial<SightsRate>): Promise<SightsRate> {
    const [r] = await db.update(sightsRates).set(data).where(eq(sightsRates.id, id)).returning();
    return r;
  }
  async deleteSightsRate(id: string): Promise<void> {
    await db.delete(sightsRates).where(eq(sightsRates.id, id));
  }

  async getAirlineRates(): Promise<AirlineRate[]> {
    return db.select().from(airlineRates).orderBy(desc(airlineRates.createdAt));
  }
  async getAirlineRate(id: string): Promise<AirlineRate | undefined> {
    const [r] = await db.select().from(airlineRates).where(eq(airlineRates.id, id));
    return r;
  }
  async createAirlineRate(data: InsertAirlineRate): Promise<AirlineRate> {
    const [r] = await db.insert(airlineRates).values({ ...data, status: "draft" }).returning();
    return r;
  }
  async bulkCreateAirlineRates(data: InsertAirlineRate[]): Promise<AirlineRate[]> {
    if (!data.length) return [];
    return db.insert(airlineRates).values(data.map(d => ({ ...d, status: "draft" as const }))).returning();
  }
  async updateAirlineRate(id: string, data: Partial<AirlineRate>): Promise<AirlineRate> {
    const [r] = await db.update(airlineRates).set(data).where(eq(airlineRates.id, id)).returning();
    return r;
  }
  async deleteAirlineRate(id: string): Promise<void> {
    await db.delete(airlineRates).where(eq(airlineRates.id, id));
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt));
  }

  async createNotification(data: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(notifications).values(data).returning();
    return notification;
  }



  async getNotification(id: string): Promise<Notification | undefined> {
    const [n] = await db.select().from(notifications).where(eq(notifications.id, id));
    return n;
  }

  async markNotificationAsRead(id: string): Promise<Notification> {
    const [notification] = await db.update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id))
      .returning();
    return notification;
  }

  async initializeBookingWorkflows(bookingId: string): Promise<void> {
    const serviceTypes = ["airline", "hotel", "transport", "guide", "sights"] as const;
    
    // Check existing workflows to avoid duplicates
    const existing = await db.select().from(bookingWorkflows).where(eq(bookingWorkflows.bookingId, bookingId));
    const existingTypes = new Set(existing.map(wf => wf.serviceType));

    for (const serviceType of serviceTypes) {
      if (existingTypes.has(serviceType)) continue;

      const steps = DEFAULT_WORKFLOW_STEPS[serviceType];
      const initialStep = steps[0]?.code;

      const [wf] = await db.insert(bookingWorkflows).values({
        bookingId,
        serviceType,
        status: "not_assigned",
        currentStep: initialStep,
      }).returning();

      // Create initial steps
      if (wf && steps.length > 0) {
        await db.insert(workflowSteps).values(
          steps.map((s, idx) => ({
            workflowId: wf.id,
            stepOrder: idx + 1,
            stepCode: s.code,
            stepName: s.name,
            status: "pending" as const,
          }))
        );
      }
    }
  }

  async cancelBookingWorkflows(bookingId: string, reason?: string): Promise<void> {
    const wfs = await db.select().from(bookingWorkflows).where(eq(bookingWorkflows.bookingId, bookingId));
    for (const wf of wfs) {
      if (wf.status === "blocked") continue;

      const wasCompleted = wf.status === "completed";
      const noteAppend = wasCompleted
        ? `[Booking Cancelled - Previously Completed]. ${reason || ""}`.trim()
        : (reason ? `[Booking Cancelled - Blocked]: ${reason}`.trim() : "[Booking Cancelled - Blocked]");
      const newNotes = wf.notes ? `${wf.notes}\n${noteAppend}`.trim() : (noteAppend || null);

      await db.update(bookingWorkflows)
        .set({
          status: "blocked",
          notes: newNotes,
          updatedAt: new Date(),
        })
        .where(eq(bookingWorkflows.id, wf.id));

      // Mark remaining pending steps as blocked
      await db.update(workflowSteps)
        .set({
          status: "blocked",
          updatedAt: new Date(),
        })
        .where(and(
          eq(workflowSteps.workflowId, wf.id),
          eq(workflowSteps.status, "pending")
        ));

      // Notify assigned staff if present
      if (wf.assignedUserId) {
        await this.createNotification({
          userId: wf.assignedUserId,
          type: "booking_update",
          title: "Service Blocked ⚠️",
          message: `The ${wf.serviceType} service workflow has been blocked due to booking cancellation.${reason ? ` (${reason})` : ""}`,
        }).catch(() => {});
      }
    }

    // Mark assignments as unassigned
    await db.update(bookingAssignments)
      .set({
        status: "unassigned",
      })
      .where(eq(bookingAssignments.bookingId, bookingId));
  }


  async getPublicGroupsByDeparture(departureId: string): Promise<Booking[]> {
    const departure = await this.getDeparture(departureId);
    if (!departure || !departure.publicJoinEnabled) return [];
    return db.select().from(bookings)
      .where(and(
        eq(bookings.departureId, departureId),
        eq(bookings.bookingType, "leader_group"),
        not(eq(bookings.status, "cancelled"))
      ))
      .orderBy(desc(bookings.createdAt));
  }

  async getPublicGroups(): Promise<any[]> {
    const rows = await db.select({
      booking: bookings,
      tour: tours,
      departure: tourDepartures
    })
    .from(bookings)
    .innerJoin(tours, eq(bookings.tourId, tours.id))
    .innerJoin(tourDepartures, eq(bookings.departureId, tourDepartures.id))
    .where(and(
      eq(bookings.bookingType, "leader_group"),
      not(eq(bookings.status, "cancelled")),
      isNotNull(bookings.joinCode),
      eq(tourDepartures.publicJoinEnabled, true)
    ))
    .orderBy(desc(bookings.createdAt));

    return rows.map(r => ({
      id: r.booking.id,
      groupName: r.booking.groupName || "Travel Group",
      joinCode: r.booking.joinCode,
      tourTitle: r.tour.title,
      departureId: r.booking.departureId,
      partySizeExpected: r.booking.partySizeExpected,
      tourId: r.booking.tourId
    }));
  }

  async getAnalytics(): Promise<any> {
    const allPayments = await db.select().from(payments).where(eq(payments.status, "paid"));
    const totalRevenue = allPayments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const allBookings = await db.select().from(bookings);
    const totalBookings = allBookings.length;

    const allDepartures = await db.select().from(tourDepartures).where(eq(tourDepartures.status, "open"));
    const activeDepartures = allDepartures.length;

    // Revenue by month (last 6 months)
    const revenueByMonth = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleString('default', { month: 'short' });
      const monthRevenue = allPayments
        .filter(p => {
          const pd = new Date(p.createdAt || new Date());
          return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
        })
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      revenueByMonth.push({ month: monthLabel, revenue: monthRevenue });
    }

    // Occupancy
    const departuresWithTours = await db.select({
      departure: tourDepartures,
      tour: tours
    })
    .from(tourDepartures)
    .innerJoin(tours, eq(tourDepartures.tourId, tours.id))
    .where(eq(tourDepartures.status, "open"))
    .limit(10);

    const occupancy = departuresWithTours.map(d => ({
      id: d.departure.id,
      tourTitle: d.tour.title,
      startDate: d.departure.startDate,
      booked: d.departure.capacityBooked || 0,
      total: d.departure.capacityTotal || 0,
      percentage: Math.round(((d.departure.capacityBooked || 0) / (d.departure.capacityTotal || 1)) * 100)
    }));

    return {
      totalRevenue,
      totalBookings,
      activeDepartures,
      revenueByMonth,
      occupancy
    };
  }

  // Import Jobs
  async getImportJobs(): Promise<ImportJob[]> {
    return db.select().from(importJobs).orderBy(desc(importJobs.startedAt));
  }
  async getImportJob(id: string): Promise<ImportJob | undefined> {
    const [job] = await db.select().from(importJobs).where(eq(importJobs.id, id));
    return job;
  }
  async createImportJob(data: any): Promise<ImportJob> {
    const [job] = await db.insert(importJobs).values({ ...data, startedAt: new Date() }).returning();
    return job;
  }
  async updateImportJob(id: string, data: any): Promise<ImportJob> {
    const [job] = await db.update(importJobs).set(data).where(eq(importJobs.id, id)).returning();
    return job;
  }

  // Data Sources
  async getDataSources(): Promise<DataSource[]> {
    return db.select().from(dataSources);
  }
  async createDataSource(data: any): Promise<DataSource> {
    const [source] = await db.insert(dataSources).values(data).returning();
    return source;
  }

  // Price Snapshots
  async createHotelPriceSnapshot(data: any): Promise<HotelPriceSnapshot> {
    const [snap] = await db.insert(hotelPriceSnapshots).values(data).returning();
    return snap;
  }
  async getHotelPriceSnapshots(hotelId: string): Promise<HotelPriceSnapshot[]> {
    return db.select().from(hotelPriceSnapshots).where(eq(hotelPriceSnapshots.hotelId, hotelId)).orderBy(desc(hotelPriceSnapshots.searchedAt));
  }
  async createFlightPriceSnapshot(data: any): Promise<FlightPriceSnapshot> {
    const [snap] = await db.insert(flightPriceSnapshots).values(data).returning();
    return snap;
  }
  async getFlightPriceSnapshots(origin: string, destination: string): Promise<FlightPriceSnapshot[]> {
    return db.select().from(flightPriceSnapshots).where(and(eq(flightPriceSnapshots.originAirport, origin), eq(flightPriceSnapshots.destinationAirport, destination))).orderBy(desc(flightPriceSnapshots.searchedAt));
  }

  // Markup Rules
  async getMarkupRules(): Promise<MarkupRule[]> {
    return db.select().from(markupRules).orderBy(desc(markupRules.createdAt));
  }
  async createMarkupRule(data: InsertMarkupRule): Promise<MarkupRule> {
    const [rule] = await db.insert(markupRules).values(data).returning();
    return rule;
  }
  async updateMarkupRule(id: string, data: Partial<MarkupRule>): Promise<MarkupRule> {
    const [rule] = await db.update(markupRules).set(data).where(eq(markupRules.id, id)).returning();
    return rule;
  }
  async deleteMarkupRule(id: string): Promise<void> {
    await db.delete(markupRules).where(eq(markupRules.id, id));
  }

  // Audit Logs
  async getAuditLogs(entityType?: string, entityId?: string): Promise<AuditLog[]> {
    let query = db.select().from(auditLogs);
    if (entityType && entityId) {
      query = query.where(and(eq(auditLogs.entityType, entityType), eq(auditLogs.entityId, entityId))) as any;
    } else if (entityType) {
      query = query.where(eq(auditLogs.entityType, entityType)) as any;
    }
    return query.orderBy(desc(auditLogs.createdAt)).limit(50);
  }

  async createAuditLog(data: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(auditLogs).values(data).returning();
    return log;
  }

  // --- Wrapper for logging changes ---
  private async logChange(entityType: string, entityId: string, action: string, oldVal: any, newVal: any, userId?: string, userName?: string) {
    try {
      const diff: any = {};
      let changed = false;
      for (const key in newVal) {
        if (JSON.stringify(oldVal[key]) !== JSON.stringify(newVal[key])) {
          diff[key] = { from: oldVal[key], to: newVal[key] };
          changed = true;
        }
      }
      if (!changed && action === "updated") return;

      await this.createAuditLog({
        entityType,
        entityId,
        action,
        changedBy: userId,
        changedByName: userName,
        previousValue: JSON.stringify(oldVal),
        newValue: JSON.stringify(newVal),
        note: changed ? `Fields changed: ${Object.keys(diff).join(", ")}` : action,
      });
    } catch (e) {
      console.error("Audit logging failed:", e);
    }
  }

  // Affiliates
  async getAffiliate(id: string): Promise<Affiliate | undefined> {
    const [row] = await db.select().from(affiliates).where(eq(affiliates.id, id));
    return row;
  }
  async updateAffiliate(id: string, data: Partial<Affiliate>): Promise<Affiliate> {
    const [row] = await db.update(affiliates).set(data).where(eq(affiliates.id, id)).returning();
    if (!row) throw new Error("Affiliate not found");
    return row;
  }

  async getLeaderDashboardAlerts(bookingIds: string[]): Promise<{ missingDocs: number; pendingPayments: number; unreadMessages: number }> {
    let missingDocs = 0;
    let pendingPayments = 0;
    let unreadMessages = 0;

    if (bookingIds.length === 0) {
      return { missingDocs, pendingPayments, unreadMessages };
    }

    const [allDocs, allTravelers, allPays, allMsgs] = await Promise.all([
      db.select().from(documents).where(inArray(documents.bookingId, bookingIds)),
      db.select().from(travelers).where(inArray(travelers.bookingId, bookingIds)),
      db.select().from(payments).where(inArray(payments.bookingId, bookingIds)),
      db.select().from(messages).where(inArray(messages.bookingId, bookingIds))
    ]);

    const docsMap = new Map<string, typeof allDocs>();
    const travelersMap = new Map<string, typeof allTravelers>();
    const paysMap = new Map<string, typeof allPays>();
    const msgsMap = new Map<string, typeof allMsgs>();

    for (const d of allDocs) {
      if (!docsMap.has(d.bookingId)) docsMap.set(d.bookingId, []);
      docsMap.get(d.bookingId)!.push(d);
    }
    for (const t of allTravelers) {
      if (!travelersMap.has(t.bookingId)) travelersMap.set(t.bookingId, []);
      travelersMap.get(t.bookingId)!.push(t);
    }
    for (const p of allPays) {
      if (!paysMap.has(p.bookingId)) paysMap.set(p.bookingId, []);
      paysMap.get(p.bookingId)!.push(p);
    }
    for (const m of allMsgs) {
      if (!msgsMap.has(m.bookingId)) msgsMap.set(m.bookingId, []);
      msgsMap.get(m.bookingId)!.push(m);
    }

    for (const id of bookingIds) {
      const docs = docsMap.get(id) || [];
      const travelersList = travelersMap.get(id) || [];
      if (travelersList.length > 0 && docs.length === 0) missingDocs++;
      const pays = paysMap.get(id) || [];
      pendingPayments += pays.filter(p => p.status === "pending").length;
      const msgs = msgsMap.get(id) || [];
      unreadMessages += msgs.filter(m => m.visibility === "customer_visible").length;
    }

    return { missingDocs, pendingPayments, unreadMessages };
  }

  async getLeaderPaymentsReport(userId: string, allBookings: Booking[]): Promise<any[]> {
    const bookingIds = allBookings.map(b => b.id);
    if (bookingIds.length === 0) return [];

    const [allPays, allTravelers, allProfiles] = await Promise.all([
      db.select().from(payments).where(inArray(payments.bookingId, bookingIds)),
      db.select().from(travelers).where(inArray(travelers.bookingId, bookingIds)),
      db.select().from(userProfiles).where(inArray(userProfiles.userId, allBookings.map(b => b.customerId)))
    ]);

    const paysMap = new Map<string, typeof allPays>();
    const travelersMap = new Map<string, typeof allTravelers>();
    const profilesMap = new Map<string, UserProfile>();

    for (const p of allPays) {
      if (!paysMap.has(p.bookingId)) paysMap.set(p.bookingId, []);
      paysMap.get(p.bookingId)!.push(p);
    }
    for (const t of allTravelers) {
      if (!travelersMap.has(t.bookingId)) travelersMap.set(t.bookingId, []);
      travelersMap.get(t.bookingId)!.push(t);
    }
    for (const prof of allProfiles) {
      profilesMap.set(prof.userId, prof);
    }

    const result: any[] = [];
    for (const b of allBookings) {
      const pays = paysMap.get(b.id) || [];
      const travelersList = travelersMap.get(b.id) || [];
      const isLeaderBooking = b.customerId === userId;
      const customerProfile = profilesMap.get(b.customerId);

      for (const p of pays) {
        result.push({
          ...p,
          bookingCode: b.bookingCode,
          groupName: b.groupName,
          bookingType: b.bookingType,
          travelers: travelersList.map(t => `${t.firstName} ${t.lastName}`),
          paidBy: isLeaderBooking ? "Leader" : (customerProfile?.id || "Participant"),
          isLeaderPayment: isLeaderBooking,
        });
      }
    }

    return result;
  }

  async getAffiliates(): Promise<Affiliate[]> {
    return db.select().from(affiliates).orderBy(desc(affiliates.createdAt));
  }
  async createAffiliate(data: InsertAffiliate): Promise<Affiliate> {
    const [row] = await db.insert(affiliates).values(data).returning();
    return row;
  }
  async getAffiliateByCode(code: string): Promise<Affiliate | undefined> {
    const [row] = await db.select().from(affiliates).where(eq(affiliates.code, code));
    return row;
  }
  async createAffiliatePayout(data: InsertAffiliatePayout): Promise<AffiliatePayout> {
    const [row] = await db.insert(affiliatePayouts).values(data).returning();
    return row;
  }
  async getAffiliatePayouts(): Promise<AffiliatePayout[]> {
    return db.select().from(affiliatePayouts).orderBy(desc(affiliatePayouts.createdAt));
  }

  // Tour Day Items
  async getTourDayItems(dayId: string): Promise<TourDayItem[]> {
    return await db.select().from(tourDayItems).where(eq(tourDayItems.tourDayId, dayId)).orderBy(tourDayItems.sortOrder);
  }

  async getTourDayItemsByTourId(tourId: string): Promise<TourDayItem[]> {
    const rows = await db
      .select({ item: tourDayItems })
      .from(tourDayItems)
      .innerJoin(tourDays, eq(tourDayItems.tourDayId, tourDays.id))
      .where(eq(tourDays.tourId, tourId))
      .orderBy(tourDayItems.sortOrder);
    return rows.map(r => r.item);
  }

  async createTourDayItem(data: InsertTourDayItem): Promise<TourDayItem> {
    let finalData = { ...data };
    
    // Auto-fetch cost and create snapshots for integrity
    if (data.hotelId && (!data.cost || data.cost === "0")) {
      const hotel = await this.getHotel(data.hotelId);
      if (hotel?.basePrice) {
        finalData.cost = hotel.basePrice.toString();
        const snap = await this.createHotelPriceSnapshot({
          hotelId: data.hotelId,
          price: hotel.basePrice,
          currency: "USD",
          source: "internal_master"
        });
        finalData.hotelSnapshotId = snap.id;
      }
    } else if (data.sightId && (!data.cost || data.cost === "0")) {
      const sight = await this.getSight(data.sightId);
      if (sight?.individualTicketCost) {
        finalData.cost = sight.individualTicketCost.toString();
      }
    } else if (data.guideId && (!data.cost || data.cost === "0")) {
      const guide = await this.getGuideRate(data.guideId);
      if (guide?.price) {
        finalData.cost = guide.price.toString();
      }
    }

    const [item] = await db.insert(tourDayItems).values(finalData).returning();
    return item;
  }

  async updateTourDayItem(id: string, data: Partial<TourDayItem>): Promise<TourDayItem> {
    const [item] = await db.update(tourDayItems).set(data).where(eq(tourDayItems.id, id)).returning();
    return item;
  }

  async deleteTourDayItem(id: string): Promise<void> {
    await db.delete(tourDayItems).where(eq(tourDayItems.id, id));
  }

  // Global Settings
  async getGlobalSettings(): Promise<GlobalSetting[]> {
    return db.select().from(globalSettings);
  }
  async getGlobalSettingByKey(key: string): Promise<GlobalSetting | undefined> {
    const [setting] = await db.select().from(globalSettings).where(eq(globalSettings.key, key));
    return setting;
  }
  async updateGlobalSetting(key: string, value: string): Promise<GlobalSetting> {
    const [setting] = await db.insert(globalSettings)
      .values({ key, value })
      .onConflictDoUpdate({ target: globalSettings.key, set: { value, updatedAt: new Date() } })
      .returning();
    return setting;
  }

  async getInvoices(bookingId?: string): Promise<Invoice[]> {
    if (bookingId) {
      return await db.select().from(invoices).where(eq(invoices.bookingId, bookingId));
    }
    return await db.select().from(invoices);
  }

  async getInvoice(id: string): Promise<Invoice | undefined> {
    const [row] = await db.select().from(invoices).where(eq(invoices.id, id));
    return row;
  }

  async createInvoice(data: InsertInvoice): Promise<Invoice> {
    const [row] = await db.insert(invoices).values(data).returning();
    return row;
  }

  async updateInvoice(id: string, data: Partial<Invoice>): Promise<Invoice> {
    const [row] = await db.update(invoices).set(data).where(eq(invoices.id, id)).returning();
    if (!row) throw new Error("Invoice not found");
    return row;
  }

  async getGlobalSalesStats(): Promise<any> {
    const allBookings = await db.select().from(bookings);
    const confirmed = allBookings.filter(b => b.status === "confirmed" || b.status === "completed");
    
    const totalRevenue = confirmed.reduce((sum, b) => sum + (parseFloat(b.totalPrice?.toString() || "0")), 0);
    const bookingCount = confirmed.length;
    const netProfit = totalRevenue * 0.15; // 15% estimated net margin
    const avgBookingValue = bookingCount > 0 ? totalRevenue / bookingCount : 0;
    const [{ count: activeAssets }] = await db.select({ count: sql<number>`count(*)::int` }).from(tours);
    
    // Aggregate by month for the chart
    const monthlySalesMap: Record<string, number> = {};
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    confirmed.forEach(b => {
      const date = b.createdAt || new Date();
      const month = monthNames[date.getMonth()];
      monthlySalesMap[month] = (monthlySalesMap[month] || 0) + parseFloat(b.totalPrice?.toString() || "0");
    });

    const monthlySales = monthNames.map(month => ({
      month,
      amount: monthlySalesMap[month] || 0
    }));

    return {
      totalRevenue,
      totalProfit: netProfit,
      bookingCount,
      // Fields consumed by the admin dashboard stat cards
      grossSales: totalRevenue,
      netProfit,
      avgBookingValue,
      activeAssets,
      activeTravelers: bookingCount * 2, // Estimated
      topDestinations: [
        { name: "Jordan", count: 12 }, // Placeholder for complex join
        { name: "Egypt", count: 8 },
        { name: "Turkey", count: 5 }
      ],
      monthlySales
    };
  }

  // Sights Extra
  async getSightImages(sightId: string): Promise<SightImage[]> {
    return db.select().from(sightImages).where(eq(sightImages.sightId, sightId));
  }
  async createSightImage(data: InsertSightImage): Promise<SightImage> {
    const [r] = await db.insert(sightImages).values(data).returning();
    return r;
  }
  async getSightHours(sightId: string): Promise<SightHour[]> {
    return db.select().from(sightHours).where(eq(sightHours.sightId, sightId));
  }
  async createSightHour(data: InsertSightHour): Promise<SightHour> {
    const [r] = await db.insert(sightHours).values(data).returning();
    return r;
  }
  async getSightTicketPrices(sightId: string): Promise<SightTicketPrice[]> {
    return db.select().from(sightTicketPrices).where(eq(sightTicketPrices.sightId, sightId));
  }
  async createSightTicketPrice(data: InsertSightTicketPrice): Promise<SightTicketPrice> {
    const [r] = await db.insert(sightTicketPrices).values(data).returning();
    return r;
  }

  // Hotels Extra
  async getHotelImages(hotelId: string): Promise<HotelImage[]> {
    return db.select().from(hotelImages).where(eq(hotelImages.hotelId, hotelId));
  }
  async createHotelImage(data: InsertHotelImage): Promise<HotelImage> {
    const [r] = await db.insert(hotelImages).values(data).returning();
    return r;
  }
  async getHotelAmenities(hotelId: string): Promise<HotelAmenity[]> {
    return db.select().from(hotelAmenities).where(eq(hotelAmenities.hotelId, hotelId));
  }
  async createHotelAmenity(data: InsertHotelAmenity): Promise<HotelAmenity> {
    const [r] = await db.insert(hotelAmenities).values(data).returning();
    return r;
  }
  async getHotelRoomTypes(hotelId: string): Promise<HotelRoomType[]> {
    return db.select().from(hotelRoomTypes).where(eq(hotelRoomTypes.hotelId, hotelId));
  }
  async createHotelRoomType(data: InsertHotelRoomType): Promise<HotelRoomType> {
    const [r] = await db.insert(hotelRoomTypes).values(data).returning();
    return r;
  }

  // Custom Tours
  async getCustomTours(customerId: string): Promise<CustomTour[]> {
    return db.select().from(customTours).where(eq(customTours.customerId, customerId)).orderBy(desc(customTours.createdAt));
  }
  async getCustomTour(id: string): Promise<CustomTour | undefined> {
    const [r] = await db.select().from(customTours).where(eq(customTours.id, id));
    return r;
  }
  async createCustomTour(data: InsertCustomTour): Promise<CustomTour> {
    const [r] = await db.insert(customTours).values(data).returning();
    return r;
  }
  async updateCustomTour(id: string, data: Partial<CustomTour>): Promise<CustomTour> {
    const [r] = await db.update(customTours).set(data).where(eq(customTours.id, id)).returning();
    return r;
  }

  async getCustomTourDays(customTourId: string): Promise<CustomTourDay[]> {
    return db.select().from(customTourDays).where(eq(customTourDays.customTourId, customTourId)).orderBy(customTourDays.dayNumber);
  }
  async createCustomTourDay(data: InsertCustomTourDay): Promise<CustomTourDay> {
    const [r] = await db.insert(customTourDays).values(data).returning();
    return r;
  }

  async getCustomTourDayItems(customTourDayId: string): Promise<CustomTourDayItem[]> {
    return db.select().from(customTourDayItems).where(eq(customTourDayItems.customTourDayId, customTourDayId));
  }
  async createCustomTourDayItem(data: InsertCustomTourDayItem): Promise<CustomTourDayItem> {
    const [r] = await db.insert(customTourDayItems).values(data).returning();
    return r;
  }

  // Quotes
  async getTourQuotes(customTourId: string): Promise<TourQuote[]> {
    return db.select().from(tourQuotes).where(eq(tourQuotes.customTourId, customTourId)).orderBy(desc(tourQuotes.createdAt));
  }
  async createTourQuote(data: InsertTourQuote): Promise<TourQuote> {
    const [r] = await db.insert(tourQuotes).values(data).returning();
    return r;
  }
  async getTourQuoteItems(quoteId: string): Promise<TourQuoteItem[]> {
    return db.select().from(tourQuoteItems).where(eq(tourQuoteItems.quoteId, quoteId));
  }
  async createTourQuoteItem(data: InsertTourQuoteItem): Promise<TourQuoteItem> {
    const [r] = await db.insert(tourQuoteItems).values(data).returning();
    return r;
  }

  // Scraper & AI Jobs
  async createScraperRun(data: InsertScraperRun): Promise<ScraperRun> {
    const [r] = await db.insert(scraperRuns).values(data).returning();
    return r;
  }
  async updateScraperRun(id: string, data: Partial<ScraperRun>): Promise<ScraperRun> {
    const [r] = await db.update(scraperRuns).set(data).where(eq(scraperRuns.id, id)).returning();
    return r;
  }
  async createScraperError(data: InsertScraperError): Promise<ScraperError> {
    const [r] = await db.insert(scraperErrors).values(data).returning();
    return r;
  }

  async createAiGenerationJob(data: InsertAiGenerationJob): Promise<AiGenerationJob> {
    const [r] = await db.insert(aiGenerationJobs).values(data).returning();
    return r;
  }
  async updateAiGenerationJob(id: string, data: Partial<AiGenerationJob>): Promise<AiGenerationJob> {
    const [r] = await db.update(aiGenerationJobs).set(data).where(eq(aiGenerationJobs.id, id)).returning();
    return r;
  }
  async getAiGenerationJob(id: string): Promise<AiGenerationJob | undefined> {
    const [r] = await db.select().from(aiGenerationJobs).where(eq(aiGenerationJobs.id, id));
    return r;
  }

  async createAiGeneratedItinerary(data: InsertAiGeneratedItinerary): Promise<AiGeneratedItinerary> {
    const [r] = await db.insert(aiGeneratedItineraries).values(data).returning();
    return r;
  }
  async getAiGeneratedItineraryByJob(jobId: string): Promise<AiGeneratedItinerary | undefined> {
    const [r] = await db.select().from(aiGeneratedItineraries).where(eq(aiGeneratedItineraries.jobId, jobId));
    return r;
  }

  // Regions
  async getRegionsByCountry(countryId: string): Promise<Region[]> {
    return db.select().from(regions).where(eq(regions.countryId, countryId));
  }
  async createRegion(data: InsertRegion): Promise<Region> {
    const [r] = await db.insert(regions).values(data).returning();
    return r;
  }

  async createAffiliateReferral(data: InsertAffiliateReferral): Promise<AffiliateReferral> {
    const [r] = await db.insert(affiliateReferrals).values(data).returning();
    return r;
  }

  // Master Records
  async getMasterRecords(type?: string): Promise<MasterRecord[]> {
    if (type) {
      return db.select().from(masterRecords).where(eq(masterRecords.recordType, type)).orderBy(desc(masterRecords.createdAt));
    }
    return db.select().from(masterRecords).orderBy(desc(masterRecords.createdAt));
  }

  async getMasterRecord(id: string): Promise<MasterRecord | undefined> {
    const [record] = await db.select().from(masterRecords).where(eq(masterRecords.id, id));
    return record;
  }

  async createMasterRecord(data: InsertMasterRecord): Promise<MasterRecord> {
    const [record] = await db.insert(masterRecords).values(data).returning();
    return record;
  }

  async updateMasterRecord(id: string, data: Partial<MasterRecord>): Promise<MasterRecord> {
    const [record] = await db.update(masterRecords).set(data).where(eq(masterRecords.id, id)).returning();
    return record;
  }

  async deleteMasterRecord(id: string): Promise<void> {
    await db.delete(masterRecords).where(eq(masterRecords.id, id));
  }
}

export const storage = new DatabaseStorage();
