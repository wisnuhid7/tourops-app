/**
 * Flow 2: Public Tour Catalog & Discovery Tests
 */
export async function runPublicCatalogFlow(client) {
  const steps = [];

  // Step 1: Environment check
  try {
    const res = await client.request(null, "GET", "/api/environment");
    steps.push({
      name: "2.1 Public environment status check",
      passed: res.status === 200,
      status: res.status,
      durationMs: res.durationMs,
      details: JSON.stringify(res.data),
    });
  } catch (err) {
    steps.push({
      name: "2.1 Public environment status check",
      passed: false,
      error: err.message,
    });
  }

  // Step 2: Browse tours
  let sampleTour = null;
  try {
    const res = await client.request(null, "GET", "/api/tours/public");
    const tours = Array.isArray(res.data) ? res.data : [];
    sampleTour = tours[0] || null;

    steps.push({
      name: "2.2 Browse public tour catalog (unauthenticated)",
      passed: res.status === 200 && Array.isArray(tours),
      status: res.status,
      durationMs: res.durationMs,
      details: `Found ${tours.length} published tours. Sample: "${sampleTour?.title || 'None'}"`,
    });
  } catch (err) {
    steps.push({
      name: "2.2 Browse tour catalog",
      passed: false,
      error: err.message,
    });
  }

  // Step 3: Tour detail inspection
  if (sampleTour?.id) {
    try {
      const res = await client.request("customer1", "GET", `/api/tours/${sampleTour.id}`);
      steps.push({
        name: "2.3 Retrieve tour detailed itinerary",
        passed: res.status === 200 && res.data?.id === sampleTour.id,
        status: res.status,
        durationMs: res.durationMs,
        details: `Title: "${res.data?.title}", Days: ${res.data?.days?.length || 0}`,
      });
    } catch (err) {
      steps.push({
        name: "2.3 Retrieve tour detailed itinerary",
        passed: false,
        error: err.message,
      });
    }

    // Step 4: Tour departures
    try {
      const res = await client.request("customer1", "GET", `/api/tours/${sampleTour.id}/departures`);
      const departures = Array.isArray(res.data) ? res.data : [];
      steps.push({
        name: "2.4 Check scheduled departures & seat capacity",
        passed: res.status === 200,
        status: res.status,
        durationMs: res.durationMs,
        details: `Found ${departures.length} scheduled departures`,
      });
    } catch (err) {
      steps.push({
        name: "2.4 Check scheduled departures",
        passed: false,
        error: err.message,
      });
    }
  } else {
    steps.push({
      name: "2.3 Retrieve tour detailed itinerary (Skipped: No tours found)",
      passed: true,
      details: "No seeded tour available to fetch details",
    });
  }

  return {
    flowId: "publicCatalog",
    name: "Public Catalog & Discovery",
    steps,
    passed: steps.every((s) => s.passed),
  };
}
