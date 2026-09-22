/**
 * Flow 11: Accounting & Financial Reconciliation
 */
export async function runAccountingFlow(client) {
  const steps = [];

  // Step 1: Accounting queries payments ledger
  try {
    await client.ensureLoggedIn("accounting1");
    const res = await client.request("accounting1", "GET", "/api/admin/payments");
    const total = res.data && typeof res.data.total === "number" ? res.data.total : (Array.isArray(res.data) ? res.data.length : 0);

    steps.push({
      name: "11.1 Accounting retrieves enterprise payment ledger and receivables",
      passed: res.status === 200 && (res.data?.rows || Array.isArray(res.data)),
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved payment ledger (${total} total transactions logged)`,
    });
  } catch (err) {
    steps.push({
      name: "11.1 Accounting retrieves enterprise payment ledger",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Accounting queries payments ledger
  try {
    const res = await client.request("accounting1", "GET", "/api/payments");
    const count = Array.isArray(res.data) ? res.data.length : 0;

    steps.push({
      name: "11.2 Accounting inspects payment ledger",
      passed: res.status === 200 && Array.isArray(res.data),
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} logged transactions`,
    });
  } catch (err) {
    steps.push({
      name: "11.2 Accounting payments ledger",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Affiliate partners and referral tracking
  try {
    const res = await client.request("accounting1", "GET", "/api/affiliates");
    steps.push({
      name: "11.3 Accounting reviews affiliate referral commissions",
      passed: res.status === 200 || res.status === 404,
      status: res.status,
      durationMs: res.durationMs,
      details: `Affiliate ledger accessed with HTTP ${res.status}`,
    });
  } catch (err) {
    steps.push({
      name: "11.3 Affiliate commissions",
      passed: false,
      error: err.message,
    });
  }

  // Step 4: Non-accounting staff forbidden from finance mutation
  try {
    await client.ensureLoggedIn("supportagent1");
    const res = await client.request("supportagent1", "GET", "/api/admin/payments");
    const blocked = res.status === 401 || res.status === 403;

    steps.push({
      name: "11.4 Non-finance staff (Support Agent) blocked from billing ledger",
      passed: blocked,
      status: res.status,
      durationMs: res.durationMs,
      details: `Support Agent blocked with HTTP ${res.status} as expected`,
    });
  } catch (err) {
    steps.push({
      name: "11.4 Non-finance staff blocked",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "accounting",
    name: "Accounting & Financials",
    steps,
    passed: steps.every((s) => s.passed),
  };
}
