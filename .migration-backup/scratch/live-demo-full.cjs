const puppeteer = require('puppeteer');

(async () => {
  console.log('Memulai Full Live Testing di Google Chrome...');
  // We don't close the browser at the end, and we leave it open.
  const browser = await puppeteer.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 300, // Diperlambat drastis agar sangat mudah dipantau mata manusia (300ms per action)
    defaultViewport: null, 
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  
  // ==========================================
  // SCENARIO 1: SUPER ADMIN (All access)
  // ==========================================
  console.log('--- SCENARIO 1: SUPER ADMIN ---');
  await page.goto('https://biblicaljourney.net/admin/login', { waitUntil: 'networkidle2' });

  console.log('Login sebagai Super Admin...');
  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', 'superadmin1');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await new Promise(resolve => setTimeout(resolve, 8000));
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('Membuka halaman Tours...');
  await page.goto('https://biblicaljourney.net/admin/tours', { waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Membuka halaman Bookings...');
  await page.goto('https://biblicaljourney.net/admin/bookings', { waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Membuka halaman Workflows...');
  await page.goto('https://biblicaljourney.net/admin/workflows', { waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Membuka halaman Users...');
  await page.goto('https://biblicaljourney.net/admin/users', { waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Logout Super Admin...');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');


  // ==========================================
  // SCENARIO 2: COUNTRY MANAGER (Ops)
  // ==========================================
  console.log('--- SCENARIO 2: COUNTRY MANAGER ---');
  await page.goto('https://biblicaljourney.net/staff/login', { waitUntil: 'networkidle2' });

  console.log('Login sebagai Country Manager...');
  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', 'countrymanager1');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await new Promise(resolve => setTimeout(resolve, 8000));
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Memverifikasi Dashboard Bookings untuk Manager...');
  await page.goto('https://biblicaljourney.net/ops', { waitUntil: 'networkidle2' });
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Logout Country Manager...');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await client.send('Network.clearBrowserCookies');


  // ==========================================
  // SCENARIO 3: SUPPLIER (Rates & Workflows)
  // ==========================================
  console.log('--- SCENARIO 3: SUPPLIER ---');
  await page.goto('https://biblicaljourney.net/staff/login', { waitUntil: 'networkidle2' });

  console.log('Login sebagai Supplier / Hotel Manager...');
  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', 'hotelmanager1');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await new Promise(resolve => setTimeout(resolve, 8000));
  await new Promise(resolve => setTimeout(resolve, 6000));
  
  console.log('Mengecek Tab Assigned Tasks...');
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('Mengecek Tab Hotel Rates & Membuat Data...');
  const tabs = await page.$$('button[role="tab"]');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text.includes('Hotel Rates')) {
      await tab.click();
      break;
    }
  }
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  const rateBtns = await page.$$('button');
  for (const btn of rateBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Create Rate')) {
      await btn.click();
      break;
    }
  }
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Logout Supplier...');
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await client.send('Network.clearBrowserCookies');


  // ==========================================
  // SCENARIO 4: TRAVEL AGENT (New Feature)
  // ==========================================
  console.log('--- SCENARIO 4: TRAVEL AGENT ---');
  await page.goto('https://biblicaljourney.net/staff/login', { waitUntil: 'networkidle2' });

  console.log('Login sebagai Travel Agent...');
  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', 'travelagent1');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  await new Promise(resolve => setTimeout(resolve, 8000));
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Mengecek Dashboard Generic untuk Role...');
  const createBtns = await page.$$('button');
  for (const btn of createBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Create')) {
      await btn.click();
      console.log('Create diklik!');
      break;
    }
  }
  await new Promise(resolve => setTimeout(resolve, 6000));

  const deleteBtns = await page.$$('button.destructive, button.bg-destructive, button.text-destructive');
  if (deleteBtns.length > 0) {
    await deleteBtns[0].click();
    console.log('Delete diklik!');
  }
  await new Promise(resolve => setTimeout(resolve, 6000));

  console.log('Live demo FULL selesai!');
  console.log('Browser akan TETAP DIBUKA sesuai permintaan pengguna agar bisa diinspeksi manual.');
  
  // Intentionally NOT calling browser.close() so the user can interact.
})();
