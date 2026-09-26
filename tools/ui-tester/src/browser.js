/**
 * Playwright Browser Controller for TourOps UI Testing
 */
import { chromium } from "playwright";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { ACCOUNTS, TEST_PASSWORD } from "./accounts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "../public/screenshots");

// Ensure screenshots directory exists
if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

export class BrowserController {
  constructor(options = {}) {
    this.baseUrl = options.baseUrl || "http://localhost:5173";
    this.apiUrl = options.apiUrl || "http://localhost:5001";
    this.headless = options.headless !== undefined ? options.headless : true;
    this.viewport = VIEWPORTS[options.viewport] || VIEWPORTS.desktop;
    this.browser = null;
    this.context = null;
    this.page = null;
    this.logs = [];
    this.consoleErrors = [];
  }

  /**
   * Launch browser instance
   */
  async launch() {
    this.browser = await chromium.launch({
      headless: this.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    this.context = await this.browser.newContext({
      viewport: this.viewport,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 TourOps-UITester",
    });

    this.page = await this.context.newPage();

    // Listen for console errors & unhandled errors
    this.page.on("console", (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === "error") {
        this.consoleErrors.push({ text, location: msg.location() });
      }
    });

    this.page.on("pageerror", (err) => {
      this.consoleErrors.push({ text: err.message, stack: err.stack });
    });

    return this.page;
  }

  /**
   * Fast cookie/session injection via backend API authentication
   */
  async loginAs(username) {
    const account = ACCOUNTS.find((a) => a.username === username);
    if (!account) throw new Error(`Unknown account username: ${username}`);

    if (this.context) {
      await this.context.clearCookies();
    }

    const loginRes = await fetch(`${this.apiUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: TEST_PASSWORD }),
    });

    if (!loginRes.ok) {
      throw new Error(`Login failed for ${username} (HTTP ${loginRes.status})`);
    }

    const setCookies = loginRes.headers.getSetCookie 
      ? loginRes.headers.getSetCookie() 
      : [loginRes.headers.get("set-cookie")].filter(Boolean);

    for (const rawCookie of setCookies) {
      const parts = rawCookie.split(";")[0].trim().split("=");
      if (parts[0] && parts[1]) {
        await this.context.addCookies([
          {
            name: parts[0],
            value: parts.slice(1).join("="),
            domain: "localhost",
            path: "/",
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
      }
    }

    return account;
  }

  /**
   * Capture named screenshot and return relative web path
   */
  async captureScreenshot(flowId, stepName) {
    if (!this.page) return null;
    const cleanFlow = flowId.replace(/[^a-z0-9_-]/gi, "_");
    const cleanStep = stepName.replace(/[^a-z0-9_-]/gi, "_");
    const filename = `${cleanFlow}_${Date.now()}_${cleanStep}.png`;
    const fullPath = path.join(SCREENSHOTS_DIR, filename);

    await this.page.screenshot({ path: fullPath, fullPage: false });
    return `/screenshots/${filename}`;
  }

  /**
   * Close browser
   */
  async close() {
    if (this.context) await this.context.close().catch(() => {});
    if (this.browser) await this.browser.close().catch(() => {});
    this.context = null;
    this.browser = null;
    this.page = null;
  }
}

