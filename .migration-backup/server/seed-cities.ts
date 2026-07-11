import { db } from "./db";
import { countries, cities, masterRecords } from "../shared/schema";
import { eq, and, sql } from "drizzle-orm";

const CITIES_TO_SEED = [
  // Egypt
  { name: "Cairo", countryCode: "EG" },
  { name: "Alexandria", countryCode: "EG" },
  { name: "Luxor", countryCode: "EG" },
  { name: "Aswan", countryCode: "EG" },
  { name: "Hurghada", countryCode: "EG" },
  { name: "Sharm El Sheikh", countryCode: "EG" },
  { name: "Giza", countryCode: "EG" },
  { name: "Port Said", countryCode: "EG" },

  // Indonesia
  { name: "Jakarta", countryCode: "ID" },
  { name: "Denpasar", countryCode: "ID" },
  { name: "Ubud", countryCode: "ID" },
  { name: "Surabaya", countryCode: "ID" },
  { name: "Bandung", countryCode: "ID" },
  { name: "Yogyakarta", countryCode: "ID" },
  { name: "Medan", countryCode: "ID" },
  { name: "Makassar", countryCode: "ID" },
  { name: "Semarang", countryCode: "ID" },
  { name: "Malang", countryCode: "ID" },

  // Japan
  { name: "Tokyo", countryCode: "JP" },
  { name: "Kyoto", countryCode: "JP" },
  { name: "Osaka", countryCode: "JP" },
  { name: "Yokohama", countryCode: "JP" },
  { name: "Nagoya", countryCode: "JP" },
  { name: "Sapporo", countryCode: "JP" },
  { name: "Fukuoka", countryCode: "JP" },
  { name: "Hiroshima", countryCode: "JP" },
  { name: "Nara", countryCode: "JP" },

  // Turkey
  { name: "Istanbul", countryCode: "TR" },
  { name: "Cappadocia", countryCode: "TR" },
  { name: "Ankara", countryCode: "TR" },
  { name: "Antalya", countryCode: "TR" },
  { name: "Izmir", countryCode: "TR" },
  { name: "Bursa", countryCode: "TR" },

  // Saudi Arabia
  { name: "Mecca", countryCode: "SA" },
  { name: "Medina", countryCode: "SA" },
  { name: "Riyadh", countryCode: "SA" },
  { name: "Jeddah", countryCode: "SA" },
  { name: "Dammam", countryCode: "SA" },
];

async function seedCities() {
  console.log("🌱 Starting cities and master records seeding...");

  // Load all countries to map countryCode to countryId
  const allCountries = await db.select().from(countries);
  const countryMap = new Map<string, string>(); // code -> id
  for (const country of allCountries) {
    countryMap.set(country.code.toUpperCase(), country.id);
  }

  let citiesSeeded = 0;
  let masterRecordsSeeded = 0;

  for (const entry of CITIES_TO_SEED) {
    const code = entry.countryCode.toUpperCase();
    const countryId = countryMap.get(code);

    if (!countryId) {
      console.warn(`⚠️ Country with code ${code} not found in database. Skipping ${entry.name}.`);
      continue;
    }

    // 1. Seed into cities table
    const nameTrimmed = entry.name.trim();
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
      citiesSeeded++;
      console.log(`✓ Seeded City: ${nameTrimmed} (${code})`);
    } else {
      console.log(`• City already exists: ${nameTrimmed} (${code})`);
    }

    // 2. Seed into master_records table
    const [existingMasterRecord] = await db.select()
      .from(masterRecords)
      .where(and(
        eq(masterRecords.recordType, "city_manager"),
        eq(sql`lower(${masterRecords.title})`, nameTrimmed.toLowerCase())
      ))
      .limit(1);

    if (!existingMasterRecord) {
      await db.insert(masterRecords).values({
        recordType: "city_manager",
        title: nameTrimmed,
        status: "published"
      });
      masterRecordsSeeded++;
      console.log(`✓ Seeded Master Record for City: ${nameTrimmed}`);
    } else {
      console.log(`• Master Record already exists: ${nameTrimmed}`);
    }
  }

  console.log(`\n🎉 Seeding finished!`);
  console.log(`- Seeded ${citiesSeeded} new cities into 'cities' table.`);
  console.log(`- Seeded ${masterRecordsSeeded} new records into 'master_records' table.`);
  process.exit(0);
}

seedCities().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
