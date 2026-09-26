/**
 * TourOps UI Testing Tool & Visual Runner Server
 * Runs interactive UI testing dashboard on port 5055
 */
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { BrowserController } from "./browser.js";
import { ACCOUNTS } from "./accounts.js";

import { testLandingAndAuth } from "./scenarios/01_landing_and_auth.ui.js";
import { testCustomerBookingFlow } from "./scenarios/02_customer_booking_flow.ui.js";
import { testTourBuilderAssembly } from "./scenarios/03_tour_builder_assembly.ui.js";
import { testPricingEngineOverrides } from "./scenarios/04_pricing_engine_overrides.ui.js";
import { testOperationsWorkflowChecklist } from "./scenarios/05_operations_workflow_checklist.ui.js";
import { testTourLeaderManifest } from "./scenarios/06_tour_leader_manifest.ui.js";
import { testSupplierPortalRates } from "./scenarios/07_supplier_portal_rates.ui.js";
import { testAccountingPayments } from "./scenarios/08_accounting_payments.ui.js";
import { testRbacUiNavigationAudit } from "./scenarios/09_rbac_ui_navigation_audit.ui.js";
import { testAll18RolesDom } from "./scenarios/10_all_18_roles_dom_test.ui.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.UI_TESTER_PORT || 5055;
const APP_URL = process.env.APP_URL || "http://localhost:5173";
const API_TARGET = process.env.API_TARGET || "http://localhost:5001";

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public")));

const UI_FLOWS = [
  {
    id: "01_landing_and_auth",
    name: "1. Landing, Catalog & Auth UI",
    category: "Authentication",
    description: "Verifies landing page, public tour cards, and login portal validation.",
    runner: testLandingAndAuth,
  },
  {
    id: "02_customer_booking_flow",
    name: "2. Customer Booking & Traveler Portal UI",
    category: "Customer Experience",
    description: "Tests tour discovery, my-bookings history, and passenger management.",
    runner: testCustomerBookingFlow,
  },
  {
    id: "03_tour_builder_assembly",
    name: "3. Tour Builder & Assembly UI",
    category: "Tour Design",
    description: "Inspects Tour Builder workspace, day-by-day components, and role sidebar.",
    runner: testTourBuilderAssembly,
  },
  {
    id: "04_pricing_engine_overrides",
    name: "4. Pricing Engine & Quotes UI",
    category: "Pricing & Margins",
    description: "Audits margin adjustment rules, group quotes backlog, and pax tables.",
    runner: testPricingEngineOverrides,
  },
  {
    id: "05_operations_workflow_checklist",
    name: "5. Operations & 5-Step Fulfillment UI",
    category: "Operations",
    description: "Evaluates operations dashboard, workflow service checklist, and staff dispatch.",
    runner: testOperationsWorkflowChecklist,
  },
  {
    id: "06_tour_leader_manifest",
    name: "6. Tour Leader & Manifest Privacy UI",
    category: "Field Operations",
    description: "Checks mobile manifest readiness with strict financial data isolation.",
    runner: testTourLeaderManifest,
  },
  {
    id: "07_supplier_portal_rates",
    name: "7. Supplier Portals & Rate Cards UI",
    category: "Supply Chain",
    description: "Verifies hotel inventory dashboard and transport manager route portals.",
    runner: testSupplierPortalRates,
  },
  {
    id: "08_accounting_payments",
    name: "8. Accounting & Financial Audit UI",
    category: "Finance",
    description: "Tests accounting ledger and verifies client-side guard blocking non-finance roles.",
    runner: testAccountingPayments,
  },
  {
    id: "09_rbac_ui_navigation_audit",
    name: "9. RBAC UI Navigation & Route Guards",
    category: "Security & Access",
    description: "Tests client-side routing redirections for customer, supplier, and admin.",
    runner: testRbacUiNavigationAudit,
  },
  {
    id: "10_all_18_roles_dom_test",
    name: "10. All 18 Roles Comprehensive DOM Audit",
    category: "Security & RBAC",
    description: "Full DOM tree, username, role badges, and client-side route barriers for all 18 roles.",
    runner: testAll18RolesDom,
  },
];

/**
 * Health check
 */
app.get("/api/health", (req, res) => {
  res.json({
    status: "ONLINE",
    port: PORT,
    appUrl: APP_URL,
    apiUrl: API_TARGET,
  });
});

/**
 * List all available UI testing flows
 */
app.get("/api/flows", (req, res) => {
  res.json({
    flows: UI_FLOWS.map(({ id, name, category, description }) => ({
      id,
      name,
      category,
      description,
    })),
  });
});

/**
 * Execute a single UI flow
 */
app.post("/api/run-flow/:id", async (req, res) => {
  const { id } = req.params;
  const { headless = true, viewport = "desktop" } = req.body;
  const flow = UI_FLOWS.find((f) => f.id === id);

  if (!flow) {
    return res.status(404).json({ error: `Flow ${id} not found` });
  }

  const browserCtrl = new BrowserController({
    baseUrl: APP_URL,
    apiUrl: API_TARGET,
    headless: Boolean(headless),
    viewport,
  });

  const startTime = Date.now();
  try {
    const result = await flow.runner(browserCtrl);
    await browserCtrl.close();
    res.json({
      ...result,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    await browserCtrl.close().catch(() => {});
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
 * Execute all UI flows in sequence
 */
app.post("/api/run-all", async (req, res) => {
  const { headless = true, viewport = "desktop" } = req.body;
  const results = [];
  const startTime = Date.now();

  for (const flow of UI_FLOWS) {
    const browserCtrl = new BrowserController({
      baseUrl: APP_URL,
      apiUrl: API_TARGET,
      headless: Boolean(headless),
      viewport,
    });

    const flowStart = Date.now();
    try {
      const result = await flow.runner(browserCtrl);
      await browserCtrl.close();
      results.push({ ...result, durationMs: Date.now() - flowStart });
    } catch (err) {
      await browserCtrl.close().catch(() => {});
      results.push({
        flowId: flow.id,
        name: flow.name,
        passed: false,
        error: err.message,
        durationMs: Date.now() - flowStart,
      });
    }
  }

  res.json({
    totalFlows: UI_FLOWS.length,
    passedCount: results.filter((r) => r.passed).length,
    allPassed: results.every((r) => r.passed),
    durationMs: Date.now() - startTime,
    results,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`[TourOps UI Tester] Visual UI test server listening on http://localhost:${PORT}`);
  console.log(`[TourOps UI Tester] Testing target Tourops App at ${APP_URL}`);
});

