import { db } from "../server/db.js";
import { tours } from "../shared/schema.js";

async function main() {
  const allTours = await db.select().from(tours);
  console.log("ALL TOURS:");
  allTours.forEach(t => {
    console.log(`- ID: ${t.id}, Title: "${t.title}", Duration: ${t.duration}, Category: "${t.category}", Slug: "${t.slug}"`);
  });
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
