import { BrowserController } from "./browser.js";
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
import fs from "fs";

const UI_FLOWS = [
  { id: "01_landing_and_auth", name: "1. Landing, Catalog & Auth UI", runner: testLandingAndAuth },
  { id: "02_customer_booking_flow", name: "2. Customer Booking & Traveler Portal UI", runner: testCustomerBookingFlow },
  { id: "03_tour_builder_assembly", name: "3. Tour Builder & Assembly UI", runner: testTourBuilderAssembly },
  { id: "04_pricing_engine_overrides", name: "4. Pricing Engine & Quotes UI", runner: testPricingEngineOverrides },
  { id: "05_operations_workflow_checklist", name: "5. Operations & 5-Step Fulfillment UI", runner: testOperationsWorkflowChecklist },
  { id: "06_tour_leader_manifest", name: "6. Tour Leader & Manifest Privacy UI", runner: testTourLeaderManifest },
  { id: "07_supplier_portal_rates", name: "7. Supplier Portals & Rate Cards UI", runner: testSupplierPortalRates },
  { id: "08_accounting_payments", name: "8. Accounting & Financial Audit UI", runner: testAccountingPayments },
  { id: "09_rbac_ui_navigation_audit", name: "9. RBAC UI Navigation & Route Guards", runner: testRbacUiNavigationAudit },
  { id: "10_all_18_roles_dom_test", name: "10. All 18 Roles Comprehensive DOM Audit", runner: testAll18RolesDom },
];

async function main() {
  console.log("============================================================");
  console.log("  TourOps: Testing All UI Flows (Playwright Headless)");
  console.log("============================================================\n");

  const browserCtrl = new BrowserController({
    baseUrl: process.env.APP_URL || "http://localhost:5173",
    apiUrl: process.env.API_TARGET || "http://localhost:5001",
    headless: true,
  });

  const results = [];
  const failures = [];

  for (const flow of UI_FLOWS) {
    const start = Date.now();
    try {
      const res = await flow.runner(browserCtrl);
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const passed = res.passed !== false;
      results.push({ ...res, duration, name: flow.name, id: flow.id, passed });

      if (passed) {
        console.log(`✅ [PASS] ${flow.name} (${duration}s)`);
      } else {
        console.log(`❌ [FAIL] ${flow.name} (${duration}s)`);
        const failedSteps = (res.steps || []).filter((s) => !s.passed);
        failedSteps.forEach((s) => {
          console.log(`     ↳ Step: ${s.name || s.role || "Unknown"}`);
          if (s.error) console.log(`       Error: ${s.error}`);
          if (s.details) console.log(`       Details: ${s.details}`);
          failures.push({
            flow: flow.name,
            flowId: flow.id,
            step: s.name || s.role || "Failed Step",
            error: s.error || s.details,
            fullStep: s,
          });
        });
        if (failedSteps.length === 0 && res.error) {
          console.log(`     ↳ Error: ${res.error}`);
          failures.push({
            flow: flow.name,
            flowId: flow.id,
            step: "Root Error",
            error: res.error,
          });
        }
      }
    } catch (err) {
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      console.log(`💥 [CRASH] ${flow.name} (${duration}s): ${err.message}`);
      results.push({ id: flow.id, name: flow.name, passed: false, duration, error: err.message, stack: err.stack });
      failures.push({
        flow: flow.name,
        flowId: flow.id,
        step: "Execution Exception",
        error: err.message,
        stack: err.stack,
      });
    }
  }

  await browserCtrl.close().catch(() => {});

  console.log("\n============================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`UI Summary: ${passedCount} / ${results.length} Scenarios Passed.`);
  console.log(`UI Failures Detected: ${failures.length}`);
  console.log("============================================================\n");

  fs.writeFileSync(".tmp-ui-failures.json", JSON.stringify({ results, failures }, null, 2));
}

main().catch((err) => {
  console.error("Fatal UI test runner error:", err);
  process.exit(1);
});
