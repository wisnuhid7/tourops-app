/**
 * UI Scenario 10: Complete DOM Verification for all 18 Roles
 * Based on TourOps_Full_Role_Permissions_Guide.docx
 */
import { ACCOUNTS } from "../accounts.js";

export const ROLE_DEFINITIONS = [
  {
    role: "super_admin",
    username: "superadmin1",
    portal: "/admin/login",
    landing: "/admin",
    expectedRoleBadge: "SUPER ADMIN",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/test-data", shouldAllow: true },
  },
  {
    role: "admin",
    username: "admin1",
    portal: "/admin/login",
    landing: "/admin",
    expectedRoleBadge: "ADMIN",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/tours", shouldAllow: true },
  },
  {
    role: "tour_builder",
    username: "tourbuilder1",
    portal: "/staff/login",
    landing: "/ops/tour-builder",
    expectedRoleBadge: "TOUR BUILDER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/users", shouldAllow: false },
  },
  {
    role: "content_editor",
    username: "contenteditor1",
    portal: "/staff/login",
    landing: "/ops/content-editor",
    expectedRoleBadge: "CONTENT EDITOR",
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
  {
    role: "country_manager",
    username: "countrymanager1",
    portal: "/staff/login",
    landing: "/ops",
    expectedRoleBadge: "COUNTRY MANAGER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/master-data", shouldAllow: true },
  },
  {
    role: "city_manager",
    username: "citymanager1",
    portal: "/staff/login",
    landing: "/ops/city-manager",
    expectedRoleBadge: "CITY MANAGER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/users", shouldAllow: false },
  },
  {
    role: "hotel_manager",
    username: "hotelmanager1",
    portal: "/staff/login",
    landing: "/supplier",
    expectedRoleBadge: "HOTEL MANAGER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
  {
    role: "transport_manager",
    username: "transportmanager1",
    portal: "/staff/login",
    landing: "/ops/transport",
    expectedRoleBadge: "TRANSPORT MANAGER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
  {
    role: "guide_manager",
    username: "guidemanager1",
    portal: "/staff/login",
    landing: "/supplier",
    expectedRoleBadge: "GUIDE MANAGER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
  {
    role: "sights_manager",
    username: "sightsmanager1",
    portal: "/staff/login",
    landing: "/supplier",
    expectedRoleBadge: "SIGHTS MANAGER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
  {
    role: "airline_supplier",
    username: "airlinesupplier1",
    portal: "/staff/login",
    landing: "/supplier",
    expectedRoleBadge: "AIRLINE SUPPLIER",
    mustRenderSelector: "main",
    guardTest: { path: "/ops", shouldAllow: false },
  },
  {
    role: "supplier",
    username: "supplier1",
    portal: "/staff/login",
    landing: "/supplier",
    expectedRoleBadge: "SUPPLIER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/users", shouldAllow: false },
  },
  {
    role: "operations_manager",
    username: "operationsmanager1",
    portal: "/staff/login",
    landing: "/ops",
    expectedRoleBadge: "OPERATIONS MANAGER",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/pricing-engine", shouldAllow: true },
  },
  {
    role: "flight_agent",
    username: "flightagent1",
    portal: "/staff/login",
    landing: "/ops/flight-agent",
    expectedRoleBadge: "FLIGHT AGENT",
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
  {
    role: "tour_leader",
    username: "tourleader1",
    portal: "/staff/login",
    landing: "/ops/tour-leader",
    expectedRoleBadge: "TOUR LEADER",
    mustRenderSelector: "main",
    guardTest: { path: "/ops/accounting", shouldAllow: false },
  },
  {
    role: "support_agent",
    username: "supportagent1",
    portal: "/staff/login",
    landing: "/ops/support",
    expectedRoleBadge: "SUPPORT AGENT",
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
  {
    role: "accounting",
    username: "accounting1",
    portal: "/staff/login",
    landing: "/ops/accounting",
    expectedRoleBadge: "ACCOUNTING",
    mustRenderSelector: "main",
    guardTest: { path: "/admin/users", shouldAllow: false },
  },
  {
    role: "customer",
    username: "customer1",
    portal: "/login",
    landing: "/tours",
    expectedRoleBadge: null, // Customer navbar doesn't show staff sidebar
    mustRenderSelector: "main",
    guardTest: { path: "/admin", shouldAllow: false },
  },
];

export async function testAll18RolesDom(browserCtrl) {
  const page = await browserCtrl.launch();
  const steps = [];
  const flowId = "10_all_18_roles_dom_test";

  for (const def of ROLE_DEFINITIONS) {
    const roleStepName = `Role [${def.role}] DOM Test (${def.username})`;
    try {
      // 1. Authenticate user
      await browserCtrl.loginAs(def.username);

      // 2. Navigate to landing page via DOM
      await page.goto(`${browserCtrl.baseUrl}${def.landing}`, {
        waitUntil: "domcontentloaded",
        timeout: 10000,
      });

      // Allow SPA client queries and layout to settle
      await page.waitForTimeout(600);

      // 3. Inspect DOM URL
      const currentUrl = page.url();
      const urlMatches = currentUrl.includes(def.landing);

      // 4. Inspect DOM Structure
      const bodyText = await page.innerText("body");
      const hasMain = await page.$(def.mustRenderSelector);

      let badgeVerified = true;
      if (def.expectedRoleBadge) {
        // Look for role badge or role name in DOM text
        badgeVerified = bodyText.toUpperCase().includes(def.expectedRoleBadge);
      }

      // Check username presence in DOM
      const usernameInDom = bodyText.includes(def.username);

      // 5. Test Route Guard Barrier in DOM
      let guardPassed = true;
      let guardDetails = "";
      if (def.guardTest) {
        await page.goto(`${browserCtrl.baseUrl}${def.guardTest.path}`, {
          waitUntil: "domcontentloaded",
          timeout: 10000,
        });
        await page.waitForTimeout(600);
        const guardedUrl = page.url();

        if (def.guardTest.shouldAllow) {
          guardPassed = guardedUrl.includes(def.guardTest.path);
          guardDetails = `Exemption check: allowed at ${guardedUrl}`;
        } else {
          // Should NOT remain on guarded path
          guardPassed = !guardedUrl.includes(def.guardTest.path);
          guardDetails = `Barrier check: guarded and redirected to ${guardedUrl}`;
        }
      }

      // 6. Screenshot for visual audit
      const screenshot = await browserCtrl.captureScreenshot(flowId, `role_${def.role}`);

      const passed = urlMatches && Boolean(hasMain) && badgeVerified && usernameInDom && guardPassed;

      steps.push({
        name: roleStepName,
        role: def.role,
        username: def.username,
        landing: def.landing,
        passed,
        screenshot,
        details: `URL: ${currentUrl} | Username in DOM: ${usernameInDom} | Role in DOM: ${badgeVerified} | ${guardDetails}`,
      });
    } catch (err) {
      steps.push({
        name: roleStepName,
        role: def.role,
        username: def.username,
        passed: false,
        error: err.message,
      });
    }
  }

  return {
    flowId,
    name: "10. All 18 Roles DOM & RBAC Audit",
    steps,
    passed: steps.every((s) => s.passed),
    consoleErrors: [...browserCtrl.consoleErrors],
  };
}
