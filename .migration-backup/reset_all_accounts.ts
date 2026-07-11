
import { authStorage } from "./server/replit_integrations/auth/storage";
import { storage } from "./server/storage";
import bcrypt from "bcryptjs";

const accounts = [
  // Staff & Admin
  { username: "admin", password: "admin123", role: "admin" },
  { username: "admin_test", password: "password123", role: "admin" },
  { username: "ops_test", password: "password123", role: "country_manager" },
  { username: "hotel_test", password: "password123", role: "hotel_manager" },
  // Customers
  { username: "tester", password: "password123", role: "customer" },
  { username: "customer_test", password: "password123", role: "customer" },
  { username: "admintestcustomer", password: "password123", role: "customer" },
];

async function main() {
  console.log("Starting master account reset...");

  for (const account of accounts) {
    try {
      let user = await authStorage.getUserByUsername(account.username);
      
      const passwordHash = await bcrypt.hash(account.password, 10);
      
      if (!user) {
        console.log(`User ${account.username} not found. Creating...`);
        user = await authStorage.upsertUser({
          username: account.username,
          passwordHash,
          firstName: account.username.charAt(0).toUpperCase() + account.username.slice(1),
          lastName: "Test",
        });
      } else {
        console.log(`Updating user ${account.username}...`);
        await authStorage.upsertUser({
          ...user,
          passwordHash,
        });
      }

      // Sync profile/role
      let profile = await storage.getProfileByUserId(user.id);
      if (!profile) {
        console.log(`Creating profile for ${account.username} with role ${account.role}...`);
        await storage.getOrCreateProfile(user.id); // This might default role, so we update next
        profile = await storage.getProfileByUserId(user.id);
      }

      if (profile) {
        console.log(`Setting role ${account.role} for ${account.username}...`);
        await storage.updateProfile(profile.id, {
          role: account.role as any,
          isActive: true,
        });
      }

      console.log(`Successfully synced ${account.username}`);
    } catch (err) {
      console.error(`Failed to sync ${account.username}:`, err);
    }
  }

  console.log("Master account reset complete.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
