import { db } from "@workspace/db";
import { tours, tourDays, tourDepartures } from "@workspace/db";
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
      tags: ["culture", "leisure", "beach"],
      translations: {
        es: {
          title: "Bali Inmersivo: Descubrimiento Cultural y de Ocio",
          description: "Explora el rico patrimonio cultural y la serena belleza de Bali, Indonesia, a través de este itinerario cuidadosamente diseñado para una experiencia equilibrada.",
          highlights: "Atardecer en el Templo de Uluwatu\nBosque de los Monos de Ubud\nTerrazas de Arroz de Tegallalang\nTanah Lot",
          inclusions: "- 4 noches de alojamiento\n- Desayuno diario\n- Traslados privados al aeropuerto\n- Guía de habla inglesa",
          exclusions: "- Vuelos internacionales\n- Gastos personales\n- Seguro de viaje",
        },
        id: {
          title: "Bali Immerse: Penjelajahan Budaya dan Rekreasi",
          description: "Jelajahi warisan budaya yang kaya dan keindahan Bali, Indonesia, melalui itinerari yang dirancang dengan cermat untuk pengalaman yang seimbang.",
          highlights: "Matahari Terbenam di Pura Uluwatu\nMonkey Forest Ubud\nTerasering Sawah Tegallalang\nTanah Lot",
          inclusions: "- Akomodasi 4 malam\n- Sarapan setiap hari\n- Antar-jemput bandara pribadi\n- Pemandu berbahasa Inggris",
          exclusions: "- Penerbangan internasional\n- Pengeluaran pribadi\n- Asuransi perjalanan",
        },
      },
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
      tags: ["spring", "nature", "photography"],
      translations: {
        es: {
          title: "Japón: Flor de Cerezo Sakura",
          description: "Vive la magia de la temporada de los cerezos en flor en Japón. Recorre Tokio, Kioto y Osaka mientras disfrutas de los magníficos paisajes rosados.",
          highlights: "Tokyo Skytree\nMonte Fuji\nTemplos de Kioto\nCastillo de Osaka",
          inclusions: "- 7 noches de alojamiento\n- JR Pass (7 días)\n- Cena de bienvenida\n- Guía local",
          exclusions: "- Vuelos\n- Comidas no especificadas",
        },
        id: {
          title: "Jepang Musim Sakura",
          description: "Rasakan keajaiban musim bunga sakura di Jepang. Jelajahi Tokyo, Kyoto, dan Osaka sambil menikmati pemandangan merah muda yang menakjubkan.",
          highlights: "Tokyo Skytree\nGunung Fuji\nKuil-kuil Kyoto\nKastil Osaka",
          inclusions: "- Akomodasi 7 malam\n- JR Pass (7 hari)\n- Makan malam sambutan\n- Pemandu lokal",
          exclusions: "- Penerbangan\n- Makanan yang tidak disebutkan",
        },
      },
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
      // Backfill translations on already-seeded tours that predate i18n seeding.
      if (!(existing[0] as any).translations && (tourData as any).translations) {
        const [updated] = await db.update(tours)
          .set({ translations: (tourData as any).translations })
          .where(eq(tours.id, existing[0].id))
          .returning();
        insertedTours.push(updated);
      } else {
        insertedTours.push(existing[0]);
      }
    }
  }

  // 2. Tour Days
  console.log("Seeding Tour Days...");
  if (insertedTours[0]) {
    const baliTour = insertedTours[0];
    const days = [
      { tourId: baliTour.id, dayNumber: 1, title: "Arrival in Bali", description: "Welcome to Bali. Transfer to hotel and rest.", city: "Denpasar", countryCode: "ID",
        translations: { es: { title: "Llegada a Bali", description: "Bienvenido a Bali. Traslado al hotel y descanso." }, id: { title: "Tiba di Bali", description: "Selamat datang di Bali. Transfer ke hotel dan istirahat." } } },
      { tourId: baliTour.id, dayNumber: 2, title: "Ubud Exploration", description: "Visit Monkey Forest and Rice Terraces.", city: "Ubud", countryCode: "ID",
        translations: { es: { title: "Exploración de Ubud", description: "Visita al Bosque de los Monos y las Terrazas de Arroz." }, id: { title: "Penjelajahan Ubud", description: "Kunjungi Monkey Forest dan Terasering Sawah." } } },
      { tourId: baliTour.id, dayNumber: 3, title: "Temple Tour", description: "Visit Uluwatu and Tanah Lot.", city: "Badung", countryCode: "ID",
        translations: { es: { title: "Ruta de Templos", description: "Visita a Uluwatu y Tanah Lot." }, id: { title: "Tur Pura", description: "Kunjungi Uluwatu dan Tanah Lot." } } }
    ];
    for (const day of days) {
      const existing = await db.select().from(tourDays).where(and(eq(tourDays.tourId, baliTour.id), eq(tourDays.dayNumber, day.dayNumber)));
      if (existing.length === 0) {
        await db.insert(tourDays).values(day);
      } else if (!(existing[0] as any).translations && (day as any).translations) {
        await db.update(tourDays).set({ translations: (day as any).translations }).where(eq(tourDays.id, existing[0].id));
      }
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
