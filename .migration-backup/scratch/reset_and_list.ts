
import { authStorage } from "../server/replit_integrations/auth/storage";
import { storage } from "../server/storage";
import { db } from "../server/db";
import { users } from "../shared/models/auth";
import bcrypt from "bcryptjs";

async function main() {
    const passwordHash = await bcrypt.hash("password123", 10);
    const adminHash = await bcrypt.hash("admin123", 10);
    
    const allUsers = await db.select().from(users);
    for (const user of allUsers) {
        const hash = user.username === 'admin' ? adminHash : passwordHash;
        await authStorage.upsertUser({ ...user, passwordHash: hash });
    }
    
    const results = [];
    for (const user of allUsers) {
        const profile = await storage.getProfileByUserId(user.id);
        results.push({
            username: user.username,
            password: user.username === 'admin' ? 'admin123' : 'password123',
            role: profile?.role || 'customer',
            fullName: profile?.fullName || '-'
        });
    }
    console.table(results);
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
