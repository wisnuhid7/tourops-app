import { db } from "../server/db";
import { tours } from "../shared/schema";

async function main() {
  const allTours = await db.select().from(tours);
  for (const t of allTours) {
    console.log(`Tour: "${t.title}"`);
    console.log(`  id: ${t.id}`);
    console.log(`  category: ${typeof t.category} = ${JSON.stringify(t.category)}`);
    console.log(`  translations: ${typeof t.translations} = ${JSON.stringify(t.translations)}`);
    console.log(`  duration: ${t.duration}`);
    console.log("-".repeat(40));
  }
}

main().catch(console.error);
