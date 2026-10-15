/**
 * OWASP A05 / A06 / A10 — SSRF via the server-side image proxy.
 *
 * Uses IP literals only (no DNS) so the unit assertions never touch the
 * network. Covers:
 *   - the existing mitigation `isSafeImageUrl()` (lib/utils.ts:35-54): the
 *     PASSING tests prove it blocks loopback/link-local/private/scheme abuse.
 *   - the confirmed weakness: `imageService.processImage()` calls
 *     `fetch(url)` with DEFAULT redirect handling (lib/images.ts:48), so a
 *     public attacker URL can 302 to `http://169.254.169.254/...` or an
 *     internal host after the initial URL passed isSafeImageUrl.
 *   - the open-redirect fallback: on any processing failure processImage
 *     returns the ORIGINAL url, which assetsRoutes.ts:29 hands to res.redirect().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isSafeImageUrl } from "../../lib/utils";
import { imageService } from "../../lib/images";

describe("OWASP A05/A06 — SSRF surface", () => {
  describe("isSafeImageUrl mitigation (should PASS — gate works for direct targets)", () => {
    const blocked = [
      "http://127.0.0.1/x.png",
      "http://127.0.0.1:5001/api/internal",
      "http://169.254.169.254/latest/meta-data/",
      "http://10.1.2.3/x.png",
      "http://192.168.0.5/x.png",
      "http://172.16.0.1/x.png",
      "http://0.0.0.0/x.png",
      "http://[::1]/x.png",
      "http://[fd00::1]/x.png",
      "http://localhost/x.png",
      "file:///etc/passwd",
      "ftp://example.com/x.png",
      "gopher://127.0.0.1:11211/_stats",
      "not-a-url",
    ];
    for (const url of blocked) {
      it(`rejects ${url}`, async () => {
        expect(await isSafeImageUrl(url)).toBe(false);
      });
    }

    it("accepts a public IP literal (http)", async () => {
      expect(await isSafeImageUrl("http://93.184.216.34/x.png")).toBe(true);
    });
  });

  describe("SSRF via redirect-follow + open-redirect fallback (CONFIRMED GAPS)", () => {
    const fetchMock = vi.fn();

    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal("fetch", fetchMock);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("does not return the attacker url on failure (open-redirect fallback removed)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 } as any);
      const url = "https://attacker.example/not-an-image";
      // Previously processImage returned `url`, which the caller handed to
      // res.redirect(). It must now fail loudly so no attacker-controlled
      // redirect target can be produced.
      await expect(imageService.processImage(url, { width: 100 })).rejects.toThrow();
    });

    // Confirmed evidence: lib/images.ts:48 issues `fetch(url)` with NO options
    // object, so Node applies its default `redirect: "follow"`. A public
    // attacker URL that passed isSafeImageUrl can therefore 302 into
    // link-local / internal space AFTER the check.
    it("processImage must pass explicit fetch options (no options => redirect:follow)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 } as any);
      await imageService.processImage("https://attacker.example/r.png", { width: 100 }).catch(() => {});
      const call = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
      expect(call[1]).toBeDefined();
    });

    it("processImage must pin redirect to error|manual", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 } as any);
      await imageService.processImage("https://attacker.example/r.png", { width: 100 }).catch(() => {});
      const call = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
      expect(["manual", "error"]).toContain(call[1]?.redirect);
    });

    it("processImage must cap the response size (no unbounded arrayBuffer of a user URL)", async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 403 } as any);
      await imageService.processImage("https://attacker.example/big.png", { width: 100 }).catch(() => {});
      const call = fetchMock.mock.calls[0] as [string, RequestInit | undefined];
      const cap = (call[1] as any)?.maxBytes ?? (call[1] as any)?.size;
      expect(typeof cap).toBe("number");
    });
  });
});
