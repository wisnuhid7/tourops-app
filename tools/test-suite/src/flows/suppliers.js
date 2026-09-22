/**
 * Flow 4: Supplier Catalogs & Rate Cards
 */
export async function runSuppliersFlow(client) {
  const steps = [];

  // Step 1: Hotel Manager catalog & rates
  try {
    await client.ensureLoggedIn("hotelmanager1");
    const res = await client.request("hotelmanager1", "GET", "/api/hotels");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "4.1 Hotel Manager retrieves lodging catalog",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} hotels`,
    });
  } catch (err) {
    steps.push({
      name: "4.1 Hotel Manager catalog",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Transport Manager fleet & routes
  try {
    await client.ensureLoggedIn("transportmanager1");
    const res = await client.request("transportmanager1", "GET", "/api/master/transport-companies");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "4.2 Transport Manager retrieves vehicle fleet companies",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} transport companies`,
    });
  } catch (err) {
    steps.push({
      name: "4.2 Transport Manager companies",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Guide Manager rates
  try {
    await client.ensureLoggedIn("guidemanager1");
    const res = await client.request("guidemanager1", "GET", "/api/rates/guide");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "4.3 Guide Manager checks guide daily rate cards",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} guide rate agreements`,
    });
  } catch (err) {
    steps.push({
      name: "4.3 Guide Manager rates",
      passed: false,
      error: err.message,
    });
  }

  // Step 4: Sights Manager attraction tickets
  try {
    await client.ensureLoggedIn("sightsmanager1");
    const res = await client.request("sightsmanager1", "GET", "/api/rates/sights");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "4.4 Sights Manager checks attraction catalog and ticket rates",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} sights rates`,
    });
  } catch (err) {
    steps.push({
      name: "4.4 Sights Manager",
      passed: false,
      error: err.message,
    });
  }

  // Step 5: Airline Supplier catalog
  try {
    await client.ensureLoggedIn("airlinesupplier1");
    const res = await client.request("airlinesupplier1", "GET", "/api/rates/airline");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "4.5 Airline Supplier inspects agency rate agreements",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} airline agreements`,
    });
  } catch (err) {
    steps.push({
      name: "4.5 Airline Supplier",
      passed: false,
      error: err.message,
    });
  }

  // Step 6: Supplier Isolation Check
  try {
    await client.ensureLoggedIn("supplier1");
    const res = await client.request("supplier1", "GET", "/api/admin/users");
    const blocked = res.status === 401 || res.status === 403 || res.status === 404;
    steps.push({
      name: "4.6 Supplier Isolation: Forbidden from accessing staff administration",
      passed: blocked,
      status: res.status,
      durationMs: res.durationMs,
      details: `Supplier blocked as expected (HTTP ${res.status})`,
    });
  } catch (err) {
    steps.push({
      name: "4.6 Supplier Isolation",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "suppliers",
    name: "Supplier Catalogs & Rates",
    steps,
    passed: steps.every((s) => s.passed),
  };
}

