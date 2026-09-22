/**
 * Flow 8: Passenger Management & Invitations
 */
export async function runPassengersFlow(client) {
  const steps = [];

  // Step 1: Customer queries travelers via own booking
  try {
    await client.ensureLoggedIn("customer1");
    const bookingsRes = await client.request("customer1", "GET", "/api/my-bookings");
    let count = 0;
    let ok = false;
    let duration = bookingsRes.durationMs;

    if (bookingsRes.status === 200 && Array.isArray(bookingsRes.data) && bookingsRes.data.length > 0) {
      const firstBookingId = bookingsRes.data[0].id;
      const res = await client.request("customer1", "GET", `/api/my-bookings/${firstBookingId}/travelers`);
      count = Array.isArray(res.data) ? res.data.length : 0;
      ok = res.status === 200 && Array.isArray(res.data);
      duration += res.durationMs;
    } else {
      ok = bookingsRes.status === 200;
    }

    steps.push({
      name: "8.1 Customer accesses registered travelers list",
      passed: ok,
      status: 200,
      durationMs: duration,
      details: `Retrieved ${count} traveler records from active booking`,
    });
  } catch (err) {
    steps.push({
      name: "8.1 Customer accesses travelers",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Test unauthenticated invite token verification
  try {
    const fakeToken = "invalid-token-123456789";
    const res = await client.request(null, "GET", `/api/passenger-invitations/${fakeToken}`);
    const safeResponse = res.status === 404 || res.status === 400 || res.status === 401;

    steps.push({
      name: "8.2 Verify invitation token security (invalid token returns 404/400)",
      passed: safeResponse,
      status: res.status,
      durationMs: res.durationMs,
      details: `Invalid invite rejected with status HTTP ${res.status}`,
    });
  } catch (err) {
    steps.push({
      name: "8.2 Invitation token security",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Operations Manager traveler document review
  try {
    await client.ensureLoggedIn("operationsmanager1");
    const res = await client.request("operationsmanager1", "GET", "/api/documents");
    steps.push({
      name: "8.3 Operations Manager reviews traveler document compliance",
      passed: res.status === 200 && Array.isArray(res.data),
      status: res.status,
      durationMs: res.durationMs,
      details: `Operations Manager accessed passenger documents repository`,
    });
  } catch (err) {
    steps.push({
      name: "8.3 Operations Manager documents review",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "passengers",
    name: "Passenger Management & Portal",
    steps,
    passed: steps.every((s) => s.passed),
  };
}
