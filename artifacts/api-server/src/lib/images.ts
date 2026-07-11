import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { createHash } from "crypto";


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
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);
      const buffer = Buffer.from(await response.arrayBuffer());

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
      return url; // Fallback to original URL on failure
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
