const puppeteer = require('puppeteer');

(async () => {
  console.log('Memulai Live Testing di Google Chrome...');
  const browser = await puppeteer.launch({
    headless: false,
    channel: 'chrome',
    slowMo: 100, // Memberikan waktu jeda agar user bisa memantau
    defaultViewport: null, 
    args: ['--start-maximized']
  });

  const page = await browser.newPage();
  
  // Test 1: City Manager
  console.log('1. Membuka halaman login staff...');
  await page.goto('https://biblicaljourney.net/staff/login', { waitUntil: 'networkidle2' });

  console.log('Login sebagai City Manager...');
  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', 'citymanager1');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  console.log('Menunggu Dashboard termuat...');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  // Tahan sejenak agar user bisa melihat Dashboard baru
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Mencoba klik tombol Create (CRUD)...');
  const createBtns = await page.$$('button');
  for (const btn of createBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Create')) {
      await btn.click();
      console.log('Tombol Create diklik! Notifikasi seharusnya muncul.');
      break;
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Mencoba klik tombol Delete (CRUD)...');
  const deleteBtns = await page.$$('button.destructive, button.bg-destructive, button.text-destructive');
  if (deleteBtns.length > 0) {
    await deleteBtns[0].click();
    console.log('Tombol Delete diklik!');
  }
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  // Clear site data to logout and try Supplier
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  
  const client = await page.target().createCDPSession();
  await client.send('Network.clearBrowserCookies');

  // Test 2: Hotel Manager (Supplier Dashboard)
  console.log('2. Membuka halaman login kembali...');
  await page.goto('https://biblicaljourney.net/staff/login', { waitUntil: 'networkidle2' });

  console.log('Login sebagai Hotel Manager...');
  await page.waitForSelector('input[type="text"]');
  await page.type('input[type="text"]', 'hotelmanager1');
  await page.type('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');

  console.log('Menunggu Supplier Dashboard termuat...');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Berpindah ke Tab Hotel Rates...');
  const tabs = await page.$$('button[role="tab"]');
  for (const tab of tabs) {
    const text = await page.evaluate(el => el.textContent, tab);
    if (text.includes('Hotel Rates')) {
      await tab.click();
      break;
    }
  }

  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Mencoba klik tombol Create Rate (CRUD)...');
  const rateBtns = await page.$$('button');
  for (const btn of rateBtns) {
    const text = await page.evaluate(el => el.textContent, btn);
    if (text.includes('Create Rate')) {
      await btn.click();
      console.log('Tombol Create Rate diklik!');
      break;
    }
  }
  
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('Live demo selesai! Menutup browser dalam 3 detik...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await browser.close();
})();
