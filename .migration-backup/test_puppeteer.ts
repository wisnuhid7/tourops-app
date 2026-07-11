import puppeteer from 'puppeteer';

(async () => {
  try {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Login as admin
    await page.goto('http://localhost:5000/admin/login');
    await page.type('input[name="username"]', 'superadmin1'); // From previous messages, user said 'login superadmin1'
    await page.type('input[name="password"]', 'dummy'); // Assuming default password or we can try 'password'
    
    // Find the login button and click it
    const btn = await page.$('button[type="submit"]');
    if (btn) await btn.click();
    else await page.keyboard.press('Enter');
    
    await page.waitForNavigation({ waitUntil: 'networkidle0' }).catch(() => {});
    
    // Fetch the booking from the admin api
    const cookies = await page.cookies();
    const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
    
    const res = await fetch('http://localhost:5000/api/admin/bookings/9f096297-3b67-46d7-a522-336ce9c8b032', {
      headers: { 'Cookie': cookieString }
    });
    
    const data = await res.text();
    console.log("BOOKING DATA:", data);
    
    await browser.close();
  } catch (err) {
    console.error(err);
  }
})();
