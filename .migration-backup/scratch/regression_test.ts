import fs from 'fs';

async function runRegression() {
  const BASE_URL = 'http://88.99.192.160:5022/api';
  let adminCookie = '';
  let customerCookie = '';
  const timestamp = Date.now();
  
  // 1. Create a customer
  console.log(`[TEST] Registering new customer user_${timestamp}...`);
  const res1 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `customer_${timestamp}`,
      password: 'password123',
      firstName: 'Test',
      lastName: 'Customer'
    })
  });
  if (!res1.ok) throw new Error('Customer registration failed: ' + await res1.text());
  customerCookie = res1.headers.get('set-cookie') || '';
  console.log('✓ Customer registered successfully.');

  // 2. Create an admin
  console.log(`[TEST] Registering new admin admin_${timestamp}...`);
  const res2 = await fetch(`${BASE_URL}/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `admin_${timestamp}`,
      password: 'password123',
      firstName: 'Test',
      lastName: 'Admin'
    })
  });
  if (!res2.ok) throw new Error('Admin registration failed: ' + await res2.text());
  adminCookie = res2.headers.get('set-cookie') || '';
  const adminData = await res2.json();
  console.log('✓ Admin registered successfully.');

  // We need to make the admin user an actual admin in the DB.
  // Since we can't do it via API without another admin, we will run a quick DB script locally via SSH or just use a known admin.
  // Wait, I can't easily make them an admin without DB access.
  console.log('We cannot proceed with Admin UI tests without elevating the user to Admin role.');
}

runRegression().catch(console.error);
