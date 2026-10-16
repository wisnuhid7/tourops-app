import type { Express } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";
import { routeError } from "../lib/routeError";
import { storage } from "../storage";
import { isAuthenticated, passwordSchema } from "../replit_integrations/auth";
import { authStorage } from "../replit_integrations/auth/storage";
import { authTokens, db, notifications, userProfiles, userRoleEnum, users } from "@workspace/db";
import { ADMIN_ROLES, PLATFORM_WIDE_READ_ROLES, getUserId, requireRole } from "../middleware/auth";
import { upload, sniffImageMime } from "./shared";

const DOCUMENT_MIME_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const documentUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(process.cwd(), "uploads", "documents");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = DOCUMENT_MIME_EXT[file.mimetype] ?? ".bin";
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1E9)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!DOCUMENT_MIME_EXT[file.mimetype]) {
      return cb(new Error("Only PDF and image files are allowed"));
    }
    cb(null, true);
  },
});

function sniffDocumentMime(buffer: Buffer, declaredMime: string): boolean {
  if (declaredMime === "application/pdf") {
    return buffer.length >= 5 && buffer.toString("ascii", 0, 5) === "%PDF-";
  }
  return sniffImageMime(buffer, declaredMime);
}

// Image uploads directory + endpoint, and user profile management. Extracted
// verbatim from routes.ts - behaviour and registration order unchanged.
export function registerAccountsRoutes(app: Express): void {
  // Pre-create uploads directory so it exists before any request hits
  const uploadsDir = path.join(process.cwd(), "uploads", "images");
  fs.mkdirSync(uploadsDir, { recursive: true });

  app.post("/api/upload", isAuthenticated, (req, res, next) => {
    upload.single("image")(req, res, async (err) => {
      if (err) {
        // Multer rejections (disallowed type / oversize) are CLIENT errors, not
        // 500s. Return a clean 4xx and never echo the raw Multer message
        // (F-08: wrong-status + information disclosure).
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: "File too large" });
        }
        return res.status(415).json({ message: "Unsupported image type" });
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      // F-05: the declared Content-Type is attacker-controlled, so verify the
      // ACTUAL bytes match the declared raster format. On mismatch, delete the
      // already-written file and reject — nothing spoofed is persisted.
      try {
        const fh = await fs.promises.open(req.file.path, "r");
        const { buffer, bytesRead } = await fh.read(Buffer.alloc(16), 0, 16, 0);
        await fh.close();
        if (!sniffImageMime(buffer.subarray(0, bytesRead), req.file.mimetype)) {
          await fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(415).json({ message: "File content does not match its declared image type" });
        }
      } catch {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ message: "Unable to validate uploaded file" });
      }

      res.json({ url: `/uploads/images/${req.file.filename}` });
    });
  });

  app.post("/api/upload-document", isAuthenticated, (req, res, next) => {
    documentUpload.single("file")(req, res, async (err) => {
      if (err) {
        if ((err as any).code === "LIMIT_FILE_SIZE") {
          return res.status(413).json({ message: "File too large" });
        }
        return res.status(415).json({ message: "Only PDF and image files are allowed" });
      }
      if (!req.file) return res.status(400).json({ message: "No file uploaded" });

      try {
        const fh = await fs.promises.open(req.file.path, "r");
        const { buffer, bytesRead } = await fh.read(Buffer.alloc(16), 0, 16, 0);
        await fh.close();
        if (!sniffDocumentMime(buffer.subarray(0, bytesRead), req.file.mimetype)) {
          await fs.promises.unlink(req.file.path).catch(() => {});
          return res.status(415).json({ message: "File content does not match its declared type" });
        }
      } catch {
        await fs.promises.unlink(req.file.path).catch(() => {});
        return res.status(400).json({ message: "Unable to validate uploaded file" });
      }

      res.json({ url: `/uploads/documents/${req.file.filename}` });
    });
  });

  // ---- User Profiles ----
  app.get("/api/user-profile", isAuthenticated, async (req, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) return res.status(401).json({ message: "Unauthorized" });
      const profile = await storage.getOrCreateProfile(userId);
      res.json(profile);
    } catch (e: any) { routeError(res, e); }
  });

  app.get("/api/user-profiles", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, PLATFORM_WIDE_READ_ROLES)) return;
      const requester = await storage.getOrCreateProfile(getUserId(req)!);
      const all = await storage.getAllProfiles();
      // country_manager only sees users assigned to its own country (per role spec).
      if (requester.role === "country_manager") {
        return res.json(all.filter(p => p.countryCode && requester.countryCode && p.countryCode.toUpperCase() === requester.countryCode.toUpperCase()));
      }
      res.json(all);
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/user-profiles/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const updateSchema = z.object({ role: z.enum(userRoleEnum.enumValues).optional(), phone: z.string().optional(), companyName: z.string().optional(), countryCode: z.string().optional(), cityId: z.string().nullable().optional(), isTourLeader: z.boolean().optional(), isActive: z.boolean().optional() });
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      res.json(await storage.updateProfile(req.params.id as string, parsed.data as any));
    } catch (e: any) { routeError(res, e); }
  });

  app.post("/api/admin/users", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const createSchema = z.object({
        username: z.string().min(3).max(50),
        password: passwordSchema,
        firstName: z.string().min(1),
        lastName: z.string().optional(),
        email: z.string().email().optional(),
        role: z.enum(userRoleEnum.enumValues),
        phone: z.string().optional(),
        companyName: z.string().optional(),
        countryCode: z.string().optional(),
        cityId: z.string().nullable().optional(),
      });
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      const existing = await authStorage.getUserByUsername(parsed.data.username);
      if (existing) return res.status(409).json({ message: "Username already exists" });

      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await authStorage.upsertUser({
        username: parsed.data.username,
        passwordHash,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName || null,
        email: parsed.data.email || null,
      });

      // Explicit provisioning (getOrCreateProfile is fail-closed and never creates)
      let profile = await authStorage.ensureProfile(user.id);
      if (profile) {
        profile = (await storage.updateProfile(profile.id, {
          role: parsed.data.role as any,
          phone: parsed.data.phone || null,
          companyName: parsed.data.companyName || null,
          countryCode: parsed.data.countryCode || null,
          cityId: parsed.data.cityId || null,
        })) ?? profile;
      }

      res.json({ user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email }, profile });
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/admin/users/:id/password", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const pwSchema = z.object({ password: passwordSchema });
      const parsed = pwSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });
      const passwordHash = await bcrypt.hash(parsed.data.password, 10);
      const user = await authStorage.getUser(req.params.id as string);
      if (!user) return res.status(404).json({ message: "User not found" });
      await authStorage.upsertUser({ ...user, passwordHash, updatedAt: new Date() });
      res.json({ success: true });
    } catch (e: any) { routeError(res, e); }
  });

  app.patch("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const editSchema = z.object({
        username: z.string().min(3).max(50).optional(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().nullable().optional(),
        email: z.string().email().nullable().optional(),
        role: z.enum(userRoleEnum.enumValues).optional(),
        phone: z.string().nullable().optional(),
        companyName: z.string().nullable().optional(),
        countryCode: z.string().nullable().optional(),
        cityId: z.string().nullable().optional(),
        isActive: z.boolean().optional(),
        isTourLeader: z.boolean().optional(),
      });
      const parsed = editSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: parsed.error.message });

      const userId = req.params.id as string;
      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (parsed.data.username && parsed.data.username !== user.username) {
        const existingUsername = await authStorage.getUserByUsername(parsed.data.username);
        if (existingUsername && existingUsername.id !== userId) {
          return res.status(409).json({ message: "Username already taken" });
        }
      }

      if (parsed.data.email && parsed.data.email !== user.email) {
        const existingEmail = await authStorage.getUserByEmail(parsed.data.email);
        if (existingEmail && existingEmail.id !== userId) {
          return res.status(409).json({ message: "Email already taken" });
        }
      }

      const userPatch: Partial<typeof users.$inferInsert> = {};
      if (parsed.data.username !== undefined) userPatch.username = parsed.data.username;
      if (parsed.data.firstName !== undefined) userPatch.firstName = parsed.data.firstName;
      if (parsed.data.lastName !== undefined) userPatch.lastName = parsed.data.lastName;
      if (parsed.data.email !== undefined) userPatch.email = parsed.data.email;

      let updatedUser = user;
      if (Object.keys(userPatch).length > 0) {
        updatedUser = (await authStorage.updateUser(userId, userPatch)) ?? user;
      }

      let profile = await authStorage.getProfileByUserId(userId);
      if (!profile) {
        profile = await authStorage.ensureProfile(userId);
      }

      const profilePatch: Partial<typeof userProfiles.$inferInsert> = {};
      if (parsed.data.role !== undefined) profilePatch.role = parsed.data.role;
      if (parsed.data.phone !== undefined) profilePatch.phone = parsed.data.phone;
      if (parsed.data.companyName !== undefined) profilePatch.companyName = parsed.data.companyName;
      if (parsed.data.countryCode !== undefined) profilePatch.countryCode = parsed.data.countryCode;
      if (parsed.data.cityId !== undefined) profilePatch.cityId = parsed.data.cityId;
      if (parsed.data.isActive !== undefined) profilePatch.isActive = parsed.data.isActive;
      if (parsed.data.isTourLeader !== undefined) profilePatch.isTourLeader = parsed.data.isTourLeader;

      let updatedProfile = profile;
      if (Object.keys(profilePatch).length > 0) {
        updatedProfile = (await storage.updateProfile(profile.id, profilePatch)) ?? profile;
      }

      res.json({ user: updatedUser, profile: updatedProfile });
    } catch (e: any) { routeError(res, e); }
  });

  app.delete("/api/admin/users/:id", isAuthenticated, async (req, res) => {
    try {
      if (!await requireRole(req, res, ADMIN_ROLES)) return;
      const userId = req.params.id as string;

      if ((req as any).user?.id === userId) {
        return res.status(400).json({ message: "Cannot delete your own logged-in account" });
      }

      const user = await authStorage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      if (user.username === "superadmin1" || userId === "user-super_admin-1") {
        return res.status(403).json({ message: "Cannot delete primary super administrator" });
      }

      await db.delete(authTokens).where(eq(authTokens.userId, userId));
      await db.delete(notifications).where(eq(notifications.userId, userId));
      await db.delete(userProfiles).where(eq(userProfiles.userId, userId));
      await db.delete(users).where(eq(users.id, userId));

      res.json({ success: true, message: "User deleted successfully" });
    } catch (e: any) { routeError(res, e); }
  });
}
