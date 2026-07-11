import { db } from "./db";
import { users } from "../shared/models/auth";
import { userProfiles } from "../shared/schema";
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

  console.log("✅ Seeding complete! Here are the accounts:");
  console.table(generatedAccounts);
  process.exit(0);
}

seedUsers().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
