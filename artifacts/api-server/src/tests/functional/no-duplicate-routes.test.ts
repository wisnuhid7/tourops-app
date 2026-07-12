/**
 * Guardrail against shadowed duplicate route registrations.
 *
 * `registerRoutes` builds one large Express app by registering hundreds of
 * method+path handlers in sequence. Express dispatches a request to the FIRST
 * matching handler and silently ignores any later duplicate of the same
 * method+path. This has already bitten this codebase twice:
 *   - a duplicate audit-log route, and
 *   - a duplicate flight-search route whose two copies had DIFFERENT auth.
 *
 * When two copies exist, a fix (or an auth gate) applied to the second copy is
 * dead code — the first registration wins — so a security gap can hide behind a
 * handler that looks correct. This test enumerates every registered method+path
 * pair and fails if any exact duplicate exists, catching the problem before it
 * ships regardless of which specific route is affected.
 *
 * The DB, auth, and Redis-backed workers are mocked so we can register the REAL
 * routes without touching live infrastructure.
 */
import { describe, it, expect, vi } from "vitest";
import express, { type Express } from "express";
import { createServer } from "http";

// Neutralize infra the route module touches at import/registration time.
vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }) }),
  },
  countries: {},
  cities: {},
  tourDays: {},
  tourDepartures: {},
  // Insert schemas are imported by name; a permissive stub is enough since we
  // never execute a handler here, only register the routes.
  ...Object.fromEntries(
    [
      "insertTourSchema", "insertTourDepartureSchema", "insertBookingSchema",
      "insertTravelerSchema", "insertBookingAssignmentSchema", "insertMessageSchema",
      "insertDocumentSchema", "insertPaymentSchema", "insertTourDaySchema", "insertTourDayItemSchema",
      "insertCountrySchema", "insertCitySchema", "insertAirportSchema",
      "insertSightSchema", "insertHotelSchema", "insertTransportCompanySchema", "insertAirlineAgencySchema",
      "insertBusTypeSchema", "insertTransportRouteSchema", "insertTransportRoutePricingSchema",
      "insertTransportBookingSchema", "insertTransportInvoiceSchema", "insertTransportPaymentSchema",
      "insertHotelRateSchema", "insertTransportRateSchema", "insertGuideRateSchema", "insertSightsRateSchema", "insertAirlineRateSchema",
      "insertBookingWorkflowSchema", "insertWorkflowStepSchema", "insertInvoiceSchema",
      "insertAffiliateSchema", "insertMarkupRuleSchema",
    ].map((k) => [k, { safeParse: () => ({ success: true, data: {} }) }]),
  ),
}));

vi.mock("../../replit_integrations/auth", () => ({
  setupAuth: async () => {},
  isAuthenticated: (_req: any, _res: any, next: any) => next(),
  registerAuthRoutes: () => {},
}));

vi.mock("../../lib/workers", () => ({
  queues: {},
  startWorkers: vi.fn(),
}));
vi.mock("ioredis", () => ({
  default: function () {
    return { on: vi.fn(), quit: vi.fn() };
  },
}));

import { registerRoutes } from "../../routes/routes";

type RouteLayer = {
  route?: { path: string | string[]; methods: Record<string, boolean> };
};

function collectRoutes(app: Express): string[] {
  // Express 5 exposes the router at `app.router`; fall back to `_router` for safety.
  const stack: RouteLayer[] =
    (app as any).router?.stack ?? (app as any)._router?.stack ?? [];
  const pairs: string[] = [];
  for (const layer of stack) {
    if (!layer.route) continue;
    const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
    for (const method of Object.keys(layer.route.methods)) {
      if (method === "_all") continue;
      for (const p of paths) {
        pairs.push(`${method.toUpperCase()} ${p}`);
      }
    }
  }
  return pairs;
}

describe("registered routes have no shadowed duplicates", () => {
  it("registers each method+path exactly once", async () => {
    const app = express();
    app.use(express.json());
    const server = createServer(app);
    await registerRoutes(server, app);

    const pairs = collectRoutes(app);

    // Sanity check: we actually walked a populated route table.
    expect(pairs.length).toBeGreaterThan(0);

    const seen = new Map<string, number>();
    for (const pair of pairs) {
      seen.set(pair, (seen.get(pair) ?? 0) + 1);
    }
    const duplicates = [...seen.entries()]
      .filter(([, count]) => count > 1)
      .map(([pair, count]) => `${pair} (registered ${count}×)`);

    expect(
      duplicates,
      `Shadowed duplicate route registration(s) detected. Express serves the ` +
        `FIRST registration and ignores the rest, so a later copy (and any auth ` +
        `gate on it) is dead code. Collapse each to a single definition:\n` +
        duplicates.join("\n"),
    ).toEqual([]);
  });
});
