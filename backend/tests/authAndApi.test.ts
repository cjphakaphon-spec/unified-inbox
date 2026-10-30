import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { seedInitialAgent } from '../src/services/auth';

describe('Milestone 5: Auth & Protected REST APIs', () => {
  let authToken: string;
  let testConvId: number;

  beforeAll(async () => {
    // Ensure agent exists
    await seedInitialAgent();
  });

  describe('Authentication (/api/auth)', () => {
    it('rejects login with wrong password (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@inbox.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBeDefined();
    });

    it('rejects login with non-existent email (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@inbox.com', password: 'password123' });

      expect(res.status).toBe(401);
    });

    it('successfully logs in with valid credentials and returns JWT token (200)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@inbox.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.agent.email).toBe('admin@inbox.com');
      authToken = res.body.token;
    });

    it('GET /api/auth/me returns current agent profile with valid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.agent.email).toBe('admin@inbox.com');
    });
  });

  describe('Protected Conversations API (/api/conversations)', () => {
    it('returns 401 when calling GET /api/conversations without token', async () => {
      const res = await request(app).get('/api/conversations');
      expect(res.status).toBe(401);
    });

    it('returns 401 when calling GET /api/conversations with invalid token', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', 'Bearer invalid_token_xyz');

      expect(res.status).toBe(401);
    });

    it('returns 200 with conversation list when authenticated', async () => {
      const res = await request(app)
        .get('/api/conversations')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        testConvId = res.body[0].id;
        expect(res.body[0]).toHaveProperty('channel_type');
        expect(res.body[0]).toHaveProperty('customer_name');
        expect(res.body[0]).toHaveProperty('status');
      }
    });

    it('GET /api/conversations/:id/messages returns message history', async () => {
      if (!testConvId) return;

      const res = await request(app)
        .get(`/api/conversations/${testConvId}/messages`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      if (res.body.length > 0) {
        expect(res.body[0]).toHaveProperty('direction');
        expect(res.body[0]).toHaveProperty('type');
      }
    });

    it('POST /api/conversations/:id/read marks unread count as 0', async () => {
      if (!testConvId) return;

      const res = await request(app)
        .post(`/api/conversations/${testConvId}/read`)
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).toBe(200);
      expect(res.body.unread_count).toBe(0);
    });

    it('PATCH /api/conversations/:id updates status', async () => {
      if (!testConvId) return;

      const res = await request(app)
        .patch(`/api/conversations/${testConvId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'closed' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('closed');

      // Reopen
      await request(app)
        .patch(`/api/conversations/${testConvId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ status: 'open' });
    });
  });
});
