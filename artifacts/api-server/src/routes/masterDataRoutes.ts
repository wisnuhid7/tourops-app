import type { Express, Request } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import {
  cities,
  countries,
  db,
  insertAirlineAgencySchema,
  insertAirportSchema,
  insertCitySchema,
  insertCountrySchema,
  insertSightSchema,
  insertTransportCompanySchema,
} from "@workspace/db";
import {
  AIRLINE_MANAGE_ROLES,
  ALL_STAFF_ROLES,
  SIGHTS_MANAGE_ROLES,
  TRANSPORT_COMPANY_MANAGE_ROLES,
  getUserId,
  requireRole,
} from "../middleware/auth";
import { coerceBooleans, ownerScope } from "./shared";

// Master data: countries, cities, airports, sights, transport companies, and
// airline agencies. Includes the local getAssignedCountryScope helper for
// country_manager scoping. Extracted verbatim from routes.ts.
export function registerMasterDataRoutes(app: Express): void {
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
}
