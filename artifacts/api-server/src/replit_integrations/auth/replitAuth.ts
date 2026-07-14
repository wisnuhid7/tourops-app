import session from "express-session";
import type { Express, RequestHandler } from "express";
import connectPg from "connect-pg-simple";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    userRole?: string;
  }
}

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: true,
    ttl: sessionTtl,
    tableName: "sessions",
  });
  return session({
    secret: process.env.SESSION_SECRET!,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // "auto": Secure is set whenever the request is HTTPS (trust proxy is
      // enabled, so proxied HTTPS counts). Plain-HTTP tools like curl still work.
      secure: "auto",
      // The Replit preview embeds the app in a cross-origin iframe, where
      // browsers drop SameSite=Lax cookies. SameSite=None (+Secure) plus
      // Partitioned (CHIPS) lets the session cookie survive iframe storage
      // partitioning; on plain HTTP these attributes are simply ignored.
      sameSite: "none",
      partitioned: true,
      maxAge: sessionTtl,
    }
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  return next();
};
