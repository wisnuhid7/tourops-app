import puppeteer from "puppeteer";

async function main() {
  console.log("Connecting to the running browser at http://localhost:51519...");
  try {
    const browser = await puppeteer.connect({
      browserURL: "http://localhost:51519",
    });
    console.log("✅ Connected successfully!");
    const pages = await browser.pages();
    console.log(`Found ${pages.length} open pages:`);
    for (let i = 0; i < pages.length; i++) {
      console.log(`Page ${i}: URL = ${pages[i].url()}, Title = ${await pages[i].title()}`);
    }
    await browser.disconnect();
  } catch (err: any) {
    console.error("❌ Failed to connect:", err.message);
  }
}

main();
