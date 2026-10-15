import type { Express, Request, Response } from "express";
import { routeError } from "../lib/routeError";
import { isSafeImageUrl } from "../lib/utils";
import { imageService } from "../lib/images";
import { pdfService } from "../lib/pdf";
import { isAuthenticated } from "../replit_integrations/auth";

// Image proxy / optimized asset serving, plus the tour itinerary PDF export.
// Extracted verbatim from routes.ts — behaviour and registration order
// unchanged (registered just before the pricing routes).
export function registerAssetsRoutes(app: Express): void {
  // ---- Image Proxy & Optimization ----
  app.get("/api/images/proxy", isAuthenticated, async (req, res) => {
    try {
      const url = req.query.url as string;
      const width = req.query.width as string;
      const height = req.query.height as string;
      if (!url) return res.status(400).json({ message: "URL is required" });
      if (!(await isSafeImageUrl(url))) {
        return res.status(400).json({ message: "URL is not allowed" });
      }

      const result = await imageService.processImage(url as string, {
        width: width ? parseInt(width as string) : undefined,
        height: height ? parseInt(height as string) : undefined
      });

      if (typeof result === 'string') {
        // Cache hit returns OUR own processed-asset path. Only ever redirect
        // there — never to a caller-supplied URL (open-redirect guard, F-06).
        if (result.startsWith('/uploads/')) return res.redirect(result);
        return res.status(502).json({ message: "Image could not be processed" });
      }

      // Serve the local file path
      res.redirect(result.path);
    } catch {
      // Upstream fetch/processing failure. imageService now THROWS instead of
      // returning the caller URL, so nothing attacker-controlled can reach
      // res.redirect here. 502 = bad upstream, and we never echo internals.
      res.status(502).json({ message: "Image could not be processed" });
    }
  });

  app.get("/api/tours/:id/pdf", isAuthenticated, async (req, res) => {
    try {
      const pdfBuffer = await pdfService.generateItinerary(req.params.id as string);
      res.contentType("application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="itinerary-${req.params.id}.pdf"`);
      res.send(pdfBuffer);
    } catch (e: any) { routeError(res, e); }
  });
}
