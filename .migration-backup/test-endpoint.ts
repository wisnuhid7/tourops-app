async function run() {
  console.log("Testing auth and leader dashboard api endpoints...");
  
  const baseUrl = "http://localhost:5022";
  
  try {
    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "customer1",
        password: "password123",
        portal: "customer"
      })
    });
    
    console.log("Login status:", loginRes.status);
    const loginJson = await loginRes.json();
    console.log("Login response:", loginJson);
    
    const cookie = loginRes.headers.get("set-cookie");
    console.log("Set-Cookie:", cookie);
    
    if (cookie) {
      const profileRes = await fetch(`${baseUrl}/api/user-profile`, {
        headers: { "Cookie": cookie }
      });
      console.log("Profile status:", profileRes.status);
      const profileJson = await profileRes.json();
      console.log("Profile response:", profileJson);

      const dashboardRes = await fetch(`${baseUrl}/api/leader/dashboard`, {
        headers: { "Cookie": cookie }
      });
      console.log("Dashboard status:", dashboardRes.status);
      const dashboardJson = await dashboardRes.json();
      console.log("Dashboard response:", dashboardJson);
    }
  } catch (err) {
    console.error("Error connecting to server:", err);
  }
}

run();
