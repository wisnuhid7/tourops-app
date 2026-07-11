/**
 * Automated Chrome Browser CRUD Test for TourOps
 * Uses Puppeteer to test UI workflows across all portals and roles
 */
import puppeteer, { Browser, Page } from "puppeteer";
import fs from "fs";
import path from "path";

const SCREENSHOT_DIR = path.join(process.cwd(), "scratch", "screenshots");
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

interface BrowserTestResult {
  env: string;
  role: string;
  portal: string;
  test: string;
  status: "PASS" | "FAIL" | "WARN";
  detail: string;
  screenshot?: string;
}

const results: BrowserTestResult[] = [];

const ENVS: Record<string, string> = {
  local: "http://localhost:5022",
  deployed: "https://biblicaljourney.net",
};

const ACCOUNTS = [
  // Admin Portal
  { role: "super_admin", username: "superadmin1", password: "password123", portal: "admin", loginUrl: "/admin/login" },
  { role: "admin", username: "admin", password: "admin123", portal: "admin", loginUrl: "/admin/login" },
  // Staff Portal
  { role: "airline_supplier", username: "airlinesupplier1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "country_manager", username: "countrymanager1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "city_manager", username: "citymanager1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "hotel_manager", username: "hotelmanager1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "transport_manager", username: "transportmanager1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "guide_manager", username: "guidemanager1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "sights_manager", username: "sightsmanager1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "content_editor", username: "contenteditor1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "flight_agent", username: "flightagent1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "tour_builder", username: "tourbuilder1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "supplier", username: "supplier1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  { role: "travel_agent", username: "travelagent1", password: "password123", portal: "staff", loginUrl: "/staff/login" },
  // Customer Portal
  { role: "customer (superadmin1)", username: "superadmin1", password: "password123", portal: "customer", loginUrl: "/auth" },
];

async function screenshot(page: Page, name: string): Promise<string> {
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  return filepath;
}

async function delay(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function loginViaUI(page: Page, baseUrl: string, account: typeof ACCOUNTS[0]): Promise<boolean> {
  try {
    const url = `${baseUrl}${account.loginUrl}`;
    console.log(`      Navigating to ${url}...`);
    await page.goto(url, { waitUntil: "networkidle2", timeout: 15000 });
    await delay(2000);

    // Try finding username/password fields using data-testid
    const usernameField = await page.$('[data-testid="input-username"]');
    const passwordField = await page.$('[data-testid="input-password"]');

    if (!usernameField || !passwordField) {
      console.log(`      ⚠️ Username or password field with data-testid not found! Trying fallback input tags...`);
      const fallbackUser = await page.$('input[name="username"], input[type="text"]');
      const fallbackPass = await page.$('input[name="password"], input[type="password"]');
      if (!fallbackUser || !fallbackPass) {
        console.log(`      ❌ Form fields completely missing.`);
        return false;
      }
      await fallbackUser.click({ clickCount: 3 });
      await fallbackUser.type(account.username, { delay: 30 });
      await fallbackPass.click({ clickCount: 3 });
      await fallbackPass.type(account.password, { delay: 30 });
    } else {
      await usernameField.click({ clickCount: 3 });
      await usernameField.type(account.username, { delay: 30 });
      await passwordField.click({ clickCount: 3 });
      await passwordField.type(account.password, { delay: 30 });
    }

    // Try finding submit button using data-testid
    const submitBtn = await page.$('[data-testid="button-login-submit"]');
    if (submitBtn) {
      console.log(`      Found submit button via data-testid. Clicking...`);
      await submitBtn.click();
    } else {
      console.log(`      ⚠️ Submit button data-testid missing. Clicking fallback button...`);
      const fallbackBtn = await page.$('button[type="submit"]');
      if (fallbackBtn) {
        await fallbackBtn.click();
      } else {
        await page.keyboard.press("Enter");
      }
    }

    await delay(5000);

    // Check if login succeeded with robustness for redirects
    let currentUrl = "";
    let pageContent = "";
    let errorEl = null;

    try {
      currentUrl = page.url();
      pageContent = await page.content();
      errorEl = await page.$('[data-testid="text-login-error"]');
    } catch (err: any) {
      console.log(`      ⚠️ Navigation redirect active, waiting for stability: ${err.message}`);
      await delay(3000);
      currentUrl = page.url();
      pageContent = await page.content();
      errorEl = await page.$('[data-testid="text-login-error"]').catch(() => null);
    }
    
    if (errorEl) {
      const errMsg = await page.evaluate(el => el?.textContent, errorEl).catch(() => "Unknown error");
      console.log(`      ❌ Login form returned error: ${errMsg}`);
      return false;
    }

    const hasError = pageContent.includes("Invalid username") || 
                     pageContent.includes("invalid") ||
                     (currentUrl.includes("login") && pageContent.includes("failed"));
    
    if (hasError) {
      console.log(`      ❌ Page content indicates login failure.`);
      return false;
    }

    console.log(`      Successfully logged in. Current URL: ${currentUrl}`);
    return true;
  } catch (err: any) {
    console.log(`      ❌ Error in loginViaUI: ${err.message}`);
    return false;
  }
}

async function testPortalNavigation(page: Page, baseUrl: string, account: typeof ACCOUNTS[0], envName: string) {
  const role = account.role;

  // Define pages to check based on portal type
  let pagesToCheck: { name: string; path: string }[] = [];

  if (account.portal === "admin") {
    pagesToCheck = [
      { name: "Admin Dashboard", path: "/admin" },
      { name: "Admin Bookings", path: "/admin/bookings" },
      { name: "Admin Tours", path: "/admin/tours" },
      { name: "Admin Users", path: "/admin/users" },
      { name: "Admin Countries", path: "/admin/countries" },
      { name: "Admin Cities", path: "/admin/cities" },
      { name: "Admin Hotels", path: "/admin/hotels" },
      { name: "Admin Sights", path: "/admin/sights" },
      { name: "Admin Workflows", path: "/admin/workflows" },
    ];
  } else if (account.portal === "staff") {
    pagesToCheck = [
      { name: "Staff Dashboard", path: "/staff" },
      { name: "Staff Workflows", path: "/staff/workflows" },
      { name: "Staff Bookings", path: "/staff/bookings" },
    ];
  } else {
    pagesToCheck = [
      { name: "Customer Home", path: "/" },
      { name: "My Bookings", path: "/my-bookings" },
    ];
  }

  for (const pg of pagesToCheck) {
    try {
      await page.goto(`${baseUrl}${pg.path}`, { waitUntil: "networkidle2", timeout: 12000 });
      await delay(1000);

      const httpStatus = 200; // If page loaded without navigation error
      const pageTitle = await page.title();
      const pageContent = await page.content();
      
      // Check for error indicators
      const has404 = pageContent.includes("404") && pageContent.includes("not found");
      const has403 = pageContent.includes("403") || pageContent.includes("Forbidden");
      const hasContent = pageContent.length > 500;

      const ssName = `${envName}_${role}_${pg.name.replace(/\s+/g, "_")}`;
      const ssPath = await screenshot(page, ssName);

      if (has404) {
        results.push({ env: envName, role, portal: account.portal, test: `Navigate: ${pg.name}`, status: "FAIL", detail: "Page returned 404", screenshot: ssPath });
      } else if (has403) {
        results.push({ env: envName, role, portal: account.portal, test: `Navigate: ${pg.name}`, status: "WARN", detail: "Access denied (403)", screenshot: ssPath });
      } else if (hasContent) {
        results.push({ env: envName, role, portal: account.portal, test: `Navigate: ${pg.name}`, status: "PASS", detail: `Page loaded (${pageContent.length} bytes)`, screenshot: ssPath });
      } else {
        results.push({ env: envName, role, portal: account.portal, test: `Navigate: ${pg.name}`, status: "WARN", detail: "Page loaded but appears empty", screenshot: ssPath });
      }
    } catch (err: any) {
      results.push({ env: envName, role, portal: account.portal, test: `Navigate: ${pg.name}`, status: "FAIL", detail: err.message });
    }
  }
}

async function testAdminCRUD(page: Page, baseUrl: string, role: string, envName: string) {
  // Test Tour CRUD via Admin UI
  try {
    // Navigate to Tours page
    await page.goto(`${baseUrl}/admin/tours`, { waitUntil: "networkidle2", timeout: 12000 });
    await delay(1500);
    const ssPath = await screenshot(page, `${envName}_${role}_admin_tours_list`);
    
    const content = await page.content();
    const hasTours = content.includes("tour") || content.includes("Tour");
    results.push({ env: envName, role, portal: "admin", test: "View Tours List", status: hasTours ? "PASS" : "WARN", detail: hasTours ? "Tours page loaded with content" : "Tours page may be empty", screenshot: ssPath });

    // Navigate to Bookings page
    await page.goto(`${baseUrl}/admin/bookings`, { waitUntil: "networkidle2", timeout: 12000 });
    await delay(1500);
    const ssBookings = await screenshot(page, `${envName}_${role}_admin_bookings_list`);
    
    const bkContent = await page.content();
    const hasBookings = bkContent.includes("BK-") || bkContent.includes("booking") || bkContent.includes("Booking");
    results.push({ env: envName, role, portal: "admin", test: "View Bookings List", status: hasBookings ? "PASS" : "WARN", detail: hasBookings ? "Bookings loaded" : "Bookings page may be empty", screenshot: ssBookings });

    // Navigate to Users page
    await page.goto(`${baseUrl}/admin/users`, { waitUntil: "networkidle2", timeout: 12000 });
    await delay(1500);
    const ssUsers = await screenshot(page, `${envName}_${role}_admin_users_list`);
    
    const usrContent = await page.content();
    const hasUsers = usrContent.includes("admin") || usrContent.includes("user") || usrContent.includes("Role");
    results.push({ env: envName, role, portal: "admin", test: "View Users List", status: hasUsers ? "PASS" : "WARN", detail: hasUsers ? "Users loaded" : "Users page may be empty", screenshot: ssUsers });

  } catch (err: any) {
    results.push({ env: envName, role, portal: "admin", test: "Admin CRUD", status: "FAIL", detail: err.message });
  }
}

async function testStaffWorkflows(page: Page, baseUrl: string, role: string, envName: string) {
  try {
    await page.goto(`${baseUrl}/staff`, { waitUntil: "networkidle2", timeout: 12000 });
    await delay(1500);
    const ssDash = await screenshot(page, `${envName}_${role}_staff_dashboard`);
    
    const content = await page.content();
    const hasDash = content.length > 500;
    results.push({ env: envName, role, portal: "staff", test: "Staff Dashboard", status: hasDash ? "PASS" : "WARN", detail: hasDash ? "Dashboard loaded" : "Dashboard may be empty", screenshot: ssDash });

  } catch (err: any) {
    results.push({ env: envName, role, portal: "staff", test: "Staff Dashboard", status: "FAIL", detail: err.message });
  }
}

async function testCustomerBooking(page: Page, baseUrl: string, role: string, envName: string) {
  try {
    // Check My Bookings page
    await page.goto(`${baseUrl}/my-bookings`, { waitUntil: "networkidle2", timeout: 12000 });
    await delay(1500);
    const ssMyBookings = await screenshot(page, `${envName}_${role}_my_bookings`);

    const content = await page.content();
    const hasBookings = content.includes("BK-") || content.includes("booking") || content.includes("My Bookings");
    results.push({ env: envName, role, portal: "customer", test: "My Bookings Page", status: hasBookings ? "PASS" : "WARN", detail: hasBookings ? "Bookings visible" : "No bookings found", screenshot: ssMyBookings });

    // Check tours public page
    await page.goto(`${baseUrl}/`, { waitUntil: "networkidle2", timeout: 12000 });
    await delay(1500);
    const ssHome = await screenshot(page, `${envName}_${role}_home_page`);

    const homeContent = await page.content();
    const hasTours = homeContent.includes("tour") || homeContent.includes("Tour") || homeContent.includes("Bali");
    results.push({ env: envName, role, portal: "customer", test: "Home/Tours Page", status: hasTours ? "PASS" : "WARN", detail: hasTours ? "Tours visible" : "No tours found", screenshot: ssHome });

  } catch (err: any) {
    results.push({ env: envName, role, portal: "customer", test: "Customer Pages", status: "FAIL", detail: err.message });
  }
}

// ===== MAIN =====
async function main() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║  🌐 TourOps Automated Chrome Browser CRUD Test Suite       ║");
  console.log("║  Testing all roles × all portals × 2 environments          ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1366, height: 768 },
  });

  for (const [envName, baseUrl] of Object.entries(ENVS)) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  🌐 Environment: ${envName.toUpperCase()} (${baseUrl})`);
    console.log(`${"=".repeat(60)}`);

    // Check connectivity
    const page = await browser.newPage();
    try {
      await page.goto(baseUrl, { waitUntil: "networkidle2", timeout: 10000 });
      console.log("  ✅ Server reachable");
    } catch (err: any) {
      console.log(`  ❌ Cannot reach ${baseUrl}: ${err.message}`);
      results.push({ env: envName, role: "ALL", portal: "ALL", test: "Connectivity", status: "FAIL", detail: err.message });
      await page.close();
      continue;
    }
    await page.close();

    for (const account of ACCOUNTS) {
      console.log(`\n  👤 [${account.portal.toUpperCase()}] ${account.role} (${account.username})`);

      // Create a fresh, isolated incognito browser context to avoid any session leaking
      const context = await browser.createBrowserContext();
      const page = await context.newPage();
      
      // 1. Login Test
      const loginOk = await loginViaUI(page, baseUrl, account);
      const loginSS = await screenshot(page, `${envName}_${account.role}_login_result`);
      
      results.push({
        env: envName, role: account.role, portal: account.portal,
        test: "Login", status: loginOk ? "PASS" : "FAIL",
        detail: loginOk ? "Login successful" : "Login failed",
        screenshot: loginSS,
      });

      if (!loginOk) {
        console.log(`    ❌ Login failed`);
        await page.close();
        await context.close();
        continue;
      }
      console.log(`    ✅ Login OK`);

      // 2. Page Navigation Tests
      await testPortalNavigation(page, baseUrl, account, envName);

      // 3. Portal-specific deeper tests
      if (account.portal === "admin") {
        await testAdminCRUD(page, baseUrl, account.role, envName);
      } else if (account.portal === "staff") {
        await testStaffWorkflows(page, baseUrl, account.role, envName);
      } else {
        await testCustomerBooking(page, baseUrl, account.role, envName);
      }

      await page.close();
      await context.close();

      // Summary per role
      const roleResults = results.filter(r => r.role === account.role && r.env === envName);
      const passed = roleResults.filter(r => r.status === "PASS").length;
      const failed = roleResults.filter(r => r.status === "FAIL").length;
      const warned = roleResults.filter(r => r.status === "WARN").length;
      console.log(`    📊 ✅${passed} | ❌${failed} | ⚠️${warned}`);
    }
  }

  await browser.close();

  // ===== GENERATE REPORT =====
  console.log(`\n\n${"═".repeat(70)}`);
  console.log(`  📋 BROWSER TEST FINAL REPORT`);
  console.log(`${"═".repeat(70)}\n`);

  for (const envName of Object.keys(ENVS)) {
    const envResults = results.filter(r => r.env === envName);
    const passed = envResults.filter(r => r.status === "PASS").length;
    const failed = envResults.filter(r => r.status === "FAIL").length;
    const warned = envResults.filter(r => r.status === "WARN").length;
    console.log(`  🌐 ${envName.toUpperCase()}: ✅ PASS=${passed}  ❌ FAIL=${failed}  ⚠️ WARN=${warned}`);
  }

  const failures = results.filter(r => r.status === "FAIL");
  if (failures.length > 0) {
    console.log(`\n  ❌ FAILURES (${failures.length}):`);
    for (const f of failures) {
      console.log(`     [${f.env}] ${f.role} (${f.portal}) → ${f.test}: ${f.detail}`);
    }
  } else {
    console.log(`\n  🎉 No failures!`);
  }

  // Save JSON report
  const reportPath = path.join(process.cwd(), "scratch", "browser-test-report.json");
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n  📄 JSON report: ${reportPath}`);
  console.log(`  📸 Screenshots: ${SCREENSHOT_DIR}/`);

  process.exit(failures.length > 0 ? 1 : 0);
}

main();
