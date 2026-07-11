
import { db } from "../server/db";
import { users } from "../shared/models/auth";
import { userProfiles } from "../shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  try {
    const allUsers = await db.select().from(users);
    const results = [];
    for (const user of allUsers) {
      const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));
      results.push({
        username: user.username,
        name: `${user.firstName} ${user.lastName || ""}`.trim(),
        role: profile?.role || "no profile",
        company: profile?.companyName || "-",
      });
    }
    console.table(results);
  } catch (err) {
    console.error("Error fetching users:", err);
  } finally {
    process.exit(0);
  }
}

main();
