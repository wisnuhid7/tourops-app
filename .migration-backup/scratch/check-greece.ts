import { db } from "../server/db.js";
import { countries } from "../shared/schema.js";
import { eq, or, sql } from "drizzle-orm";

async function main() {
  const [gr] = await db.select().from(countries).where(
    or(
      eq(countries.code, "GR"),
      eq(sql`lower(${countries.name})`, "greece")
    )
  );
  console.log("GREECE COUNTRY RECORD:", gr ? JSON.stringify(gr) : "NOT FOUND");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
