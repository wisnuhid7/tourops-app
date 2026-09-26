/**
 * Standalone DOM Test Runner for all 18 Roles
 */
import { BrowserController } from "./browser.js";
import { testAll18RolesDom } from "./scenarios/10_all_18_roles_dom_test.ui.js";

async function main() {
  console.log("============================================================");
  console.log("  TourOps: Testing All 18 Roles via Browser DOM & Playwright");
  console.log("============================================================\n");

  const browserCtrl = new BrowserController({
    baseUrl: process.env.APP_URL || "http://localhost:5173",
    apiUrl: process.env.API_TARGET || "http://localhost:5001",
    headless: true,
  });

  const startTime = Date.now();
  try {
    const report = await testAll18RolesDom(browserCtrl);
    await browserCtrl.close();

    console.log(`Test Execution Finished in ${((Date.now() - startTime) / 1000).toFixed(2)}s\n`);
    console.log("--------------------------------------------------------------------------------------------------------");
    console.log(
      `| ${"No".padEnd(3)} | ${"Role".padEnd(20)} | ${"Account".padEnd(18)} | ${"Landing".padEnd(18)} | ${"Status".padEnd(8)} |`
    );
    console.log("--------------------------------------------------------------------------------------------------------");

    let passedCount = 0;
    report.steps.forEach((step, idx) => {
      const num = String(idx + 1).padEnd(3);
      const role = (step.role || "").padEnd(20);
      const acc = (step.username || "").padEnd(18);
      const landing = (step.landing || "").padEnd(18);
      const status = step.passed ? "✅ PASS" : "❌ FAIL";
      if (step.passed) passedCount++;

      console.log(`| ${num} | ${role} | ${acc} | ${landing} | ${status.padEnd(8)} |`);
      if (!step.passed) {
        console.log(`     ↳ Details: ${step.details}`);
      }
      if (step.error) {
        console.log(`     ↳ Error: ${step.error}`);
      }
    });

    console.log("--------------------------------------------------------------------------------------------------------\n");
    console.log(`Summary: ${passedCount} / ${report.steps.length} Roles Passed DOM Verification.`);

    if (report.passed) {
      console.log("🎉 SUCCESS: All 18 Roles verified successfully in the DOM!\n");
      process.exit(0);
    } else {
      console.error("⚠️ Some roles failed DOM verification.\n");
      process.exit(1);
    }
  } catch (err) {
    await browserCtrl.close().catch(() => {});
    console.error("Runner encountered fatal error:", err);
    process.exit(1);
  }
}

main();
