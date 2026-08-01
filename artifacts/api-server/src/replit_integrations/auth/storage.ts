import { users, type User, type UpsertUser } from "@workspace/db";
import { userProfiles, type UserProfile, authTokens, type AuthToken } from "@workspace/db";
import { db } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import crypto from "crypto";

export type AuthTokenType = "password_reset" | "email_verify";

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

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

  async ensureProfile(
    userId: string,
    accountType?: "individual" | "family_organizer" | "group_organizer" | "tour_leader" | "organization",
  ): Promise<UserProfile> {
    const existing = await this.getProfileByUserId(userId);
    if (existing) return existing;
    const [profile] = await db
      .insert(userProfiles)
      .values({ userId, role: "customer", accountType: accountType ?? "individual" })
      .returning();
    return profile;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  /** Partial update on the users row (password, 2FA fields, emailVerified, ...). */
  async updateUser(id: string, patch: Partial<UpsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  /**
   * Creates a single-use auth token. Returns the RAW token (for the email
   * link); only its SHA-256 hash is persisted. Any previous unused tokens of
   * the same type for the user are invalidated so only the latest link works.
   */
  async createAuthToken(userId: string, type: AuthTokenType, ttlMs: number): Promise<string> {
    const raw = crypto.randomBytes(32).toString("hex");
    await db
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.userId, userId), eq(authTokens.type, type), isNull(authTokens.usedAt)));
    await db.insert(authTokens).values({
      userId,
      tokenHash: hashToken(raw),
      type,
      expiresAt: new Date(Date.now() + ttlMs),
    });
    return raw;
  }

  /**
   * Validates and consumes a token: it must exist, match the type, be unused
   * and unexpired. Marks it used atomically and returns the row (or undefined).
   */
  async consumeAuthToken(rawToken: string, type: AuthTokenType): Promise<AuthToken | undefined> {
    const [token] = await db
      .update(authTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(authTokens.tokenHash, hashToken(rawToken)), eq(authTokens.type, type), isNull(authTokens.usedAt)))
      .returning();
    if (!token) return undefined;
    if (token.expiresAt.getTime() < Date.now()) return undefined;
    return token;
  }
}

export const authStorage = new AuthStorage();
