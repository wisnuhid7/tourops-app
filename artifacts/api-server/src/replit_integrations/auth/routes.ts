import type { Express, Request } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { runUserSeed, superAdminExists } from "../../seed-core";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod/v4";
import rateLimit from "express-rate-limit";

// AUTH-06: single source of truth for the password policy. Applied uniformly to
// self-registration, admin-created users, and admin password resets so the
// minimum strength can't drift between code paths.
export const MIN_PASSWORD_LENGTH = 8;
export const passwordSchema = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`);

// AUTH-07: per-account failed-login lockout, complementing the per-IP limiter.
// The IP limiter throttles a single source; this throttles guessing against one
// account from many IPs. In-memory (resets on restart) — acceptable for a
// single-process deployment; move to the session store / DB if scaled out.
const ACCOUNT_LOCK_THRESHOLD = 5; // failed attempts before lockout
const ACCOUNT_LOCK_MS = 15 * 60 * 1000; // 15-minute lockout window
type AccountAttempt = { count: number; lockedUntil: number };
const accountAttempts = new Map<string, AccountAttempt>();

function accountKey(username: string): string {
  return username.trim().toLowerCase();
}
/** Returns remaining lock seconds if the account is currently locked, else 0. */
function accountLockRemaining(username: string): number {
  const rec = accountAttempts.get(accountKey(username));
  if (!rec || rec.lockedUntil <= Date.now()) return 0;
  return Math.ceil((rec.lockedUntil - Date.now()) / 1000);
}
function registerFailedAttempt(username: string): void {
  const key = accountKey(username);
  const now = Date.now();
  const rec = accountAttempts.get(key);
  // Start (or restart) the counter when there's no record, or when a previous
  // lock has fully expired. `lockedUntil === 0` means "never locked" — do NOT
  // treat that as an expiry, or the counter would reset on every attempt.
  if (!rec || (rec.lockedUntil > 0 && rec.lockedUntil <= now)) {
    accountAttempts.set(key, { count: 1, lockedUntil: 0 });
    return;
  }
  rec.count += 1;
  if (rec.count >= ACCOUNT_LOCK_THRESHOLD) {
    rec.lockedUntil = now + ACCOUNT_LOCK_MS;
    rec.count = 0;
  }
}
function clearFailedAttempts(username: string): void {
  accountAttempts.delete(accountKey(username));
}

// AUTH-02: rotate the session ID at the moment of privilege elevation
// (login / registration) to defend against session fixation.
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });
}

// Brute-force / credential-stuffing protection for authentication endpoints.
// Keyed on client IP (trust proxy is set, so req.ip resolves to the real
// client behind the Replit proxy — not a spoofable header). Successful logins
// don't count against the limit.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10, // max 10 failed attempts per IP per window
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { message: "Too many login attempts. Please try again later." },
});

/** Constant-time string comparison that avoids leaking length via early return. */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Still run a comparison to keep timing roughly constant.
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}

const CUSTOMER_ROLES = ["customer"];
const ADMIN_ROLES = ["admin", "super_admin"];
const STAFF_ROLES = [
  "admin", "super_admin",
  "airline_supplier", "country_manager", "city_manager",
  "hotel_manager", "transport_manager", "guide_manager",
  "sights_manager", "content_editor", "flight_agent",
  "tour_builder", "supplier", "tour_leader", "accounting", "operations_manager", "support_agent",
];

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  portal: z.enum(["customer", "admin", "staff"]).optional(),
});

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/login", authRateLimiter, async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Username and password required" });

      const { username, password, portal } = parsed.data;

      // AUTH-07: per-account lockout check (before any credential work).
      const lockRemaining = accountLockRemaining(username);
      if (lockRemaining > 0) {
        return res.status(429).json({
          message: `Too many failed attempts. Try again in ${Math.ceil(lockRemaining / 60)} minute(s).`,
        });
      }

      const user = await authStorage.getUserByUsername(username);
      if (!user || !user.passwordHash) {
        registerFailedAttempt(username);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        registerFailedAttempt(username);
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Ensure user always has a profile (auto-creates with role="customer" if missing)
      await authStorage.ensureProfile(user.id);

      const profile = await authStorage.getProfileByUserId(user.id);
      const role = profile?.role || "customer";

      // Account lifecycle: a deactivated profile must not be able to log in.
      // `isActive` is nullable in older rows; only an explicit `false` blocks login.
      if (profile && profile.isActive === false) {
        return res.status(403).json({ message: "Account is disabled" });
      }

      if (portal === "admin" && !ADMIN_ROLES.includes(role)) {
        return res.status(403).json({ message: "This account does not have admin access" });
      }
      if (portal === "staff" && !STAFF_ROLES.includes(role) && !ADMIN_ROLES.includes(role)) {
        return res.status(403).json({ message: "This account does not have staff access" });
      }
      if (portal === "customer" && !CUSTOMER_ROLES.includes(role) && !ADMIN_ROLES.includes(role)) {
        return res.status(403).json({ message: "This account does not have customer access" });
      }

      // Successful credential check — reset the per-account failure counter and
      // rotate the session ID (AUTH-02) before elevating privileges.
      clearFailedAttempts(username);
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userRole = role;

      res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ---- Self-Registration (Customer) ----
  app.post("/api/auth/register", authRateLimiter, async (req, res) => {
    try {
      const registerSchema = z.object({
        username: z.string().min(3, "Username must be at least 3 characters").max(50),
        password: passwordSchema,
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().optional(),
        email: z.string().email("Invalid email address").optional().or(z.literal("")),
      });

      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || "Invalid input";
        return res.status(400).json({ message: firstError });
      }

      const { username, password, firstName, lastName, email } = parsed.data;

      // Check for existing username
      const existing = await authStorage.getUserByUsername(username);
      if (existing) {
        return res.status(409).json({ message: "Username is already taken" });
      }

      const passwordHash = await bcrypt.hash(password, 10);
      const user = await authStorage.upsertUser({
        username,
        passwordHash,
        firstName,
        lastName: lastName || null,
        email: email || null,
      });

      // Auto-create customer profile
      await authStorage.ensureProfile(user.id);

      // Log them in immediately (rotate session ID first — AUTH-02).
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userRole = "customer";

      res.status(201).json({
        id: user.id,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: "customer",
      });
    } catch (error: any) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed. Please try again." });
    }
  });

  app.get("/api/auth/user", isAuthenticated, async (req, res) => {
    try {
      const userId = req.session.userId!;
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });
      const { passwordHash, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Clear the session cookie with the same attributes it was set with —
  // browsers only reliably remove a cookie when path/SameSite/Secure/
  // Partitioned match the original Set-Cookie.
  const clearSessionCookie = (res: Parameters<Parameters<Express["post"]>[1]>[1]) => {
    res.clearCookie("connect.sid", {
      path: "/",
      httpOnly: true,
      secure: true,
      sameSite: "none",
      partitioned: true,
    });
    // Also clear the non-Partitioned/non-Secure variant set over plain HTTP.
    res.clearCookie("connect.sid", { path: "/" });
  };

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      clearSessionCookie(res);
      res.json({ success: true });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      clearSessionCookie(res);
      res.redirect("/");
    });
  });

  // ---- One-time demo seeding (secret-guarded) ----
  // Creates/refreshes the standard demo accounts. Only works when the request
  // presents the SEED_SECRET; if SEED_SECRET is unset, the endpoint is disabled.
  // Intended for bootstrapping a freshly deployed environment that has no
  // usable staff accounts. Remove once real accounts exist.
  app.post("/api/auth/seed-demo", async (req, res) => {
    try {
      const secret = process.env.SEED_SECRET;
      if (!secret) {
        return res.status(404).json({ message: "Not found" });
      }
      const provided = req.get("x-seed-secret") || "";
      if (!safeEqual(provided, secret)) {
        return res.status(403).json({ message: "Forbidden" });
      }
      // One-time bootstrap: once a super_admin exists, refuse to reseed so a
      // leaked secret cannot reset privileged credentials to a known value.
      if (await superAdminExists()) {
        return res.status(409).json({ message: "Already bootstrapped" });
      }
      const accounts = await runUserSeed();
      // Do not return plaintext passwords; only report which accounts exist now.
      res.json({ ok: true, count: accounts.length, usernames: accounts.map(a => a.username) });
    } catch (error: any) {
      console.error("Seed error:", error);
      res.status(500).json({ message: "Seeding failed" });
    }
  });
}
