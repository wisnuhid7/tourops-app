import { db } from "../server/db.js";
import { users, userProfiles } from "../shared/schema.js";
import { eq } from "drizzle-orm";

async function main() {
  const [user] = await db.select().from(users).where(eq(users.username, "superadmin1"));
  if (!user) {
    console.log("user superadmin1 not found");
    process.exit(0);
  }
  const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));
  console.log("USER:", user.username, "ID:", user.id);
  console.log("PROFILE:", profile ? JSON.stringify(profile) : "no profile");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
