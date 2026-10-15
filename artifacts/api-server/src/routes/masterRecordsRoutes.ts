import type { Express } from "express";
import { and, eq, sql } from "drizzle-orm";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated } from "../replit_integrations/auth";
import { cities, countries, db } from "@workspace/db";
import { MASTER_RECORDS_MANAGE_ROLES, getUserId, requireRole } from "../middleware/auth";

// Master records CRUD. Extracted verbatim from routes.ts - behaviour and
// registration order unchanged.
export function registerMasterRecordsRoutes(app: Express): void {
  // ---- Master Records ----
  app.get("/api/master-records", isAuthenticated, async (req, res) => {
    try {
      res.json(await storage.getMasterRecords(req.query.type as string));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/master-records", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, MASTER_RECORDS_MANAGE_ROLES)) return;
      const record = await storage.createMasterRecord(req.body);
      
      // If it is a city manager creating a city, auto-insert into cities table
      if (req.body.recordType === "city_manager" && req.body.title) {
        const userId = getUserId(req);
        const profile = await storage.getProfileByUserId(userId!);
        const countryCode = profile?.countryCode || "EG"; // default to Egypt if not set
        
        let countryId: string | null = null;
        const [country] = await db.select().from(countries).where(eq(countries.code, countryCode.toUpperCase())).limit(1);
        if (country) {
          countryId = country.id;
        } else {
          const [firstCountry] = await db.select().from(countries).limit(1);
          if (firstCountry) countryId = firstCountry.id;
        }
        
        if (countryId) {
          const nameTrimmed = req.body.title.trim();
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
              countryId: countryId
            });
          }
        }
      }
      
      res.status(201).json(record);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/master-records/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, MASTER_RECORDS_MANAGE_ROLES)) return;
      const oldRecord = await storage.getMasterRecord(req.params.id as string);
      const updated = await storage.updateMasterRecord(req.params.id as string, req.body);
      
      if (oldRecord && oldRecord.recordType === "city_manager" && req.body.title && req.body.title !== oldRecord.title) {
        const oldName = oldRecord.title.trim().toLowerCase();
        const newName = req.body.title.trim();
        
        const match = await db.select().from(cities).where(eq(sql`lower(${cities.name})`, oldName)).limit(1);
        if (match[0]) {
          await db.update(cities).set({ name: newName }).where(eq(cities.id, match[0].id));
        }
      }
      
      res.json(updated);
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/master-records/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, MASTER_RECORDS_MANAGE_ROLES)) return;
      const oldRecord = await storage.getMasterRecord(req.params.id as string);
      
      if (oldRecord && oldRecord.recordType === "city_manager") {
        const cityName = oldRecord.title.trim().toLowerCase();
        const match = await db.select().from(cities).where(eq(sql`lower(${cities.name})`, cityName)).limit(1);
        if (match[0]) {
          await db.delete(cities).where(eq(cities.id, match[0].id));
        }
      }
      
      await storage.deleteMasterRecord(req.params.id as string);
      res.sendStatus(204);
    } catch (e: any) { routeError(res, e); }
  });

}
