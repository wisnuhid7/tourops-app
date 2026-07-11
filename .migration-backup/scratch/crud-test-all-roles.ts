/**
 * Comprehensive CRUD Test Script for TourOps
 * Tests all roles across both Local and Deployed environments
 * Uses pure HTTP fetch API calls (no browser needed)
 */

// ===== CONFIGURATION =====
const ENVIRONMENTS = {
  local: "http://localhost:5022",
  deployed: "https://biblicaljourney.net",
};

const TEST_ACCOUNTS: Record<string, { username: string; password: string; portal: string; role: string }> = {
  // Admin roles
  super_admin: { username: "superadmin1", password: "password123", portal: "admin", role: "super_admin" },
  admin: { username: "admin", password: "admin123", portal: "admin", role: "admin" },
  // Staff roles
  airline_supplier: { username: "airlinesupplier1", password: "password123", portal: "staff", role: "airline_supplier" },
  country_manager: { username: "countrymanager1", password: "password123", portal: "staff", role: "country_manager" },
  city_manager: { username: "citymanager1", password: "password123", portal: "staff", role: "city_manager" },
  hotel_manager: { username: "hotelmanager1", password: "password123", portal: "staff", role: "hotel_manager" },
  transport_manager: { username: "transportmanager1", password: "password123", portal: "staff", role: "transport_manager" },
  guide_manager: { username: "guidemanager1", password: "password123", portal: "staff", role: "guide_manager" },
  sights_manager: { username: "sightsmanager1", password: "password123", portal: "staff", role: "sights_manager" },
  content_editor: { username: "contenteditor1", password: "password123", portal: "staff", role: "content_editor" },
  flight_agent: { username: "flightagent1", password: "password123", portal: "staff", role: "flight_agent" },
  tour_builder: { username: "tourbuilder1", password: "password123", portal: "staff", role: "tour_builder" },
  supplier: { username: "supplier1", password: "password123", portal: "staff", role: "supplier" },
  travel_agent: { username: "travelagent1", password: "password123", portal: "staff", role: "travel_agent" },
};

// ===== TYPES =====
interface TestResult {
  role: string;
  env: string;
  category: string;
  operation: string;
  endpoint: string;
  status: "PASS" | "FAIL" | "SKIP" | "EXPECTED_DENY";
  httpStatus?: number;
  detail: string;
}

const results: TestResult[] = [];

// ===== HTTP HELPER =====
async function api(
  baseUrl: string,
  method: string,
  path: string,
  cookie: string,
  body?: any,
): Promise<{ status: number; data: any; headers: Headers }> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (cookie) headers["Cookie"] = cookie;

  try {
    const resp = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    let data: any;
    try {
      data = await resp.json();
    } catch {
      data = null;
    }
    return { status: resp.status, data, headers: resp.headers };
  } catch (err: any) {
    return { status: 0, data: { error: err.message }, headers: new Headers() };
  }
}

// ===== LOGIN HELPER =====
async function login(
  baseUrl: string,
  username: string,
  password: string,
  portal: string,
): Promise<{ cookie: string; success: boolean; detail: string }> {
  try {
    const resp = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, portal }),
      redirect: "manual",
    });

    const setCookies = resp.headers.getSetCookie?.() || [];
    const cookie = setCookies.map((c: string) => c.split(";")[0]).join("; ");

    if (resp.status === 200) {
      return { cookie, success: true, detail: "Login OK" };
    } else {
      const data = await resp.json().catch(() => ({}));
      return { cookie: "", success: false, detail: `HTTP ${resp.status}: ${(data as any).message || "Unknown"}` };
    }
  } catch (err: any) {
    return { cookie: "", success: false, detail: `Connection Error: ${err.message}` };
  }
}

// ===== TEST FUNCTIONS BY CATEGORY =====

async function testToursCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Tours";

  // READ
  const readAll = await api(baseUrl, "GET", "/api/tours", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/tours", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} tours` : readAll.data?.message || "Error" });

  const readPublic = await api(baseUrl, "GET", "/api/tours/public", cookie);
  results.push({ role, env, category: cat, operation: "READ (public)", endpoint: "GET /api/tours/public", status: readPublic.status === 200 ? "PASS" : "FAIL", httpStatus: readPublic.status, detail: `${readPublic.data?.length || 0} published tours` });

  // CREATE (admin/country_manager only)
  const ts = Date.now();
  const createRes = await api(baseUrl, "POST", "/api/tours", cookie, {
    title: `Test Tour ${ts}`, slug: `test-tour-${ts}`, description: "Automated test", duration: 3, basePrice: "100", isPublished: false,
  });
  if (createRes.status === 201 || createRes.status === 200) {
    const tourId = createRes.data?.id;
    results.push({ role, env, category: cat, operation: "CREATE", endpoint: "POST /api/tours", status: "PASS", httpStatus: createRes.status, detail: `ID: ${tourId}` });

    // UPDATE
    const updateRes = await api(baseUrl, "PATCH", `/api/tours/${tourId}`, cookie, { description: "Updated description" });
    results.push({ role, env, category: cat, operation: "UPDATE", endpoint: `PATCH /api/tours/:id`, status: updateRes.status === 200 ? "PASS" : "FAIL", httpStatus: updateRes.status, detail: updateRes.data?.description || updateRes.data?.message || "" });

    // DELETE
    const deleteRes = await api(baseUrl, "DELETE", `/api/tours/${tourId}`, cookie);
    results.push({ role, env, category: cat, operation: "DELETE", endpoint: `DELETE /api/tours/:id`, status: deleteRes.status === 200 ? "PASS" : "FAIL", httpStatus: deleteRes.status, detail: deleteRes.data?.success ? "Deleted" : deleteRes.data?.message || "" });
  } else {
    const expected = createRes.status === 403;
    results.push({ role, env, category: cat, operation: "CREATE", endpoint: "POST /api/tours", status: expected ? "EXPECTED_DENY" : "FAIL", httpStatus: createRes.status, detail: createRes.data?.message || "" });
    results.push({ role, env, category: cat, operation: "UPDATE", endpoint: "PATCH /api/tours/:id", status: "SKIP", detail: "No tour created" });
    results.push({ role, env, category: cat, operation: "DELETE", endpoint: "DELETE /api/tours/:id", status: "SKIP", detail: "No tour created" });
  }
}

async function testBookingsCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Bookings";

  // READ (staff/admin see all)
  const readAll = await api(baseUrl, "GET", "/api/bookings", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/bookings", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} bookings` : readAll.data?.message || "" });

  // READ (customer's own bookings)
  const readMy = await api(baseUrl, "GET", "/api/my-bookings", cookie);
  results.push({ role, env, category: cat, operation: "READ (my)", endpoint: "GET /api/my-bookings", status: readMy.status === 200 ? "PASS" : "FAIL", httpStatus: readMy.status, detail: readMy.status === 200 ? `${readMy.data?.length || 0} bookings` : readMy.data?.message || "" });

  // CREATE booking needs a valid tour/departure; get one
  const tours = await api(baseUrl, "GET", "/api/tours/public", cookie);
  const deps = tours.data && tours.data.length > 0 ? await api(baseUrl, "GET", `/api/tours/${tours.data[0].id}/departures`, cookie) : { status: 0, data: [] };

  if (deps.data && deps.data.length > 0) {
    const ts = Date.now();
    const createRes = await api(baseUrl, "POST", "/api/bookings", cookie, {
      tourId: tours.data[0].id, departureId: deps.data[0].id, bookingType: "private_family",
      groupName: `Test Family ${ts}`, partySizeExpected: 2,
    });
    if (createRes.status === 200 || createRes.status === 201) {
      const bkId = createRes.data?.id;
      results.push({ role, env, category: cat, operation: "CREATE", endpoint: "POST /api/bookings", status: "PASS", httpStatus: createRes.status, detail: `Code: ${createRes.data?.bookingCode}` });

      // UPDATE (admin only)
      const updateRes = await api(baseUrl, "PATCH", `/api/bookings/${bkId}`, cookie, { notes: "Test updated" });
      results.push({ role, env, category: cat, operation: "UPDATE", endpoint: "PATCH /api/bookings/:id", status: updateRes.status === 200 ? "PASS" : updateRes.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: updateRes.status, detail: updateRes.data?.message || "OK" });

      // DELETE (admin only)
      const deleteRes = await api(baseUrl, "DELETE", `/api/bookings/${bkId}`, cookie);
      results.push({ role, env, category: cat, operation: "DELETE", endpoint: "DELETE /api/bookings/:id", status: deleteRes.status === 200 ? "PASS" : deleteRes.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: deleteRes.status, detail: deleteRes.data?.message || deleteRes.data?.success ? "Deleted" : "" });
    } else {
      results.push({ role, env, category: cat, operation: "CREATE", endpoint: "POST /api/bookings", status: createRes.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: createRes.status, detail: createRes.data?.message || "" });
      results.push({ role, env, category: cat, operation: "UPDATE", endpoint: "PATCH /api/bookings/:id", status: "SKIP", detail: "No booking created" });
      results.push({ role, env, category: cat, operation: "DELETE", endpoint: "DELETE /api/bookings/:id", status: "SKIP", detail: "No booking created" });
    }
  } else {
    results.push({ role, env, category: cat, operation: "CREATE", endpoint: "POST /api/bookings", status: "SKIP", detail: "No tours/departures" });
    results.push({ role, env, category: cat, operation: "UPDATE", endpoint: "PATCH /api/bookings/:id", status: "SKIP", detail: "No tours/departures" });
    results.push({ role, env, category: cat, operation: "DELETE", endpoint: "DELETE /api/bookings/:id", status: "SKIP", detail: "No tours/departures" });
  }
}

async function testCountriesCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Countries";
  const readAll = await api(baseUrl, "GET", "/api/countries", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/countries", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} countries` : readAll.data?.message || "" });

  const ts = Date.now();
  const createRes = await api(baseUrl, "POST", "/api/countries", cookie, { code: `T${ts % 100}`, name: `TestCountry${ts}` });
  if (createRes.status === 200 || createRes.status === 201) {
    const id = createRes.data?.id;
    results.push({ role, env, category: cat, operation: "CREATE", endpoint: "POST /api/countries", status: "PASS", httpStatus: createRes.status, detail: `ID: ${id}` });

    const updateRes = await api(baseUrl, "PATCH", `/api/countries/${id}`, cookie, { name: `Updated${ts}` });
    results.push({ role, env, category: cat, operation: "UPDATE", endpoint: "PATCH /api/countries/:id", status: updateRes.status === 200 ? "PASS" : "FAIL", httpStatus: updateRes.status, detail: updateRes.data?.name || updateRes.data?.message || "" });

    const deleteRes = await api(baseUrl, "DELETE", `/api/countries/${id}`, cookie);
    results.push({ role, env, category: cat, operation: "DELETE", endpoint: "DELETE /api/countries/:id", status: deleteRes.status === 200 ? "PASS" : "FAIL", httpStatus: deleteRes.status, detail: deleteRes.data?.success ? "Deleted" : deleteRes.data?.message || "" });
  } else {
    const expected = createRes.status === 403;
    results.push({ role, env, category: cat, operation: "CREATE", endpoint: "POST /api/countries", status: expected ? "EXPECTED_DENY" : "FAIL", httpStatus: createRes.status, detail: createRes.data?.message || "" });
    results.push({ role, env, category: cat, operation: "UPDATE", endpoint: "PATCH /api/countries/:id", status: "SKIP", detail: "No country created" });
    results.push({ role, env, category: cat, operation: "DELETE", endpoint: "DELETE /api/countries/:id", status: "SKIP", detail: "No country created" });
  }
}

async function testCitiesCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Cities";
  const readAll = await api(baseUrl, "GET", "/api/cities", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/cities", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} cities` : readAll.data?.message || "" });
}

async function testHotelsCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Hotels";
  const readAll = await api(baseUrl, "GET", "/api/hotels", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/hotels", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} hotels` : readAll.data?.message || "" });
}

async function testSightsCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Sights";
  const readAll = await api(baseUrl, "GET", "/api/sights", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/sights", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} sights` : readAll.data?.message || "" });
}

async function testWorkflowsCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Workflows";
  const readAll = await api(baseUrl, "GET", "/api/workflows", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/workflows", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} workflows` : readAll.data?.message || "" });
}

async function testDocumentsCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Documents";
  const readAll = await api(baseUrl, "GET", "/api/documents", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/documents", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} documents` : readAll.data?.message || "" });
}

async function testPaymentsCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Payments";
  const readAll = await api(baseUrl, "GET", "/api/payments", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/payments", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} payments` : readAll.data?.message || "" });
}

async function testAssignmentsCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Assignments";
  const readAll = await api(baseUrl, "GET", "/api/assignments", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/assignments", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} assignments` : readAll.data?.message || "" });
}

async function testUserProfilesCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "User Profiles";
  const readSelf = await api(baseUrl, "GET", "/api/user-profile", cookie);
  results.push({ role, env, category: cat, operation: "READ (self)", endpoint: "GET /api/user-profile", status: readSelf.status === 200 ? "PASS" : "FAIL", httpStatus: readSelf.status, detail: readSelf.status === 200 ? `Role: ${readSelf.data?.role}` : readSelf.data?.message || "" });

  const readAll = await api(baseUrl, "GET", "/api/user-profiles", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/user-profiles", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} profiles` : readAll.data?.message || "" });
}

async function testNotifications(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Notifications";
  const readAll = await api(baseUrl, "GET", "/api/notifications", cookie);
  results.push({ role, env, category: cat, operation: "READ", endpoint: "GET /api/notifications", status: readAll.status === 200 ? "PASS" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} notifications` : readAll.data?.message || "" });
}

async function testTransportCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Transport";
  const readCompanies = await api(baseUrl, "GET", "/api/transport-companies", cookie);
  results.push({ role, env, category: cat, operation: "READ (companies)", endpoint: "GET /api/transport-companies", status: readCompanies.status === 200 ? "PASS" : readCompanies.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readCompanies.status, detail: readCompanies.status === 200 ? `${readCompanies.data?.length || 0} companies` : readCompanies.data?.message || "" });
}

async function testAirlineCRUD(baseUrl: string, cookie: string, role: string, env: string) {
  const cat = "Airlines";
  const readAll = await api(baseUrl, "GET", "/api/airline-agencies", cookie);
  results.push({ role, env, category: cat, operation: "READ (all)", endpoint: "GET /api/airline-agencies", status: readAll.status === 200 ? "PASS" : readAll.status === 403 ? "EXPECTED_DENY" : "FAIL", httpStatus: readAll.status, detail: readAll.status === 200 ? `${readAll.data?.length || 0} agencies` : readAll.data?.message || "" });
}

// ===== MAIN RUNNER =====
async function runTests() {
  console.log("╔══════════════════════════════════════════════════════════════╗");
  console.log("║     TourOps Comprehensive CRUD Test Suite                   ║");
  console.log("║     Testing ALL roles × ALL features × 2 environments      ║");
  console.log("╚══════════════════════════════════════════════════════════════╝\n");

  for (const [envName, baseUrl] of Object.entries(ENVIRONMENTS)) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`  🌐 Environment: ${envName.toUpperCase()} (${baseUrl})`);
    console.log(`${"=".repeat(60)}`);

    // Quick connectivity check
    try {
      const ping = await fetch(`${baseUrl}/api/tours/public`, { signal: AbortSignal.timeout(8000) });
      if (ping.status !== 200) {
        console.log(`  ⚠️  Server responded with ${ping.status} — may have issues`);
      } else {
        console.log(`  ✅ Server is reachable`);
      }
    } catch (err: any) {
      console.log(`  ❌ Cannot reach ${baseUrl}: ${err.message}`);
      // Record FAIL for all roles in this env
      for (const [roleName, acct] of Object.entries(TEST_ACCOUNTS)) {
        results.push({ role: roleName, env: envName, category: "Connection", operation: "CONNECT", endpoint: baseUrl, status: "FAIL", detail: err.message });
      }
      continue;
    }

    for (const [roleName, acct] of Object.entries(TEST_ACCOUNTS)) {
      console.log(`\n  👤 Testing role: ${roleName} (${acct.username})`);

      // Login
      const loginResult = await login(baseUrl, acct.username, acct.password, acct.portal);
      results.push({ role: roleName, env: envName, category: "Auth", operation: "LOGIN", endpoint: "POST /api/auth/login", status: loginResult.success ? "PASS" : "FAIL", detail: loginResult.detail });

      if (!loginResult.success) {
        console.log(`    ❌ Login failed: ${loginResult.detail}`);
        continue;
      }
      console.log(`    ✅ Login OK`);

      const cookie = loginResult.cookie;

      // Run all test categories
      await testUserProfilesCRUD(baseUrl, cookie, roleName, envName);
      await testToursCRUD(baseUrl, cookie, roleName, envName);
      await testBookingsCRUD(baseUrl, cookie, roleName, envName);
      await testCountriesCRUD(baseUrl, cookie, roleName, envName);
      await testCitiesCRUD(baseUrl, cookie, roleName, envName);
      await testHotelsCRUD(baseUrl, cookie, roleName, envName);
      await testSightsCRUD(baseUrl, cookie, roleName, envName);
      await testWorkflowsCRUD(baseUrl, cookie, roleName, envName);
      await testDocumentsCRUD(baseUrl, cookie, roleName, envName);
      await testPaymentsCRUD(baseUrl, cookie, roleName, envName);
      await testAssignmentsCRUD(baseUrl, cookie, roleName, envName);
      await testNotifications(baseUrl, cookie, roleName, envName);
      await testTransportCRUD(baseUrl, cookie, roleName, envName);
      await testAirlineCRUD(baseUrl, cookie, roleName, envName);

      // Logout
      await api(baseUrl, "POST", "/api/auth/logout", cookie);

      const roleResults = results.filter(r => r.role === roleName && r.env === envName);
      const passed = roleResults.filter(r => r.status === "PASS").length;
      const failed = roleResults.filter(r => r.status === "FAIL").length;
      const denied = roleResults.filter(r => r.status === "EXPECTED_DENY").length;
      const skipped = roleResults.filter(r => r.status === "SKIP").length;
      console.log(`    📊 Results: ✅${passed} | ❌${failed} | 🚫${denied} | ⏭️${skipped}`);
    }
  }

  // ===== GENERATE REPORT =====
  console.log(`\n\n${"═".repeat(70)}`);
  console.log(`  📋 FINAL REPORT`);
  console.log(`${"═".repeat(70)}\n`);

  // Summary per environment
  for (const envName of Object.keys(ENVIRONMENTS)) {
    const envResults = results.filter(r => r.env === envName);
    const passed = envResults.filter(r => r.status === "PASS").length;
    const failed = envResults.filter(r => r.status === "FAIL").length;
    const denied = envResults.filter(r => r.status === "EXPECTED_DENY").length;
    const skipped = envResults.filter(r => r.status === "SKIP").length;
    console.log(`  🌐 ${envName.toUpperCase()}: ✅ PASS=${passed}  ❌ FAIL=${failed}  🚫 EXPECTED_DENY=${denied}  ⏭️ SKIP=${skipped}`);
  }

  // Failures detail
  const failures = results.filter(r => r.status === "FAIL");
  if (failures.length > 0) {
    console.log(`\n  ❌ FAILURES (${failures.length}):`);
    for (const f of failures) {
      console.log(`     [${f.env}] ${f.role} → ${f.category}/${f.operation} (${f.endpoint}) HTTP ${f.httpStatus || "?"}: ${f.detail}`);
    }
  } else {
    console.log(`\n  🎉 No failures found!`);
  }

  // Write JSON report
  const reportPath = process.cwd() + "/scratch/crud-test-report.json";
  const { writeFileSync } = await import("fs");
  writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\n  📄 Full JSON report saved to: ${reportPath}`);

  // Exit with code
  process.exit(failures.length > 0 ? 1 : 0);
}

runTests();
