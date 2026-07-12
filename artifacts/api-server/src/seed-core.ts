import { db } from "@workspace/db";
import { userProfiles } from "@workspace/db";
import { transportCompanies } from "@workspace/db";
import { countries } from "@workspace/db";
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

export interface SeededAccount {
  role: string;
  username: string;
  password: string;
}

/**
 * True if any super_admin profile already exists. Used to make the bootstrap
 * seed a one-time operation: once a super_admin exists, reseeding is refused so
 * a leaked SEED_SECRET can't reset privileged credentials to a known value.
 */
export async function superAdminExists(): Promise<boolean> {
  const rows = await db
    .select({ userId: userProfiles.userId })
    .from(userProfiles)
    .where(eq(userProfiles.role, "super_admin" as any))
    .limit(1);
  return rows.length > 0;
}

/**
 * Idempotently create/refresh the standard demo accounts (one per role) with a
 * known password, and link role-scoped profiles (transport_manager -> company,
 * city_manager -> country) when possible. Safe to run on a fresh or existing DB.
 * Returns the list of accounts and their password.
 */
export async function runUserSeed(password = "password123"): Promise<SeededAccount[]> {
  const passwordHash = await bcrypt.hash(password, 10);
  const generatedAccounts: SeededAccount[] = [];

  for (const role of roles) {
    const username = `${role.replace("_", "")}1`;
    const email = `${username}@tourops.com`;
    const id = `user-${role}-1`;

    const user = await authStorage.upsertUser({ id, username, passwordHash, email });

    const existingProfile = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));
    if (existingProfile.length > 0) {
      await db.update(userProfiles).set({ role: role as any }).where(eq(userProfiles.userId, user.id));
    } else {
      await db.insert(userProfiles).values({ userId: user.id, role: role as any });
    }

    generatedAccounts.push({ role, username, password });
    console.log(`Created user for role: ${role} -> ${username}`);
  }

  // transport_manager needs a transportCompanyId to see the transport dashboard's
  // company-scoped tabs. Link it to an existing company deterministically.
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
      console.warn("⚠️  No transport company found to link transportmanager1 to.");
    }
  }

  // city_manager needs a countryCode to scope which cities it can manage.
  const cityManagerProfile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, "user-city_manager-1"));
  if (cityManagerProfile.length > 0 && !cityManagerProfile[0].countryCode) {
    const [country] = await db.select().from(countries).limit(1);
    if (country) {
      await db
        .update(userProfiles)
        .set({ countryCode: country.code })
        .where(eq(userProfiles.userId, "user-city_manager-1"));
      console.log(`Linked citymanager1 -> country "${country.name}"`);
    } else {
      console.warn("⚠️  No country found to link citymanager1 to.");
    }
  }

  return generatedAccounts;
}
