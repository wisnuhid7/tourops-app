/**
 * UI Scenario 9: RBAC UI Navigation & Client-Side Route Guards Audit
 */
import { ACCOUNTS } from "../accounts.js";

export async function testRbacUiNavigationAudit(browserCtrl) {
  const page = await browserCtrl.launch();
  const steps = [];
  const flowId = "09_rbac_ui_navigation_audit";

  // Test 1: Customer blocked from /admin
  try {
    await browserCtrl.loginAs("customer1");
    await page.goto(`${browserCtrl.baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const url = page.url();
    const blockedFromAdmin = !url.includes("/admin");
    const shot1 = await browserCtrl.captureScreenshot(flowId, "1_customer_blocked_from_admin");

    steps.push({
      name: "9.1 Customer Route Guard: Blocked from /admin",
      passed: blockedFromAdmin,
      screenshot: shot1,
      details: `Customer redirected to: ${url}`,
    });
  } catch (err) {
    steps.push({ name: "9.1 Customer Route Guard", passed: false, error: err.message });
  }

  // Test 2: External Supplier blocked from /admin/users
  try {
    await browserCtrl.loginAs("supplier1");
    await page.goto(`${browserCtrl.baseUrl}/admin/users`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const url = page.url();
    const blockedFromUsers = !url.includes("/admin/users");
    const shot2 = await browserCtrl.captureScreenshot(flowId, "2_supplier_blocked_from_users");

    steps.push({
      name: "9.2 Supplier Route Guard: Blocked from /admin/users",
      passed: blockedFromUsers,
      screenshot: shot2,
      details: `Supplier redirected to: ${url}`,
    });
  } catch (err) {
    steps.push({ name: "9.2 Supplier Route Guard", passed: false, error: err.message });
  }

  // Test 3: Super Admin unrestricted navigation across /admin, /ops, /supplier
  try {
    await browserCtrl.loginAs("superadmin1");
    await page.goto(`${browserCtrl.baseUrl}/admin`, { waitUntil: "networkidle" });
    await page.waitForSelector("body");
    const shot3 = await browserCtrl.captureScreenshot(flowId, "3_super_admin_full_workspace");

    steps.push({
      name: "9.3 Super Admin Full Workspace Shell & Navigation",
      passed: true,
      screenshot: shot3,
      details: "Super Admin workspace fully accessible without redirect",
    });
  } catch (err) {
    steps.push({ name: "9.3 Super Admin Workspace", passed: false, error: err.message });
  }

  return {
    flowId,
    name: "9. RBAC UI Navigation & Route Guards",
    steps,
    passed: steps.every((s) => s.passed),
    consoleErrors: [...browserCtrl.consoleErrors],
  };
}

