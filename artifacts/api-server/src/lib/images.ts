import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { createHash } from "crypto";

// Hard cap on a remotely-fetched image, independent of the upload limit, so a
// hostile URL cannot stream unbounded bytes into memory (F-09).
const MAX_REMOTE_IMAGE_BYTES = 10 * 1024 * 1024; // 10MB
const FETCH_TIMEOUT_MS = 15_000;

// Read a fetch Response body but abort if it exceeds `max` bytes. Falls back to
// arrayBuffer() for streams that don't expose a reader.
async function readCappedBody(response: Response, max: number): Promise<Buffer> {
  const lenHeader = response.headers?.get?.("content-length");
  if (lenHeader && Number(lenHeader) > max) {
    throw new Error(`Image exceeds maximum size of ${max} bytes`);
  }
  const body: any = (response as any).body;
  if (body && typeof body.getReader === "function") {
    const reader = body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > max) {
        try { await reader.cancel(); } catch {}
        throw new Error(`Image exceeds maximum size of ${max} bytes`);
      }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > max) throw new Error(`Image exceeds maximum size of ${max} bytes`);
  return buf;
}


export class ImageService {
  private readonly uploadDir = path.join(process.cwd(), "public", "uploads", "processed");

  constructor() {
    this.ensureDirectory();
  }

  private async ensureDirectory() {
    try {
      await fs.mkdir(this.uploadDir, { recursive: true });
    } catch (e) {}
  }

  /**
   * Generates a unique filename based on URL and processing options
   */
  private getCacheKey(url: string, options: any): string {
    const data = JSON.stringify({ url, ...options });
    return createHash("md5").update(data).digest("hex");
  }

  /**
   * Processes a remote image and returns the local relative path
   */
  async processImage(url: string, options: { width?: number; height?: number; quality?: number } = {}) {
    const { width = 1200, height, quality = 80 } = options;
    const cacheKey = this.getCacheKey(url, options);
    const filename = `${cacheKey}.webp`;
    const targetPath = path.join(this.uploadDir, filename);
    const relativePath = `/uploads/processed/${filename}`;

    // 1. Check Cache
    try {
      await fs.access(targetPath);
      return relativePath;
    } catch (e) {
      // Not in cache, proceed to process
    }

    try {
      // 2. Download Image
      // SECURITY (F-06): pin redirects off so a public URL that passed
      // isSafeImageUrl cannot 302 into link-local/internal space AFTER the
      // check; also cap the read size and bound the request with a timeout.
      const fetchOptions = {
        redirect: "error",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        // Enforced by readCappedBody; surfaced on the options object intent.
        size: MAX_REMOTE_IMAGE_BYTES,
      };
      const response = await fetch(url, fetchOptions as RequestInit);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      const buffer = await readCappedBody(response, MAX_REMOTE_IMAGE_BYTES);

      // 3. Process with Sharp
      let pipeline = sharp(buffer).webp({ quality });

      if (height) {
        pipeline = pipeline.resize(width, height, { fit: "cover" });
      } else {
        pipeline = pipeline.resize(width, null, { withoutEnlargement: true });
      }

      // 4. Extract Stats (Metadata)
      const metadata = await pipeline.metadata();
      const stats = await pipeline.stats();
      const dominant = stats.channels.map(c => Math.round(c.mean));
      const dominantHex = `#${dominant.map(v => v.toString(16).padStart(2, '0')).join('')}`;

      await pipeline.toFile(targetPath);

      return { path: relativePath, dominantColor: dominantHex, width: metadata.width, height: metadata.height };
    } catch (error) {
      console.error(`Image processing failed for ${url}:`, error);
      // SECURITY (F-06): never return the caller-supplied URL here. The caller
      // (assetsRoutes) would hand it to res.redirect(), creating an
      // open-redirect primitive. Fail loudly instead.
      throw error;
    }
  }

  /**
   * Background task to pre-process images for a list of items
   */
  async preProcessBatch(urls: string[]) {
    // Process in small chunks to avoid overloading CPU
    const uniqueUrls = Array.from(new Set(urls.filter(u => u && u.startsWith('http'))));
    for (const url of uniqueUrls) {
      // We don't await here to keep it background, 
      // but we might want to use a real queue for production
      this.processImage(url, { width: 800 }).catch(() => {});
      this.processImage(url, { width: 300, height: 200 }).catch(() => {});
    }
  }
}

export const imageService = new ImageService();
