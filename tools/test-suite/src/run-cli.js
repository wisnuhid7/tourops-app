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

const API_TARGET = process.env.API_TARGET || "http://localhost:5001";
const client = new TestClient(API_TARGET);

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
  { id: "fullCycle", name: "13. Full Lifecycle Scenario", runner: runFullCycleScenario, category: "E2E" },
];

async function main() {
  console.log("============================================================");
  console.log("  TourOps: Running Complete Backend Integration & E2E Flows");
  console.log(`  Target API: ${API_TARGET}`);
  console.log("============================================================\n");

  const results = [];
  const failures = [];

  for (const flow of FLOWS) {
    const start = Date.now();
    try {
      const res = await flow.runner(client);
      const duration = ((Date.now() - start) / 1000).toFixed(2);
      const passed = res.passed !== false;
      results.push({ ...res, duration, name: flow.name, id: flow.id, passed });

      if (passed) {
        console.log(`✅ [PASS] ${flow.name} (${duration}s)`);
      } else {
        console.log(`❌ [FAIL] ${flow.name} (${duration}s)`);
        const failedSteps = (res.steps || []).filter((s) => !s.passed);
        failedSteps.forEach((s) => {
          console.log(`     ↳ Step: ${s.name}`);
          if (s.error) console.log(`       Error: ${s.error}`);
          if (s.details) console.log(`       Details: ${JSON.stringify(s.details)}`);
          failures.push({
            flow: flow.name,
            flowId: flow.id,
            step: s.name,
            error: s.error || s.details,
            fullStep: s,
          });
        });
        if (failedSteps.length === 0 && res.error) {
          console.log(`     ↳ Error: ${res.error}`);
          failures.push({
            flow: flow.name,
            flowId: flow.id,
            step: "Flow Root",
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

  console.log("\n============================================================");
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Summary: ${passedCount} / ${results.length} Flows Passed.`);
  console.log(`Total Failures/Defects Detected: ${failures.length}`);
  console.log("============================================================\n");

  if (failures.length > 0) {
    import("fs").then((fs) => {
      fs.writeFileSync(".tmp-test-failures.json", JSON.stringify(failures, null, 2));
    });
  }
}

main();
