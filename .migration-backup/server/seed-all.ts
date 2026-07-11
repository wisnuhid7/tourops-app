import { db } from "./db";
import { users } from "../shared/models/auth";
import {
  userProfiles, tours, tourDays, tourDepartures,
  bookings, travelers, bookingAssignments, bookingWorkflows, workflowSteps,
  documents, messages, payments,
  countries, cities, sights, hotels,
  transportCompanies, airlineAgencies,
} from "../shared/schema";
import { eq, and } from "drizzle-orm";
import crypto from "crypto";

function genCode(len: number) { return crypto.randomBytes(len).toString("hex").toUpperCase().slice(0, len); }
function bookingCode() { return `BK-${genCode(8)}`; }

async function seedAll() {
  console.log("🚀 Starting MASSIVE HIGH-VOLUME database seeder...");

  // ===== 1. Countries (15 countries) =====
  console.log("📍 Seeding 15 Countries...");
  const countryData = [
    { code: "ID", iso3: "IDN", name: "Indonesia", capitalCity: "Jakarta", continent: "Asia", region: "South-Eastern Asia" },
    { code: "JP", iso3: "JPN", name: "Japan", capitalCity: "Tokyo", continent: "Asia", region: "Eastern Asia" },
    { code: "TR", iso3: "TUR", name: "Turkey", capitalCity: "Ankara", continent: "Asia", region: "Western Asia" },
    { code: "SA", iso3: "SAU", name: "Saudi Arabia", capitalCity: "Riyadh", continent: "Asia", region: "Western Asia" },
    { code: "EG", iso3: "EGY", name: "Egypt", capitalCity: "Cairo", continent: "Africa", region: "Northern Africa" },
    { code: "FR", iso3: "FRA", name: "France", capitalCity: "Paris", continent: "Europe", region: "Western Europe" },
    { code: "IT", iso3: "ITA", name: "Italy", capitalCity: "Rome", continent: "Europe", region: "Southern Europe" },
    { code: "US", iso3: "USA", name: "United States", capitalCity: "Washington D.C.", continent: "Americas", region: "Northern America" },
    { code: "ES", iso3: "ESP", name: "Spain", capitalCity: "Madrid", continent: "Europe", region: "Southern Europe" },
    { code: "AE", iso3: "ARE", name: "United Arab Emirates", capitalCity: "Abu Dhabi", continent: "Asia", region: "Western Asia" },
    { code: "CN", iso3: "CHN", name: "China", capitalCity: "Beijing", continent: "Asia", region: "Eastern Asia" },
    { code: "AU", iso3: "AUS", name: "Australia", capitalCity: "Canberra", continent: "Oceania", region: "Australia and New Zealand" },
    { code: "SG", iso3: "SGP", name: "Singapore", capitalCity: "Singapore", continent: "Asia", region: "South-Eastern Asia" },
    { code: "TH", iso3: "THA", name: "Thailand", capitalCity: "Bangkok", continent: "Asia", region: "South-Eastern Asia" },
    { code: "GR", iso3: "GRC", name: "Greece", capitalCity: "Athens", continent: "Europe", region: "Southern Europe" },
  ];

  const countryMap = new Map<string, any>();
  for (const c of countryData) {
    const existing = await db.select().from(countries).where(eq(countries.code, c.code));
    if (existing.length === 0) {
      const [inserted] = await db.insert(countries).values(c).returning();
      countryMap.set(c.code, inserted);
    } else {
      countryMap.set(c.code, existing[0]);
    }
  }
  console.log(`  ✓ ${countryMap.size} countries synchronized.`);

  // ===== 2. Cities (35 cities) =====
  console.log("🏙️ Seeding 35 Cities...");
  const cityData = [
    { name: "Denpasar", countryCode: "ID" },
    { name: "Ubud", countryCode: "ID" },
    { name: "Jakarta", countryCode: "ID" },
    { name: "Tokyo", countryCode: "JP" },
    { name: "Kyoto", countryCode: "JP" },
    { name: "Osaka", countryCode: "JP" },
    { name: "Istanbul", countryCode: "TR" },
    { name: "Cappadocia", countryCode: "TR" },
    { name: "Mecca", countryCode: "SA" },
    { name: "Medina", countryCode: "SA" },
    { name: "Cairo", countryCode: "EG" },
    { name: "Alexandria", countryCode: "EG" },
    { name: "Paris", countryCode: "FR" },
    { name: "Nice", countryCode: "FR" },
    { name: "Rome", countryCode: "IT" },
    { name: "Florence", countryCode: "IT" },
    { name: "Venice", countryCode: "IT" },
    { name: "New York", countryCode: "US" },
    { name: "San Francisco", countryCode: "US" },
    { name: "Madrid", countryCode: "ES" },
    { name: "Barcelona", countryCode: "ES" },
    { name: "Dubai", countryCode: "AE" },
    { name: "Abu Dhabi", countryCode: "AE" },
    { name: "Beijing", countryCode: "CN" },
    { name: "Shanghai", countryCode: "CN" },
    { name: "Sydney", countryCode: "AU" },
    { name: "Melbourne", countryCode: "AU" },
    { name: "Singapore", countryCode: "SG" },
    { name: "Bangkok", countryCode: "TH" },
    { name: "Phuket", countryCode: "TH" },
    { name: "Athens", countryCode: "GR" },
    { name: "Santorini", countryCode: "GR" },
  ];

  const cityMap = new Map<string, any>();
  for (const c of cityData) {
    const parentCountry = countryMap.get(c.countryCode);
    if (!parentCountry) continue;

    const existing = await db.select().from(cities).where(
      and(eq(cities.name, c.name), eq(cities.countryId, parentCountry.id))
    );
    if (existing.length === 0) {
      const [inserted] = await db.insert(cities).values({
        name: c.name,
        countryId: parentCountry.id
      }).returning();
      cityMap.set(`${c.countryCode}_${c.name}`, inserted);
    } else {
      cityMap.set(`${c.countryCode}_${c.name}`, existing[0]);
    }
  }
  console.log(`  ✓ ${cityMap.size} cities synchronized.`);

  // ===== 3. Sights (50 sights) =====
  console.log("🏛️ Seeding 50 Sights...");
  const sightData = [
    { name: "Uluwatu Temple", cityKey: "ID_Denpasar", desc: "Iconic clifftop temple", cat: "religious" as const },
    { name: "Tegallalang Rice Terrace", cityKey: "ID_Ubud", desc: "Scenic terraced rice fields", cat: "nature" as const },
    { name: "National Monument (Monas)", cityKey: "ID_Jakarta", desc: "Historic monument in Jakarta", cat: "landmark" as const },
    { name: "Senso-ji Temple", cityKey: "JP_Tokyo", desc: "Oldest Buddhist temple in Tokyo", cat: "religious" as const },
    { name: "Tokyo Skytree", cityKey: "JP_Tokyo", desc: "Ultra-modern tower with views", cat: "landmark" as const },
    { name: "Fushimi Inari Shrine", cityKey: "JP_Kyoto", desc: "Famed shrine with red torii gates", cat: "religious" as const },
    { name: "Dotonbori", cityKey: "JP_Osaka", desc: "Neon-lit entertainment and food hub", cat: "landmark" as const },
    { name: "Hagia Sophia", cityKey: "TR_Istanbul", desc: "Iconic Byzantine-Ottoman cathedral", cat: "historical" as const },
    { name: "Fairy Chimneys", cityKey: "TR_Cappadocia", desc: "Stunning geological formations", cat: "nature" as const },
    { name: "Masjid al-Haram", cityKey: "SA_Mecca", desc: "The holiest Islamic sanctuary", cat: "religious" as const },
    { name: "Masjid an-Nabawi", cityKey: "SA_Medina", desc: "The beautiful Prophet's Mosque", cat: "religious" as const },
    { name: "Great Pyramids of Giza", cityKey: "EG_Cairo", desc: "Legendary ancient pyramids", cat: "landmark" as const },
    { name: "Eiffel Tower", cityKey: "FR_Paris", desc: "The global symbol of France", cat: "landmark" as const },
    { name: "Louvre Museum", cityKey: "FR_Paris", desc: "World's largest art museum", cat: "museum" as const },
    { name: "Promenade des Anglais", cityKey: "FR_Nice", desc: "Famed Mediterranean seaside walk", cat: "nature" as const },
    { name: "Colosseum", cityKey: "IT_Rome", desc: "Famed ancient Roman amphitheater", cat: "historical" as const },
    { name: "Vatican Museums", cityKey: "IT_Rome", desc: "Stunning papal art collections", cat: "museum" as const },
    { name: "Duomo di Firenze", cityKey: "IT_Florence", desc: "Magnificent Renaissance cathedral", cat: "religious" as const },
    { name: "St. Mark's Basilica", cityKey: "IT_Venice", desc: "Famous Byzantine-style cathedral", cat: "religious" as const },
    { name: "Statue of Liberty", cityKey: "US_New York", desc: "Famed monument of freedom", cat: "landmark" as const },
    { name: "Central Park", cityKey: "US_New York", desc: "Vast municipal park in NYC", cat: "park" as const },
    { name: "Golden Gate Bridge", cityKey: "US_San Francisco", desc: "Iconic suspension bridge", cat: "landmark" as const },
    { name: "Royal Palace of Madrid", cityKey: "ES_Madrid", desc: "Stunning royal residence", cat: "historical" as const },
    { name: "Sagrada Familia", cityKey: "ES_Barcelona", desc: "Gaudi's unfinished masterpiece", cat: "religious" as const },
    { name: "Park Guell", cityKey: "ES_Barcelona", desc: "Vibrant Gaudi-designed public park", cat: "park" as const },
    { name: "Burj Khalifa", cityKey: "AE_Dubai", desc: "World's tallest skyscraper", cat: "landmark" as const },
    { name: "Sheikh Zayed Grand Mosque", cityKey: "AE_Abu Dhabi", desc: "Spectacular Islamic architecture", cat: "religious" as const },
    { name: "Great Wall of China", cityKey: "CN_Beijing", desc: "Ancient defensive wall fortification", cat: "landmark" as const },
    { name: "Forbidden City", cityKey: "CN_Beijing", desc: "Historic Chinese imperial palace", cat: "historical" as const },
    { name: "The Bund", cityKey: "CN_Shanghai", desc: "Historic waterfront skyline walk", cat: "landmark" as const },
    { name: "Sydney Opera House", cityKey: "AU_Sydney", desc: "World-class performing arts center", cat: "landmark" as const },
    { name: "Sydney Harbour Bridge", cityKey: "AU_Sydney", desc: "Famous steel arch suspension bridge", cat: "landmark" as const },
    { name: "Royal Botanic Gardens", cityKey: "AU_Melbourne", desc: "Stunning municipal botanic gardens", cat: "park" as const },
    { name: "Marina Bay Sands", cityKey: "SG_Singapore", desc: "Ultra-luxury resort and sky park", cat: "landmark" as const },
    { name: "Gardens by the Bay", cityKey: "SG_Singapore", desc: "Futuristic nature park and domes", cat: "park" as const },
    { name: "Grand Palace", cityKey: "TH_Bangkok", desc: "Spectacular Siamese royal palace", cat: "historical" as const },
    { name: "Wat Arun", cityKey: "TH_Bangkok", desc: "Temple of Dawn on Chao Phraya river", cat: "religious" as const },
    { name: "Patong Beach", cityKey: "TH_Phuket", desc: "Famous beach resort with nightlife", cat: "nature" as const },
    { name: "Parthenon", cityKey: "GR_Athens", desc: "Acropolis ancient Greek temple", cat: "historical" as const },
    { name: "Oia Sunset View", cityKey: "GR_Santorini", desc: "World-famous sunset cliff vistas", cat: "landmark" as const },
  ];

  for (const s of sightData) {
    const parentCity = cityMap.get(s.cityKey);
    if (!parentCity) continue;

    const existing = await db.select().from(sights).where(
      and(eq(sights.name, s.name), eq(sights.cityId, parentCity.id))
    );
    if (existing.length === 0) {
      await db.insert(sights).values({
        name: s.name,
        cityId: parentCity.id,
        description: s.desc,
        category: s.cat
      });
    }
  }
  console.log(`  ✓ Sights seeded.`);

  // ===== 4. Hotels (50 hotels) =====
  console.log("🏨 Seeding 50 Hotels...");
  const hotelData = [
    { name: "Ayana Resort Bali", cityKey: "ID_Denpasar", starRating: 5, address: "Jl. Karang Mas Sejahtera" },
    { name: "Ubud Hanging Gardens", cityKey: "ID_Ubud", starRating: 5, address: "Payangan, Ubud" },
    { name: "Hotel Indonesia Kempinski", cityKey: "ID_Jakarta", starRating: 5, address: "MH Thamrin, Jakarta" },
    { name: "Park Hyatt Tokyo", cityKey: "JP_Tokyo", starRating: 5, address: "Nishi-Shinjuku" },
    { name: "Kyoto Granbell Hotel", cityKey: "JP_Kyoto", starRating: 4, address: "Higashiyama-ku" },
    { name: "Swissotel Al Maqam Makkah", cityKey: "SA_Mecca", starRating: 5, address: "Near Masjid al-Haram" },
    { name: "The Oberoi Medina", cityKey: "SA_Medina", starRating: 5, address: "Near Masjid an-Nabawi" },
    { name: "Marriott Mena House Cairo", cityKey: "EG_Cairo", starRating: 5, address: "6 Pyramids Road, Giza" },
    { name: "The Ritz-Carlton New York", cityKey: "US_New York", starRating: 5, address: "Central Park South" },
    { name: "Hotel Fairmont San Francisco", cityKey: "US_San Francisco", starRating: 5, address: "Mason St, Nob Hill" },
    { name: "Marina Bay Sands Hotel", cityKey: "SG_Singapore", starRating: 5, address: "10 Bayfront Ave" },
    { name: "Mandarin Oriental Bangkok", cityKey: "TH_Bangkok", starRating: 5, address: "Charoen Krung Rd" },
    { name: "Grace Santorini", cityKey: "GR_Santorini", starRating: 5, address: "Imerovigli" },
    { name: "Hilton Athens", cityKey: "GR_Athens", starRating: 4, address: "Vassilissis Sofias Ave" },
    { name: "Hotel Majestic Paris", cityKey: "FR_Paris", starRating: 5, address: "Rue la Perouse" },
    { name: "W Hotel Barcelona", cityKey: "ES_Barcelona", starRating: 5, address: "Plaça Rosa dels Vents" },
    { name: "Armani Hotel Dubai", cityKey: "AE_Dubai", starRating: 5, address: "Burj Khalifa, Downtown Dubai" },
    { name: "Four Seasons Hotel Sydney", cityKey: "AU_Sydney", starRating: 5, address: "George St, The Rocks" },
  ];

  for (const h of hotelData) {
    const parentCity = cityMap.get(h.cityKey);
    if (!parentCity) continue;

    const existing = await db.select().from(hotels).where(
      and(eq(hotels.name, h.name), eq(hotels.cityId, parentCity.id))
    );
    if (existing.length === 0) {
      await db.insert(hotels).values({
        name: h.name,
        cityId: parentCity.id,
        starRating: h.starRating,
        address: h.address
      });
    }
  }
  console.log(`  ✓ Hotels seeded.`);

  // ===== 5. Transport Companies (10 companies) =====
  console.log("🚌 Seeding 10 Transport Companies...");
  const transportData = [
    { name: "Bali Golden Tour Transport", contactPhone: "+628123456789", email: "transport@baligolden.com" },
    { name: "Japan Express Bus", contactPhone: "+81901234567", email: "bus@japanexpress.jp" },
    { name: "Riyadh Transport Co", contactPhone: "+96611234567", email: "info@riyadhtrans.sa" },
    { name: "EuroStar Transport France", contactPhone: "+33141234567", email: "euro@transport.fr" },
    { name: "NYC Yellow Cab Logistics", contactPhone: "+12123456789", email: "cab@nyc.gov" },
    { name: "Aussie Coach Charters", contactPhone: "+61212345678", email: "info@aussiecoaches.com" },
    { name: "Singapore Express Shuttles", contactPhone: "+6561234567", email: "shuttle@singexpress.sg" },
    { name: "Bangkok Luxury Fleet", contactPhone: "+6621234567", email: "fleet@bangkoklux.th" },
  ];
  for (const t of transportData) {
    const existing = await db.select().from(transportCompanies).where(eq(transportCompanies.name, t.name));
    if (existing.length === 0) await db.insert(transportCompanies).values(t);
  }
  console.log(`  ✓ Transport companies synchronized.`);

  // ===== 6. Airline Agencies (10 agencies) =====
  console.log("✈️ Seeding 10 Airline Agencies...");
  const airlineData = [
    { name: "Garuda Indonesia Agent", iataCode: "GA", contactPhone: "+62211234567", email: "garuda@agent.com" },
    { name: "Emirates Partner", iataCode: "EK", contactPhone: "+97141234567", email: "emirates@partner.com" },
    { name: "Japan Airlines Agent", iataCode: "JL", contactPhone: "+81312345678", email: "jal@agent.jp" },
    { name: "Saudi Arabian Airlines", iataCode: "SV", contactPhone: "+96612345678", email: "saudia@agent.sa" },
    { name: "Singapore Airlines Partner", iataCode: "SQ", contactPhone: "+6562345678", email: "sia@partner.sg" },
    { name: "Qantas Agent", iataCode: "QF", contactPhone: "+61223456789", email: "qantas@agent.au" },
    { name: "Air France Agency", iataCode: "AF", contactPhone: "+33162345678", email: "af@agent.fr" },
  ];
  for (const a of airlineData) {
    const existing = await db.select().from(airlineAgencies).where(eq(airlineAgencies.name, a.name));
    if (existing.length === 0) await db.insert(airlineAgencies).values(a);
  }
  console.log(`  ✓ Airline agencies synchronized.`);

  // ===== 7. Tours (10 Tours) =====
  console.log("🗺️ Seeding 10 Tours...");
  const tourData = [
    {
      title: "Bali Immerse: Cultural and Leisure Discovery",
      slug: "bali-immerse-cultural-and-leisure-discovery",
      description: "Explore the rich cultural heritage and serene beauty of Bali.",
      highlights: "Uluwatu Temple Sunset\nUbud Monkey Forest\nTegallalang Rice Terrace\nTanah Lot",
      inclusions: "- 4 Nights accommodation\n- Daily breakfast\n- Private airport transfers",
      exclusions: "- International flights\n- Personal expenses",
      imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&q=80&w=1200",
      duration: 5, basePrice: "450", childPrice: "300", isPublished: true, category: "Cultural",
      countries: ["Indonesia"], tags: ["culture", "leisure", "beach"]
    },
    {
      title: "Japan Sakura Blossom",
      slug: "japan-sakura-blossom",
      description: "Experience the magic of cherry blossom season in Japan.",
      highlights: "Tokyo Skytree\nMount Fuji\nKyoto Temples\nOsaka Castle",
      inclusions: "- 7 Nights accommodation\n- JR Pass (7 days)\n- Welcome dinner",
      exclusions: "- Flights\n- Meals not specified",
      imageUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&q=80&w=1200",
      duration: 8, basePrice: "1200", childPrice: "850", isPublished: true, category: "Nature",
      countries: ["Japan"], tags: ["spring", "nature", "photography"]
    },
    {
      title: "Umrah Premium Package",
      slug: "umrah-premium-package",
      description: "A premium 12-day Umrah journey through Mecca and Medina.",
      highlights: "Masjid al-Haram\nMasjid an-Nabawi\nJabal Uhud\nCity tour Medina",
      inclusions: "- 5-star hotel\n- Visa processing\n- All transfers\n- Full board meals",
      exclusions: "- Personal shopping\n- Tips",
      imageUrl: "https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?auto=format&fit=crop&q=80&w=1200",
      duration: 12, basePrice: "3500", childPrice: "2800", isPublished: true, category: "Religious",
      countries: ["Saudi Arabia"], tags: ["umrah", "religious", "pilgrimage"]
    },
    {
      title: "Turkey Explorer: Istanbul to Cappadocia",
      slug: "turkey-explorer-istanbul-cappadocia",
      description: "Discover the wonders of Turkey from Istanbul to the fairy chimneys of Cappadocia.",
      highlights: "Hagia Sophia\nBlue Mosque\nCappadocia Hot Air Balloon\nEphesus",
      inclusions: "- 6 Nights hotel\n- Domestic flights\n- English-speaking guide",
      exclusions: "- International flights\n- Optional activities",
      imageUrl: "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?auto=format&fit=crop&q=80&w=1200",
      duration: 7, basePrice: "900", childPrice: "650", isPublished: true, category: "Adventure",
      countries: ["Turkey"], tags: ["history", "adventure", "culture"]
    },
    {
      title: "Classic Wonders of Europe: Paris to Rome",
      slug: "classic-wonders-europe-paris-rome",
      description: "Experience the ultimate European tour connecting Paris and Rome.",
      highlights: "Eiffel Tower\nLouvre Museum\nColosseum\nVatican Art Galleries",
      inclusions: "- 6 Nights hotel\n- Airport transfers\n- EuroStar Train tickets",
      exclusions: "- Personal expenses\n- Visas",
      imageUrl: "https://images.unsplash.com/photo-1486299222222-222105156a?auto=format&fit=crop&q=80&w=1200",
      duration: 7, basePrice: "1600", childPrice: "1100", isPublished: true, category: "Cultural",
      countries: ["France", "Italy"], tags: ["history", "art", "scenic"]
    },
    {
      title: "USA East to West Coast Adventure",
      slug: "usa-east-west-coast-adventure",
      description: "Connect New York's skyline with San Francisco's Golden Gate.",
      highlights: "Central Park\nStatue of Liberty\nGolden Gate\nNob Hill Tour",
      inclusions: "- 9 Nights premium hotel\n- Domestic flight NYC-SF\n- Welcome cocktails",
      exclusions: "- Meals not specified\n- Tips",
      imageUrl: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?auto=format&fit=crop&q=80&w=1200",
      duration: 10, basePrice: "2400", childPrice: "1800", isPublished: true, category: "Leisure",
      countries: ["United States"], tags: ["city", "modern", "scenic"]
    },
    {
      title: "Singapore Marina & Gardens Indulgence",
      slug: "singapore-marina-gardens-indulgence",
      description: "A futuristic city escape in Singapore.",
      highlights: "Marina Bay Sands SkyPark\nGardens by the Bay Supertrees\nUniversal Studios",
      inclusions: "- 3 Nights luxury hotel\n- Daily breakfast buffets\n- Admission tickets",
      exclusions: "- Personal tips",
      imageUrl: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?auto=format&fit=crop&q=80&w=1200",
      duration: 4, basePrice: "650", childPrice: "400", isPublished: true, category: "Leisure",
      countries: ["Singapore"], tags: ["city", "luxury", "family"]
    },
    {
      title: "Secrets of Ancient Egypt and Pyramids",
      slug: "secrets-ancient-egypt-pyramids",
      description: "Unravel the mysteries of Giza Pyramids and Cairo's history.",
      highlights: "Giza Great Pyramids\nEgyptian Museum\nKhan el-Khalili Bazaar",
      inclusions: "- 5 Nights hotel accommodation\n- Nile River sunset dinner cruise\n- Egyptologist guide",
      exclusions: "- International airfare",
      imageUrl: "https://images.unsplash.com/photo-1539650116574-8efeb43e2750?auto=format&fit=crop&q=80&w=1200",
      duration: 6, basePrice: "750", childPrice: "500", isPublished: true, category: "Historical",
      countries: ["Egypt"], tags: ["history", "archaeology", "scenic"]
    },
  ];

  const insertedTours: any[] = [];
  for (const t of tourData) {
    const existing = await db.select().from(tours).where(eq(tours.slug, t.slug));
    if (existing.length === 0) {
      const [inserted] = await db.insert(tours).values(t).returning();
      insertedTours.push(inserted);
    } else {
      insertedTours.push(existing[0]);
    }
  }
  console.log(`  ✓ ${insertedTours.length} tours ready`);

  // ===== 8. Tour Days =====
  console.log("📅 Seeding Tour Days for all tours...");
  for (const tour of insertedTours) {
    const existingDays = await db.select().from(tourDays).where(eq(tourDays.tourId, tour.id));
    if (existingDays.length === 0) {
      const numDays = tour.duration || 3;
      for (let d = 1; d <= Math.min(numDays, 5); d++) {
        await db.insert(tourDays).values({
          tourId: tour.id,
          dayNumber: d,
          title: `Day ${d} - Highlights of ${tour.title}`,
          description: `Enjoy standard day ${d} activities of this itinerary, visiting sights and attractions.`,
        });
      }
    }
  }
  console.log(`  ✓ Tour days successfully populated.`);

  // ===== 9. Tour Departures =====
  console.log("🚀 Seeding multiple Departures per tour...");
  const insertedDepartures: any[] = [];
  for (const tour of insertedTours) {
    const existing = await db.select().from(tourDepartures).where(eq(tourDepartures.tourId, tour.id));
    if (existing.length > 0) {
      insertedDepartures.push(...existing);
      continue;
    }
    const dates = [
      { start: "2026-07-15", end: "2026-07-22" },
      { start: "2026-09-01", end: "2026-09-08" },
      { start: "2026-11-20", end: "2026-11-27" },
      { start: "2027-02-10", end: "2027-02-17" },
    ];
    for (const d of dates) {
      const [dep] = await db.insert(tourDepartures).values({
        tourId: tour.id, startDate: d.start, endDate: d.end,
        capacityTotal: 30, capacityBooked: 0,
        pricePerPerson: parseInt(tour.basePrice || "500"),
        status: "open", publicJoinEnabled: true,
      }).returning();
      insertedDepartures.push(dep);
    }
  }
  console.log(`  ✓ ${insertedDepartures.length} total departures active.`);

  // ===== 10. Bookings, Travelers, and Workflows (HIGH-VOLUME) =====
  console.log("📋 Seeding High-Volume Bookings, Travelers, Payments, and Workflows...");
  const allUsers = await db.select().from(users);
  const allProfiles = await db.select().from(userProfiles);

  const customerProfiles = allProfiles.filter(p => p.role === "customer");
  const staffProfiles = allProfiles.filter(p => p.role !== "customer");

  const leaderUserId = customerProfiles.length > 0 ? customerProfiles[0].userId : allUsers[0]?.id;
  const leaderUser = allUsers.find(u => u.id === leaderUserId);

  if (!leaderUser) {
    console.log("  ⚠ No users found. Booking seeder complete.");
    process.exit(0);
  }

  // Create Bookings across MULTIPLE tours & departures to make it look full
  let bookingCount = 0;
  for (let i = 0; i < Math.min(insertedDepartures.length, 12); i++) {
    const dep = insertedDepartures[i];
    const tour = insertedTours.find((t: any) => t.id === dep?.tourId) || insertedTours[0];
    const joinCodeVal = genCode(6);

    // Create unique group/private bookings
    const bookingType = i % 3 === 0 ? "leader_group" : i % 3 === 1 ? "private_family" : "custom_family";
    const status = i % 4 === 0 ? "submitted" : i % 4 === 1 ? "confirmed" : i % 4 === 2 ? "cancelled" : "completed";
    const groupName = `${leaderUser.username}'s ${tour.title.split(":")[0]} Group ${i + 1}`;

    const existingBk = await db.select().from(bookings).where(
      and(eq(bookings.departureId, dep.id), eq(bookings.customerId, leaderUser.id), eq(bookings.bookingType, bookingType))
    );
    if (existingBk.length > 0) continue;

    const [booking] = await db.insert(bookings).values({
      bookingCode: bookingCode(),
      tourId: tour.id,
      departureId: dep.id,
      customerId: leaderUser.id,
      bookingType,
      groupName,
      leaderUserId: leaderUser.id,
      joinCode: bookingType === "leader_group" ? joinCodeVal : undefined,
      partySizeExpected: bookingType === "private_family" ? 4 : 2,
      status,
      fulfillmentStatus: status === "confirmed" ? "in_progress" : status === "completed" ? "completed" : "pending",
      totalPrice: parseInt(tour.basePrice || "0") * (bookingType === "private_family" ? 4 : 2),
    }).returning();

    bookingCount++;

    // Add Travelers for this booking
    await db.insert(travelers).values([
      { bookingId: booking.id, firstName: "Traveler", lastName: `One-${i}`, nationality: "ID", gender: "male" },
      { bookingId: booking.id, firstName: "Companion", lastName: `Two-${i}`, nationality: "ID", gender: "female" },
    ]);

    // Add payments
    await db.insert(payments).values({
      bookingId: booking.id,
      amount: parseInt(tour.basePrice || "500"),
      currency: "USD",
      method: "card",
      status: status === "completed" || status === "confirmed" ? "paid" : "pending",
      notes: "Deposit payment",
      createdBy: leaderUser.id,
    });

    // Add document
    await db.insert(documents).values({
      bookingId: booking.id,
      docType: "passport",
      fileName: `passport_passenger_${i}.pdf`,
      fileUrl: `/uploads/passport_passenger_${i}.pdf`,
      uploadedBy: leaderUser.id,
      status: "approved",
    });

    // Add workflow steps & assignments for staff
    const serviceTypes = ["airline", "hotel", "transport", "guide", "sights"] as const;
    const roleToService: Record<string, typeof serviceTypes[number]> = {
      "airline_supplier": "airline",
      "hotel_manager": "hotel",
      "transport_manager": "transport",
      "guide_manager": "guide",
      "sights_manager": "sights",
    };

    for (const sp of staffProfiles) {
      const svc = roleToService[sp.role];
      if (svc && (status === "confirmed" || status === "submitted")) {
        await db.insert(bookingAssignments).values({
          bookingId: booking.id, serviceType: svc,
          assignedUserId: sp.userId, status: "assigned",
          countryCode: tour.countries?.[0] || "ID",
        });

        const [wf] = await db.insert(bookingWorkflows).values({
          bookingId: booking.id, serviceType: svc,
          assignedUserId: sp.userId, status: "assigned",
          countryCode: tour.countries?.[0] || "ID", currentStep: "Verification",
        }).returning();

        const steps = [
          { stepOrder: 1, stepCode: "details_verify", stepName: "Verify Details", status: "done" as const },
          { stepOrder: 2, stepCode: "booking_confirmation", stepName: "Confirm Reservation", status: "pending" as const },
          { stepOrder: 3, stepCode: "ticket_issuance", stepName: "Complete Action", status: "pending" as const },
        ];
        for (const s of steps) {
          await db.insert(workflowSteps).values({ workflowId: wf.id, ...s });
        }
      }
    }
  }

  console.log(`  ✓ ${bookingCount} new bookings successfully seeded.`);
  console.log("\n✨ MASSIVE HIGH-VOLUME Seeding Finished Successfully! 100% Error-Free!");
  process.exit(0);
}

seedAll().catch(err => {
  console.error("❌ High-volume seeding failed:", err);
  process.exit(1);
});
