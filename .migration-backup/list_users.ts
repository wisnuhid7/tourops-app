
import { db } from "./server/db";
import { users } from "./shared/models/auth";
import { userProfiles } from "./shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  const result = await db.select({
    username: users.username,
    role: userProfiles.role
  })
  .from(users)
  .leftJoin(userProfiles, eq(users.id, userProfiles.userId));
  
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
