const { Client } = require('ssh2');
const bcrypt = require('bcryptjs');

const BASE_URL = 'http://88.99.192.160:5022/api';
const timestamp = Date.now();
const adminUsername = `admin_${timestamp}`;
const customerUsername = `customer_${timestamp}`;
const password = 'password123';

let adminCookie = '';
let customerCookie = '';
let tourId = '';
let departureId = '';
let bookingId = '';

async function fetchWithCookie(url, options = {}) {
  const res = await fetch(url, options);
  const cookie = res.headers.get('set-cookie');
  let data;
  try {
    data = await res.json();
  } catch (e) {
    data = await res.text();
  }
  if (!res.ok) {
    throw new Error(`API Error ${res.status} at ${url}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return { data, cookie };
}

async function seedUsers() {
  const hash = await bcrypt.hash(password, 10);
  const adminId = `admin-id-${timestamp}`;
  const customerId = `cust-id-${timestamp}`;

  return new Promise((resolve, reject) => {
    const conn = new Client();
    conn.on('ready', () => {
      console.log(`[SSH] Seeding users into DB...`);
      
      const sql = `
        INSERT INTO users (id, username, password_hash, first_name) VALUES 
        ('${adminId}', '${adminUsername}', '${hash}', 'Test Admin'),
        ('${customerId}', '${customerUsername}', '${hash}', 'Test Customer');
        
        INSERT INTO user_profiles (user_id, role) VALUES 
        ('${adminId}', 'admin'),
        ('${customerId}', 'customer');
      `;
      
      const safeSql = sql.replace(/\n/g, ' ').replace(/\$/g, '\\$');
      const cmd = `docker exec -i tour_ops_db psql -U postgres -d tourops -c "${safeSql}"`;
      conn.exec(cmd, (err, stream) => {
        if (err) return reject(err);
        let out = '';
        stream.on('data', d => { out += d; process.stdout.write(d); });
        stream.on('close', () => {
          conn.end();
          resolve(out);
        });
      });
    }).on('keyboard-interactive', (name, instr, instrLang, prompts, finish) => {
      finish(['devteam73Sleep*']);
    }).connect({
      host: '88.99.192.160', port: 2235, username: 'devteam', tryKeyboard: true, password: 'devteam73Sleep*'
    });
  });
}

async function runRegression() {
  try {
    console.log("=== REGRESSION TEST START ===");

    // 1. Seed Users via DB
    await seedUsers();
    console.log(`✓ Created Admin: ${adminUsername} and Customer: ${customerUsername}`);

    // 2. Login Admin
    console.log(`2. Logging in Admin...`);
    const adminRes = await fetchWithCookie(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password, portal: 'admin' })
    });
    adminCookie = adminRes.cookie;
    console.log(`✓ Admin logged in`);

    // 3. Login Customer
    console.log(`3. Logging in Customer...`);
    const custRes = await fetchWithCookie(`${BASE_URL}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: customerUsername, password, portal: 'customer' })
    });
    customerCookie = custRes.cookie;
    console.log(`✓ Customer logged in`);

    // 4. Admin: Create Tour
    console.log(`4. Admin creating a new Tour...`);
    const tourRes = await fetchWithCookie(`${BASE_URL}/tours`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({
        title: `Regression Tour ${timestamp}`,
        slug: `regression-tour-${timestamp}`,
        duration: 5, basePrice: "1000", isPublished: false,
        countries: [], tags: [], galleryUrls: []
      })
    });
    tourId = tourRes.data.id;
    console.log(`✓ Tour created with ID: ${tourId}`);

    // 5. Admin: Edit Tour
    console.log(`5. Admin editing the Tour...`);
    await fetchWithCookie(`${BASE_URL}/tours/${tourId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ isPublished: true, basePrice: "1200" })
    });
    console.log(`✓ Tour edited successfully.`);

    // 6. Admin: Create Departure
    console.log(`6. Admin creating a Tour Departure...`);
    const depRes = await fetchWithCookie(`${BASE_URL}/departures`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({
        tourId, startDate: '2026-10-01', endDate: '2026-10-06', capacityTotal: 20, pricePerPerson: 1200
      })
    });
    departureId = depRes.data.id;
    console.log(`✓ Departure created with ID: ${departureId}`);

    // 7. Customer: Get Public Tours
    console.log(`7. Customer getting Public Tours...`);
    const pubRes = await fetchWithCookie(`${BASE_URL}/tours/public`, {
      method: 'GET', headers: { 'Cookie': customerCookie }
    });
    const found = pubRes.data.find(t => t.id === tourId);
    if (!found) throw new Error("Tour not found in public list");
    console.log(`✓ Verified Tour in Public Tours`);

    // 8. Customer: Book Tour
    console.log(`8. Customer booking the Tour...`);
    const bookRes = await fetchWithCookie(`${BASE_URL}/bookings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': customerCookie },
      body: JSON.stringify({
        tourId, departureId, bookingType: 'private_family', partySizeExpected: 2, totalPrice: 2400
      })
    });
    bookingId = bookRes.data.id;
    console.log(`✓ Booking created with ID: ${bookingId}`);

    // 9. Admin: View Bookings
    console.log(`9. Admin viewing bookings...`);
    const allBookingsRes = await fetchWithCookie(`${BASE_URL}/bookings`, {
      method: 'GET', headers: { 'Cookie': adminCookie }
    });
    const b = allBookingsRes.data.find(b => b.id === bookingId);
    if (!b) throw new Error("Booking not found for admin");
    console.log(`✓ Booking verified in Admin view`);

    // 10. Admin: Update Booking Status
    console.log(`10. Admin confirming the Booking...`);
    await fetchWithCookie(`${BASE_URL}/bookings/${bookingId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie },
      body: JSON.stringify({ status: 'confirmed' })
    });
    console.log(`✓ Booking confirmed.`);

    // 11. Customer: Cancel Booking
    console.log(`11. Customer cancelling the Booking...`);
    await fetchWithCookie(`${BASE_URL}/my-bookings/${bookingId}/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': customerCookie },
      body: JSON.stringify({ reason: 'Regression test cancellation' })
    });
    console.log(`✓ Booking cancelled.`);

    // 12. Admin: Delete Tour
    console.log(`12. Admin deleting the Tour...`);
    await fetchWithCookie(`${BASE_URL}/tours/${tourId}`, {
      method: 'DELETE', headers: { 'Cookie': adminCookie }
    });
    console.log(`✓ Tour deleted.`);

    console.log("=== REGRESSION TEST SUCCESSFUL ===");
    
    // Save output
    require('fs').writeFileSync('regression_output.txt', 'SUCCESS\nAll steps passed.\n');

  } catch (error) {
    console.error("=== REGRESSION TEST FAILED ===");
    console.error(error.message);
    require('fs').writeFileSync('regression_output.txt', `FAILED\n${error.message}\n`);
  }
}

runRegression();
