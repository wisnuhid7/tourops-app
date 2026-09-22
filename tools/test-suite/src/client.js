/**
 * Multi-Session HTTP Client with Role-Isolated Cookie Jars
 */
import { ACCOUNTS, TEST_PASSWORD } from "./accounts.js";

const DEFAULT_API_TARGET = process.env.API_TARGET || "http://localhost:5001";

export class TestClient {
  constructor(baseUrl = DEFAULT_API_TARGET) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.cookieJars = new Map(); // username -> Cookie header string
    this.activeUsers = new Map(); // username -> user object
  }

  /**
   * Parse Set-Cookie header from response and update jar
   */
  #updateCookie(username, response) {
    const rawCookies = response.headers.getSetCookie 
      ? response.headers.getSetCookie() 
      : [response.headers.get("set-cookie")].filter(Boolean);

    if (!rawCookies || rawCookies.length === 0) return;

    const jar = this.cookieJars.get(username) || "";
    const cookieMap = new Map();

    // Parse existing jar
    if (jar) {
      jar.split(";").forEach((c) => {
        const [k, ...v] = c.trim().split("=");
        if (k) cookieMap.set(k, v.join("="));
      });
    }

    // Update with new cookies
    rawCookies.forEach((header) => {
      const parts = header.split(";")[0].trim().split("=");
      if (parts[0]) {
        cookieMap.set(parts[0], parts.slice(1).join("="));
      }
    });

    const newJar = Array.from(cookieMap.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");

    this.cookieJars.set(username, newJar);
  }

  /**
   * Authenticate a specific role account and cache its session cookie
   */
  async login(username, password = TEST_PASSWORD) {
    const url = `${this.baseUrl}/api/auth/login`;
    const startTime = Date.now();

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: this.baseUrl,
      },
      body: JSON.stringify({ username, password }),
    });

    const durationMs = Date.now() - startTime;
    this.#updateCookie(username, res);

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      throw new Error(`Login failed for ${username} (HTTP ${res.status}): ${body?.message || "Unknown error"}`);
    }

    this.activeUsers.set(username, body);
    return { user: body, durationMs, status: res.status };
  }

  /**
   * Log out a user session
   */
  async logout(username) {
    const url = `${this.baseUrl}/api/auth/logout`;
    const jar = this.cookieJars.get(username) || "";

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Origin: this.baseUrl,
        Cookie: jar,
      },
    });

    this.cookieJars.delete(username);
    this.activeUsers.delete(username);
    return res.status;
  }

  /**
   * Make an authenticated HTTP request as a specific role
   */
  async request(username, method, path, payload = null, headers = {}) {
    const url = path.startsWith("http") ? path : `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    const jar = username ? this.cookieJars.get(username) || "" : "";

    const reqHeaders = {
      Origin: this.baseUrl,
      ...headers,
    };

    if (jar) {
      reqHeaders.Cookie = jar;
    }

    let body = null;
    if (payload !== null) {
      if (typeof payload === "object") {
        reqHeaders["Content-Type"] = "application/json";
        body = JSON.stringify(payload);
      } else {
        body = payload;
      }
    }

    const startTime = Date.now();
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: reqHeaders,
        body: ["GET", "HEAD"].includes(method.toUpperCase()) ? undefined : body,
      });
    } catch (err) {
      return {
        ok: false,
        status: 0,
        statusText: "Network Error",
        durationMs: Date.now() - startTime,
        error: err.message,
        data: null,
      };
    }

    const durationMs = Date.now() - startTime;
    if (username) {
      this.#updateCookie(username, res);
    }

    const contentType = res.headers.get("content-type") || "";
    let data;
    if (contentType.includes("application/json")) {
      data = await res.json().catch(() => null);
    } else {
      data = await res.text().catch(() => "");
    }

    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      durationMs,
      data,
      headers: Object.fromEntries(res.headers.entries()),
    };
  }

  /**
   * Ensure a role is logged in, auto-logging in if not already cached
   */
  async ensureLoggedIn(username) {
    if (this.cookieJars.has(username)) {
      return this.activeUsers.get(username);
    }
    const result = await this.login(username);
    return result.user;
  }
}
