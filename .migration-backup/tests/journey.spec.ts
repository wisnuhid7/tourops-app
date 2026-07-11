import { test, expect } from '@playwright/test';

test.describe('End-to-End User Journeys', () => {

  test('Scenario 1: Complete Booking Lifecycle (Admin -> Customer -> Ops -> Admin)', async ({ browser }) => {
    // Increase timeout for this long multi-user lifecycle test to 4 minutes
    // to accommodate slower machines and on-demand Vite compilation
    test.setTimeout(240000);

    // We use isolated contexts for each user role to simulate cross-role interaction cleanly
    const adminContext = await browser.newContext();
    const customerContext = await browser.newContext();
    const opsContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const customerPage = await customerContext.newPage();
    const opsPage = await opsContext.newPage();

    adminPage.on('console', msg => console.log(`[Admin Console]: ${msg.text()}`));
    customerPage.on('console', msg => console.log(`[Customer Console]: ${msg.text()}`));
    opsPage.on('console', msg => console.log(`[Ops Console]: ${msg.text()}`));

    const uniqueId = Date.now();
    const tourTitle = `Journey Tour ${uniqueId}`;
    const groupName = `Family Journey ${uniqueId}`;

    // ==========================================
    // 1. ADMIN: Create Tour and Departure
    // ==========================================
    await adminPage.goto('/admin/login');
    await adminPage.fill('#username', 'superadmin1');
    await adminPage.fill('#password', 'password123');
    await adminPage.click('button[type="submit"]');
    await adminPage.waitForURL('**/admin');

    // Create Tour
    await adminPage.click('a[href="/admin/tours"]');
    await adminPage.waitForURL('/admin/tours');
    await adminPage.click('[data-testid="button-create-tour"]');
    await adminPage.fill('[data-testid="input-tour-title"]', tourTitle);
    await adminPage.fill('[data-testid="input-tour-duration"]', '7');
    await adminPage.fill('[data-testid="input-tour-price"]', '1500');
    await adminPage.click('[data-testid="button-save-tour"]');
    
    // Wait for the dialog to close
    await expect(adminPage.locator('text=Create New Tour')).toBeHidden({ timeout: 15000 });
    
    // Search for the tour to ensure it's filtered and visible
    await adminPage.fill('[data-testid="input-search-tours"]', tourTitle);
    await adminPage.waitForTimeout(500);
    
    // Wait for the tour to be successfully created and listed
    await expect(adminPage.locator(`h3:has-text("${tourTitle}")`).first()).toBeVisible();
    
    // Publish the tour so it is visible to customers
    const tourCard = adminPage.locator('[data-testid^="card-tour-"]', { hasText: tourTitle }).first();
    await expect(tourCard).toBeVisible();
    const publishButton = tourCard.locator('[data-testid^="button-toggle-publish-"]').first();
    await expect(publishButton).toBeVisible();
    await publishButton.click();
    
    // Verify it is published
    await expect(tourCard.locator('text=Published')).toBeVisible();
    
    // Create Departure (navigate directly as it's not in the sidebar)
    await adminPage.goto('/admin/departures');
    await adminPage.waitForURL('/admin/departures');
    await adminPage.click('[data-testid="button-create-departure"]');
    await adminPage.waitForSelector('[data-testid="select-departure-tour"]');
    
    // Select the tour from dropdown
    await adminPage.click('[data-testid="select-departure-tour"]');
    await adminPage.locator(`div[role="option"]:has-text("${tourTitle}")`).first().click();
    
    // Set dates
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 30);
    const startDate = futureDate.toISOString().split('T')[0];
    futureDate.setDate(futureDate.getDate() + 7);
    const endDate = futureDate.toISOString().split('T')[0];
    
    await adminPage.fill('[data-testid="input-start-date"]', startDate);
    await adminPage.fill('[data-testid="input-end-date"]', endDate);
    await adminPage.click('[data-testid="button-save-departure"]');

    // ==========================================
    // 2. CUSTOMER: Book the Tour
    // ==========================================
    await customerPage.goto('/');
    await customerPage.click('[data-testid="button-login"]');
    await customerPage.waitForTimeout(500);
    await customerPage.fill('[data-testid="input-username"]', 'customer1');
    await customerPage.fill('[data-testid="input-password"]', 'password123');
    await Promise.all([
      customerPage.waitForNavigation({ url: '**/tours', waitUntil: 'domcontentloaded', timeout: 25000 }),
      customerPage.click('[data-testid="button-login-submit"]'),
    ]);

    // Find and book the tour
    await customerPage.goto('/tours');
    await customerPage.waitForURL('/tours');
    
    const tourLink = customerPage.locator(`text=${tourTitle}`).first();
    await expect(tourLink).toBeVisible();
    await tourLink.click();

    // In tour detail, book the departure
    await expect(customerPage.locator(`text=${tourTitle}`)).toBeVisible();
    
    const bookButton = customerPage.locator('button[data-testid^="button-book-"]').first();
    await expect(bookButton).toBeVisible();
    await bookButton.click();

    // Fill booking details
    await expect(customerPage.getByTestId('input-party-size')).toBeVisible();
    
    await customerPage.click('[data-testid="select-booking-type"]');
    await customerPage.locator('div[role="option"]:has-text("Create Leader Group")').click();
    
    await customerPage.fill('[data-testid="input-group-name"]', groupName);
    await customerPage.fill('[data-testid="input-party-size"]', '2');
    
    await customerPage.click('[data-testid="button-confirm-booking"]');
    
    // Wait for redirect to my-bookings
    await customerPage.waitForURL('/my-bookings');
    await expect(customerPage.locator(`text=${groupName}`).first()).toBeVisible();

    // Get the booking ID dynamically from the card test ID
    const bookingCard = customerPage.locator('[data-testid^="card-my-booking-"]').first();
    await expect(bookingCard).toBeVisible();
    const testId = await bookingCard.getAttribute('data-testid');
    const bookingId = testId?.replace('card-my-booking-', '') || '';

    // ==========================================
    // 3. ADMIN: Initialize Workflows and Get Workflow ID
    // ==========================================
    await adminPage.goto('/admin/bookings');
    await adminPage.waitForURL('/admin/bookings');
    await adminPage.fill('[data-testid="input-search-bookings"]', groupName);
    await adminPage.waitForTimeout(500); // debounce
    
    // Select the booking to initialize workflow
    const checkbox = adminPage.locator('button[role="checkbox"]').nth(1); // the first one is select-all
    await expect(checkbox).toBeVisible();
    await checkbox.click();
    
    // Click the Initialize button
    const initButton = adminPage.locator('button:has-text("Initialize")').first();
    await expect(initButton).toBeVisible();
    await initButton.click();
    await adminPage.waitForTimeout(2000);

    // Go to booking detail page to retrieve the specific workflow ID for Land Transport
    await adminPage.goto(`/admin/bookings/${bookingId}`);
    await adminPage.waitForURL(`/admin/bookings/${bookingId}`);
    await adminPage.click('[data-testid="tab-fulfillment"]');
    
    const transportWorkflowCard = adminPage.locator('[data-testid^="card-workflow-"]', { hasText: 'Land Transport' }).first();
    await expect(transportWorkflowCard).toBeVisible();
    const workflowTestId = await transportWorkflowCard.getAttribute('data-testid');
    const workflowId = workflowTestId?.replace('card-workflow-', '') || '';
    console.log(`[Admin]: Found Land Transport Workflow ID: ${workflowId}`);

    // ==========================================
    // 4. OPS: Transport Manager Advances Status
    // ==========================================
    await opsPage.goto('/staff/login');
    await opsPage.fill('#username', 'transportmanager1');
    await opsPage.fill('#password', 'password123');
    await opsPage.click('button[type="submit"]');
    await opsPage.waitForURL('**/ops');

    // Wait for generic dashboard to load
    await expect(opsPage.locator('text=Tasks').first()).toBeVisible();

    // Select the exact task by workflowId and mark it Completed
    const taskCard = opsPage.locator(`[data-testid="card-ops-task-${workflowId}"]`);
    await expect(taskCard).toBeVisible();
    const selectTrigger = taskCard.locator('button[role="combobox"]');
    await expect(selectTrigger).toBeVisible();
    await selectTrigger.click();
    
    const completedOption = opsPage.locator('div[role="option"]:has-text("Completed")').first();
    await expect(completedOption).toBeVisible();
    await completedOption.click();
    
    // Wait a moment for the status change to save
    await opsPage.waitForTimeout(2000);

    // ==========================================
    // 5. ADMIN: Verify status
    // ==========================================
    await adminPage.reload();
    await adminPage.click('[data-testid="tab-fulfillment"]');
    
    // Verify that the transport workflow status is displayed as Completed
    const updatedTransportWorkflowCard = adminPage.locator(`[data-testid="card-workflow-${workflowId}"]`).first();
    await expect(updatedTransportWorkflowCard).toBeVisible();
    await expect(updatedTransportWorkflowCard.locator('[data-testid^="badge-workflow-status-"]')).toContainText('Completed');

    // Clean up
    await adminContext.close();
    await customerContext.close();
    await opsContext.close();
  });

  test('Scenario 2: Tour Leader Workflow', async ({ page }) => {
    // Increase timeout for this scenario
    test.setTimeout(90000);

    page.on('console', msg => console.log(`[Customer Scenario 2 Console]: ${msg.text()}`));

    await page.goto('/');
    await page.click('[data-testid="button-login"]');
    await page.waitForTimeout(500);
    await page.fill('[data-testid="input-username"]', 'customer1');
    await page.fill('[data-testid="input-password"]', 'password123');
    await Promise.all([
      page.waitForNavigation({ url: '**/tours', waitUntil: 'domcontentloaded', timeout: 25000 }),
      page.click('[data-testid="button-login-submit"]'),
    ]);

    await page.click('a[href="/leader-dashboard"]');
    await expect(page.locator('[data-testid="text-leader-dashboard-title"]')).toBeVisible();
    
    // Find a tour dynamically to get its ID
    await page.goto('/tours');
    const firstTourLink = page.locator('a[href^="/tours/"]').first();
    await expect(firstTourLink).toBeVisible();
    await firstTourLink.click();
    
    await page.waitForURL('**/tours/*');
    
    // Visit brochure generator by clicking the brochure button on the tour details page
    const brochureButton = page.locator('[data-testid="button-view-brochure"]').first();
    await expect(brochureButton).toBeVisible();
    await brochureButton.click();
    
    await page.waitForURL('**/tours/*/brochure');
    
    // Fill out the brochure form
    await page.waitForSelector('[data-testid="input-brochure-title"]');
    await page.fill('[data-testid="input-brochure-title"]', 'Exclusive E2E Group');
    await page.fill('[data-testid="input-leader-name"]', 'John E2E Leader');
    
    // Verify preview toggles
    await page.click('[data-testid="button-toggle-preview"]');
    await expect(page.locator('text=Exclusive E2E Group').first()).toBeVisible();
  });
});

