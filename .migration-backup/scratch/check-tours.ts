import { db } from "../server/db";
import { tours, tourDays } from "../shared/schema";

async function main() {
  const allTours = await db.select().from(tours);
  console.log("--- TOURS IN DB ---");
  for (const t of allTours) {
    console.log(`ID: ${t.id}`);
    console.log(`Title: ${t.title}`);
    console.log(`Slug: ${t.slug}`);
    console.log(`Translations:`, JSON.stringify(t.translations, null, 2));
    
    const days = await db.select().from(tourDays).where(eq(tourDays.tourId, t.id));
    console.log(`Days Count: ${days.length}`);
    for (const d of days) {
      console.log(`  Day ${d.dayNumber}: ${d.title}`);
      console.log(`  Day Translations:`, JSON.stringify(d.translations, null, 2));
    }
    console.log("-------------------");
  }
}

import { eq } from "drizzle-orm";
main().catch(console.error);
