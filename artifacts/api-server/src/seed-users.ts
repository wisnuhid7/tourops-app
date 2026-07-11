import { db } from "@workspace/db";
import { users } from "@workspace/db";
import { userProfiles } from "@workspace/db";
import { transportCompanies } from "@workspace/db";
import { authStorage } from "./replit_integrations/auth/storage";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const roles = [
  "super_admin",
  "customer",
  "airline_supplier",
  "country_manager",
  "city_manager",
  "hotel_manager",
  "transport_manager",
  "guide_manager",
  "sights_manager",
  "content_editor",
  "flight_agent",
  "tour_builder",
  "supplier",
  "travel_agent",
];

async function seedUsers() {
  console.log("🌱 Starting user seeder...");
  const passwordHash = await bcrypt.hash("password123", 10);

  const generatedAccounts = [];

  for (const role of roles) {
    const username = `${role.replace("_", "")}1`;
    const email = `${username}@tourops.com`;
    const id = `user-${role}-1`;

    const user = await authStorage.upsertUser({
      id,
      username,
      passwordHash,
      email,
    });

    const existingProfile = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));
    if (existingProfile.length > 0) {
      await db.update(userProfiles).set({ role: role as any }).where(eq(userProfiles.userId, user.id));
    } else {
      await db.insert(userProfiles).values({ userId: user.id, role: role as any });
    }

    generatedAccounts.push({ role, username, password: "password123" });
    console.log(`Created user for role: ${role} -> ${username}`);
  }

  // transport_manager needs a transportCompanyId to see the transport dashboard's
  // company-scoped tabs (companies/bus types/routes/pricing/bookings). Link it to
  // an existing company deterministically so this works on any freshly seeded DB.
  const transportProfile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, "user-transport_manager-1"));
  if (transportProfile.length > 0 && !transportProfile[0].transportCompanyId) {
    const [company] = await db.select().from(transportCompanies).limit(1);
    if (company) {
      await db
        .update(userProfiles)
        .set({ transportCompanyId: company.id })
        .where(eq(userProfiles.userId, "user-transport_manager-1"));
      console.log(`Linked transportmanager1 -> transport company "${company.name}"`);
    } else {
      console.warn("⚠️  No transport company found to link transportmanager1 to. Run seed-all.ts first.");
    }
  }

  // city_manager needs a countryCode to scope which cities it can manage.
  // Link it to an existing country deterministically so this works on any
  // freshly seeded DB.
  const cityManagerProfile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, "user-city_manager-1"));
  if (cityManagerProfile.length > 0 && !cityManagerProfile[0].countryCode) {
    const { countries } = await import("@workspace/db");
    const [country] = await db.select().from(countries).limit(1);
    if (country) {
      await db
        .update(userProfiles)
        .set({ countryCode: country.code })
        .where(eq(userProfiles.userId, "user-city_manager-1"));
      console.log(`Linked citymanager1 -> country "${country.name}"`);
    } else {
      console.warn("⚠️  No country found to link citymanager1 to. Run seed-all.ts first.");
    }
  }

  console.log("✅ Seeding complete! Here are the accounts:");
  console.table(generatedAccounts);
  process.exit(0);
}

seedUsers().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
