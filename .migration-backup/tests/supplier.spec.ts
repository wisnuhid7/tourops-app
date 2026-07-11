import { test, expect } from '@playwright/test';

test.describe('Supplier Role Tests (CRUD)', () => {
  const rateData = {
    hotelName: 'E2E Grand Hotel ' + Date.now(),
    roomType: 'Deluxe Suite',
    price: '250',
    newPrice: '275',
  };

  test('Login and navigate supplier dashboard', async ({ page }) => {
    await page.goto('/staff/login');
    await page.fill('#username', 'hotelmanager1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    await page.waitForURL('/supplier');
    // hotelmanager1 has role hotel_manager → title is "Hotel Dashboard"
    await expect(page.getByTestId('text-supplier-title')).toBeVisible();
    await expect(page.locator('h1').first()).toContainText('Hotel Dashboard');
  });

  test('Rate Cards: Create, Update, Delete', async ({ page }) => {
    await page.goto('/staff/login');
    await page.fill('#username', 'hotelmanager1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/supplier');

    // Wait for the Hotel Rates tab to appear (only visible for hotel_manager role)
    await expect(page.locator('text=Hotel Rates')).toBeVisible();

    // Switch to Hotel Rates tab
    await page.click('[data-value="hotel_rates"], button:has-text("Hotel Rates")');
    // Wait for the Create Rate button inside that tab panel to be visible
    await expect(page.locator('button:has-text("Create Rate")')).toBeVisible();

    // ── CREATE ──────────────────────────────────────────────────────────────
    await page.click('button:has-text("Create Rate")');
    // Wait for the dialog form to open
    await expect(page.locator('input[name="hotelName"]')).toBeVisible();
    await page.fill('input[name="hotelName"]', rateData.hotelName);
    await page.fill('input[name="roomType"]', rateData.roomType);
    await page.fill('input[name="price"]', rateData.price);
    // validFrom has a default (today), but validTo has NO default → must fill it (it is required)
    await page.fill('input[name="validTo"]', '2027-12-31');
    await page.click('button:has-text("Save Rate")');

    // Wait for dialog to close (dialog title disappears)
    await expect(page.locator('text=Create New Rate')).toBeHidden({ timeout: 10000 });

    // ── READ ─────────────────────────────────────────────────────────────────
    // After query invalidation, the table should now contain our new hotel name
    await expect(page.locator(`text=${rateData.hotelName}`).first()).toBeVisible({ timeout: 10000 });

    // ── UPDATE ───────────────────────────────────────────────────────────────
    // Find the row that contains our hotelName
    const row = page.locator('tr', { hasText: rateData.hotelName }).first();
    // The first button in the row is the edit icon (rotated Plus → pencil)
    await row.locator('button').first().click();
    await expect(page.locator('text=Edit Rate')).toBeVisible();
    await expect(page.locator('input[name="price"]')).toBeVisible();
    // Clear price and type new value
    await page.fill('input[name="price"]', rateData.newPrice);
    // Also ensure validTo is set in edit mode
    const currentValidTo = await page.inputValue('input[name="validTo"]');
    if (!currentValidTo) {
      await page.fill('input[name="validTo"]', '2027-12-31');
    }
    await page.click('button:has-text("Save Rate")');
    await expect(page.locator('text=Edit Rate')).toBeHidden({ timeout: 10000 });

    // ── DELETE ───────────────────────────────────────────────────────────────
    // Re-locate row after re-render
    page.once('dialog', dialog => dialog.accept());
    const updatedRow = page.locator('tr', { hasText: rateData.hotelName }).first();
    // Second button in the row is the Trash2 delete icon
    await updatedRow.locator('button').nth(1).click();

    // The row should disappear
    await expect(page.locator(`text=${rateData.hotelName}`)).toBeHidden({ timeout: 10000 });
  });
});
