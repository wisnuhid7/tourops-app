
import { authStorage } from "./server/replit_integrations/auth/storage";
import bcrypt from "bcryptjs";

async function main() {
  const user = await authStorage.getUserByUsername("admin");
  if (!user) {
    console.error("User not found");
    process.exit(1);
  }
  const passwordHash = await bcrypt.hash("admin123", 10);
  await authStorage.upsertUser({ ...user, passwordHash });
  console.log("Password updated for admin");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
