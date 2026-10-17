import { createHash, randomBytes } from "crypto";
import dns from "dns/promises";
import net from "net";

export function generateCode(len: number = 6): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").toUpperCase().slice(0, len);
}

/**
 * Computes a deterministic SHA-256 hash of a request payload
 * by recursively sorting object keys.
 */
export function computePayloadHash(payload: unknown): string {
  const sortObject = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sortObject);
    return Object.keys(obj)
      .sort()
      .reduce((acc: any, key: string) => {
        acc[key] = sortObject(obj[key]);
        return acc;
      }, {});
  };

  return createHash("sha256")
    .update(JSON.stringify(sortObject(payload ?? {})))
    .digest("hex");
}

/**
 * Blocks requests to loopback, link-local, and private IP ranges to
 * mitigate SSRF via server-side fetch of user-supplied URLs.
 */
function isPrivateIp(ip: string): boolean {
  if (net.isIP(ip) === 4) {
    const parts = ip.split(".").map(Number);
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 0) return true;
    return false;
  }
  if (net.isIP(ip) === 6) {
    const lower = ip.toLowerCase();
    return lower === "::1" || lower.startsWith("fe80:") || lower.startsWith("fc") || lower.startsWith("fd");
  }
  return false;
}

/**
 * Validates that a user-supplied URL is safe to fetch server-side:
 * http(s) only, and resolves to a public (non-private/loopback) address.
 */
export async function isSafeImageUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname;
  if (hostname === "localhost") return false;
  if (net.isIP(hostname)) {
    return !isPrivateIp(hostname);
  }
  try {
    const records = await dns.lookup(hostname, { all: true });
    return records.every((r) => !isPrivateIp(r.address));
  } catch {
    return false;
  }
}
