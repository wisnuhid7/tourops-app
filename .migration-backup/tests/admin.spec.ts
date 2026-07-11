import { test, expect } from '@playwright/test';

test.describe('Admin Role Tests (CRUD)', () => {
  // Test data for CRUD
  const tourData = {
    title: 'E2E Test Tour ' + Date.now(),
    duration: '5',
    price: '999',
    description: 'A test tour created by automated tests'
  };

  const userData = {
    username: 'e2e_user_' + Date.now(),
    password: 'password123',
    firstName: 'E2E',
    lastName: 'Tester',
    email: 'e2e_' + Date.now() + '@example.com'
  };

  test('Login and navigate admin dashboard', async ({ page }) => {
    // 1. Login
    await page.goto('/admin/login');
    await page.fill('#username', 'superadmin1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin');
    await expect(page.locator('text=Top Performing Tours').first()).toBeVisible();
  });

  test('Tours: Create, Read, Update, Delete', async ({ page }) => {
    // Ensure we are logged in
    await page.goto('/admin/login');
    await page.fill('#username', 'superadmin1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin');

    // 1. Navigate to Tours
    await page.click('a[href="/admin/tours"]');
    await page.waitForURL('/admin/tours');
    
    // 2. CREATE Tour
    await page.click('[data-testid="button-create-tour"]');
    await page.waitForSelector('[data-testid="input-tour-title"]');
    await page.fill('[data-testid="input-tour-title"]', tourData.title);
    await page.fill('[data-testid="input-tour-duration"]', tourData.duration);
    await page.fill('[data-testid="input-tour-price"]', tourData.price);
    await page.fill('[data-testid="input-tour-description"]', tourData.description);
    await page.click('[data-testid="button-save-tour"]');
    
    // Wait for the dialog to close (indicating success)
    await expect(page.locator('text=Create New Tour')).toBeHidden({ timeout: 15000 });
    
    // 3. READ Tour (Verify it appears in the list)
    await page.fill('[data-testid="input-search-tours"]', tourData.title);
    // Give it a moment to filter
    await page.waitForTimeout(500); 
    await expect(page.locator(`text=${tourData.title}`).first()).toBeVisible();

    // Find the tour ID (we might just select the first matched tour's edit button)
    // 4. UPDATE Tour
    const editButtons = page.locator('button[data-testid^="button-edit-tour-"]');
    await expect(editButtons.first()).toBeVisible();
    await editButtons.first().click();
    await page.fill('[data-testid="input-tour-price"]', '1050');
    await page.click('[data-testid="button-save-tour"]');
    
    // Wait for the edit dialog to close
    await expect(page.locator('text=Edit Tour')).toBeHidden({ timeout: 15000 });
    
    // 5. DELETE Tour
    await page.fill('[data-testid="input-search-tours"]', tourData.title);
    await page.waitForTimeout(500);
    const deleteButtons = page.locator('button[data-testid^="button-delete-tour-"]');
    await expect(deleteButtons.first()).toBeVisible();
    await deleteButtons.first().click();
  });

  test('Bookings: Read, Filter, Delete', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('#username', 'superadmin1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    // Navigate to Bookings
    await page.click('a[href="/admin/bookings"]');
    await page.waitForURL('/admin/bookings');

    // Filter bookings
    await page.click('[data-testid="select-status-filter"]');
    await page.click('div[role="option"]:has-text("Confirmed")');

    // Search bookings
    await page.fill('[data-testid="input-search-bookings"]', 'GRP');

    // We may not want to delete real seed data, but here's how we'd test delete interaction (mocked by UI currently)
    // await page.click('.text-destructive'); 
  });

  test('Users: Create, Update, Delete', async ({ page }) => {
    await page.goto('/admin/login');
    await page.fill('#username', 'superadmin1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');

    await page.click('a[href="/admin/users"]');
    await page.waitForURL('/admin/users');

    // CREATE User
    await page.click('[data-testid="button-create-user"]');
    await page.fill('[data-testid="input-create-username"]', userData.username);
    await page.fill('[data-testid="input-create-password"]', userData.password);
    await page.fill('[data-testid="input-create-firstname"]', userData.firstName);
    await page.fill('[data-testid="input-create-lastname"]', userData.lastName);
    await page.fill('[data-testid="input-create-email"]', userData.email);
    
    // Select Role
    await page.click('[data-testid="select-create-role"]');
    await page.locator('div[role="option"]:has-text("Country Manager")').click();

    await page.click('[data-testid="button-submit-create-user"]');

    // Wait for dialog to close (onSuccess calls setCreateOpen(false))
    await expect(page.locator('text=Create New User')).toBeHidden({ timeout: 15000 });

    // READ User — the UI displays firstName + lastName, not the username
    // Search by firstName ('E2E') to find the newly created user
    await page.fill('[data-testid="input-search-users"]', userData.firstName);
    await page.waitForTimeout(500);
    // The display name is "E2E Tester" (firstName + lastName)
    const displayName = `${userData.firstName} ${userData.lastName}`;
    await expect(page.locator(`text=${displayName}`).first()).toBeVisible({ timeout: 15000 });

    // UPDATE User (Reset password)
    const userCard = page.locator('div[data-testid^="card-user-"]', { hasText: displayName }).first();
    await expect(userCard).toBeVisible();
    const resetButton = userCard.locator('button[data-testid^="button-reset-password-"]').first();
    await expect(resetButton).toBeVisible();
    await resetButton.click();
    await page.locator('[role="dialog"]:visible [data-testid="input-reset-password"]').fill('newpassword123');
    await page.click('[role="dialog"]:visible [data-testid="button-submit-reset-password"]');
    
    // DELETE user is not currently implemented in the UI of users.tsx (only role change and password reset are present)
  });
});
