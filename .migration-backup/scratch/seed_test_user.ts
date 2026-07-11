import { db } from '../server/db.ts';
import { users } from '../shared/models/auth.ts';
import { userProfiles } from '../shared/schema.ts';
import { authStorage } from '../server/replit_integrations/auth/storage.ts';
import { eq } from "drizzle-orm";
import bcrypt from 'bcryptjs';

(async () => {
  try {
    const passwordHash = await bcrypt.hash('admin123', 10);
    const user = await authStorage.upsertUser({ 
      id: 'test-admin-id', 
      username: 'testadmin', 
      passwordHash, 
      email: 'admin@test.com' 
    });
    
    const existingProfile = await db.select().from(userProfiles).where(eq(userProfiles.userId, user.id));
    if (existingProfile.length > 0) {
      await db.update(userProfiles).set({ role: 'admin' }).where(eq(userProfiles.userId, user.id));
    } else {
      await db.insert(userProfiles).values({ userId: user.id, role: 'admin' });
    }
    
    console.log('Created testadmin/admin123');
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
