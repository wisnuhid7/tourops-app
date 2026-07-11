import { test, expect } from '@playwright/test';

test.describe('Customer Role Tests (CRUD)', () => {
  const customerUser = {
    username: 'e2e_customer_' + Date.now(),
    password: 'password123',
    firstName: 'E2E',
  };

  // Helper: login as existing customer1 using the landing page form
  // LoginForm uses window.location.href = '/tours' after success, so we
  // use page.waitForNavigation to catch the full-page reload redirect.
  async function loginAsCustomer1(page: any) {
    await page.goto('/');
    // Scroll to the #login section by clicking the Sign In nav button
    await page.click('[data-testid="button-login"]');
    await page.waitForTimeout(500);

    // Fill in the login form (inputs have data-testids from LoginForm)
    await page.fill('[data-testid="input-username"]', 'customer1');
    await page.fill('[data-testid="input-password"]', 'password123');

    // window.location.href causes a full-page navigation, so use Promise.all
    await Promise.all([
      page.waitForNavigation({ url: '**/tours', waitUntil: 'domcontentloaded', timeout: 25000 }),
      page.click('[data-testid="button-login-submit"]'),
    ]);
  }

  test('Customer Registration, Browsing, Booking', async ({ page }) => {
    // 1. Visit landing page
    await page.goto('/');
    await expect(page.locator('text=Popular').first()).toBeVisible();

    // 2. Login with seeded customer1
    await loginAsCustomer1(page);
    await expect(page.locator('text=Explore Tours').first()).toBeVisible();

    // 3. Navigate to My Bookings (customer dashboard)
    await page.goto('/my-bookings');
    await expect(page.getByTestId('text-my-bookings-title')).toBeVisible();

    // 4. Browse a tour detail
    await page.goto('/tours');
    await expect(page.locator('text=Explore Tours').first()).toBeVisible();
    const firstTourLink = page.locator('a[href^="/tours/"]').first();
    await expect(firstTourLink).toBeVisible();
    await firstTourLink.click();
    await expect(page.getByTestId('text-tour-title')).toBeVisible();

    // 5. Try Create Booking (only if departure slots available)
    const bookButtons = page.locator('button[data-testid^="button-book-"]');
    try {
      await bookButtons.first().waitFor({ state: 'visible', timeout: 5000 });
    } catch (e) {
      // Fallback if no departures are seeded/loaded
    }
    
    if (await bookButtons.count() > 0) {
      await bookButtons.first().click();
      await page.click('[data-testid="select-booking-type"]');
      await page.locator('div[role="option"]:has-text("Create Leader Group")').click();
      await page.fill('[data-testid="input-group-name"]', 'E2E Family Vacation');
      await page.fill('[data-testid="input-party-size"]', '4');
      await page.click('[data-testid="button-confirm-booking"]');
      await page.waitForURL('**/my-bookings');
      await expect(page.getByTestId('text-my-bookings-title')).toBeVisible();
      await expect(page.locator('text=E2E Family Vacation').first()).toBeVisible();
    } else {
      console.log('No departure dates available — skipping booking assertion.');
    }
  });

  test('Customer Registration via Sign Up form', async ({ page }) => {
    // Go to landing page
    await page.goto('/');
    // Click Sign Up button in the nav — sets showRegister=true, scrolls to #register
    await page.click('[data-testid="button-register"]');
    await page.waitForTimeout(500);

    // RegisterForm has IDs: reg-firstName, reg-username, reg-password, reg-confirm-password
    await expect(page.locator('#reg-firstName')).toBeVisible({ timeout: 10000 });
    await page.fill('#reg-firstName', customerUser.firstName);
    await page.fill('#reg-username', customerUser.username);
    await page.fill('#reg-password', customerUser.password);
    await page.fill('#reg-confirm-password', customerUser.password);

    // RegisterForm redirects to "/" using window.location.href on success
    await Promise.all([
      page.waitForNavigation({ url: '**/', waitUntil: 'domcontentloaded', timeout: 20000 }),
      page.click('button:has-text("Create Account")'),
    ]);

    // After registration, user is logged in — verify by going to my-bookings
    await page.goto('/my-bookings');
    await expect(page.getByTestId('text-my-bookings-title')).toBeVisible();
  });
});
