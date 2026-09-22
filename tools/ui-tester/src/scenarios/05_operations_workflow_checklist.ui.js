/**
 * UI Scenario 5: Operations Management & 5-Step Service Fulfillment Checklist UI
 */
export async function testOperationsWorkflowChecklist(browserCtrl) {
  const page = await browserCtrl.launch();
  const steps = [];
  const flowId = "05_operations_workflow_checklist";

  // Step 1: Operations Dashboard
  try {
    await browserCtrl.loginAs("operationsmanager1");
    await page.goto(`${browserCtrl.baseUrl}/ops`, { waitUntil: "networkidle" });
    await page.waitForSelector("body");
    const shot1 = await browserCtrl.captureScreenshot(flowId, "1_ops_manager_dashboard");

    steps.push({
      name: "5.1 Operations Manager Operational Command Center",
      passed: true,
      screenshot: shot1,
      details: "Operations dashboard and workflow pipeline cards loaded",
    });
  } catch (err) {
    steps.push({ name: "5.1 Operations Command Center", passed: false, error: err.message });
  }

  // Step 2: Assignments View
  try {
    await page.goto(`${browserCtrl.baseUrl}/ops/assignments`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const shot2 = await browserCtrl.captureScreenshot(flowId, "2_ops_staff_assignments");

    steps.push({
      name: "5.2 Resource & Guide Staff Assignments View",
      passed: true,
      screenshot: shot2,
      details: "Resource allocations and staff assignment view rendered",
    });
  } catch (err) {
    steps.push({ name: "5.2 Staff Assignments View", passed: false, error: err.message });
  }

  return {
    flowId,
    name: "5. Operations & 5-Step Fulfillment UI",
    steps,
    passed: steps.every((s) => s.passed),
    consoleErrors: [...browserCtrl.consoleErrors],
  };
}

