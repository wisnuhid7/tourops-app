import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

const mockState = vi.hoisted(() => ({
  profilesByUserId: {} as Record<string, { id: string; userId: string; role: string }>,
  session: { current: {} as { userId?: string } },
  workflows: {} as Record<string, any>,
  bookings: {} as Record<string, any>,
  documents: [] as any[],
}));

vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: async (userId: string) => {
      return mockState.profilesByUserId[userId] || { id: `auto-${userId}`, userId, role: "customer" };
    },
    getProfileByUserId: async (userId: string) => mockState.profilesByUserId[userId],
    getWorkflow: async (id: string) => mockState.workflows[id],
    updateWorkflow: async (id: string, data: any) => {
      mockState.workflows[id] = { ...mockState.workflows[id], ...data };
      return mockState.workflows[id];
    },
    getBooking: async (id: string) => mockState.bookings[id],
    getAssignments: async () => [],
    getDocuments: async (bookingId: string) => mockState.documents.filter(d => d.bookingId === bookingId),
    updateDocument: async (id: string, data: any) => {
      const doc = mockState.documents.find(d => d.id === id);
      if (doc) Object.assign(doc, data);
      return doc;
    },
    getGlobalSettingByKey: async () => null,
  },
}));

vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => {
    app.use((req, _res, next) => {
      (req as any).session = mockState.session.current;
      next();
    });
  },
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    next();
  },
  registerAuthRoutes: () => {},
}));

vi.mock("../../lib/workers", () => ({
  queues: {
    countryImport: { add: vi.fn() },
    cityImport: { add: vi.fn() },
    sightDiscovery: { add: vi.fn() },
    sightEnrichment: { add: vi.fn() },
    tourAi: { add: vi.fn() },
    hotelPrice: { add: vi.fn() },
    flightPrice: { add: vi.fn() },
  },
  startWorkers: vi.fn(),
}));
vi.mock("ioredis", () => ({
  default: function () {
    return { on: vi.fn(), quit: vi.fn() };
  },
}));

vi.mock("../../replit_integrations/auth/storage", () => ({
  authStorage: {
    getUser: async (userId: string) => ({ id: userId, email: `${userId}@example.com` }),
    getUserByUsername: async () => undefined,
    upsertUser: async () => ({ id: "u-seed", username: "seed" }),
  },
}));

import { registerRoutes } from "../../routes/routes";

async function buildApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  const server = createServer(app);
  await registerRoutes(server, app);
  return app;
}

describe("workflow status review and approval authorization", () => {
  let app: Express;

  beforeEach(async () => {
    mockState.profilesByUserId = {};
    mockState.session.current = {};
    mockState.workflows = {};
    mockState.bookings = {};
    mockState.documents = [];

    // Setup standard test booking
    mockState.bookings["booking-1"] = {
      id: "booking-1",
      bookingCode: "BK-1001",
      status: "confirmed",
      customerId: "cust-1",
    };

    // Setup standard hotel workflow assigned to hotel manager
    mockState.workflows["wf-hotel-1"] = {
      id: "wf-hotel-1",
      bookingId: "booking-1",
      serviceType: "hotel",
      assignedUserId: "supplier-hotel-1",
      status: "in_progress",
    };

    // Profiles
    mockState.profilesByUserId["supplier-hotel-1"] = {
      id: "p-hotel",
      userId: "supplier-hotel-1",
      role: "hotel_manager",
    };
    mockState.profilesByUserId["admin-1"] = {
      id: "p-admin",
      userId: "admin-1",
      role: "admin",
    };

    app = await buildApp();
  });

  it("rejects non-admin supplier when attempting to set status: completed directly", async () => {
    mockState.session.current = { userId: "supplier-hotel-1" };

    const res = await request(app)
      .patch("/api/workflows/wf-hotel-1")
      .send({ status: "completed" });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Hanya Admin atau Operations Manager/i);
    expect(mockState.workflows["wf-hotel-1"].status).toBe("in_progress");
  });

  it("allows non-admin supplier to set status: in_review for admin review", async () => {
    mockState.session.current = { userId: "supplier-hotel-1" };

    const res = await request(app)
      .patch("/api/workflows/wf-hotel-1")
      .send({ status: "in_review", notes: "Voucher kamar hotel telah dilampirkan" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("in_review");
    expect(mockState.workflows["wf-hotel-1"].status).toBe("in_review");
    expect(mockState.workflows["wf-hotel-1"].notes).toBe("Voucher kamar hotel telah dilampirkan");
  });

  it("allows admin to approve workflow (status: completed) and auto-approves pending fulfillment documents", async () => {
    // Add uploaded voucher document
    mockState.documents.push({
      id: "doc-voucher-1",
      bookingId: "booking-1",
      docType: "voucher",
      fileName: "hotel_voucher.pdf",
      status: "uploaded",
    });

    mockState.session.current = { userId: "admin-1" };

    const res = await request(app)
      .patch("/api/workflows/wf-hotel-1")
      .send({ status: "completed" });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("completed");
    expect(mockState.workflows["wf-hotel-1"].status).toBe("completed");

    // Verify document was auto-approved
    expect(mockState.documents[0].status).toBe("approved");
    expect(mockState.documents[0].reviewedBy).toBe("admin-1");
  });
});
