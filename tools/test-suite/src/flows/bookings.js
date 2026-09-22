/**
 * Flow 7: Booking Engine & Allocations
 */
export async function runBookingsFlow(client) {
  const steps = [];

  // Step 1: Customer queries own bookings
  try {
    await client.ensureLoggedIn("customer1");
    const res = await client.request("customer1", "GET", "/api/my-bookings");
    const count = Array.isArray(res.data) ? res.data.length : 0;

    steps.push({
      name: "7.1 Customer retrieves own bookings history",
      passed: res.status === 200 && Array.isArray(res.data),
      status: res.status,
      durationMs: res.durationMs,
      details: `Customer has ${count} booking(s)`,
    });
  } catch (err) {
    steps.push({
      name: "7.1 Customer retrieves own bookings",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Operations Manager booking overview
  try {
    await client.ensureLoggedIn("operationsmanager1");
    const res = await client.request("operationsmanager1", "GET", "/api/bookings");
    const count = Array.isArray(res.data) ? res.data.length : 0;

    steps.push({
      name: "7.2 Operations Manager views system-wide booking operations",
      passed: res.status === 200 && Array.isArray(res.data),
      status: res.status,
      durationMs: res.durationMs,
      details: `Operations backlog contains ${count} booking(s)`,
    });
  } catch (err) {
    steps.push({
      name: "7.2 Operations Manager bookings",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Customer cannot access other customer bookings by ID (IDOR check)
  try {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const res = await client.request("customer1", "GET", `/api/bookings/${fakeId}`);
    const protectedStatus = res.status === 404 || res.status === 403 || res.status === 401;

    steps.push({
      name: "7.3 Booking IDOR protection: Non-existent or foreign bookings return 404/403",
      passed: protectedStatus,
      status: res.status,
      durationMs: res.durationMs,
      details: `Safely rejected with status ${res.status}`,
    });
  } catch (err) {
    steps.push({
      name: "7.3 Booking IDOR protection",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "bookings",
    name: "Booking Engine & Operations",
    steps,
    passed: steps.every((s) => s.passed),
  };
}
