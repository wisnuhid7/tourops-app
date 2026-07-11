import { db } from "../server/db.js";
import { countries } from "../shared/schema.js";

async function main() {
  const allCountries = await db.select().from(countries);
  console.log("ALL COUNTRIES:");
  allCountries.forEach(c => {
    console.log(`- ID: ${c.id}, Name: "${c.name}", Code: "${c.code}"`);
  });
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
