/**
 * Idempotent seed: set real supplier costs on the Israel–Jordan tour.
 *
 * Production tour id: bf33bba3-8021-4cdd-9584-1b5df0ef193d
 * Title: "Footsteps of Faith and Ancient Wonders: Israel and Jordan – 7 Days."
 *
 * What this script does (all operations reconcile by natural key):
 *   1. Ensures a tour-specific pricing rule exists (30 % margin, 1 free per 10,
 *      round-up $10). Any existing rule for this tour is left unchanged.
 *   2. Upserts the three target departures individually by start-date. Missing
 *      ones are created; existing ones are patched to the target price.
 *   3. Sets isPriceConfirmed = true on the tour.
 *   4. Ensures three sight catalog entries exist (Petra, Dead Sea, Sea of
 *      Galilee) in the relevant cities, creating them when absent.
 *   5. Ensures every required tour-day item (transport, guide, hotel, sight)
 *      exists on each day, skipping only if an item of the same type and title
 *      already exists.
 *
 * Catalog costs applied:
 *   Hotels (catalog room rates, not item cost):
 *     Rede Andrade SLZ Hotel  double $400/room → $200 pp/night
 *     Jerusalem Hotel          double $250/room → $125 pp/night
 *   Guides (catalog per-day rate):
 *     MOlina Diaz  $500/day (days 1–4, 6)
 *     Pedro Diaz   $400/day (day 5)
 *   Transport (group cost per day, ÷ pax in engine):
 *     Day 1 $250 | Day 2 $200 | Day 3 $250 | Day 4 $200
 *     Day 5 $300 | Day 6 $200 | Day 7 $250 → total $1,650
 *   Sightseeing (per-person ticket from catalog sight):
 *     Sea of Galilee Boat Ride $15 pp | Petra Entrance $70 pp
 *     Dead Sea Beach Access    $20 pp → total $105 pp
 *
 * Reference price derivation (16 pax, double occupancy):
 *   Guide share   $2,900 / 16 = $181.25
 *   Transport     $1,650 / 16 = $103.13
 *   Sightseeing               = $105.00
 *   Hotels (both, sequential) = $975.00   ($600 + $375)
 *   Base cost                 = $1,364.38
 *   + 30 % margin             = $1,773.69
 *   × 11/10 free-pax factor   = $1,951.06
 *   Rounded up to $10         = $1,960
 *   Departure "from" prices buffer for smaller groups (10–20 pax):
 *     Autumn peak $1,999 | Winter shoulder $1,899 | Spring peak $2,099
 */
import { db } from "@workspace/db";
import { tours, tourDays, tourDayItems, tourDepartures, pricingRules, sights, cities } from "@workspace/db";
import { eq, and } from "drizzle-orm";

const TOUR_ID  = "bf33bba3-8021-4cdd-9584-1b5df0ef193d";
const GUIDE_MOLINA = "b9c10e80-50ca-4117-9e4b-1498338094c5";
const GUIDE_PEDRO  = "7a1ac5a9-b7e0-4274-bb74-c5e929aad67d";
const HOTEL_REDE   = "67988426-8081-474d-9f37-d3d070301b32";
const HOTEL_JERU   = "f6833232-fe7d-4dcc-9513-945adea2a5b2";

async function upsertSight(name: string, cityName: string, individualCost: string, category: string) {
  const [city] = await db.select().from(cities).where(eq(cities.name, cityName));
  if (!city) throw new Error(`City "${cityName}" not found in this database.`);
  const [existing] = await db.select().from(sights).where(eq(sights.name, name));
  if (existing) { console.log(`  ↺ Sight "${name}" already exists (${existing.id})`); return existing; }
  const [s] = await db.insert(sights).values({
    name, cityId: city.id, status: "published" as any,
    ticketRequired: true, isFree: false,
    individualTicketCost: individualCost, groupTicketCost: "0", ticketCurrency: "USD",
    category: category as any, isActive: true,
  }).returning();
  console.log(`  ✓ Created sight "${name}" (${s.id})`);
  return s;
}

async function ensureItem(dayId: string, itemType: string, title: string, extra: Record<string, unknown>) {
  const existing = await db.select().from(tourDayItems)
    .where(and(eq(tourDayItems.tourDayId, dayId), eq(tourDayItems.itemType, itemType), eq(tourDayItems.title, title)));
  if (existing.length > 0) { console.log(`    ↺ ${itemType} "${title}" already on day`); return; }
  await db.insert(tourDayItems).values({ tourDayId: dayId, itemType, title, cost: "0", currency: "USD", ...extra });
  console.log(`    ✓ Added ${itemType}: "${title}"`);
}

async function seedIsraelJordanCosts() {
  console.log("🗺️  Seeding Israel–Jordan tour costs…");

  const [tour] = await db.select().from(tours).where(eq(tours.id, TOUR_ID));
  if (!tour) { console.error(`  ✗ Tour ${TOUR_ID} not found; skipping.`); process.exit(1); }
  console.log(`  ✓ Found tour: "${tour.title}"`);

  // ── 1. Pricing rule ─────────────────────────────────────────────────────────
  const existingRules = await db.select().from(pricingRules).where(eq(pricingRules.tourId, TOUR_ID));
  if (existingRules.length === 0) {
    const [rule] = await db.insert(pricingRules).values({
      name: "Israel–Jordan standard margin", tourId: TOUR_ID,
      marginType: "percentage", marginValue: "30",
      freePassengerPaying: 10, freePassengerFree: 1,
      roundingRule: "ten_up", currency: "USD", isActive: true,
    }).returning();
    console.log(`  ✓ Created pricing rule (${rule.id})`);
  } else {
    console.log(`  ↺ Pricing rule already exists (${existingRules[0].id})`);
  }

  // ── 2. Departures (upsert by start-date) ────────────────────────────────────
  const departureDefs = [
    { startDate: "2026-10-05", endDate: "2026-10-11", pricePerPerson: 1999, notes: "Autumn peak" },
    { startDate: "2027-02-08", endDate: "2027-02-14", pricePerPerson: 1899, notes: "Winter shoulder" },
    { startDate: "2027-05-03", endDate: "2027-05-09", pricePerPerson: 2099, notes: "Spring peak" },
  ] as const;

  for (const dep of departureDefs) {
    const [existing] = await db.select().from(tourDepartures)
      .where(and(eq(tourDepartures.tourId, TOUR_ID), eq(tourDepartures.startDate, dep.startDate)));
    if (existing) {
      if (existing.pricePerPerson !== dep.pricePerPerson) {
        await db.update(tourDepartures).set({ pricePerPerson: dep.pricePerPerson })
          .where(eq(tourDepartures.id, existing.id));
        console.log(`  ↺ Updated departure ${dep.startDate} price → $${dep.pricePerPerson}`);
      } else {
        console.log(`  ↺ Departure ${dep.startDate} already correct ($${dep.pricePerPerson})`);
      }
    } else {
      await db.insert(tourDepartures).values({
        tourId: TOUR_ID, startDate: dep.startDate, endDate: dep.endDate,
        capacityTotal: 20, capacityBooked: 0,
        pricePerPerson: dep.pricePerPerson, status: "open",
        publicJoinEnabled: true, notes: dep.notes,
      });
      console.log(`  ✓ Created departure ${dep.startDate} → $${dep.pricePerPerson}`);
    }
  }

  // ── 3. Mark price confirmed ──────────────────────────────────────────────────
  if (!tour.isPriceConfirmed) {
    await db.update(tours).set({ isPriceConfirmed: true }).where(eq(tours.id, TOUR_ID));
    console.log("  ✓ Marked isPriceConfirmed = true");
  } else {
    console.log("  ↺ isPriceConfirmed already true");
  }

  // ── 4. Sight catalog entries ─────────────────────────────────────────────────
  const [sightGalilee, sightPetra, sightDeadSea] = await Promise.all([
    upsertSight("Sea of Galilee Boat Ride", "Tiberias", "15", "nature"),
    upsertSight("Petra Treasury & Siq Entrance", "Petra", "70", "historical"),
    upsertSight("Dead Sea Beach Access", "Amman", "20", "nature"),
  ]);

  // ── 5. Tour day items ────────────────────────────────────────────────────────
  const days = await db.select().from(tourDays)
    .where(eq(tourDays.tourId, TOUR_ID));
  const dayByNum = new Map(days.map(d => [d.dayNumber, d.id]));

  const get = (n: number) => { const id = dayByNum.get(n); if (!id) throw new Error(`Day ${n} not found`); return id; };

  console.log("  Adding day items…");

  // Day 1 – transport (guide+hotel pre-exist)
  await ensureItem(get(1), "transport", "Private coach – Arrival transfer & Galilee circuit", { cost: "250", sortOrder: 2 });

  // Day 2 – full set
  await ensureItem(get(2), "guide",     "Licensed guide: MOlina Diaz",        { guideId: GUIDE_MOLINA, sortOrder: 0 });
  await ensureItem(get(2), "hotel",     "Rede Andrade SLZ Hotel",              { hotelId: HOTEL_REDE, cost: "300", sortOrder: 1 });
  await ensureItem(get(2), "transport", "Private coach – Sea of Galilee loop", { cost: "200", sortOrder: 2 });
  await ensureItem(get(2), "sight",     "Sea of Galilee Boat Ride",            { sightId: sightGalilee.id, sortOrder: 3 });

  // Day 3 – full set
  await ensureItem(get(3), "guide",     "Licensed guide: MOlina Diaz",            { guideId: GUIDE_MOLINA, sortOrder: 0 });
  await ensureItem(get(3), "hotel",     "Jerusalem Hotel",                         { hotelId: HOTEL_JERU, cost: "200", sortOrder: 1 });
  await ensureItem(get(3), "transport", "Private coach – Jerusalem & Bethlehem",   { cost: "250", sortOrder: 2 });

  // Day 4 – full set
  await ensureItem(get(4), "guide",     "Licensed guide: MOlina Diaz",        { guideId: GUIDE_MOLINA, sortOrder: 0 });
  await ensureItem(get(4), "hotel",     "Jerusalem Hotel",                     { hotelId: HOTEL_JERU, cost: "200", sortOrder: 1 });
  await ensureItem(get(4), "transport", "Private coach – Jerusalem Old City",  { cost: "200", sortOrder: 2 });

  // Day 5 – transport (guide+hotel pre-exist)
  await ensureItem(get(5), "transport", "Private coach – Border crossing & Madaba", { cost: "300", sortOrder: 2 });

  // Day 6 – transport + Petra sight (guide+hotel pre-exist)
  await ensureItem(get(6), "transport", "Private coach – Petra day",             { cost: "200", sortOrder: 2 });
  await ensureItem(get(6), "sight",     "Petra Treasury & Siq Entrance",         { sightId: sightPetra.id, sortOrder: 3 });

  // Day 7 – transport + Dead Sea sight
  await ensureItem(get(7), "transport", "Private coach – Dead Sea & airport transfer", { cost: "250", sortOrder: 0 });
  await ensureItem(get(7), "sight",     "Dead Sea Beach Access",                       { sightId: sightDeadSea.id, sortOrder: 1 });

  console.log("✅ Israel–Jordan cost seed complete.");
}

seedIsraelJordanCosts()
  .then(() => process.exit(0))
  .catch(err => { console.error("❌ Seed failed:", err); process.exit(1); });
