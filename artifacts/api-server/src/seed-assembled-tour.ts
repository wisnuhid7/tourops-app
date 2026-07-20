import { db } from "@workspace/db";
import {
  tours, tourDays, tourDayItems, tourDepartures,
  hotels, sights, guideRates, cities,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Builds one fully-assembled, bookable tour: real hotel + guide + transport + sights
// linked day-by-day, so tour_builder / content_editor / tour_leader all have a
// realistic, complete example to work with.
async function seedAssembledTour() {
  console.log("🧩 Seeding fully-assembled demo tour...");

  const slug = "bali-signature-escape-fully-assembled";
  let [tour] = await db.select().from(tours).where(eq(tours.slug, slug));
  if (!tour) {
    [tour] = await db.insert(tours).values({
      title: "Bali Signature Escape",
      slug,
      description: "A fully assembled 4-day Bali journey combining beachfront luxury, cultural immersion, and guided temple visits — every day pre-linked to real hotels, a licensed guide, and ticketed sights.",
      highlights: "Private airport transfer\nUluwatu Temple sunset with licensed guide\nUbud Monkey Forest & Tegallalang Rice Terrace\nAyana Resort beachfront stay",
      inclusions: "- 3 nights at Ayana Resort Bali\n- Daily breakfast\n- Private transport throughout\n- English-speaking licensed guide\n- All listed entrance tickets",
      exclusions: "- International flights\n- Personal expenses\n- Travel insurance",
      imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=1200",
      galleryUrls: [
        "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=800",
        "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?auto=format&fit=crop&q=80&w=800",
      ],
      duration: 4,
      basePrice: "680",
      childPrice: "480",
      isPriceConfirmed: true,
      isPublished: true,
      category: "Cultural",
      countries: ["Indonesia"],
      tags: ["culture", "beach", "guided"],
    }).returning();
    console.log(`  ✓ Created tour "${tour.title}" (${tour.id})`);
  } else {
    console.log(`  ↺ Tour already exists (${tour.id}), reusing.`);
  }

  // Real linked inventory
  const [denpasarHotel] = await db.select().from(hotels).where(eq(hotels.name, "Ayana Resort Bali"));
  const [ubudHotel] = await db.select().from(hotels).where(eq(hotels.name, "Ubud Hanging Gardens"));
  const [ubudCity] = await db.select().from(cities).where(eq(cities.name, "Ubud"));
  const [denpasarCity] = await db.select().from(cities).where(eq(cities.name, "Denpasar"));

  const uluwatuSight = ubudCity ? undefined : undefined; // placeholder, resolved below
  const [monkeyForestSight] = await db.select().from(sights).where(eq(sights.name, "Tegallalang Rice Terrace"));

  let [baliGuide] = await db.select().from(guideRates).where(eq(guideRates.guideName, "Made Wirawan"));
  if (!baliGuide) {
    [baliGuide] = await db.insert(guideRates).values({
      countryCode: "ID",
      cityBase: "Denpasar",
      guideName: "Made Wirawan",
      guideCode: "GDE-BALI-001",
      language: "English",
      rateUnit: "per_day",
      currency: "USD",
      price: "60",
      licenseLevel: "Licensed National Guide",
      notes: "Fully licensed Bali cultural & temple guide, English/Indonesian.",
      status: "active",
    }).returning();
    console.log(`  ✓ Created guide rate "${baliGuide.guideName}" (${baliGuide.id})`);
  }

  if (!denpasarHotel || !ubudHotel || !monkeyForestSight) {
    console.warn("  ⚠️ Missing base inventory (hotels/sights) — run seed-all.ts first for full linkage.");
  }

  const dayDefs = [
    {
      dayNumber: 1, title: "Arrival & Beachfront Check-in", city: "Denpasar", countryCode: "ID",
      description: "Arrive in Bali, private transfer to the resort, evening at leisure.",
      items: [
        { itemType: "transport", title: "Private airport transfer", description: "Air-conditioned private car, meet & greet at arrivals.", cost: "25", startTime: "14:00", endTime: "15:00", sortOrder: 0 },
        { itemType: "hotel", title: "Check-in: Ayana Resort Bali", description: "Beachfront resort stay, 3 nights.", cost: "180", hotelId: denpasarHotel?.id, startTime: "15:30", endTime: "16:00", sortOrder: 1 },
      ],
    },
    {
      dayNumber: 2, title: "Uluwatu Temple & Sunset", city: "Denpasar", countryCode: "ID",
      description: "Guided visit to Uluwatu clifftop temple with traditional Kecak fire dance at sunset.",
      items: [
        { itemType: "guide", title: "Licensed guide: Made Wirawan", description: "Full-day English-speaking guide for temple tour.", cost: "60", guideId: baliGuide?.id, startTime: "08:00", endTime: "18:00", sortOrder: 0 },
        { itemType: "transport", title: "Private vehicle, Denpasar loop", description: "Air-conditioned vehicle for the day.", cost: "40", startTime: "08:00", endTime: "18:00", sortOrder: 1 },
        { itemType: "sight", title: "Uluwatu Temple + Kecak Dance", description: "Clifftop temple visit and evening fire dance performance.", cost: "20", startTime: "16:00", endTime: "19:00", sortOrder: 2 },
      ],
    },
    {
      dayNumber: 3, title: "Ubud Cultural Day", city: "Ubud", countryCode: "ID",
      description: "Transfer to Ubud, visit rice terraces and monkey forest, overnight in Ubud.",
      items: [
        { itemType: "transport", title: "Transfer Denpasar → Ubud", description: "Private vehicle, approx. 1.5 hours.", cost: "35", startTime: "09:00", endTime: "10:30", sortOrder: 0 },
        { itemType: "sight", title: "Tegallalang Rice Terrace", description: "Iconic terraced rice paddies with photo stops.", cost: "10", sightId: monkeyForestSight?.id, startTime: "11:00", endTime: "12:30", sortOrder: 1 },
        { itemType: "hotel", title: "Check-in: Ubud Hanging Gardens", description: "Jungle-view resort stay, 1 night.", cost: "150", hotelId: ubudHotel?.id, startTime: "16:00", endTime: "16:30", sortOrder: 2 },
      ],
    },
    {
      dayNumber: 4, title: "Departure", city: "Ubud", countryCode: "ID",
      description: "Breakfast, free morning, private transfer to airport for departure.",
      items: [
        { itemType: "transport", title: "Private transfer to airport", description: "Air-conditioned private car to Denpasar airport.", cost: "35", startTime: "11:00", endTime: "12:30", sortOrder: 0 },
        { itemType: "departure", title: "Departure", description: "Tour concludes at the airport.", cost: "0", startTime: "12:30", endTime: "12:30", sortOrder: 1 },
      ],
    },
  ];

  for (const day of dayDefs) {
    const { items, ...dayFields } = day;
    let [existingDay] = await db.select().from(tourDays).where(
      and(eq(tourDays.tourId, tour.id), eq(tourDays.dayNumber, day.dayNumber))
    );
    if (!existingDay) {
      [existingDay] = await db.insert(tourDays).values({ tourId: tour.id, ...dayFields }).returning();
      console.log(`  ✓ Created day ${day.dayNumber}: ${day.title}`);
    }

    const existingItems = await db.select().from(tourDayItems).where(eq(tourDayItems.tourDayId, existingDay.id));
    if (existingItems.length === 0) {
      for (const item of items) {
        await db.insert(tourDayItems).values({ tourDayId: existingDay.id, ...item });
      }
      console.log(`    ✓ Added ${items.length} schedule items to day ${day.dayNumber}`);
    }
  }

  const departureDates = [
    { startDate: "2026-08-05", endDate: "2026-08-08" },
    { startDate: "2026-09-14", endDate: "2026-09-17" },
  ];
  for (const dep of departureDates) {
    const existing = await db.select().from(tourDepartures).where(
      and(eq(tourDepartures.tourId, tour.id), eq(tourDepartures.startDate, dep.startDate))
    );
    if (existing.length === 0) {
      await db.insert(tourDepartures).values({
        tourId: tour.id, startDate: dep.startDate, endDate: dep.endDate,
        capacityTotal: 16, capacityBooked: 0, pricePerPerson: 680, status: "open",
      });
      console.log(`  ✓ Added departure ${dep.startDate}`);
    }
  }

  console.log("✅ Assembled tour seeding complete!");
  process.exit(0);
}

seedAssembledTour().catch(err => {
  console.error("❌ Assembled tour seeding failed:", err);
  process.exit(1);
});
