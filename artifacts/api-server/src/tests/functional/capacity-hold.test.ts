/**
 * US-03: Atomic Capacity Seat Hold on Booking Creation Tests.
 *
 * Covers:
 * 1. Decrements available capacity atomically and sets hold_expires_at = now + 30m.
 * 2. Booking status initialized to "pending_payment".
 * 3. Rejection with HTTP 409 (CAPACITY_EXCEEDED) when requested partySize exceeds remaining capacity.
 * 4. Automatic status update to "sold_out" when capacityTotal is reached.
 * 5. Concurrent booking requests competing for remaining seats result in exactly one successful hold.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import { createServer } from "http";

// ---------------------------------------------------------------------------
// Hoisted state
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => {
  type Departure = {
    id: string;
    tourId: string;
    pricePerPerson: string | null;
    capacityTotal: number;
    capacityBooked: number;
    status: string;
  };

  type BookingRecord = {
    id: string;
    tourId?: string;
    departureId?: string;
    customerId: string;
    totalPrice?: number;
    status: string;
    holdExpiresAt?: Date | null;
    partySizeExpected?: number;
    [key: string]: any;
  };

  return {
    session: { current: { userId: "cust-1" } },
    departures: new Map<string, Departure>(),
    bookings: [] as BookingRecord[],
    departureLocks: new Map<string, Promise<void>>(),
    tours: [
      { id: "tour-1", isPublished: true, title: "Test Tour", currency: "USD", basePrice: "500" },
    ],
  };
});

// ---------------------------------------------------------------------------
// Mock: @workspace/db with row-level transaction simulation
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async (importOriginal) => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
  const actual = await importOriginal<Record<string, unknown>>();

  let txMutex = Promise.resolve();

  const fakeDb: any = {
    transaction: async (fn: (tx: any) => Promise<unknown>) => {
      // Serialize transactions to simulate PostgreSQL row locking (SELECT ... FOR UPDATE)
      let release: () => void = () => {};
      const currentLock = txMutex;
      txMutex = new Promise<void>((resolve) => {
        release = resolve;
      });

      await currentLock;
      try {
        const txClient: any = {
          select: () => {
            const chain: any = {
              from: (table: any) => chain,
              where: (cond: any) => {
                // If querying tourDepartures
                return chain;
              },
              for: (mode: string) => chain,
              then: (resolve: (rows: any[]) => void) => {
                // Return current departure snapshot
                const dep = state.departures.get("dep-1");
                resolve(dep ? [{ ...dep }] : []);
              },
            };
            return chain;
          },
          update: (table: any) => {
            return {
              set: (values: any) => ({
                where: (cond: any) => {
                  const dep = state.departures.get("dep-1");
                  if (dep) {
                    Object.assign(dep, values);
                  }
                  return {
                    returning: () => Promise.resolve([dep]),
                  };
                },
              }),
            };
          },
        };
        return await fn(txClient);
      } finally {
        release();
      }
    },
  };

  return {
    ...actual,
    db: fakeDb,
  };
});

// ---------------------------------------------------------------------------
// Mock: auth
// ---------------------------------------------------------------------------
vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async (app: Express) => {
    app.use((req: any, _res: any, next: any) => {
      req.session = state.session.current;
      next();
    });
  },
  isAuthenticated: (req: any, res: any, next: any) => {
    if (!req.session?.userId) return res.status(401).json({ message: "Unauthorized" });
    next();
  },
  registerAuthRoutes: () => {},
}));

// ---------------------------------------------------------------------------
// Mock: workers, email, etc.
// ---------------------------------------------------------------------------
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
vi.mock("../../lib/email", () => ({
  sendNewBookingNotification: vi.fn(),
  sendEmail: vi.fn(),
  initEmailSystem: vi.fn(),
}));
vi.mock("../../lib/emailQueue", () => ({
  getQueueStats: vi.fn().mockResolvedValue({}),
  addEmailJob: vi.fn(),
}));
vi.mock("../../lib/tour-translation", () => ({
  autoFillTourTranslations: vi.fn().mockResolvedValue(undefined),
  maybeAutoTranslateTourInBackground: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: storage
// ---------------------------------------------------------------------------
vi.mock("../../storage", () => ({
  storage: {
    getOrCreateProfile: async (userId: string) => ({
      id: userId,
      userId,
      role: "customer",
      isActive: true,
    }),
    getProfileByUserId: async (userId: string) => ({ id: userId, userId, role: "customer" }),
    getProfileByUserIdWithEmail: async (userId: string) => ({
      id: userId,
      userId,
      role: "customer",
      user: { email: "cust@example.com", firstName: "Customer", lastName: "One" },
    }),
    getAllProfiles: async () => [],
    getDeparture: async (id: string) => state.departures.get(id),
    updateDeparture: async (id: string, data: any) => {
      const dep = state.departures.get(id);
      if (dep) Object.assign(dep, data);
      return dep;
    },
    getPublishedTours: async () => state.tours,
    getTour: async (id: string) => state.tours.find((t) => t.id === id),
    getAffiliateByCode: async () => undefined,
    createBooking: async (data: any) => {
      const b = { id: `bk-${state.bookings.length + 1}`, ...data };
      state.bookings.push(b);
      return b;
    },
    getAllCountries: async () => [],
    updateProfile: async () => ({}),
  },
}));

vi.mock("../../lib/pricing", () => ({
  pricingService: {
    calculateTourPrice: async () => ({ totalPrice: 500, currency: "USD" }),
  },
}));

vi.mock("../../services/rate-resolver", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/rate-resolver")>();
  return {
    ...actual,
    accommodationForTour: async () => ({
      total: "0",
      currency: "USD",
      nights: 0,
      breakdown: [],
      warnings: [],
    }),
    tourOffersRoomTypes: async () => false,
  };
});

import { registerBookingsRoutes } from "../../routes/bookingsRoutes";

function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use((req: any, _res: any, next: any) => {
    req.session = state.session.current;
    next();
  });
  registerBookingsRoutes(app);
  return app;
}

describe("US-03: Atomic Capacity Seat Hold on Booking Creation", () => {
  let app: Express;

  beforeEach(() => {
    state.bookings = [];
    state.departures.clear();
    state.departures.set("dep-1", {
      id: "dep-1",
      tourId: "tour-1",
      pricePerPerson: "500",
      capacityTotal: 10,
      capacityBooked: 0,
      status: "open",
    });
    app = buildApp();
  });

  it("atomically increments capacityBooked and creates booking with pending_payment and 30m hold", async () => {
    const beforeTime = Date.now();
    const res = await request(app)
      .post("/api/bookings")
      .send({
        tourId: "tour-1",
        departureId: "dep-1",
        partySizeExpected: 3,
      });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("pending_payment");
    expect(res.body.holdExpiresAt).toBeDefined();

    const holdTime = new Date(res.body.holdExpiresAt).getTime();
    const expectedApprox = beforeTime + 30 * 60 * 1000;
    // Within 1 minute tolerance
    expect(Math.abs(holdTime - expectedApprox)).toBeLessThan(60 * 1000);

    const dep = state.departures.get("dep-1")!;
    expect(dep.capacityBooked).toBe(3);
    expect(dep.status).toBe("open");
  });

  it("rejects booking with HTTP 409 (CAPACITY_EXCEEDED) when requested partySize exceeds remaining capacity", async () => {
    // 8 booked out of 10 total -> remaining = 2
    state.departures.set("dep-1", {
      id: "dep-1",
      tourId: "tour-1",
      pricePerPerson: "500",
      capacityTotal: 10,
      capacityBooked: 8,
      status: "open",
    });

    // Requesting 3 seats (8 + 3 = 11 > 10)
    const res = await request(app)
      .post("/api/bookings")
      .send({
        tourId: "tour-1",
        departureId: "dep-1",
        partySizeExpected: 3,
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CAPACITY_EXCEEDED");
    expect(res.body.message).toMatch(/not enough capacity/i);
    expect(res.body.capacityTotal).toBe(10);
    expect(res.body.capacityBooked).toBe(8);
    expect(res.body.capacityRemaining).toBe(2);

    // Departure capacity remains untouched
    const dep = state.departures.get("dep-1")!;
    expect(dep.capacityBooked).toBe(8);
    expect(state.bookings.length).toBe(0);
  });

  it("automatically transitions departure status to sold_out when departure is filled to capacity", async () => {
    state.departures.set("dep-1", {
      id: "dep-1",
      tourId: "tour-1",
      pricePerPerson: "500",
      capacityTotal: 10,
      capacityBooked: 8,
      status: "open",
    });

    const res = await request(app)
      .post("/api/bookings")
      .send({
        tourId: "tour-1",
        departureId: "dep-1",
        partySizeExpected: 2,
      });

    expect(res.status).toBe(200);
    const dep = state.departures.get("dep-1")!;
    expect(dep.capacityBooked).toBe(10);
    expect(dep.status).toBe("sold_out");
  });

  it("handles concurrent requests for the final seat: exactly one succeeds and the other gets 409", async () => {
    // 9 booked out of 10 -> exactly 1 seat left
    state.departures.set("dep-1", {
      id: "dep-1",
      tourId: "tour-1",
      pricePerPerson: "500",
      capacityTotal: 10,
      capacityBooked: 9,
      status: "open",
    });

    // Send two concurrent requests each trying to grab 1 seat
    const [res1, res2] = await Promise.all([
      request(app).post("/api/bookings").send({
        tourId: "tour-1",
        departureId: "dep-1",
        partySizeExpected: 1,
      }),
      request(app).post("/api/bookings").send({
        tourId: "tour-1",
        departureId: "dep-1",
        partySizeExpected: 1,
      }),
    ]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([200, 409]);

    const successRes = res1.status === 200 ? res1 : res2;
    const failRes = res1.status === 409 ? res1 : res2;

    expect(successRes.body.status).toBe("pending_payment");
    expect(failRes.body.code).toBe("CAPACITY_EXCEEDED");

    // Capacity must be strictly 10 (not 11)
    const dep = state.departures.get("dep-1")!;
    expect(dep.capacityBooked).toBe(10);
    expect(dep.status).toBe("sold_out");
    expect(state.bookings.length).toBe(1);
  });
});
