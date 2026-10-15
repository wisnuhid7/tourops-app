import type { Express, Request, Response } from "express";
import { and } from "drizzle-orm";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { pricingService } from "../lib/pricing";
import { airlineService } from "../lib/airline";
import { hotelService } from "../lib/hotel";
import { aiService } from "../lib/ai";
import { queues } from "../lib/workers";
import { scraperSafety } from "../lib/scraperSafety";
import { isAuthenticated } from "../replit_integrations/auth";
import { countries, cities, insertMarkupRuleSchema, insertAffiliateSchema } from "@workspace/db";
import { ADMIN_ROLES, ALL_STAFF_ROLES, requireRole } from "../middleware/auth";

// Admin miscellany: analytics, pricing markup rules/settings, affiliates,
// data-import runners, scraper block/unblock, audit logs, AI consultant,
// flight search, AI tour generator, and the tour price-breakdown helper.
// Extracted verbatim from routes.ts — behaviour and registration order
// unchanged (registered just before the asset routes).
export function registerAdminMiscRoutes(app: Express): void {
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
      // F-03: internal cost/markup/margin is staff-only (tour builders set
      // pricing; finance/management review it). Never expose to customers.
      if (!await requireRole(req, res, ["admin", "super_admin", "tour_builder", "accounting", "country_manager", "operations_manager"])) return;
      const breakdown = await pricingService.calculateTourPrice(req.params.id as string);
      res.json(breakdown);
    } catch (e: any) { routeError(res, e); }
  });
}
