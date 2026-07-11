import puppeteer from 'puppeteer';

(async () => {
  console.log("Registering via API...");
  const randomUser = 'testuser' + Date.now();
  const res = await fetch('https://biblicaljourney.net/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: randomUser,
      password: 'password123',
      firstName: 'Test',
      lastName: 'User'
    })
  });
  
  const cookieHeader = res.headers.get('set-cookie') || '';
  const sidMatch = cookieHeader.match(/connect\.sid=([^;]+)/);
  const sid = sidMatch ? sidMatch[1] : '';

  console.log("Launching browser...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Set cookie
  if (sid) {
    await page.setCookie({
      name: 'connect.sid',
      value: sid,
      domain: 'biblicaljourney.net',
      path: '/'
    });
  }

  page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
  page.on('pageerror', error => console.log('BROWSER ERROR:', error.message));

  try {
    console.log("Going to /my-bookings...");
    await page.goto('https://biblicaljourney.net/my-bookings', { waitUntil: 'networkidle2' });
    
    await new Promise(r => setTimeout(r, 2000));
    const html = await page.evaluate(() => document.body.innerHTML);
    
    if (html.includes('No bookings yet')) {
      console.log("Page rendered 'No bookings yet' correctly.");
    } else {
      console.log("Page content:", html.substring(0, 500));
    }
  } catch (err) {
    console.error("Script error:", err);
  } finally {
    await browser.close();
  }
})();
