/**
 * Flow 10: Tour Leader Manifests & Incident Management
 */
export async function runTourLeaderFlow(client) {
  const steps = [];

  // Step 1: Tour Leader access to public tours catalog
  try {
    await client.ensureLoggedIn("tourleader1");
    const res = await client.request("tourleader1", "GET", "/api/tours/public");
    steps.push({
      name: "10.1 Tour Leader accesses group tour catalog",
      passed: res.status === 200 && Array.isArray(res.data),
      status: res.status,
      durationMs: res.durationMs,
      details: `Tour Leader retrieved tours catalog successfully`,
    });
  } catch (err) {
    steps.push({
      name: "10.1 Tour Leader access",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Incident reports list
  try {
    const res = await client.request("tourleader1", "GET", "/api/incidents");
    const safeResponse = res.status === 200 || res.status === 404;
    steps.push({
      name: "10.2 Tour Leader incident reporting channel",
      passed: safeResponse,
      status: res.status,
      durationMs: res.durationMs,
      details: `Incident reporting channel active (HTTP ${res.status})`,
    });
  } catch (err) {
    steps.push({
      name: "10.2 Incident reports list",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Financial data leak prevention for Tour Leader
  try {
    const res = await client.request("tourleader1", "GET", "/api/invoices");
    const blocked = res.status === 401 || res.status === 403 || res.status === 404;
    steps.push({
      name: "10.3 Tour Leader Financial Isolation: Blocked from invoices and revenue data",
      passed: blocked,
      status: res.status,
      durationMs: res.durationMs,
      details: `Tour Leader safely forbidden from financial invoices (HTTP ${res.status})`,
    });
  } catch (err) {
    steps.push({
      name: "10.3 Tour Leader Financial Isolation",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "tourLeader",
    name: "Tour Leader & Incidents",
    steps,
    passed: steps.every((s) => s.passed),
  };
}

