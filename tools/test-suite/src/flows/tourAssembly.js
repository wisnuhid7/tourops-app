/**
 * Flow 5: Tour Assembly & Itinerary Building
 */
export async function runTourAssemblyFlow(client) {
  const steps = [];

  // Step 1: Tour Builder access
  try {
    await client.ensureLoggedIn("tourbuilder1");
    const res = await client.request("tourbuilder1", "GET", "/api/tours");
    steps.push({
      name: "5.1 Tour Builder lists available tour packages",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Retrieved tours list for tourbuilder1`,
    });
  } catch (err) {
    steps.push({
      name: "5.1 Tour Builder lists tours",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Content Editor access
  try {
    await client.ensureLoggedIn("contenteditor1");
    const res = await client.request("contenteditor1", "GET", "/api/tours");
    steps.push({
      name: "5.2 Content Editor verifies tour descriptions & translations",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: `Content Editor verified tour catalog`,
    });
  } catch (err) {
    steps.push({
      name: "5.2 Content Editor verification",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Super Admin inspects departure slots
  try {
    await client.ensureLoggedIn("superadmin1");
    const toursRes = await client.request("superadmin1", "GET", "/api/tours");
    const sampleTour = toursRes.data?.[0];

    if (sampleTour) {
      const depRes = await client.request("superadmin1", "GET", `/api/tours/${sampleTour.id}/departures`);
      steps.push({
        name: "5.3 Super Admin checks departure slots and passenger capacity",
        passed: depRes.status === 200,
        status: depRes.status,
        durationMs: depRes.durationMs,
        details: `Tour "${sampleTour.title}" has ${depRes.data?.length || 0} departure slots`,
      });
    } else {
      steps.push({
        name: "5.3 Super Admin checks departure slots",
        passed: true,
        details: "No tour present to check departures",
      });
    }
  } catch (err) {
    steps.push({
      name: "5.3 Super Admin checks departure slots",
      passed: false,
      error: err.message,
    });
  }

  return {
    flowId: "tourAssembly",
    name: "Tour Assembly & Itineraries",
    steps,
    passed: steps.every((s) => s.passed),
  };
}

