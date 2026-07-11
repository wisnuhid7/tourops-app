import type { Express } from "express";
import { authStorage } from "./storage";
import { isAuthenticated } from "./replitAuth";
import bcrypt from "bcryptjs";
import { z } from "zod";

const CUSTOMER_ROLES = ["customer"];
const ADMIN_ROLES = ["admin", "super_admin"];
const STAFF_ROLES = [
  "admin", "super_admin",
  "airline_supplier", "country_manager", "city_manager",
  "hotel_manager", "transport_manager", "guide_manager",
  "sights_manager", "content_editor", "flight_agent",
  "tour_builder", "supplier", "travel_agent",
];

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  portal: z.enum(["customer", "admin", "staff"]).optional(),
});

export function registerAuthRoutes(app: Express): void {
  app.post("/api/auth/login", async (req, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ message: "Username and password required" });

      const { username, password, portal } = parsed.data;
      const user = await authStorage.getUserByUsername(username);
      if (!user || !user.passwordHash) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        return res.status(401).json({ message: "Invalid username or password" });
      }

      // Ensure user always has a profile (auto-creates with role="customer" if missing)
      await authStorage.ensureProfile(user.id);

      const profile = await authStorage.getProfileByUserId(user.id);
      const role = profile?.role || "customer";

      if (portal === "admin" && !ADMIN_ROLES.includes(role)) {
        return res.status(403).json({ message: "This account does not have admin access" });
      }
      if (portal === "staff" && !STAFF_ROLES.includes(role) && !ADMIN_ROLES.includes(role)) {
        return res.status(403).json({ message: "This account does not have staff access" });
      }
      if (portal === "customer" && !CUSTOMER_ROLES.includes(role) && !ADMIN_ROLES.includes(role)) {
        return res.status(403).json({ message: "This account does not have customer access" });
      }

      req.session.userId = user.id;
      req.session.userRole = role;

      res.json({ id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role });
    } catch (error: any) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ---- Self-Registration (Customer) ----
  app.post("/api/auth/register", async (req, res) => {
    try {
      const registerSchema = z.object({
        username: z.string().min(3, "Username must be at least 3 characters").max(50),
        password: z.string().min(6, "Password must be at least 6 characters"),
        firstName: z.string().min(1, "First name is required"),
        lastName: z.string().optional(),
        email: z.string().email("Invalid email address").optional().or(z.literal("")),
      });

      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        const firstError = parsed.error.errors[0]?.message || "Invalid input";
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

      // Log them in immediately
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

  app.post("/api/auth/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: "Logout failed" });
      }
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/logout", (req, res) => {
    req.session.destroy(() => {
      res.clearCookie("connect.sid");
      res.redirect("/");
    });
  });
}
