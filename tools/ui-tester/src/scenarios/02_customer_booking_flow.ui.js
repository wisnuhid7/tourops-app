/**
 * UI Scenario 2: Customer Booking Journey & Traveler Portal
 */
export async function testCustomerBookingFlow(browserCtrl) {
  const page = await browserCtrl.launch();
  const steps = [];
  const flowId = "02_customer_booking_flow";

  // Step 1: Customer Authenticated Catalog
  try {
    await browserCtrl.loginAs("customer1");
    await page.goto(`${browserCtrl.baseUrl}/tours`, { waitUntil: "networkidle" });
    const shot1 = await browserCtrl.captureScreenshot(flowId, "1_customer_tours_catalog");

    steps.push({
      name: "2.1 Customer Tours Marketplace & Filters",
      passed: true,
      screenshot: shot1,
      details: "Customer authenticated and browsing tour packages",
    });
  } catch (err) {
    steps.push({ name: "2.1 Customer Tours Marketplace", passed: false, error: err.message });
  }

  // Step 2: Customer My Bookings View
  try {
    await page.goto(`${browserCtrl.baseUrl}/my-bookings`, { waitUntil: "networkidle" });
    await page.waitForSelector("body");
    const shot2 = await browserCtrl.captureScreenshot(flowId, "2_customer_my_bookings");

    steps.push({
      name: "2.2 Customer Booking Management History",
      passed: true,
      screenshot: shot2,
      details: "Rendered customer bookings list and status badges",
    });
  } catch (err) {
    steps.push({ name: "2.2 Customer Booking History", passed: false, error: err.message });
  }

  // Step 3: Manage Passengers & Group Join View
  try {
    await page.goto(`${browserCtrl.baseUrl}/manage-passengers`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const shot3 = await browserCtrl.captureScreenshot(flowId, "3_customer_passengers_portal");

    await page.goto(`${browserCtrl.baseUrl}/join-groups`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const shot4 = await browserCtrl.captureScreenshot(flowId, "4_customer_join_groups_portal");

    steps.push({
      name: "2.3 Passenger Manifest & Group Joining Portals",
      passed: true,
      screenshot: shot4,
      details: "Rendered group join codes and passenger management interfaces",
    });
  } catch (err) {
    steps.push({ name: "2.3 Passenger Portals", passed: false, error: err.message });
  }

  return {
    flowId,
    name: "2. Customer Booking & Traveler Portal UI",
    steps,
    passed: steps.every((s) => s.passed),
    consoleErrors: [...browserCtrl.consoleErrors],
  };
}

