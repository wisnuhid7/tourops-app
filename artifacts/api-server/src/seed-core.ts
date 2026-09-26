import { db } from "@workspace/db";
import { userProfiles } from "@workspace/db";
import { transportCompanies } from "@workspace/db";
import { countries } from "@workspace/db";
import { cities } from "@workspace/db";
import { authStorage } from "./replit_integrations/auth/storage";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

const roles = [
  "super_admin",
  "admin",
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
  "tour_leader",
  "accounting",
  "operations_manager",
  "support_agent",
];

/**
 * One-time, idempotent startup maintenance (data-only, no DDL):
 * 1. Remaps the legacy "travel_agent" role to "tour_leader" (old prod rows).
 * 2. Creates any MISSING demo accounts (one per role). Existing users and
 *    their passwords are never modified — this only fills gaps so a freshly
 *    published environment has a working account for every role.
 */
// Roles that must NEVER be auto-created at startup: creating a privileged
// account with a well-known password would open an admin backdoor. These are
// only created via the explicit secret-guarded bootstrap (/api/auth/seed-demo).
const PRIVILEGED_ROLES = new Set(["super_admin", "admin"]);

export async function runStartupMaintenance(): Promise<void> {
  // Serialize across concurrently booting instances (e.g. autoscale) so two
  // boots can't race on the same select-then-insert checks.
  const { sql } = await import("drizzle-orm");
  const lock = await db.execute(sql`SELECT pg_try_advisory_lock(727270) AS locked`);
  const locked = (lock as any).rows?.[0]?.locked ?? (lock as any)[0]?.locked;
  if (!locked) {
    console.log("Startup maintenance: another instance holds the lock; skipping");
    return;
  }
  try {
    await runStartupMaintenanceLocked();
    // Auto-populate geo reference data (countries/cities/airports) on a fresh
    // DB. Idempotent, insert-only; runs inside the same advisory lock so
    // concurrently booting instances can't race.
    const { maybeRunGeoImportAtStartup } = await import("./routes/geoImportRoutes");
    await maybeRunGeoImportAtStartup();
  } finally {
    await db.execute(sql`SELECT pg_advisory_unlock(727270)`);
  }
}

async function runStartupMaintenanceLocked(): Promise<void> {
  // 1. Legacy role remap.
  const remapped = await db
    .update(userProfiles)
    .set({ role: "tour_leader" as any })
    .where(eq(userProfiles.role, "travel_agent" as any))
    .returning({ userId: userProfiles.userId });
  if (remapped.length > 0) {
    console.log(`Startup maintenance: remapped ${remapped.length} legacy travel_agent profile(s) to tour_leader`);
  }

  // 2. Top up missing demo accounts (create-only; never touch existing users).
  let passwordHash: string | null = null;
  for (const role of roles) {
    if (PRIVILEGED_ROLES.has(role)) continue; // never auto-create privileged accounts
    const username = `${role.replace("_", "")}1`;
    const id = `user-${role}-1`;
    const existing = await authStorage.getUser(id);
    if (existing) {
      // Ensure the profile exists and has the right role, but leave the
      // user's credentials untouched.
      const profile = await db.select().from(userProfiles).where(eq(userProfiles.userId, id));
      if (profile.length === 0) {
        await db.insert(userProfiles).values({ userId: id, role: role as any });
        console.log(`Startup maintenance: created missing profile for ${username} (${role})`);
      } else if (profile[0].role !== role) {
        await db.update(userProfiles).set({ role: role as any }).where(eq(userProfiles.userId, id));
        console.log(`Startup maintenance: corrected role for ${username} -> ${role}`);
      }
      continue;
    }
    if (!passwordHash) passwordHash = await bcrypt.hash("password123", 10);
    const user = await authStorage.upsertUser({
      id,
      username,
      passwordHash,
      email: `${username}@tourops.com`,
    });
    await db.insert(userProfiles).values({ userId: user.id, role: role as any });
    console.log(`Startup maintenance: created missing demo account ${username} (${role})`);
  }
}

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

  // city_manager needs a countryCode and cityId to manage their assigned city.
  const cityManagerProfile = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, "user-city_manager-1"));
  if (cityManagerProfile.length > 0) {
    const updates: Record<string, any> = {};
    if (!cityManagerProfile[0].countryCode) {
      const [country] = await db.select().from(countries).limit(1);
      if (country) updates.countryCode = country.code;
    }
    if (!cityManagerProfile[0].cityId) {
      const [city] = await db.select().from(cities).limit(1);
      if (city) {
        updates.cityId = city.id;
        console.log(`Linked citymanager1 -> city "${city.name}"`);
      }
    }
    if (Object.keys(updates).length > 0) {
      await db
        .update(userProfiles)
        .set(updates)
        .where(eq(userProfiles.userId, "user-city_manager-1"));
    }
  }

  return generatedAccounts;
}

// Allow direct execution: tsx --env-file=.env src/seed-core.ts
if (process.argv[1]?.endsWith("seed-core.ts") || process.argv[1]?.endsWith("seed-core.js")) {
  console.log("🌱 Starting user seeder via seed-core.ts...");
  runUserSeed()
    .then((accounts) => {
      console.log("✅ Seeding complete! Here are the accounts:");
      console.table(accounts);
      process.exit(0);
    })
    .catch((err) => {
      console.error("❌ Seeding failed:", err);
      process.exit(1);
    });
}
