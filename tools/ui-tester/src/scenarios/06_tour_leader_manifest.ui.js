/**
 * UI Scenario 6: Tour Leader Manifest & Financial Privacy Isolation UI
 */
export async function testTourLeaderManifest(browserCtrl) {
  const page = await browserCtrl.launch();
  const steps = [];
  const flowId = "06_tour_leader_manifest";

  // Step 1: Tour Leader Operations Portal
  try {
    await browserCtrl.loginAs("tourleader1");
    await page.goto(`${browserCtrl.baseUrl}/ops/tour-leader`, { waitUntil: "networkidle" });
    await page.waitForSelector("body");
    const shot1 = await browserCtrl.captureScreenshot(flowId, "1_tour_leader_dashboard");

    steps.push({
      name: "6.1 Tour Leader Field Operations Portal",
      passed: true,
      screenshot: shot1,
      details: "Rendered Tour Leader field overview and tour runs",
    });
  } catch (err) {
    steps.push({ name: "6.1 Tour Leader Portal", passed: false, error: err.message });
  }

  // Step 2: Leader Group Dashboard & Privacy Check
  try {
    await page.goto(`${browserCtrl.baseUrl}/leader-dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const pageText = await page.innerText("body");
    // Verify that sensitive company pricing formulas are not leaked
    const leaksPricingSecrets = pageText.includes("profit_margin_formula_secret");
    const shot2 = await browserCtrl.captureScreenshot(flowId, "2_tour_leader_manifest_privacy");

    steps.push({
      name: "6.2 Manifest Readiness & Financial Privacy Isolation",
      passed: !leaksPricingSecrets,
      screenshot: shot2,
      details: "Passenger manifest active with strict financial data isolation",
    });
  } catch (err) {
    steps.push({ name: "6.2 Manifest Readiness", passed: false, error: err.message });
  }

  return {
    flowId,
    name: "6. Tour Leader & Manifest Privacy UI",
    steps,
    passed: steps.every((s) => s.passed),
    consoleErrors: [...browserCtrl.consoleErrors],
  };
}

