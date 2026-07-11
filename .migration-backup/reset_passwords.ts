
import { authStorage } from "./server/replit_integrations/auth/storage";
import bcrypt from "bcryptjs";

async function main() {
  const user = await authStorage.getUserByUsername("hotel_test");
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash("password123", 10);
  await authStorage.upsertUser({ ...user, passwordHash });
  console.log("Password updated for hotel_test");
  
  const userOps = await authStorage.getUserByUsername("ops_test");
  if (userOps) {
    await authStorage.upsertUser({ ...userOps, passwordHash });
    console.log("Password updated for ops_test");
  }
  
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
