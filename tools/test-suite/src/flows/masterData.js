/**
 * Flow 3: Master Data & Geographic Endpoints
 */
export async function runMasterDataFlow(client) {
  const steps = [];

  // Step 1: Countries list
  try {
    const res = await client.request("superadmin1", "GET", "/api/master/countries");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "3.1 Query Countries master dataset",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} countries`,
    });
  } catch (err) {
    steps.push({
      name: "3.1 Query Countries",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Cities list
  try {
    const res = await client.request("superadmin1", "GET", "/api/master/cities");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "3.2 Query Cities master dataset",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} cities`,
    });
  } catch (err) {
    steps.push({
      name: "3.2 Query Cities",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Airports with IATA codes
  try {
    const res = await client.request("superadmin1", "GET", "/api/master/airports");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "3.3 Query Airports (IATA code index)",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} airports`,
    });
  } catch (err) {
    steps.push({
      name: "3.3 Query Airports",
      passed: false,
      error: err.message,
    });
  }

  // Step 4: Country manager access verification
  try {
    await client.ensureLoggedIn("countrymanager1");
    const res = await client.request("countrymanager1", "GET", "/api/master/countries");
    steps.push({
      name: "3.4 Country Manager access to regional master data",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Country Manager retrieved master countries list`,
    });
  } catch (err) {
    steps.push({
      name: "3.4 Country Manager access",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "masterData",
    name: "Master Data & Destinations",
    steps,
    passed: steps.every((s) => s.passed),
  };
}

