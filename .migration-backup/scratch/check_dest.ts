process.env.DATABASE_URL="postgresql://postgres:tour_ops_2026@88.99.192.160:5033/tourops";
import { db } from "../server/db";
import { tours } from "../shared/schema";
import { eq } from "drizzle-orm";

async function run() {
  const allTours = await db.query.tours.findMany({
    where: eq(tours.status, "published"),
  });
  
  const destMap = new Map();

  for (const tour of allTours) {
    if (!tour.countries || !Array.isArray(tour.countries)) continue;
    for (const country of tour.countries) {
      if (!country) continue;
      const countryName = country.trim();
      if (destMap.has(countryName)) {
        const dest = destMap.get(countryName);
        dest.tours += 1;
        if (dest.img.includes('placeholder') && tour.imageUrl) {
          dest.img = tour.imageUrl;
        }
      } else {
        destMap.set(countryName, {
          name: countryName,
          tours: 1,
          img: tour.imageUrl || 'https://images.unsplash.com/photo-1488085061387-422e29b40080?auto=format&fit=crop&q=80',
        });
      }
    }
  }

  const popularDestinations = Array.from(destMap.values())
    .sort((a, b) => b.tours - a.tours)
    .slice(0, 8);
    
  console.log(JSON.stringify(popularDestinations, null, 2));
  process.exit(0);
}

run().catch(console.error);
