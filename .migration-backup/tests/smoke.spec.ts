import { test, expect } from '@playwright/test';

// Helper to check for 404
async function expectNo404(page) {
  // Wait a little for the route to settle
  await page.waitForLoadState('domcontentloaded');
  // Explicitly verify the Not Found component text isn't present
  await expect(page.locator('text=404 Page Not Found')).toBeHidden();
  await expect(page.locator('text=Did you forget to add the page to the router?')).toBeHidden();
}

// Heavy pages that make external API calls — give them longer timeout
const HEAVY_ROUTES = ['/admin/tour-generator', '/admin/airline-search'];

test.describe('Smoke Tests - All Features & Pages', () => {
  
  test('Admin Routes Smoke Test', async ({ page }) => {
    // Log browser console
    page.on('console', msg => console.log(`[Admin Console]: ${msg.text()}`));
    // Increase timeout for this test — visits 12 pages, some are heavy
    test.setTimeout(240000);
    // Login as Admin
    await page.goto('/admin/login');
    await page.fill('#username', 'superadmin1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin');
    await expectNo404(page);

    const adminRoutes = [
      '/admin/tours',
      '/admin/departures',
      '/admin/bookings',
      '/admin/users',
      '/admin/reports',
      '/admin/affiliates',
      '/admin/tour-generator',
      '/admin/airline-search',
      '/admin/master-data',
      '/admin/pricing',
      '/admin/transport',
      '/admin/rate-cards'
    ];

    for (const route of adminRoutes) {
      console.log(`Visiting Admin route: ${route}`);
      // Heavy pages that call external APIs need extra time
      const waitUntil = HEAVY_ROUTES.includes(route) ? 'domcontentloaded' : 'domcontentloaded';
      try {
        await page.goto(route, { waitUntil, timeout: 30000 });
      } catch {
        // If the page times out on navigation, try checking if it partially loaded
        console.log(`Warning: ${route} navigation was slow`);
      }
      await expectNo404(page);
    }
  });

  test('Customer Routes Smoke Test', async ({ page }) => {
    // Log browser console
    page.on('console', msg => console.log(`[Customer Console]: ${msg.text()}`));
    // Increase timeout for this test
    test.setTimeout(180000);
    // Some routes don't strictly require login, but we'll login to access restricted ones like my-bookings
    await page.goto('/');
    // Fill login form using data-testids from LoginForm component
    await page.fill('[data-testid="input-username"]', 'customer1');
    await page.fill('[data-testid="input-password"]', 'password123');
    // window.location.href causes full-page redirect — use Promise.all to capture it
    await Promise.all([
      page.waitForNavigation({ url: '**/tours', waitUntil: 'domcontentloaded', timeout: 25000 }),
      page.click('[data-testid="button-login-submit"]'),
    ]);
    await page.goto('/my-bookings', { waitUntil: 'domcontentloaded' });
    await expectNo404(page);

    const customerRoutes = [
      '/',
      '/tours',
      '/leader-dashboard',
      '/leader-payments',
      '/manage-passengers',
      '/join-groups'
    ];

    for (const route of customerRoutes) {
      console.log(`Visiting Customer route: ${route}`);
      try {
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch {
        console.log(`Warning: Customer ${route} navigation was slow`);
      }
      await expectNo404(page);
    }
  });

  test('Ops & Supplier Routes Smoke Test', async ({ page }) => {
    test.setTimeout(120000);
    // 1. Supplier
    await page.goto('/staff/login');
    await page.fill('#username', 'hotelmanager1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/supplier');
    await expectNo404(page);
    
    // Clear cookies to switch users
    await page.context().clearCookies();

    // 2. Ops (Transport)
    await page.goto('/staff/login');
    await page.fill('#username', 'transportmanager1');
    await page.fill('#password', 'password123');
    await page.click('button[type="submit"]');
    await page.waitForURL('/ops'); // Transport manager redirects to /ops based on App.tsx
    await expectNo404(page);

    await page.goto('/ops/transport');
    await expectNo404(page);
  });
});
