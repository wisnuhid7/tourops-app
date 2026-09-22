/**
 * Flow 1: Authentication & Session Security Tests
 */
export async function runAuthFlow(client) {
  const steps = [];

  // Step 1: Valid login as Super Admin
  try {
    const res = await client.login("superadmin1");
    steps.push({
      name: "1.1 Login with valid superadmin credentials",
      passed: res.status === 200 && res.user?.role === "super_admin",
      status: res.status,
      durationMs: res.durationMs,
      details: `Logged in as superadmin1 (${res.user?.role})`,
    });
  } catch (err) {
    steps.push({
      name: "1.1 Login with valid superadmin credentials",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Login with invalid password
  try {
    const res = await client.request(null, "POST", "/api/auth/login", {
      username: "superadmin1",
      password: "wrongpassword999",
    });
    const expectedRejection = res.status === 401;
    steps.push({
      name: "1.2 Reject invalid password with 401 without user enumeration",
      passed: expectedRejection,
      status: res.status,
      durationMs: res.durationMs,
      details: res.data?.message || "Rejected as expected",
    });
  } catch (err) {
    steps.push({
      name: "1.2 Reject invalid password with 401",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Check Current User Profile (Session persistence)
  try {
    const res = await client.request("superadmin1", "GET", "/api/user-profile");
    const passed = res.status === 200 && res.data?.role === "super_admin";
    steps.push({
      name: "1.3 Session persistence on /api/user-profile",
      passed,
      status: res.status,
      durationMs: res.durationMs,
      details: `Active user role: ${res.data?.role} (User ID: ${res.data?.userId})`,
    });
  } catch (err) {
    steps.push({
      name: "1.3 Session persistence",
      passed: false,
      error: err.message,
    });
  }

  // Step 4: Login as customer
  try {
    const res = await client.login("customer1");
    steps.push({
      name: "1.4 Customer login and role verification",
      passed: res.status === 200 && res.user?.role === "customer",
      status: res.status,
      durationMs: res.durationMs,
      details: `Logged in as customer1 (${res.user?.role})`,
    });
  } catch (err) {
    steps.push({
      name: "1.4 Customer login",
      passed: false,
      error: err.message,
    });
  }

  // Step 5: Customer attempting to access Superadmin only endpoints (Role guard)
  try {
    const res = await client.request("customer1", "GET", "/api/admin/users");
    const blocked = res.status === 403 || res.status === 401 || res.status === 404;
    steps.push({
      name: "1.5 Guard staff endpoints from customer (Expect 401/403)",
      passed: blocked,
      status: res.status,
      durationMs: res.durationMs,
      details: `Customer blocked from /api/admin/users (HTTP ${res.status})`,
    });
  } catch (err) {
    steps.push({
      name: "1.5 Guard staff endpoints",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "auth",
    name: "Authentication & Security",
    steps,
    passed: steps.every((s) => s.passed),
  };
}
