import { runUserSeed } from "./seed-core";

async function seedUsers() {
  console.log("🌱 Starting user seeder...");
  const accounts = await runUserSeed();
  console.log("✅ Seeding complete! Here are the accounts:");
  console.table(accounts);
  process.exit(0);
}

seedUsers().catch(err => {
  console.error("❌ Seeding failed:", err);
  process.exit(1);
});
