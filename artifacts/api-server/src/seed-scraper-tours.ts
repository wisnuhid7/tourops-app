import { db } from "@workspace/db";
import { tours, tourDays } from "@workspace/db";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

// Raw DB row shapes coming from the JSON export (snake_case, as stored in PG).
interface TourRow {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  highlights: string | null;
  inclusions: string | null;
  exclusions: string | null;
  image_url: string | null;
  gallery_urls: string[] | null;
  duration: number;
  base_price: string;
  markup_amount: string;
  total_price: string;
  is_price_confirmed: boolean;
  child_price: string | null;
  single_supplement: string | null;
  countries: string[] | null;
  tags: string[] | null;
  category: string | null;
  internal_notes: string | null;
  translations: unknown | null;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

interface TourDayRow {
  id: string;
  tour_id: string;
  day_number: number;
  title: string;
  description: string | null;
  country_code: string | null;
  city: string | null;
  activities: string | null;
  image_url: string | null;
  translations: unknown | null;
  created_at: string;
}

interface SeedData {
  tours: TourRow[];
  tourDays: TourDayRow[];
}

export interface ScraperTourSeedResult {
  toursInserted: number;
  toursSkipped: number;
  daysInserted: number;
}

/**
 * Idempotently seeds the 243 scraper-imported tours and their tour_days.
 *
 * Tours: INSERT … ON CONFLICT (slug) DO NOTHING — never overwrites staff edits.
 * Tour days: only deleted+reinserted for tours that were just inserted on this
 * run, so staff-edited days on already-present tours are preserved.
 *
 * Data source: src/data/scraper-tours-seed.json (dev) or dist/data/ (prod).
 * The path is resolved relative to this compiled file via import.meta.url so
 * it works in both tsx (dev, points to src/) and esbuild bundle (prod, points
 * to dist/index.mjs which is the same level as dist/data/).
 */
export async function runScraperTourSeed(): Promise<ScraperTourSeedResult> {
  const dataPath = fileURLToPath(
    new URL("./data/scraper-tours-seed.json", import.meta.url),
  );
  const seed = JSON.parse(readFileSync(dataPath, "utf-8")) as SeedData;

  // Index days by tour_id for quick lookup.
  const daysByTourId = new Map<string, TourDayRow[]>();
  for (const day of seed.tourDays) {
    const bucket = daysByTourId.get(day.tour_id);
    if (bucket) {
      bucket.push(day);
    } else {
      daysByTourId.set(day.tour_id, [day]);
    }
  }

  let toursInserted = 0;
  let toursSkipped = 0;
  let daysInserted = 0;

  for (const tour of seed.tours) {
    // Map snake_case DB columns to drizzle camelCase field names.
    const payload = {
      id: tour.id,
      title: tour.title,
      slug: tour.slug,
      description: tour.description,
      highlights: tour.highlights,
      inclusions: tour.inclusions,
      exclusions: tour.exclusions,
      imageUrl: tour.image_url,
      galleryUrls: tour.gallery_urls,
      duration: tour.duration,
      basePrice: tour.base_price,
      markupAmount: tour.markup_amount,
      totalPrice: tour.total_price,
      isPriceConfirmed: tour.is_price_confirmed,
      childPrice: tour.child_price,
      singleSupplement: tour.single_supplement,
      countries: tour.countries,
      tags: tour.tags,
      category: tour.category,
      internalNotes: tour.internal_notes,
      translations: tour.translations,
      isPublished: tour.is_published,
    };

    // ON CONFLICT (slug) DO NOTHING — if the slug exists, skip silently.
    // .returning() yields the inserted row only; empty array = conflict/skipped.
    const inserted = await db
      .insert(tours)
      .values(payload)
      .onConflictDoNothing()
      .returning({ id: tours.id });

    if (inserted.length > 0) {
      toursInserted++;

      // Delete+reinsert days only for tours we just created; preserves any
      // staff-edited days on tours that were already in the DB.
      const days = daysByTourId.get(tour.id) ?? [];
      if (days.length > 0) {
        await db.transaction(async (tx) => {
          await tx.delete(tourDays).where(eq(tourDays.tourId, tour.id));
          for (const day of days) {
            await tx.insert(tourDays).values({
              id: day.id,
              tourId: day.tour_id,
              dayNumber: day.day_number,
              title: day.title,
              description: day.description,
              countryCode: day.country_code,
              city: day.city,
              activities: day.activities,
              imageUrl: day.image_url,
              translations: day.translations,
            });
          }
          daysInserted += days.length;
        });
      }
    } else {
      toursSkipped++;
    }
  }

  return { toursInserted, toursSkipped, daysInserted };
}
