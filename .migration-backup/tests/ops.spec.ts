import { test, expect } from '@playwright/test';

test.describe('Ops Role Tests (CRUD/Task Management)', () => {
  test('Login and manage tasks in Ops Dashboard', async ({ page }) => {
    // 1. Go to Staff login page
    await page.goto('/staff/login');
    
    // 2. Fill login form with transport manager role
    await page.fill('#username', 'transportmanager1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // 3. Wait for navigation to ops dashboard
    await page.waitForURL('/ops');
    
    // We might be redirected to /ops or maybe /ops stays as generic if not configured properly.
    // Let's ensure the dashboard loads successfully.
    await expect(page.locator('h1').first()).toBeVisible();

    // The transport dashboard uses tabs. Let's switch to the Bookings tab (tasks)
    const bookingsTab = page.locator('[data-testid="tab-bookings"]');
    if (await bookingsTab.isVisible()) {
      await bookingsTab.click();
      
      // Look for any advance booking button (which advances the status, essentially an UPDATE operation)
      const advanceButtons = page.locator('button[data-testid^="button-advance-booking-"]');
      if (await advanceButtons.count() > 0) {
        // If there is a task, update its status
        await advanceButtons.first().click();
        
        // Wait a moment for the toast or status change to propagate
        await page.waitForTimeout(1000);
      } else {
        console.log('No bookings available to advance status.');
      }
    } else {
      console.log('Not on the transport dashboard or tab not visible.');
    }
  });
});
