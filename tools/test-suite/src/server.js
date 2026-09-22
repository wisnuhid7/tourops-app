/**
 * TourOps Testing Suite & Dashboard Server
 * Runs visual testing dashboard on port 5050
 */
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts.js";
import { TestClient } from "./client.js";

import { runAuthFlow } from "./flows/auth.js";
import { runPublicCatalogFlow } from "./flows/publicCatalog.js";
import { runMasterDataFlow } from "./flows/masterData.js";
import { runSuppliersFlow } from "./flows/suppliers.js";
import { runTourAssemblyFlow } from "./flows/tourAssembly.js";
import { runPricingFlow } from "./flows/pricing.js";
import { runBookingsFlow } from "./flows/bookings.js";
import { runPassengersFlow } from "./flows/passengers.js";
import { runOperationsFlow } from "./flows/operations.js";
import { runTourLeaderFlow } from "./flows/tourLeader.js";
import { runAccountingFlow } from "./flows/accounting.js";
import { runRbacMatrix } from "./flows/rbacMatrix.js";
import { runFullCycleScenario } from "./scenarios/fullCycle.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.TEST_SUITE_PORT || 5050;
const API_TARGET = process.env.API_TARGET || "http://localhost:5001";
const APP_URL = process.env.APP_URL || "http://localhost:5173";

const testClient = new TestClient(API_TARGET);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const FLOWS = [
  { id: "auth", name: "1. Auth & Session Security", runner: runAuthFlow, category: "Core Security" },
  { id: "publicCatalog", name: "2. Public Catalog & Discovery", runner: runPublicCatalogFlow, category: "Public Experience" },
  { id: "masterData", name: "3. Master Data & Geographic", runner: runMasterDataFlow, category: "Destination" },
  { id: "suppliers", name: "4. Supplier Catalogs & Rates", runner: runSuppliersFlow, category: "Suppliers" },
  { id: "tourAssembly", name: "5. Tour Assembly & Itineraries", runner: runTourAssemblyFlow, category: "Tour Design" },
  { id: "pricing", name: "6. Dynamic Pricing Engine & Quotes", runner: runPricingFlow, category: "Pricing" },
  { id: "bookings", name: "7. Booking Engine & Allocations", runner: runBookingsFlow, category: "Bookings" },
  { id: "passengers", name: "8. Passenger Management & Portals", runner: runPassengersFlow, category: "Passengers" },
  { id: "operations", name: "9. Operations & 5-Step Fulfillment", runner: runOperationsFlow, category: "Operations" },
  { id: "tourLeader", name: "10. Tour Leader Manifests & Incidents", runner: runTourLeaderFlow, category: "Operations" },
  { id: "accounting", name: "11. Accounting & Financials", runner: runAccountingFlow, category: "Finance" },
  { id: "rbacMatrix", name: "12. RBAC Matrix Security Audit", runner: runRbacMatrix, category: "Security" },
];

/**
 * List all 17 testing accounts
 */
app.get("/api/accounts", (req, res) => {
  res.json({
    accounts: ACCOUNTS.map((acc) => ({
      ...acc,
      defaultPassword: TEST_PASSWORD,
      isLoggedIn: testClient.cookieJars.has(acc.username),
    })),
  });
});

/**
 * List all test flows
 */
app.get("/api/flows", (req, res) => {
  res.json({
    flows: FLOWS.map(({ id, name, category }) => ({ id, name, category })),
  });
});

/**
 * Run a specific flow
 */
app.post("/api/run-flow/:id", async (req, res) => {
  const { id } = req.params;
  const flow = FLOWS.find((f) => f.id === id);

  if (!flow) {
    return res.status(404).json({ error: `Flow ${id} not found` });
  }

  const startTime = Date.now();
  try {
    const result = await flow.runner(testClient);
    res.json({
      ...result,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    res.status(500).json({
      flowId: id,
      name: flow.name,
      passed: false,
      error: err.message,
      durationMs: Date.now() - startTime,
    });
  }
});

/**
 * Run all flows in sequence
 */
app.post("/api/run-all", async (req, res) => {
  const startTime = Date.now();
  const results = [];

  for (const flow of FLOWS) {
    try {
      const result = await flow.runner(testClient);
      results.push(result);
    } catch (err) {
      results.push({
        flowId: flow.id,
        name: flow.name,
        passed: false,
        error: err.message,
        steps: [{ name: "Flow execution crashed", passed: false, error: err.message }],
      });
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;

  res.json({
    totalCount,
    passedCount,
    allPassed: passedCount === totalCount,
    durationMs: Date.now() - startTime,
    results,
  });
});

/**
 * Run End-to-End full lifecycle scenario
 */
app.post("/api/run-scenario/full", async (req, res) => {
  const startTime = Date.now();
  try {
    const result = await runFullCycleScenario(testClient);
    res.json({
      ...result,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    res.status(500).json({
      scenarioId: "fullCycle",
      passed: false,
      error: err.message,
      durationMs: Date.now() - startTime,
    });
  }
});

/**
 * Impersonate role:
 * Proxies login to TourOps backend, forwards the Set-Cookie to the user's browser,
 * and redirects directly to the main Tourops application at http://localhost:5173!
 */
app.get("/impersonate/:username", async (req, res) => {
  const { username } = req.params;
  const account = ACCOUNTS.find((a) => a.username === username);

  if (!account) {
    return res.status(404).send(`Unknown account: ${username}`);
  }

  try {
    const loginRes = await fetch(`${API_TARGET}/api/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: API_TARGET,
      },
      body: JSON.stringify({ username, password: TEST_PASSWORD }),
    });

    if (!loginRes.ok) {
      return res.status(400).send(`Failed to authenticate ${username}: HTTP ${loginRes.status}`);
    }

    // Forward Set-Cookie headers to the browser
    const rawCookies = loginRes.headers.getSetCookie 
      ? loginRes.headers.getSetCookie() 
      : [loginRes.headers.get("set-cookie")].filter(Boolean);

    rawCookies.forEach((cookie) => {
      res.appendHeader("Set-Cookie", cookie);
    });

    // Redirect to TourOps App
    let targetPath = "/";
    if (account.role === "super_admin") targetPath = "/admin";
    else if (account.role === "operations_manager") targetPath = "/ops";
    else if (account.role === "tour_leader") targetPath = "/ops/tour-leader";
    else if (account.role === "accounting") targetPath = "/ops/accounting";

    res.redirect(`${APP_URL}${targetPath}`);
  } catch (err) {
    res.status(500).send(`Impersonation failed: ${err.message}`);
  }
});

/**
 * Backend health check
 */
app.get("/api/health", async (req, res) => {
  try {
    const backendRes = await fetch(`${API_TARGET}/api/environment`);
    const data = await backendRes.json().catch(() => null);
    res.json({
      testSuitePort: PORT,
      backendStatus: backendRes.ok ? "ONLINE" : "UNHEALTHY",
      backendUrl: API_TARGET,
      frontendUrl: APP_URL,
      backendData: data,
    });
  } catch (err) {
    res.json({
      testSuitePort: PORT,
      backendStatus: "OFFLINE",
      backendUrl: API_TARGET,
      frontendUrl: APP_URL,
      error: err.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(` TourOps Test Suite & Role Testing Dashboard LIVE!`);
  console.log(` URL: http://localhost:${PORT}`);
  console.log(` Target API: ${API_TARGET}`);
  console.log(` Main Web App: ${APP_URL}`);
  console.log(`======================================================\n`);
});
