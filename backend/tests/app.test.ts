import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';

// Mock DB pool query to avoid needing a live DB during unit test
vi.mock('../src/db', () => ({
  pool: {
    query: vi.fn().mockResolvedValue({ rows: [{ now: new Date() }] }),
  },
}));

describe('Server & Health Check', () => {
  it('GET /api/health returns 200 with status ok and database connected', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.database).toBe('connected');
    expect(res.body.timestamp).toBeDefined();
  });
});
