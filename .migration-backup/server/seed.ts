import { db } from "./db";
import { tours, tourDays, tourDepartures } from "../shared/schema";
import { eq, and } from "drizzle-orm";

async function seed() {
  console.log("🌱 Starting seeder...");

  // 1. Tours
  const dummyTours = [
    {
      title: "Bali Immerse: Cultural and Leisure Discovery",
      slug: "bali-immerse-cultural-and-leisure-discovery",
      description: "Explore the rich cultural heritage and serene beauty of Bali, Indonesia, through this thoughtfully curated itinerary designed for a balanced experience.",
      highlights: "Uluwatu Temple Sunset\nUbud Monkey Forest\nTegallalang Rice Terrace\nTanah Lot",
      inclusions: "- 4 Nights accommodation\n- Daily breakfast\n- Private airport transfers\n- English speaking guide",
      exclusions: "- International flights\n- Personal expenses\n- Travel insurance",
      imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=1200",
      duration: 5,
      basePrice: "450",
      childPrice: "300",
      isPublished: true,
      category: "Cultural",
      countries: ["Indonesia"],
      tags: ["culture", "leisure", "beach"]
    },
    {
      title: "Japan Sakura Blossom",
      slug: "japan-sakura-blossom",
      description: "Experience the magic of cherry blossom season in Japan. Journey through Tokyo, Kyoto, and Osaka while enjoying the magnificent pink landscapes.",
      highlights: "Tokyo Skytree\nMount Fuji\nKyoto Temples\nOsaka Castle",
      inclusions: "- 7 Nights accommodation\n- JR Pass (7 days)\n- Welcome dinner\n- Local guide",
      exclusions: "- Flights\n- Meals not specified",
      imageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=1200",
      duration: 8,
      basePrice: "1200",
      childPrice: "850",
      isPublished: true,
      category: "Nature",
      countries: ["Japan"],
      tags: ["spring", "nature", "photography"]
    }
  ];

  console.log("Seeding Tours...");
  const insertedTours = [];
  for (const tourData of dummyTours) {
    // Check if exists
    const existing = await db.select().from(tours).where(eq(tours.slug, tourData.slug));
    if (existing.length === 0) {
      const inserted = await db.insert(tours).values(tourData).returning();
      insertedTours.push(inserted[0]);
    } else {
      insertedTours.push(existing[0]);
    }
  }

  // 2. Tour Days
  console.log("Seeding Tour Days...");
  if (insertedTours[0]) {
    const baliTour = insertedTours[0];
    const days = [
      { tourId: baliTour.id, dayNumber: 1, title: "Arrival in Bali", description: "Welcome to Bali. Transfer to hotel and rest.", city: "Denpasar", countryCode: "ID" },
      { tourId: baliTour.id, dayNumber: 2, title: "Ubud Exploration", description: "Visit Monkey Forest and Rice Terraces.", city: "Ubud", countryCode: "ID" },
      { tourId: baliTour.id, dayNumber: 3, title: "Temple Tour", description: "Visit Uluwatu and Tanah Lot.", city: "Badung", countryCode: "ID" }
    ];
    for (const day of days) {
      const existing = await db.select().from(tourDays).where(and(eq(tourDays.tourId, baliTour.id), eq(tourDays.dayNumber, day.dayNumber)));
      if (existing.length === 0) await db.insert(tourDays).values(day);
    }
  }

  // 3. Tour Departures
  console.log("Seeding Departures...");
  if (insertedTours[0]) {
    const baliTour = insertedTours[0];
    const departures = [
      { tourId: baliTour.id, startDate: "2026-07-10", endDate: "2026-07-15", capacityTotal: 20, capacityBooked: 5, pricePerPerson: 450, status: "open" as const },
      { tourId: baliTour.id, startDate: "2026-08-12", endDate: "2026-08-17", capacityTotal: 15, capacityBooked: 0, pricePerPerson: 450, status: "open" as const }
    ];
    for (const dep of departures) {
      // Just insert if doesn't exist (simplistic check by date)
      const existing = await db.select().from(tourDepartures).where(and(eq(tourDepartures.tourId, baliTour.id), eq(tourDepartures.startDate, dep.startDate)));
      if (existing.length === 0) await db.insert(tourDepartures).values(dep);
    }
  }
  
  if (insertedTours[1]) {
    const japanTour = insertedTours[1];
    const departures = [
      { tourId: japanTour.id, startDate: "2027-03-20", endDate: "2027-03-28", capacityTotal: 25, capacityBooked: 10, pricePerPerson: 1200, status: "open" as const },
    ];
    for (const dep of departures) {
      const existing = await db.select().from(tourDepartures).where(and(eq(tourDepartures.tourId, japanTour.id), eq(tourDepartures.startDate, dep.startDate)));
      if (existing.length === 0) await db.insert(tourDepartures).values(dep);
    }
  }

  console.log("✅ Seeding complete!");
  process.exit(0);
}

seed().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
