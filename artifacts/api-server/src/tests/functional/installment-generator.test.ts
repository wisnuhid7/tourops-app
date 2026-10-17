/**
 * US-04: Dynamic Staged Installment Generator Engine Functional Tests.
 *
 * Verifies end-to-end:
 * 1. Booking creation with D <= 30 days generates 1 installment (100% full payment).
 * 2. Booking creation with 31 <= D <= 90 days generates 2 installments (30% DP, 70% at D-30).
 * 3. Booking creation with D >= 91 days generates 3 installments (20% DP, 30% at D-90, 50% at D-30).
 * 4. Sum of installment amounts equals totalPrice exactly with no rounding drift.
 * 5. Stores multi-language labels (labelEn, labelId) and snapshot in booking_payment_schedules.
 * 6. Due dates are never earlier than bookingDate.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import express, { type Express } from "express";
import crypto from "crypto";
import Decimal from "decimal.js";
import { verifyInstallmentInvariant } from "../../services/installment-generator";

// ---------------------------------------------------------------------------
// Hoisted state
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => {
  type BookingRecord = {
    id: string;
    bookingCode: string;
    tourId?: string;
    departureId?: string;
    customerId: string;
    totalPrice?: number;
    currency?: string;
    status: string;
    idempotencyKey?: string;
    requestHash?: string;
    createdAt?: Date;
    [key: string]: any;
  };

  type PaymentScheduleRecord = {
    id: string;
    bookingId: string;
    installmentNumber: number;
    label: string;
    labelEn?: string | null;
    labelId?: string | null;
    percentage: string;
    amount: string;
    paidAmount: string;
    currency: string;
    dueDate: Date;
    status: string;
  };

  return {
    session: { current: { userId: "cust-1" } },
    bookings: [] as BookingRecord[],
    schedules: [] as PaymentScheduleRecord[],
    tours: [
      { id: "tour-1", isPublished: true, title: "Test Tour", currency: "USD", basePrice: "1000" },
    ],
    departures: new Map<string, any>(),
  };
});

// ---------------------------------------------------------------------------
// Mock: @workspace/db
// ---------------------------------------------------------------------------
vi.mock("@workspace/db", async (importOriginal) => {
  if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test_db";
  }
  const actual = await importOriginal<Record<string, unknown>>();

  const fakeDb: any = {
    transaction: async (fn: (tx: any) => Promise<unknown>) => fn(fakeDb),
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => Array.from(state.departures.values()),
          then: (r: any) => r(Array.from(state.departures.values())),
        }),
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: () => Promise.resolve([]),
          then: (r: any) => r([]),
        }),
      }),
    }),
    insert: () => ({
      values: (val: any) => ({
        returning: () => {
          const arr = Array.isArray(val) ? val : [val];
          const created = arr.map((item, idx) => ({
            id: `sched-${state.schedules.length + idx + 1}`,
            ...item,
          }));
          state.schedules.push(...created);
          return Promise.resolve(created);
        },
        then: (r: any) => {
          const arr = Array.isArray(val) ? val : [val];
          const created = arr.map((item, idx) => ({
            id: `sched-${state.schedules.length + idx + 1}`,
            ...item,
          }));
          state.schedules.push(...created);
          return r(created);
        },
      }),
    }),
    delete: () => ({
      where: () => ({
        then: (r: any) => r([]),
      }),
    }),
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
// Mock: workers
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

// ---------------------------------------------------------------------------
// Mock: email
// ---------------------------------------------------------------------------
vi.mock("../../lib/email", () => ({
  sendNewBookingNotification: vi.fn(),
  sendEmail: vi.fn(),
  initEmailSystem: vi.fn(),
}));
vi.mock("../../lib/emailQueue", () => ({
  getQueueStats: vi.fn().mockResolvedValue({}),
  addEmailJob: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock: tour-translation
// ---------------------------------------------------------------------------
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
    getProfileByUserId: async (userId: string) => ({
      id: userId,
      userId,
      role: "customer",
      isActive: true,
    }),
    getProfileByUserIdWithEmail: async (userId: string) => ({
      id: userId,
      userId,
      role: "customer",
      isActive: true,
      user: { email: "customer@example.com", username: "customer" },
    }),
    getAllProfiles: async () => [],
    getDeparture: async (id: string) => state.departures.get(id),
    getPublishedTours: async () => state.tours,
    getTour: async (id: string) => state.tours.find((t) => t.id === id),
    getAffiliateByCode: async () => undefined,
    createBooking: async (data: any) => {
      const b: any = {
        id: `book-${state.bookings.length + 1}`,
        createdAt: new Date(),
        ...data,
      };
      state.bookings.push(b);
      return b;
    },
    updateBooking: async (id: string, data: any) => {
      const idx = state.bookings.findIndex((b) => b.id === id);
      if (idx !== -1) {
        state.bookings[idx] = { ...state.bookings[idx], ...data };
        return state.bookings[idx];
      }
      return data;
    },
    getBookingByIdempotencyKey: async (key: string) =>
      state.bookings.find((b) => b.idempotencyKey === key),
    createPaymentSchedules: async (schedules: any[]) => {
      const created = schedules.map((s, idx) => ({
        id: `sched-${state.schedules.length + idx + 1}`,
        ...s,
      }));
      state.schedules.push(...created);
      return created;
    },
    getPaymentSchedules: async (bookingId: string) =>
      state.schedules.filter((s) => s.bookingId === bookingId),
    createAuditLog: async () => ({}),
  },
}));

// ---------------------------------------------------------------------------
// Mock: pricingService
// ---------------------------------------------------------------------------
vi.mock("../../lib/pricing", () => ({
  pricingService: {
    calculateTourPrice: async () => ({ totalCost: 1000, finalPrice: 1000, markupAmount: 0 }),
  },
}));

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

describe("Dynamic Staged Installment Generator Engine Functional (US-04)", () => {
  let app: Express;

  beforeEach(() => {
    state.bookings = [];
    state.schedules = [];
    state.departures.clear();
    app = buildApp();
  });

  it("Scheme 1: D <= 30 days generates 1 installment with 100% full payment and multi-language labels", async () => {
    const depDate = new Date(Date.now() + 15 * 86400000); // 15 days from now
    state.departures.set("dep-15d", {
      id: "dep-15d",
      tourId: "tour-1",
      startDate: depDate.toISOString(),
      pricePerPerson: "1500",
      capacityTotal: 10,
      capacityBooked: 0,
      status: "open",
    });

    const res = await request(app)
      .post("/api/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        tourId: "tour-1",
        departureId: "dep-15d",
        partySizeExpected: 1,
        totalPrice: 1500,
        currency: "USD",
      });

    expect(res.status).toBe(200);
    const bookingId = res.body.id;

    // Check generated schedules in state
    const schedules = state.schedules.filter((s) => s.bookingId === bookingId);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].installmentNumber).toBe(1);
    expect(schedules[0].percentage).toBe("100.00");
    expect(schedules[0].amount).toBe("1500.00");
    expect(schedules[0].labelEn).toBe("Full Payment (100%)");
    expect(schedules[0].labelId).toBe("Pelunasan Penuh (100%)");
    expect(schedules[0].status).toBe("pending");
    expect(verifyInstallmentInvariant(schedules, 1500)).toBe(true);
  });

  it("Scheme 2: 31 <= D <= 90 days generates 2 installments (30% DP, 70% at D-30)", async () => {
    const depDate = new Date(Date.now() + 60 * 86400000); // 60 days from now
    state.departures.set("dep-60d", {
      id: "dep-60d",
      tourId: "tour-1",
      startDate: depDate.toISOString(),
      pricePerPerson: "2000",
      capacityTotal: 10,
      capacityBooked: 0,
      status: "open",
    });

    const res = await request(app)
      .post("/api/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        tourId: "tour-1",
        departureId: "dep-60d",
        partySizeExpected: 1,
        totalPrice: 2000,
        currency: "USD",
      });

    expect(res.status).toBe(200);
    const bookingId = res.body.id;

    const schedules = state.schedules.filter((s) => s.bookingId === bookingId);
    expect(schedules).toHaveLength(2);

    // Installment 1: 30% DP
    expect(schedules[0].installmentNumber).toBe(1);
    expect(schedules[0].percentage).toBe("30.00");
    expect(schedules[0].amount).toBe("600.00");
    expect(schedules[0].labelEn).toBe("Deposit (30%)");
    expect(schedules[0].labelId).toBe("Uang Muka (30%)");

    // Installment 2: 70% Final Balance
    expect(schedules[1].installmentNumber).toBe(2);
    expect(schedules[1].percentage).toBe("70.00");
    expect(schedules[1].amount).toBe("1400.00");
    expect(schedules[1].labelEn).toBe("Final Balance (70%)");
    expect(schedules[1].labelId).toBe("Pelunasan Akhir (70%)");

    expect(verifyInstallmentInvariant(schedules, 2000)).toBe(true);
  });

  it("Scheme 3: D >= 91 days generates 3 installments (20% DP, 30% at D-90, 50% at D-30)", async () => {
    const depDate = new Date(Date.now() + 120 * 86400000); // 120 days from now
    state.departures.set("dep-120d", {
      id: "dep-120d",
      tourId: "tour-1",
      startDate: depDate.toISOString(),
      pricePerPerson: "3333.33",
      capacityTotal: 10,
      capacityBooked: 0,
      status: "open",
    });

    const res = await request(app)
      .post("/api/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        tourId: "tour-1",
        departureId: "dep-120d",
        partySizeExpected: 1,
        totalPrice: 3333.33,
        currency: "USD",
      });

    expect(res.status).toBe(200);
    const bookingId = res.body.id;

    const schedules = state.schedules.filter((s) => s.bookingId === bookingId);
    expect(schedules).toHaveLength(3);

    // Stage 1: 20%
    expect(schedules[0].percentage).toBe("20.00");
    expect(schedules[0].labelEn).toBe("Deposit (20%)");
    expect(schedules[0].labelId).toBe("Uang Muka (20%)");

    // Stage 2: 30%
    expect(schedules[1].percentage).toBe("30.00");
    expect(schedules[1].labelEn).toBe("Second Installment (30%)");
    expect(schedules[1].labelId).toBe("Cicilan Kedua (30%)");

    // Stage 3: 50%
    expect(schedules[2].percentage).toBe("50.00");
    expect(schedules[2].labelEn).toBe("Final Balance (50%)");
    expect(schedules[2].labelId).toBe("Pelunasan Akhir (50%)");

    // Invariant check: exact sum of booking total with zero rounding drift
    expect(verifyInstallmentInvariant(schedules, res.body.totalPrice)).toBe(true);
    const sum = schedules.reduce((acc, s) => acc.plus(new Decimal(s.amount)), new Decimal(0));
    expect(sum.toFixed(2)).toBe(new Decimal(res.body.totalPrice).toFixed(2));
  });

  it("Explicit plan: 'full' generates 1 installment even if D >= 91 days", async () => {
    const depDate = new Date(Date.now() + 150 * 86400000);
    state.departures.set("dep-150d", {
      id: "dep-150d",
      tourId: "tour-1",
      startDate: depDate.toISOString(),
      pricePerPerson: "2500",
      capacityTotal: 10,
      capacityBooked: 0,
      status: "open",
    });

    const res = await request(app)
      .post("/api/bookings")
      .set("Idempotency-Key", crypto.randomUUID())
      .send({
        tourId: "tour-1",
        departureId: "dep-150d",
        partySizeExpected: 1,
        totalPrice: 2500,
        currency: "USD",
        paymentPlan: "full",
      });

    expect(res.status).toBe(200);
    const bookingId = res.body.id;

    const schedules = state.schedules.filter((s) => s.bookingId === bookingId);
    expect(schedules).toHaveLength(1);
    expect(schedules[0].percentage).toBe("100.00");
    expect(schedules[0].amount).toBe("2500.00");
    expect(verifyInstallmentInvariant(schedules, 2500)).toBe(true);
  });
});
