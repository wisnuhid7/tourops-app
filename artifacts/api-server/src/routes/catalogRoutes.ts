import type { Express } from "express";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { scraperService } from "../lib/scrapers";
import { hotelService } from "../lib/hotel";
import { aiService } from "../lib/ai";
import { isAuthenticated } from "../replit_integrations/auth";
import { cities, countries, hotels } from "@workspace/db";
import { ALL_STAFF_ROLES, SIGHTS_MANAGE_ROLES, TOUR_BUILDER_ROLES, requireRole } from "../middleware/auth";
import { maybeAutoTranslateEntitiesInBackground } from "../lib/entity-translation";

// Catalog administration: scraping, AI features/tour generation, and tour day
// items. Extracted verbatim from routes.ts - behaviour and registration order
// unchanged.
export function registerCatalogRoutes(app: Express): void {
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
  // Read: staff only (F-02). An unpublished tour's itinerary must not be
  // readable by anonymous or customer callers; the only consumer is the staff
  // itinerary editor.
  app.get("/api/tour-days/:dayId/items", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ALL_STAFF_ROLES)) return;
      const items = await storage.getTourDayItems(req.params.dayId as string);
      maybeAutoTranslateEntitiesInBackground("tourDayItem", items as any);
      res.json(items);
    }
    catch (e: any) { routeError(res, e); }
  });

  // Mutations: tour builders / admins only (F-02) — not merely "authenticated"
  // (any customer could previously rewrite itinerary data).
  app.post("/api/tour-days/:dayId/items", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      const data = { ...req.body, tourDayId: req.params.dayId };
      const item = await storage.createTourDayItem(data);
      res.status(201).json(item);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/tour-day-items/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      res.json(await storage.updateTourDayItem(req.params.id as string, req.body));
    }
    catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/tour-day-items/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, TOUR_BUILDER_ROLES)) return;
      await storage.deleteTourDayItem(req.params.id as string);
      res.sendStatus(204);
    } catch (e: any) { routeError(res, e); }
  });
}
