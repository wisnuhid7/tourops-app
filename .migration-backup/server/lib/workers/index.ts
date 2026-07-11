import type { Queue as BullQueue, Worker as BullWorker } from 'bullmq';

// Lazy-loaded BullMQ types — only initialized when Redis is available
let _Queue: typeof BullQueue | null = null;
let _Worker: typeof BullWorker | null = null;
let _QueueEvents: any = null;
let connection: any = null;
let redisAvailable = false;

async function tryInitRedis(): Promise<boolean> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  try {
    const IORedis = (await import('ioredis')).default;
    const bullmq = await import('bullmq');
    _Queue = bullmq.Queue;
    _Worker = bullmq.Worker;
    _QueueEvents = bullmq.QueueEvents;

    const redis = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: () => null, // Do NOT retry — fail fast
      lazyConnect: true,
    });

    // Suppress error events to avoid unhandled error crashes
    redis.on('error', () => {});

    // Try to actually connect
    await redis.connect();
    connection = redis;
    return true;
  } catch {
    console.warn('[Workers] Redis not available — background queues disabled.');
    return false;
  }
}

function makeQueue(name: string): BullQueue | null {
  if (!_Queue || !connection) return null;
  try {
    return new _Queue(name, { connection });
  } catch {
    return null;
  }
}

// Queues are null when Redis is unavailable
export const queues: Record<string, BullQueue | null> = {
  countryImport: null,
  cityImport: null,
  sightDiscovery: null,
  sightEnrichment: null,
  imageProcessing: null,
  hotelPrice: null,
  flightPrice: null,
  tourAi: null,
  dataQuality: null,
};

export async function startWorkers(): Promise<void> {
  redisAvailable = await tryInitRedis();
  if (!redisAvailable) return;

  // Populate queues now that Redis is confirmed available
  Object.assign(queues, {
    countryImport: makeQueue('country-import'),
    cityImport: makeQueue('city-import'),
    sightDiscovery: makeQueue('sight-discovery'),
    sightEnrichment: makeQueue('sight-enrichment'),
    imageProcessing: makeQueue('image-processing'),
    hotelPrice: makeQueue('hotel-price'),
    flightPrice: makeQueue('flight-price'),
    tourAi: makeQueue('tour-ai'),
    dataQuality: makeQueue('data-quality'),
  });

  console.log('[Workers] Starting background workers...');
  try {
    new _Worker!('country-import', async (job) => {
      const { scraperService } = await import('../scrapers');
      const { storage } = await import('../../storage');
      const countries = await scraperService.scrapeCountries();
      const result = await storage.bulkCreateCountries(countries);
      return { count: result.length };
    }, { connection });

    new _Worker!('city-import', async (job) => {
      const { scraperService } = await import('../scrapers');
      const { storage } = await import('../../storage');
      const { countryCode, countryId } = job.data;
      const cities = await scraperService.scrapeCities(countryCode, countryId);
      const result = await storage.bulkCreateCities(cities);
      return { count: result.length };
    }, { connection });

    new _Worker!('sight-discovery', async (job) => {
      const { scraperService } = await import('../scrapers');
      const { storage } = await import('../../storage');
      const { cityId, cityName, osmId } = job.data;
      const sights = await scraperService.scrapeSights(cityId, cityName, osmId);
      const result = await storage.bulkCreateSights(sights);
      return { count: result.length };
    }, { connection });

    new _Worker!('sight-enrichment', async (job) => {
      const { scraperService } = await import('../scrapers');
      const { storage } = await import('../../storage');
      const { sightId, sightName } = job.data;
      const enrichment = await scraperService.enrichSightData(sightName);
      const result = await storage.updateSight(sightId, enrichment);
      return { success: true };
    }, { connection });

    Object.entries(queues).forEach(([queueName, q]) => {
      if (!q || !_QueueEvents) return;
      const events = new _QueueEvents(queueName, { connection });
      events.on('completed', ({ jobId }: any) =>
        console.log(`[Worker] ${queueName} job ${jobId} completed`)
      );
      events.on('failed', ({ jobId, failedReason }: any) =>
        console.error(`[Worker] ${queueName} job ${jobId} failed: ${failedReason}`)
      );
    });
  } catch (err: any) {
    console.warn('[Workers] Worker startup error:', err.message);
  }
}
