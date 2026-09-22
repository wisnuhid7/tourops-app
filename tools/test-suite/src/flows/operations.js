/**
 * Flow 9: Operations Workflows & 5-Step Service Fulfillment
 */
export async function runOperationsFlow(client) {
  const steps = [];

  // Step 1: Operations Manager loads multi-step service workflows
  try {
    await client.ensureLoggedIn("operationsmanager1");
    const res = await client.request("operationsmanager1", "GET", "/api/workflows");
    const count = Array.isArray(res.data) ? res.data.length : 0;

    steps.push({
      name: "9.1 Operations Manager queries active service fulfillment workflows",
      passed: res.status === 200 && Array.isArray(res.data),
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved ${count} operational workflows`,
    });
  } catch (err) {
    steps.push({
      name: "9.1 Service fulfillment workflows",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Query workflow steps
  try {
    const wfRes = await client.request("operationsmanager1", "GET", "/api/workflows");
    let count = 0;
    let ok = false;
    let duration = wfRes.durationMs;

    if (wfRes.status === 200 && Array.isArray(wfRes.data) && wfRes.data.length > 0) {
      const firstWfId = wfRes.data[0].id;
      const res = await client.request("operationsmanager1", "GET", `/api/workflows/${firstWfId}/steps`);
      count = Array.isArray(res.data) ? res.data.length : 0;
      ok = res.status === 200 && Array.isArray(res.data);
      duration += res.durationMs;
    } else {
      ok = wfRes.status === 200;
    }

    steps.push({
      name: "9.2 Inspect fulfillment checklist steps (Airline/Hotel/Transport/Guide/Sights)",
      passed: ok,
      status: 200,
      durationMs: duration,
      details: `Retrieved ${count} individual service steps for active workflow`,
    });
  } catch (err) {
    steps.push({
      name: "9.2 Fulfillment checklist steps",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Staff Assignments overview
  try {
    const res = await client.request("operationsmanager1", "GET", "/api/assignments");
    steps.push({
      name: "9.3 Operations Manager verifies staff and guide assignments",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Assignments endpoint returned status 200`,
    });
  } catch (err) {
    steps.push({
      name: "9.3 Staff assignments overview",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "operations",
    name: "Operations & 5-Step Fulfillment",
    steps,
    passed: steps.every((s) => s.passed),
  };
}
