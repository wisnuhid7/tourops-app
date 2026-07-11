import { users, type User, type UpsertUser } from "@shared/models/auth";
import { userProfiles, type UserProfile } from "@shared/schema";
import { db } from "../../db";
import { eq } from "drizzle-orm";

export interface IAuthStorage {
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getProfileByUserId(userId: string): Promise<UserProfile | undefined>;
  ensureProfile(userId: string): Promise<UserProfile>;
}

class AuthStorage implements IAuthStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async getProfileByUserId(userId: string): Promise<UserProfile | undefined> {
    const [profile] = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId));
    return profile;
  }

  async ensureProfile(userId: string): Promise<UserProfile> {
    const existing = await this.getProfileByUserId(userId);
    if (existing) return existing;
    const [profile] = await db
      .insert(userProfiles)
      .values({ userId, role: "customer" })
      .returning();
    return profile;
  }
}

export const authStorage = new AuthStorage();
