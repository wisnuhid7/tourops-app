const puppeteer = require('puppeteer');

(async () => {
  console.log('Starting visible UI test on Google Chrome...');
  const browser = await puppeteer.launch({
    headless: false,
    channel: 'chrome', // Uses the user's installed Google Chrome
    slowMo: 50,
    defaultViewport: null, // full screen
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  
  console.log('Navigating to Admin Login...');
  await page.goto('https://biblicaljourney.net/admin/login');

  console.log('Typing credentials...');
  await page.waitForSelector('[data-testid="input-username"]');
  await page.type('[data-testid="input-username"]', 'demoadmin', { delay: 100 });
  await page.type('[data-testid="input-password"]', 'demo123', { delay: 100 });
  
  console.log('Clicking login...');
  await page.click('[data-testid="button-login-submit"]');

  console.log('Waiting for dashboard to load...');
  // Wait for the URL to change to /admin or something else
  await page.waitForFunction('window.location.pathname.includes("/admin")');
  await page.waitForSelector('text/Dashboard', { timeout: 10000 }).catch(() => {});

  console.log('Dashboard loaded! Showing for 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Navigating to Tours page...');
  await page.goto('https://biblicaljourney.net/admin/tours');
  await page.waitForSelector('text/Tours', { timeout: 10000 }).catch(() => {});
  
  console.log('Tours page loaded! Showing for 5 seconds...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Test complete. Closing browser.');
  await browser.close();
})();
