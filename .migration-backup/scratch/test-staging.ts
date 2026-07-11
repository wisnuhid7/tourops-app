import puppeteer from "puppeteer";

async function run() {
  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    console.log(`[LOCAL DEV CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on("pageerror", (err) => {
    console.log(`[LOCAL DEV ERROR]:`, err.stack || err.toString());
  });

  try {
    console.log("Navigating to local login page...");
    await page.goto("http://localhost:5022/admin/login", { waitUntil: "networkidle2" });

    console.log("Logging in...");
    await page.type('[data-testid="input-username"]', "superadmin1");
    await page.type('[data-testid="input-password"]', "password123");
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2" }),
      page.click('[data-testid="button-login-submit"]')
    ]);

    console.log("Navigating to Tour Generator...");
    await page.goto("http://localhost:5022/admin/tour-generator", { waitUntil: "networkidle2" });

    console.log("Selecting Pharaohs' Route tour...");
    await page.waitForSelector("select", { visible: true });
    
    const options = await page.$$eval("select option", (opts) => 
      opts.map(o => ({ value: o.value, text: o.textContent }))
    );
    const pharaohOpt = options.find(o => o.text && o.text.includes("Pharaohs"));
    
    if (pharaohOpt) {
      console.log(`Selecting value: ${pharaohOpt.value}`);
      await page.select("select", pharaohOpt.value);
    } else {
      console.log("Pharaohs tour not found locally!");
    }

    console.log("Waiting 5 seconds for render and errors...");
    await new Promise(resolve => setTimeout(resolve, 5000));

    console.log("Saving screenshot...");
    await page.screenshot({ path: "scratch/local-dev-pharaoh-result.png", fullPage: true });
    console.log("Screenshot saved.");

  } catch (err) {
    console.error("Error during execution:", err);
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
}

run().catch(console.error);
