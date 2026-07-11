import puppeteer from 'puppeteer';

(async () => {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Capture console messages
  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  try {
    console.log("Navigating to login...");
    await page.goto('http://localhost:5022/staff-login', { waitUntil: 'networkidle2' });
    
    // Login as customer1
    await page.type('input[type="text"]', 'customer1');
    await page.type('input[type="password"]', 'password123');
    await page.click('button[type="submit"]');
    
    console.log("Waiting for navigation after login...");
    await page.waitForNavigation({ waitUntil: 'networkidle2' });
    
    console.log("Current URL:", page.url());
    
    // Go to My Bookings
    console.log("Going to /my-bookings...");
    await page.goto('http://localhost:5022/my-bookings', { waitUntil: 'networkidle2' });
    console.log("Current URL:", page.url());
    
    // Wait for the booking card to load
    console.log("Waiting for booking card...");
    await page.waitForSelector('.hover-elevate', { timeout: 10000 });
    
    // Click the first booking card
    console.log("Clicking the first booking...");
    await page.click('.hover-elevate');
    
    console.log("Waiting for detail page to load...");
    await new Promise(r => setTimeout(r, 3000));
    
    console.log("Current URL after click:", page.url());
    
    // Check if body is empty (white screen)
    const bodyHTML = await page.evaluate(() => document.body.innerHTML);
    if (bodyHTML.includes('Booking Confirmation') || bodyHTML.includes('Trip Summary')) {
      console.log("Page loaded successfully.");
    } else {
      console.log("Page might be blank!");
    }
    
  } catch (err) {
    console.error("Script error:", err);
  } finally {
    await browser.close();
  }
})();
