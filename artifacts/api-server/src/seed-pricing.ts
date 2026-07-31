/**
 * Idempotent seed for the pricing engine: default group size bands
 * (with assistance rules) and a global default pricing rule
 * (20% margin, 1 free passenger per 3 paying).
 *
 * Run: pnpm --filter @workspace/api-server exec tsx src/seed-pricing.ts
 */
import { db, groupSizeBands, pricingRules } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";
import { DEFAULT_GROUP_BANDS, assistanceTypeForPax } from "./services/pricing-engine";

export async function seedPricing() {
  for (let i = 0; i < DEFAULT_GROUP_BANDS.length; i++) {
    const band = DEFAULT_GROUP_BANDS[i];
    const existing = await db.select().from(groupSizeBands).where(eq(groupSizeBands.label, band.label));
    if (existing.length === 0) {
      await db.insert(groupSizeBands).values({
        label: band.label,
        minPax: band.minPax,
        maxPax: band.maxPax,
        assistanceType: assistanceTypeForPax(band.minPax),
        sortOrder: i,
      });
      console.log(`Created group size band ${band.label}`);
    }
  }

  const globalRule = await db.select().from(pricingRules)
    .where(and(isNull(pricingRules.tourId), eq(pricingRules.isActive, true)));
  if (globalRule.length === 0) {
    await db.insert(pricingRules).values({
      name: "Global default (20% margin, 1 free per 3 paying)",
      tourId: null,
      marginType: "percentage",
      marginValue: "20",
      freePassengerPaying: 3,
      freePassengerFree: 1,
      currency: "USD",
    });
    console.log("Created global default pricing rule");
  }
}

// Allow direct execution
if (process.argv[1] && process.argv[1].endsWith("seed-pricing.ts")) {
  seedPricing().then(() => { console.log("Pricing seed complete"); process.exit(0); })
    .catch((e) => { console.error(e); process.exit(1); });
}
