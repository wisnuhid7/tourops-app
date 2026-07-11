import { describe, it, expect, vi, beforeAll } from 'vitest';
import request from 'supertest';

// Mock the database before anything else is imported
vi.mock('../../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  }
}));

// Mock storage
vi.mock('../../storage', () => ({
  storage: {
    bulkCreateHotels: vi.fn().mockResolvedValue([]),
    getGlobalSalesStats: vi.fn().mockResolvedValue({}),
    getAuditLogs: vi.fn().mockResolvedValue([]),
    getSight: vi.fn().mockResolvedValue({ id: '1', name: 'Test Sight' }),
  }
}));

// Mock workers/queues entirely to avoid Redis
vi.mock('../../lib/workers', () => ({
  queues: {
    countryImport: { add: vi.fn().mockResolvedValue({ id: '1' }) },
    cityImport: { add: vi.fn().mockResolvedValue({ id: '1' }) },
    sightDiscovery: { add: vi.fn().mockResolvedValue({ id: '1' }) },
    sightEnrichment: { add: vi.fn().mockResolvedValue({ id: '1' }) },
    tourAi: { add: vi.fn().mockResolvedValue({ id: '1' }) },
    hotelPrice: { add: vi.fn().mockResolvedValue({ id: '1' }) },
    flightPrice: { add: vi.fn().mockResolvedValue({ id: '1' }) },
  },
  startWorkers: vi.fn(),
}));

// Mock IORedis just in case
vi.mock('ioredis', () => ({
  default: function() {
    return { on: vi.fn(), quit: vi.fn() };
  }
}));

// Now import the app
import { app } from '../../index';

describe('Functional API Tests', () => {
  it('GET /api/hotels/search should return 400 if params are missing', async () => {
    const response = await request(app).get('/api/hotels/search');
    expect(response.status).toBe(400);
  });

  it('GET /api/hotels/search should return hotels if params are valid', async () => {
    const response = await request(app).get('/api/hotels/search?city=Palestine&countryCode=PS');
    expect(response.status).toBe(200);
  });

  it('POST /api/admin/scraper/block should require authentication', async () => {
    const response = await request(app)
      .post('/api/admin/scraper/block')
      .send({ domain: 'malicious.com' });
    expect([401, 403]).toContain(response.status);
  });
});
