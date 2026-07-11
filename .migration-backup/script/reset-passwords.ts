import bcrypt from "bcryptjs";
import { db, pool } from "../server/db";
import { users } from "@shared/schema";

async function main() {
  const newPassword = process.argv[2];
  if (!newPassword || newPassword.length < 6) {
    console.error("Usage: tsx script/reset-passwords.ts <new-password>");
    console.error("Password must be at least 6 characters.");
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  const updated = await db.update(users).set({ passwordHash }).returning({ username: users.username });

  console.log(`Updated ${updated.length} accounts on ${process.env.DATABASE_URL?.replace(/:[^:@]+@/, ":***@")}:`);
  for (const row of updated) console.log(" -", row.username);

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
