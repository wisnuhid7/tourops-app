import { db } from "../server/db";
import { countries, cities, airports, sights, hotels } from "../shared/schema";
import { sql } from "drizzle-orm";

async function main() {
  console.log("Checking data population counts...");
  
  try {
    const countryCountResult = await db.select({ count: sql<number>`count(*)` }).from(countries);
    const cityCountResult = await db.select({ count: sql<number>`count(*)` }).from(cities);
    const airportCountResult = await db.select({ count: sql<number>`count(*)` }).from(airports);
    const sightCountResult = await db.select({ count: sql<number>`count(*)` }).from(sights);
    const hotelCountResult = await db.select({ count: sql<number>`count(*)` }).from(hotels);

    console.log("\n================ DATA POPULATION COUNTS ================");
    console.log(`Countries: ${countryCountResult[0].count}`);
    console.log(`Cities:    ${cityCountResult[0].count}`);
    console.log(`Airports:  ${airportCountResult[0].count}`);
    console.log(`Sights:    ${sightCountResult[0].count}`);
    console.log(`Hotels:    ${hotelCountResult[0].count}`);
    console.log("========================================================\n");

    if (countryCountResult[0].count > 0) {
      const sampleCountries = await db.select({ code: countries.code, name: countries.name }).from(countries).limit(5);
      console.log("Sample Countries:", sampleCountries);
    }
    
    if (cityCountResult[0].count > 0) {
      const sampleCities = await db.select({ name: cities.name, isTourismCity: cities.isTourismCity }).from(cities).limit(5);
      console.log("Sample Cities:", sampleCities);
    }

    if (airportCountResult[0].count > 0) {
      const sampleAirports = await db.select({ code: airports.code, name: airports.name }).from(airports).limit(5);
      console.log("Sample Airports:", sampleAirports);
    }

    if (sightCountResult[0].count > 0) {
      const sampleSights = await db.select({ name: sights.name, category: sights.category, status: sights.status }).from(sights).limit(5);
      console.log("Sample Sights:", sampleSights);
    }

    if (hotelCountResult[0].count > 0) {
      const sampleHotels = await db.select({ name: hotels.name, starRating: hotels.starRating }).from(hotels).limit(5);
      console.log("Sample Hotels:", sampleHotels);
    }

  } catch (error) {
    console.error("Error querying database:", error);
  } finally {
    process.exit(0);
  }
}

main();
