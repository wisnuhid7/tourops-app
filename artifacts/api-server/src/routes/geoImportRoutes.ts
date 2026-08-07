/**
 * One-time geo data import endpoint.
 *
 * POST /api/admin/import-geo
 *
 * Copies the bulk-loaded countries, cities, and airports from the bundled
 * data files (exported from the dev DB) into the live production database.
 * Uses natural-key deduplication so it is safe to call multiple times and
 * never overwrites existing rows.
 *
 * Security:
 *   - Requires the GEO_IMPORT_SECRET env var to be set.
 *   - Caller must send  X-Import-Secret: <value>  matching that env var.
 *   - Constant-time comparison (no timing oracle).
 *   - If GEO_IMPORT_SECRET is unset the endpoint returns 404.
 */

import type { Express } from "express";
import { db, countries, cities, airports } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import crypto from "crypto";
import path from "path";
import fs from "fs";

function safeEqual(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ab.length !== bb.length) {
      // Still do the compare to avoid timing differences on length check alone
      crypto.timingSafeEqual(ab, ab);
      return false;
    }
    return crypto.timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

interface RawCountry {
  code: string; iso3: string | null; name: string; capital_city: string | null;
  continent: string | null; region: string | null; subregion: string | null;
  currency_code: string | null; currency_name: string | null; phone_code: string | null;
  flag_url: string | null; latitude: string | null; longitude: string | null;
  population: number | null; source_name: string | null; is_active: boolean | null;
}

interface RawCity {
  name: string; ascii_name: string | null; country_code: string;
  population: number | null; latitude: string | null; longitude: string | null;
  timezone: string | null; geoname_id: string | null; city_rank: number | null;
  is_capital: boolean | null; is_tourism_city: boolean | null;
  is_airport_city: boolean | null; is_active: boolean | null; source_name: string | null;
}

interface RawAirport {
  code: string; name: string; is_active: boolean | null;
  country_code: string; city_name: string;
}

function loadData<T>(filename: string): T[] {
  // __dirname resolves to dist/ at runtime (esbuild banner sets it to the
  // directory of the compiled bundle). Data files are copied there by build.mjs.
  const filePath = path.join(__dirname, "data", filename);
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T[];
}

export interface GeoImportSummary {
  countries: { inserted: number; total: number };
  cities: { inserted: number; total: number };
  airports: { inserted: number; total: number };
}

/**
 * Idempotent geo import: inserts only missing countries (by ISO2 code),
 * cities (by country + lower(name)), and airports (by IATA code).
 * Existing rows are never modified.
 */
export async function runGeoImport(): Promise<GeoImportSummary> {
  const rawCountries = loadData<RawCountry>("geo-countries.json");
  const rawCities = loadData<RawCity>("geo-cities.json");
  const rawAirports = loadData<RawAirport>("geo-airports.json");
  {

      // ── 1. Countries ─────────────────────────────────────────────────────
      // Natural key: code (ISO2). ON CONFLICT DO NOTHING preserves existing rows.
      let countriesInserted = 0;
      const COUNTRY_CHUNK = 50;
      for (let i = 0; i < rawCountries.length; i += COUNTRY_CHUNK) {
        const chunk = rawCountries.slice(i, i + COUNTRY_CHUNK);
        const rows = await db
          .insert(countries)
          .values(
            chunk.map((c) => ({
              code: c.code,
              iso3: c.iso3 ?? null,
              name: c.name,
              capitalCity: c.capital_city ?? null,
              continent: c.continent ?? null,
              region: c.region ?? null,
              subregion: c.subregion ?? null,
              currencyCode: c.currency_code ?? null,
              currencyName: c.currency_name ?? null,
              phoneCode: c.phone_code ?? null,
              flagUrl: c.flag_url ?? null,
              latitude: c.latitude ?? null,
              longitude: c.longitude ?? null,
              population: c.population ?? null,
              sourceName: c.source_name ?? null,
              isActive: c.is_active ?? true,
            }))
          )
          .onConflictDoNothing()
          .returning({ id: countries.id });
        countriesInserted += rows.length;
      }

      // ── 2. Build country code → prod ID map ──────────────────────────────
      const allCountries = await db.select({ id: countries.id, code: countries.code }).from(countries);
      const codeToId = new Map(allCountries.map((c) => [c.code, c.id]));

      // ── 3. Cities ─────────────────────────────────────────────────────────
      // No unique constraint on cities; dedup by lower(name) + country_id.
      // Load existing (country_id, lower_name) pairs so we skip them.
      const existingCities = await db.execute(
        sql`SELECT country_id, lower(name) as lname FROM cities`
      ) as any;
      const existingCityKeys = new Set<string>(
        (existingCities.rows ?? existingCities).map(
          (r: any) => `${r.country_id}:${r.lname}`
        )
      );

      const newCityValues: Array<{
        name: string; asciiName: string | null; countryId: string;
        population: number | null; latitude: string | null; longitude: string | null;
        timezone: string | null; geonameId: string | null; cityRank: number | null;
        isCapital: boolean; isTourismCity: boolean; isAirportCity: boolean;
        isActive: boolean; sourceName: string | null;
      }> = [];

      for (const c of rawCities) {
        const countryId = codeToId.get(c.country_code);
        if (!countryId) continue;
        const key = `${countryId}:${c.name.toLowerCase()}`;
        if (existingCityKeys.has(key)) continue;
        existingCityKeys.add(key); // avoid dups within the import batch
        newCityValues.push({
          name: c.name,
          asciiName: c.ascii_name ?? null,
          countryId,
          population: c.population ?? null,
          latitude: c.latitude ?? null,
          longitude: c.longitude ?? null,
          timezone: c.timezone ?? null,
          geonameId: c.geoname_id ?? null,
          cityRank: c.city_rank ?? 0,
          isCapital: c.is_capital ?? false,
          isTourismCity: c.is_tourism_city ?? false,
          isAirportCity: c.is_airport_city ?? false,
          isActive: c.is_active ?? true,
          sourceName: c.source_name ?? null,
        });
      }

      let citiesInserted = 0;
      const CITY_CHUNK = 100;
      for (let i = 0; i < newCityValues.length; i += CITY_CHUNK) {
        const chunk = newCityValues.slice(i, i + CITY_CHUNK);
        await db.insert(cities).values(chunk);
        citiesInserted += chunk.length;
      }

      // ── 4. Build (country_id, lower_name) → city_id map for airports ─────
      const allCities = await db.execute(
        sql`SELECT id, country_id, lower(name) as lname FROM cities`
      ) as any;
      const cityKeyToId = new Map<string, string>(
        (allCities.rows ?? allCities).map((r: any) => [`${r.country_id}:${r.lname}`, r.id])
      );

      // ── 5. Airports ────────────────────────────────────────────────────────
      // Natural key: code (IATA). ON CONFLICT DO NOTHING.
      const airportValues: Array<{ code: string; name: string; cityId: string; isActive: boolean }> = [];
      for (const a of rawAirports) {
        const countryId = codeToId.get(a.country_code);
        if (!countryId) continue;
        const cityId = cityKeyToId.get(`${countryId}:${a.city_name.toLowerCase()}`);
        if (!cityId) continue;
        airportValues.push({
          code: a.code,
          name: a.name,
          cityId,
          isActive: a.is_active ?? true,
        });
      }

      let airportsInserted = 0;
      const AIRPORT_CHUNK = 100;
      for (let i = 0; i < airportValues.length; i += AIRPORT_CHUNK) {
        const chunk = airportValues.slice(i, i + AIRPORT_CHUNK);
        const rows = await db
          .insert(airports)
          .values(chunk)
          .onConflictDoNothing()
          .returning({ id: airports.id });
        airportsInserted += rows.length;
      }

      return {
        countries: { inserted: countriesInserted, total: rawCountries.length },
        cities: { inserted: citiesInserted, total: rawCities.length },
        airports: { inserted: airportsInserted, total: airportValues.length },
      };
  }
}

/**
 * Startup hook: if the airports table is empty (fresh production DB), run the
 * geo import automatically so the live site gets the reference data on first
 * boot after a publish — no manual endpoint call needed. Errors are logged,
 * never fatal to boot.
 */
export async function maybeRunGeoImportAtStartup(): Promise<void> {
  try {
    const [{ count }] = (await db.execute(
      sql`SELECT COUNT(*)::int AS count FROM airports`
    ) as any).rows ?? [{ count: 1 }];
    if (count > 0) return;
    console.log("Geo import: airports table is empty; running automatic import...");
    const summary = await runGeoImport();
    console.log(
      `Geo import complete: +${summary.countries.inserted} countries, ` +
      `+${summary.cities.inserted} cities, +${summary.airports.inserted} airports`
    );
  } catch (e) {
    console.error("Geo import at startup failed (non-fatal):", e);
  }
}

export function registerGeoImportRoutes(app: Express): void {
  // Manual trigger, secret-guarded. Kept as a fallback / re-run mechanism.
  app.post("/api/admin/import-geo", async (req, res) => {
    try {
      const secret = process.env.GEO_IMPORT_SECRET;
      if (!secret) return res.status(404).json({ message: "Not found" });
      const provided = (req.get("x-import-secret") ?? "").trim();
      if (!safeEqual(provided, secret)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      const summary = await runGeoImport();
      res.json({ ok: true, ...summary });
    } catch (e: any) {
      console.error("geo-import error:", e);
      res.status(500).json({ message: "Import failed" });
    }
  });
}
