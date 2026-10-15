/**
 * OWASP A05 / A08 / A10 — image upload validation and error handling.
 *
 * Confirmed facts (routes/shared.ts:49-68, routes/accountsRoutes.ts:22-31):
 *   - multer fileFilter checks ONLY the client-declared Content-Type. No
 *     magic-byte / file-signature sniffing -> polyglots & spoofed types pass.
 *   - SVG is intentionally excluded (GOOD) — but because multer raises the
 *     fileFilter error, the handler returns HTTP 500 with the raw error text
 *     instead of a 4xx. That is both a wrong-status A10 issue and an
 *     information-disclosure smell (raw Multer message echoed to the client).
 *   - missing file -> 400 (GOOD).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";

const mockState = vi.hoisted(() => ({
  session: { current: {} as { userId?: string } },
  profile: { id: "p1", userId: "user-1", role: "customer", isActive: true, countryCode: null, cityId: null, transportCompanyId: null },
}));

const uploadDir = path.join(process.cwd(), "uploads", "images");
let filesBefore: string[] = [];

vi.mock("../../lib/logger", () => ({
  logger: { error: () => {}, info: () => {}, warn: () => {}, debug: () => {}, child: () => ({ error: () => {}, info: () => {}, warn: () => {}, debug: () => {} }) },
}));
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: () => Promise.resolve(mockState.profile),
    getGlobalSettingByKey: async () => null,
    updateGlobalSetting: async () => {},
    createAuditLog: async () => {},
  },
}));
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => {
    app.use((req: any, _res: any, next: any) => { req.session = mockState.session.current; next(); });
  },
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
  registerAuthRoutes: () => {},
  passwordSchema: { _def: {} } as any,
}));
vi.mock("../../replit_integrations/auth/storage", () => ({
  authStorage: {
    getUserByUsername: async () => ({ id: "admin-1" }), // admin already exists -> no seed
    getUser: async () => null, getUserByEmail: async () => null,
    upsertUser: async () => ({ id: "x" }), updateUser: async () => null,
    ensureProfile: async () => null, getProfileByUserId: async () => null,
  },
}));
vi.mock("@workspace/db", async (importOriginal) => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
  const actual = await importOriginal<Record<string, unknown>>();
  const chain: any = {
    from: () => chain, where: () => chain, leftJoin: () => chain, limit: () => chain, offset: () => chain,
    orderBy: () => chain, values: () => chain, set: () => chain, onConflictDoNothing: () => chain,
    onConflictDoUpdate: () => chain, returning: () => Promise.resolve([]), execute: () => Promise.resolve([]),
    then: (resolve: (rows: unknown[]) => void) => resolve([]),
  };
  const fakeDb: any = {
    select: () => chain, insert: () => chain, update: () => chain, delete: () => chain,
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fakeDb), execute: () => Promise.resolve([]),
  };
  return { ...actual, db: fakeDb };
});
vi.mock("../../lib/workers", () => ({
  queues: { countryImport: { add: vi.fn() }, cityImport: { add: vi.fn() }, sightDiscovery: { add: vi.fn() }, sightEnrichment: { add: vi.fn() }, tourAi: { add: vi.fn() }, hotelPrice: { add: vi.fn() }, flightPrice: { add: vi.fn() } },
  startWorkers: vi.fn(),
}));
vi.mock("ioredis", () => ({ default: function () { return { on: vi.fn(), quit: vi.fn() }; } }));

import { registerRoutes } from "../../routes/routes";

function listUploads(): string[] {
  try { return fs.readdirSync(uploadDir); } catch { return []; }
}

describe("OWASP A05/A08/A10 — image upload security", () => {
  let app: Express;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    await registerRoutes(createServer(app), app);
    filesBefore = listUploads();
  });

  afterAll(() => {
    // Remove any files this suite wrote so the repo stays clean.
    for (const f of listUploads()) {
      if (!filesBefore.includes(f)) {
        try { fs.unlinkSync(path.join(uploadDir, f)); } catch {}
      }
    }
  });

  beforeEach(() => {
    mockState.session.current = { userId: "user-1" }; // authenticated customer
  });

  // CONTROL (passes) — unauth upload is rejected, empty upload is a clean 400.
  it("control: unauthenticated upload is rejected with 401", async () => {
    mockState.session.current = {};
    const res = await request(app)
      .post("/api/upload")
      .attach("image", Buffer.from("x"), { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(401);
  });

  it("control: missing file yields a clean 400", async () => {
    const res = await request(app).post("/api/upload");
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ message: "No file uploaded" });
  });

  // GAP (A10) — declared-SVG is rejected but with 500 + raw Multer message.
  describe("A10: rejected MIME must be a 4xx, not a 500 leaking the raw error", () => {
    it("SVG upload must be rejected with a 4xx status", async () => {
      const res = await request(app)
        .post("/api/upload")
        .attach("image", Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), {
          filename: "evil.svg",
          contentType: "image/svg+xml",
        });
      expect([400, 415, 422]).toContain(res.status);
    });

    it("rejection body must not echo the raw Multer error text", async () => {
      const res = await request(app)
        .post("/api/upload")
        .attach("image", Buffer.from("<svg/>"), { filename: "evil.svg", contentType: "image/svg+xml" });
      expect(String(res.body?.message ?? "")).not.toMatch(/Upload error:/);
    });
  });

  // GAP (A05/A08) — declared MIME only; no signature sniffing.
  describe("A05/A08: content-type is trusted without signature validation", () => {
    it("HTML bytes labelled image/png must be rejected (expect 4xx, nothing persisted)", async () => {
      const before = listUploads();
      const res = await request(app)
        .post("/api/upload")
        .attach("image", Buffer.from("<script>alert(document.domain)</script>"), {
          filename: "payload.png",
          contentType: "image/png",
        });
      expect([400, 415, 422]).toContain(res.status);
      // and no new file may have been written
      expect(listUploads().length).toBe(before.length);
    });

    it("a ZIP/PDF polyglot labelled image/jpeg must be rejected", async () => {
      // %PDF- header, declared as a JPEG
      const res = await request(app)
        .post("/api/upload")
        .attach("image", Buffer.from("%PDF-1.7\n1 0 obj"), {
          filename: "doc.jpg",
          contentType: "image/jpeg",
        });
      expect([400, 415, 422]).toContain(res.status);
    });
  });
});
