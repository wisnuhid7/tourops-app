async function test() {
  const tourId = "ca172c6b-3d69-4ba6-8527-1e0c191197d7";
  try {
    console.log("Fetching tour detail...");
    let res = await fetch(`http://127.0.0.1:5022/api/tours/${tourId}`);
    console.log("Tour Detail Status:", res.status);
    
    console.log("Fetching departures...");
    res = await fetch(`http://127.0.0.1:5022/api/tours/${tourId}/departures`);
    console.log("Departures Status:", res.status);
    
    console.log("Fetching days...");
    res = await fetch(`http://127.0.0.1:5022/api/tours/${tourId}/days`);
    console.log("Days Status:", res.status);
    const daysJson = await res.json();
    console.log("Days length:", daysJson.length);
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
