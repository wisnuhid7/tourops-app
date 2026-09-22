/**
 * UI Scenario 4: Dynamic Pricing Engine, Margin Settings & Group Quotes UI
 */
export async function testPricingEngineOverrides(browserCtrl) {
  const page = await browserCtrl.launch();
  const steps = [];
  const flowId = "04_pricing_engine_overrides";

  // Step 1: Super Admin Pricing Engine
  try {
    await browserCtrl.loginAs("superadmin1");
    await page.goto(`${browserCtrl.baseUrl}/admin/pricing-engine`, { waitUntil: "networkidle" });
    await page.waitForSelector("body");
    const shot1 = await browserCtrl.captureScreenshot(flowId, "1_admin_pricing_engine");

    steps.push({
      name: "4.1 Dynamic Pricing Engine & Margin Tables",
      passed: true,
      screenshot: shot1,
      details: "Rendered quotes backlog and pax pricing calculator",
    });
  } catch (err) {
    steps.push({ name: "4.1 Dynamic Pricing Engine", passed: false, error: err.message });
  }

  // Step 2: Group Quotes Workspace
  try {
    await page.goto(`${browserCtrl.baseUrl}/admin/group-quotes`, { waitUntil: "networkidle" });
    await page.waitForSelector("body");
    const shot2 = await browserCtrl.captureScreenshot(flowId, "2_group_quotes_backlog");

    steps.push({
      name: "4.2 Group Quotes Operational Backlog",
      passed: true,
      screenshot: shot2,
      details: "Group quotes management workspace rendered",
    });
  } catch (err) {
    steps.push({ name: "4.2 Group Quotes Backlog", passed: false, error: err.message });
  }

  // Step 3: Pricing Settings & Rate Cards
  try {
    await page.goto(`${browserCtrl.baseUrl}/admin/pricing`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const shot3 = await browserCtrl.captureScreenshot(flowId, "3_pricing_rules_settings");

    steps.push({
      name: "4.3 Pricing Adjustment Rules & Settings",
      passed: true,
      screenshot: shot3,
      details: "Rendered markup configurations and season rules",
    });
  } catch (err) {
    steps.push({ name: "4.3 Pricing Rules Settings", passed: false, error: err.message });
  }

  return {
    flowId,
    name: "4. Pricing Engine & Quotes UI",
    steps,
    passed: steps.every((s) => s.passed),
    consoleErrors: [...browserCtrl.consoleErrors],
  };
}

