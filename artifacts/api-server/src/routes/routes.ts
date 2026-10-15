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

// Shared helpers (pickPublicTranslations, upload, getUserName, canAccessBooking,
// initializeBookingWorkflows, ensureTourViewable, ownerScope, coerceBooleans)
// now live in ./shared.
import {
  pickPublicTranslations, ALLOWED_IMAGE_MIME_EXT, upload,
  getUserName, canAccessBooking, initializeBookingWorkflows,
  ensureTourViewable, ownerScope, coerceBooleans,
  isUniqueViolation, isSlugUniqueViolation,
  publicTourPricing, ensureCityExists, type PublicTourPricing,
  resetPublicTourPricingCache,
} from "./shared";

import { queues } from "../lib/workers";
import { scraperSafety } from "../lib/scraperSafety";
import { setupAuth, isAuthenticated } from "../replit_integrations/auth";
import { registerPaymentRoutes } from "./paymentRoutes";
import { registerServiceOpsRoutes } from "./serviceOpsRoutes";
import { registerLifecycleRoutes } from "./lifecycleRoutes";
import { registerGeoImportRoutes } from "./geoImportRoutes";
import { registerPricingRoutes } from "./pricingRoutes";
import { registerAssetsRoutes } from "./assetsRoutes";
import { registerAdminMiscRoutes } from "./adminMiscRoutes";
import { registerNotificationsRoutes } from "./notificationsRoutes";
import { registerMasterDataRoutes } from "./masterDataRoutes";
import { registerTransportRoutes } from "./transportRoutes";
import { registerRateCardsRoutes } from "./rateCardsRoutes";
import { registerOpsRoutes } from "./opsRoutes";
import { registerSupplierOpsRoutes } from "./supplierOpsRoutes";
import { registerCatalogRoutes } from "./catalogRoutes";
import { registerMasterRecordsRoutes } from "./masterRecordsRoutes";
import { registerHotelsRoutes } from "./hotelsRoutes";
import { registerAccountsRoutes } from "./accountsRoutes";
import { registerToursRoutes } from "./toursRoutes";
import { registerTourDaysRoutes } from "./tourDaysRoutes";
import { registerBookingsRoutes } from "./bookingsRoutes";
import { registerAuthRoutes, passwordSchema } from "../replit_integrations/auth";
import { authStorage } from "../replit_integrations/auth/storage";
import { db } from "@workspace/db";
import { countries, cities, tours, tourDays, tourDayItems, tourDepartures, users, userProfiles, authTokens, notifications } from "@workspace/db";
import { eq, and, sql, isNull, desc, inArray } from "drizzle-orm";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod/v4";

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
  groupSizeBands, pricingRules, airfareRates, pricingQuotes,
  pricingAdjustmentRules, pricingSeasons,
  insertGroupSizeBandSchema, insertPricingRuleSchema, insertAirfareRateSchema,
  insertPricingAdjustmentRuleSchema, insertPricingSeasonSchema, patchPricingSeasonSchema,
  exchangeRates,
  insertExchangeRateSchema, insertPricingQuoteOverrideSchema
} from "@workspace/db";
import { computeQuote, assistanceTypeForPax, PricingInputError, OCCUPANCY_TYPES, type HotelChoiceInput } from "../services/pricing-engine";
import { resolveTourComponents, accommodationForTour, tourOffersRoomTypes, BOOKING_ROOM_TYPES, type BookingRoomType } from "../services/rate-resolver";
import { calculateBookingPrice, resolvePerPersonPrice, isUsableDeparturePrice, ROOM_TYPE_OCCUPANCY } from "../services/booking-pricing";
import {
  normalizeQuoteStatus,
  computeQuoteTransition,
  buildTransitionTimingPatch,
  buildCustomerQuoteView,
  VIEWED_TRANSITION_FROM,
  OVERRIDABLE_QUOTE_STATUSES,
  CUSTOMER_VISIBLE_QUOTE_STATUSES,
} from "../services/quote-lifecycle";
import {
  persistComputedQuote,
  findPricingQuote,
  findPricingQuoteByShareToken,
  listPricingQuotes,
  listQuoteLineItems,
  listQuoteOverrides,
  listQuoteSnapshots,
  findInternalPricingQuote,
  applyQuoteUpdate,
  applyPriceOverride,
  markQuoteViewed,
} from "../services/quote-workflow";

import { sendWhatsApp, sendSMS, MESSAGE_TEMPLATES } from "../lib/messaging";
import { generateCode as genCode } from "../lib/utils";

// Auth/role catalogue moved to ../middleware/auth (imported below). Behaviour
// is unchanged — the same role sets and the same requireRole/getUserId/
// isStaffViewer implementations, now shared with the sibling route modules.
import {
  ALL_STAFF_ROLES, ADMIN_ROLES, EXTERNAL_SUPPLIER_ROLES, INTERNAL_STAFF_ROLES,
  PLATFORM_WIDE_READ_ROLES, SUPPORT_READ_ROLES, FINANCE_ROLES, BOOKING_READ_ROLES,
  MASTER_RECORDS_MANAGE_ROLES, OPS_DISPATCH_ROLES, CATALOG_BASE_ROLES, HOTEL_MANAGE_ROLES,
  HOTEL_REGISTER_ROLES, HOTEL_EDIT_ROLES, GUIDE_MANAGE_ROLES, GUIDE_READ_ROLES,
  SIGHTS_MANAGE_ROLES, AIRLINE_MANAGE_ROLES, TRANSPORT_COMPANY_MANAGE_ROLES,
  TRANSPORT_FINANCE_ROLES, TOUR_BUILDER_ROLES, TOUR_CONTENT_ROLES,
  getUserId, requireRole, isStaffViewer,
} from "../middleware/auth";

// getUserName / canAccessBooking / initializeBookingWorkflows /
// ensureTourViewable / ownerScope / coerceBooleans now live in ./shared.

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  await setupAuth(app);
  resetPublicTourPricingCache();
  registerAuthRoutes(app);
  registerPaymentRoutes(app);
  registerServiceOpsRoutes(app);
  registerLifecycleRoutes(app);
  registerGeoImportRoutes(app);

  registerAccountsRoutes(app);
  registerToursRoutes(app);

  registerTourDaysRoutes(app);

  registerBookingsRoutes(app);

  registerCatalogRoutes(app);

  registerMasterRecordsRoutes(app);

  registerHotelsRoutes(app);

  registerOpsRoutes(app);

  registerSupplierOpsRoutes(app);

  registerMasterDataRoutes(app);

  registerTransportRoutes(app);

  registerRateCardsRoutes(app);

  // Seed default admin user if none exists.
  // SECURITY (F-01): never create a well-known default credential in
  // production. The seed runs only in non-production, or in production when an
  // operator explicitly supplies DEFAULT_ADMIN_PASSWORD for a one-time
  // bootstrap (fail-closed: absent in prod => no admin is auto-created).
  try {
    const isProduction = process.env.NODE_ENV === "production" || !!process.env.REPLIT_DEPLOYMENT;
    const bootstrapPassword = process.env.DEFAULT_ADMIN_PASSWORD;
    const existingAdmin = await authStorage.getUserByUsername("admin");
    if (!existingAdmin && (!isProduction || bootstrapPassword)) {
      const seedPassword = bootstrapPassword || "admin123";
      const passwordHash = await bcrypt.hash(seedPassword, 10);
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
      // Never log the seeded password; operators are expected to rotate it.
      console.log("Default admin user created: username=admin");
    } else if (!existingAdmin && isProduction) {
      console.warn(
        "No admin user exists and DEFAULT_ADMIN_PASSWORD is not set; skipping default admin seed. " +
        "Set DEFAULT_ADMIN_PASSWORD once to bootstrap an admin account."
      );
    }

    // Seed default pricing settings
    const taxSetting = await storage.getGlobalSettingByKey("sales_tax_percent");
    if (!taxSetting) await storage.updateGlobalSetting("sales_tax_percent", "11"); // 11% default
    
    const serviceFeeSetting = await storage.getGlobalSettingByKey("default_service_fee");
    if (!serviceFeeSetting) await storage.updateGlobalSetting("default_service_fee", "25"); // $25 default
  } catch (e) {
    console.error("Error seeding admin/settings:", e);
  }



  registerNotificationsRoutes(app);

  registerAdminMiscRoutes(app);

  registerAssetsRoutes(app);

  registerPricingRoutes(app);

  return httpServer;
}
