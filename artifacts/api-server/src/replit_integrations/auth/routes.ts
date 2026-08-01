import type { Express, Request } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import { routeError } from "../../lib/routeError";
import { runUserSeed, superAdminExists } from "../../seed-core";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { z } from "zod/v4";
import rateLimit from "express-rate-limit";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { enqueueEmail } from "../../lib/emailQueue";

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
    req.session.regenerate((err) => {
      if (err) return reject(err);
      // regenerate() rebuilds the cookie from the original session options,
      // wiping the per-request plain-HTTP downgrade applied in setupAuth.
      // Re-apply it: SameSite=None without Secure is rejected by browsers.
      if (!req.secure) {
        req.session.cookie.sameSite = "lax";
        req.session.cookie.secure = false;
        (req.session.cookie as any).partitioned = false;
      }
      resolve();
    });
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

// Forgot-password/reset always return 2xx (enumeration-safe), so a limiter
// with skipSuccessfulRequests would never count them. Count every request.
const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5, // max 5 reset-related requests per IP per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again later." },
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

// ---- Password reset / email verification helpers ----
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const VERIFY_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Base URL for links embedded in auth emails. NEVER derived from request
 * headers (an attacker-supplied Origin/Host on the unauthenticated
 * forgot-password endpoint would poison the victim's reset link and leak the
 * live token to an attacker domain). Uses the env-configured canonical URL,
 * with the workspace dev domain as a development fallback.
 */
function linkBase(_req: Request): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.REPLIT_DEV_DOMAIN) return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  // Last resort: relative link (works when the email is viewed in-app/dev
  // console; never points off-site).
  return "";
}

function authEmailHtml(title: string, body: string, ctaLabel: string, ctaUrl: string): string {
  return `
  <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:8px">
    <h2 style="color:#116bb0;margin-top:0">${title}</h2>
    <p style="color:#374151;line-height:1.6">${body}</p>
    <p style="margin:28px 0">
      <a href="${ctaUrl}" style="background:#116bb0;color:#ffffff;padding:12px 22px;border-radius:6px;text-decoration:none;font-weight:bold">${ctaLabel}</a>
    </p>
    <p style="color:#6b7280;font-size:12px">If the button doesn't work, copy this link into your browser:<br>${ctaUrl}</p>
    <p style="color:#6b7280;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
  </div>`;
}

async function sendVerificationEmail(req: Request, userId: string, email: string): Promise<void> {
  const raw = await authStorage.createAuthToken(userId, "email_verify", VERIFY_TOKEN_TTL_MS);
  const url = `${linkBase(req)}/verify-email?token=${raw}`;
  enqueueEmail(
    email,
    "Verify your email — TourOps",
    authEmailHtml(
      "Verify your email address",
      "Welcome to TourOps! Please confirm this email address to secure your account. This link expires in 24 hours.",
      "Verify Email",
      url,
    ),
  );
}

// 2FA: TOTP codes drift ±30s; allow one step of clock skew.
authenticator.options = { window: 1 };

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

      // Profile provisioning is portal-aware: a missing profile is only
      // auto-created as "customer" for customer-portal logins (legacy
      // self-registered accounts). For admin/staff portals a missing profile
      // means the account was never provisioned by an administrator — fail
      // closed instead of silently demoting the user to customer.
      let profile = await authStorage.getProfileByUserId(user.id);
      if (!profile) {
        if (portal === "admin" || portal === "staff") {
          return res.status(403).json({
            message: "This account has no staff profile. Contact an administrator.",
          });
        }
        console.warn(`[authz] auto-created customer profile for user ${user.id} at customer login (no existing profile)`);
        profile = await authStorage.ensureProfile(user.id);
      }
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

      // Successful credential check — reset the per-account failure counter.
      clearFailedAttempts(username);

      // Two-factor authentication: when enabled, do NOT elevate the session
      // yet. Park the pending login in the session and require a TOTP code
      // via POST /api/auth/login/2fa before granting access.
      if (user.totpEnabled && user.totpSecret) {
        await regenerateSession(req);
        req.session.pendingTwoFactor = { userId: user.id, role };
        return res.json({ requiresTwoFactor: true });
      }

      // Rotate the session ID (AUTH-02) before elevating privileges.
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userRole = role;

      res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role });
    } catch (error) {
      routeError(res, error);
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
        // Client account classification (who they book for). Defaults to individual.
        accountType: z.enum(["individual", "family_organizer", "group_organizer", "tour_leader", "organization"]).optional(),
      });

      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || "Invalid input";
        return res.status(400).json({ message: firstError });
      }

      const { username, password, firstName, lastName, email, accountType } = parsed.data;

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
      await authStorage.ensureProfile(user.id, accountType ?? "individual");

      // Kick off email verification when the account was registered with an
      // email address (non-blocking — queued).
      if (user.email) {
        try {
          await sendVerificationEmail(req, user.id, user.email);
        } catch (e) {
          console.error("Failed to enqueue verification email:", e);
        }
      }

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
    } catch (error) {
      routeError(res, error);
    }
  });

  // ---- Two-factor login (step 2) ----
  app.post("/api/auth/login/2fa", authRateLimiter, async (req, res) => {
    try {
      const parsed = z.object({ code: z.string().min(6).max(8) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Verification code required" });
      const pending = req.session.pendingTwoFactor;
      if (!pending) return res.status(401).json({ message: "No pending login. Start again." });
      const user = await authStorage.getUser(pending.userId);
      if (!user || !user.totpEnabled || !user.totpSecret) {
        delete req.session.pendingTwoFactor;
        return res.status(401).json({ message: "No pending login. Start again." });
      }
      if (!authenticator.check(parsed.data.code, user.totpSecret)) {
        return res.status(401).json({ message: "Invalid verification code" });
      }
      const role = pending.role;
      await regenerateSession(req);
      req.session.userId = user.id;
      req.session.userRole = role;
      res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role });
    } catch (error) {
      routeError(res, error);
    }
  });

  // ---- Forgot password ----
  // Always responds 200 with the same message so account existence is never
  // disclosed. Only accounts that have an email address can receive a link.
  app.post("/api/auth/forgot-password", passwordResetRateLimiter, async (req, res) => {
    try {
      const parsed = z.object({ identifier: z.string().min(1).max(255) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Username or email required" });
      const identifier = parsed.data.identifier.trim();
      const user = identifier.includes("@")
        ? await authStorage.getUserByEmail(identifier)
        : await authStorage.getUserByUsername(identifier);
      if (user?.email) {
        const raw = await authStorage.createAuthToken(user.id, "password_reset", RESET_TOKEN_TTL_MS);
        const url = `${linkBase(req)}/reset-password?token=${raw}`;
        enqueueEmail(
          user.email,
          "Reset your password — TourOps",
          authEmailHtml(
            "Reset your password",
            `Hi ${user.firstName || user.username || "there"}, we received a request to reset your TourOps password. This link expires in 1 hour.`,
            "Reset Password",
            url,
          ),
        );
      }
      res.json({ message: "If an account with that username or email exists, a reset link has been sent." });
    } catch (error) {
      routeError(res, error);
    }
  });

  app.post("/api/auth/reset-password", passwordResetRateLimiter, async (req, res) => {
    try {
      const parsed = z.object({ token: z.string().min(20), password: passwordSchema }).safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.issues[0]?.message || "Invalid input";
        return res.status(400).json({ message: firstError });
      }
      const token = await authStorage.consumeAuthToken(parsed.data.token, "password_reset");
      if (!token) return res.status(400).json({ message: "This reset link is invalid or has expired." });
      const user = await authStorage.getUser(token.userId);
      if (!user) return res.status(400).json({ message: "This reset link is invalid or has expired." });
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      await authStorage.updateUser(user.id, { passwordHash });
      if (user.username) clearFailedAttempts(user.username);
      res.json({ message: "Password updated. You can now log in." });
    } catch (error) {
      routeError(res, error);
    }
  });

  // ---- Email verification ----
  app.post("/api/auth/send-verification", isAuthenticated, async (req, res) => {
    try {
      const user = await authStorage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (!user.email) return res.status(400).json({ message: "No email address on this account." });
      if (user.emailVerified) return res.status(400).json({ message: "Email is already verified." });
      await sendVerificationEmail(req, user.id, user.email);
      res.json({ message: "Verification email sent." });
    } catch (error) {
      routeError(res, error);
    }
  });

  app.post("/api/auth/verify-email", async (req, res) => {
    try {
      const parsed = z.object({ token: z.string().min(20) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Token required" });
      const token = await authStorage.consumeAuthToken(parsed.data.token, "email_verify");
      if (!token) return res.status(400).json({ message: "This verification link is invalid or has expired." });
      await authStorage.updateUser(token.userId, { emailVerified: true });
      res.json({ message: "Email verified. Thank you!" });
    } catch (error) {
      routeError(res, error);
    }
  });

  // ---- Two-factor authentication management (requires active session) ----
  app.get("/api/auth/2fa/status", isAuthenticated, async (req, res) => {
    try {
      const user = await authStorage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      res.json({ enabled: !!user.totpEnabled, emailVerified: !!user.emailVerified, email: user.email || null });
    } catch (error) {
      routeError(res, error);
    }
  });

  app.post("/api/auth/2fa/setup", isAuthenticated, async (req, res) => {
    try {
      const user = await authStorage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ message: "User not found" });
      if (user.totpEnabled) return res.status(400).json({ message: "Two-factor authentication is already enabled." });
      const secret = authenticator.generateSecret();
      // Stored immediately but inactive until a valid code confirms enrollment.
      await authStorage.updateUser(user.id, { totpSecret: secret, totpEnabled: false });
      const label = user.username || user.email || user.id;
      const otpauth = authenticator.keyuri(label, "TourOps", secret);
      const qrDataUrl = await QRCode.toDataURL(otpauth);
      res.json({ secret, otpauth, qrDataUrl });
    } catch (error) {
      routeError(res, error);
    }
  });

  app.post("/api/auth/2fa/enable", isAuthenticated, async (req, res) => {
    try {
      const parsed = z.object({ code: z.string().min(6).max(8) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Verification code required" });
      const user = await authStorage.getUser(req.session.userId!);
      if (!user?.totpSecret) return res.status(400).json({ message: "Run 2FA setup first." });
      if (!authenticator.check(parsed.data.code, user.totpSecret)) {
        return res.status(400).json({ message: "Invalid verification code" });
      }
      await authStorage.updateUser(user.id, { totpEnabled: true });
      res.json({ message: "Two-factor authentication enabled." });
    } catch (error) {
      routeError(res, error);
    }
  });

  app.post("/api/auth/2fa/disable", isAuthenticated, async (req, res) => {
    try {
      const parsed = z.object({ code: z.string().min(6).max(8) }).safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Verification code required" });
      const user = await authStorage.getUser(req.session.userId!);
      if (!user?.totpEnabled || !user.totpSecret) {
        return res.status(400).json({ message: "Two-factor authentication is not enabled." });
      }
      if (!authenticator.check(parsed.data.code, user.totpSecret)) {
        return res.status(400).json({ message: "Invalid verification code" });
      }
      await authStorage.updateUser(user.id, { totpEnabled: false, totpSecret: null });
      res.json({ message: "Two-factor authentication disabled." });
    } catch (error) {
      routeError(res, error);
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
      routeError(res, error);
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
    } catch (error) {
      routeError(res, error);
    }
  });
}
