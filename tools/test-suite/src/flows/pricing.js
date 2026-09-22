/**
 * Flow 6: Dynamic Pricing Engine & Group Quotes
 */
export async function runPricingFlow(client) {
  const steps = [];

  // Step 1: Pricing rules
  try {
    await client.ensureLoggedIn("superadmin1");
    const res = await client.request("superadmin1", "GET", "/api/pricing/rules");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "6.1 Super Admin loads markup & margin adjustment rules",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} pricing adjustment rules`,
    });
  } catch (err) {
    steps.push({
      name: "6.1 Markup & margin rules",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Group size bands
  try {
    const res = await client.request("superadmin1", "GET", "/api/pricing/group-size-bands");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "6.2 Inspect group size bands (pax thresholds)",
      passed: res.status === 200 && Array.isArray(res.data),
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} group size bands`,
    });
  } catch (err) {
    steps.push({
      name: "6.2 Group size bands",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Pricing seasons
  try {
    const res = await client.request("superadmin1", "GET", "/api/pricing/seasons");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "6.3 Inspect seasonal pricing calendar",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} pricing seasons`,
    });
  } catch (err) {
    steps.push({
      name: "6.3 Pricing seasons",
      passed: false,
      error: err.message,
    });
  }

  // Step 4: Group quotes list (Ops Manager / Admin)
  try {
    await client.ensureLoggedIn("operationsmanager1");
    const res = await client.request("operationsmanager1", "GET", "/api/pricing/quotes");
    const count = Array.isArray(res.data) ? res.data.length : 0;
    steps.push({
      name: "6.4 Operations Manager loads Group Quotes backlog",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} group quotes`,
    });
  } catch (err) {
    steps.push({
      name: "6.4 Group quotes backlog",
      passed: false,
      error: err.message,
    });
  }

  // Step 5: IDOR Protection on Quote breakdown
  try {
    await client.ensureLoggedIn("customer1");
    const res = await client.request("customer1", "GET", "/api/pricing/rules");
    const blocked = res.status === 401 || res.status === 403 || res.status === 404;
    steps.push({
      name: "6.5 IDOR Guard: Prevent customer from viewing internal pricing rules",
      passed: blocked,
      status: res.status,
      durationMs: res.durationMs,
      details: `Customer blocked with HTTP ${res.status} as expected`,
    });
  } catch (err) {
    steps.push({
      name: "6.5 IDOR Guard on pricing rules",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "pricing",
    name: "Dynamic Pricing & Quotes",
    steps,
    passed: steps.every((s) => s.passed),
  };
}
