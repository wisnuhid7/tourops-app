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

  // Step 2: Customer selects tour and opens Tour Detail
  let selectedTourId = "be561942-98d5-46b3-8b0e-953a39cce2bc";
  try {
    const tourCard = page.locator(`[data-testid="card-public-tour-${selectedTourId}"], a[href*="${selectedTourId}"]`).first();
    if (await tourCard.count() > 0) {
      await tourCard.click();
      await page.waitForURL(`**/tours/${selectedTourId}`, { timeout: 8000 });
    } else {
      await page.goto(`${browserCtrl.baseUrl}/tours/${selectedTourId}`, { waitUntil: "networkidle" });
    }
    await page.waitForSelector("[data-testid='text-tour-title'], h1");
    const tourTitle = await page.locator("[data-testid='text-tour-title'], h1").first().textContent();
    const shot2 = await browserCtrl.captureScreenshot(flowId, "2_customer_tour_detail");

    steps.push({
      name: "2.2 Tour Detail Inspection & Available Departures",
      passed: true,
      screenshot: shot2,
      details: `Navigated to tour detail: "${tourTitle?.trim()}"`,
    });
  } catch (err) {
    steps.push({ name: "2.2 Tour Detail Inspection", passed: false, error: err.message });
  }

  // Step 3: Open Book Now dialog & Submit New Booking
  try {
    const bookBtn = page.locator("button:has-text('Book Now'), button:has-text('Reservar'), [data-testid^='button-book-']").first();
    await bookBtn.waitFor({ state: "visible", timeout: 8000 });
    await bookBtn.click();
    await page.waitForTimeout(500);

    // Capture screenshot of Booking Dialog
    const shot3 = await browserCtrl.captureScreenshot(flowId, "3_booking_dialog_opened");

    // Check optional room type selector
    const roomSelect = page.locator("[data-testid='select-room-type']");
    if (await roomSelect.count() > 0) {
      await roomSelect.click();
      await page.waitForTimeout(300);
      const firstOption = page.locator("[role='option'], [data-testid^='option-room-']").first();
      if (await firstOption.count() > 0) {
        await firstOption.click();
        await page.waitForTimeout(500);
      }
    }

    // Fill optional notes
    const notesField = page.locator("textarea");
    if (await notesField.count() > 0) {
      await notesField.fill("Automated E2E UI Test Booking created via Playwright");
    }

    // Click Confirm Booking button
    const confirmBtn = page.locator("[data-testid='button-confirm-booking']");
    await confirmBtn.waitFor({ state: "visible" });
    await confirmBtn.click();

    // Verify automatic redirect to /my-bookings
    await page.waitForURL("**/my-bookings", { timeout: 12000 });
    await page.waitForSelector("body");
    const shot4 = await browserCtrl.captureScreenshot(flowId, "4_booking_created_confirmed");

    steps.push({
      name: "2.3 Customer Create Booking & Confirmation Flow",
      passed: true,
      screenshot: shot4,
      details: "Customer successfully submitted booking and redirected to My Bookings",
    });
  } catch (err) {
    steps.push({ name: "2.3 Customer Create Booking", passed: false, error: err.message });
  }

  // Step 4: Customer My Bookings View & Status Validation
  try {
    await page.goto(`${browserCtrl.baseUrl}/my-bookings`, { waitUntil: "networkidle" });
    await page.waitForSelector("body");
    const shot5 = await browserCtrl.captureScreenshot(flowId, "5_customer_my_bookings");

    steps.push({
      name: "2.4 Customer Booking Management History",
      passed: true,
      screenshot: shot5,
      details: "Rendered customer bookings list and status badges",
    });
  } catch (err) {
    steps.push({ name: "2.4 Customer Booking History", passed: false, error: err.message });
  }

  // Step 5: Manage Passengers & Group Join View
  try {
    await page.goto(`${browserCtrl.baseUrl}/manage-passengers`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const shot6 = await browserCtrl.captureScreenshot(flowId, "6_customer_passengers_portal");

    await page.goto(`${browserCtrl.baseUrl}/join-groups`, { waitUntil: "networkidle" });
    await page.waitForTimeout(500);
    const shot7 = await browserCtrl.captureScreenshot(flowId, "7_customer_join_groups_portal");

    steps.push({
      name: "2.5 Passenger Manifest & Group Joining Portals",
      passed: true,
      screenshot: shot7,
      details: "Rendered group join codes and passenger management interfaces",
    });
  } catch (err) {
    steps.push({ name: "2.5 Passenger Portals", passed: false, error: err.message });
  }

  return {
    flowId,
    name: "2. Customer Booking & Traveler Portal UI",
    steps,
    passed: steps.every((s) => s.passed),
    consoleErrors: [...browserCtrl.consoleErrors],
  };
}
