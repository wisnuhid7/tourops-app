import { db } from "../server/db";
import { tours, tourDays } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const [tour] = await db.select().from(tours).where(eq(tours.id, "00451cbd-4964-4d8a-b60d-239d0942935a"));
  console.log("Tour details:", JSON.stringify(tour, null, 2));

  const days = await db.select().from(tourDays).where(eq(tourDays.tourId, "00451cbd-4964-4d8a-b60d-239d0942935a"));
  console.log("Days details:", JSON.stringify(days, null, 2));
}

main().catch(console.error);
