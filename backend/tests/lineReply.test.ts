import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/index';
import { pool } from '../src/db';
import { LineAdapter } from '../src/adapters/line';
import { saveIncoming } from '../src/services/inbox';
import { generateToken } from '../src/services/auth';

describe('Milestone 3: LINE Reply & Send Messages API', () => {
  let testConversationId: number;
  const testUserId = `test_reply_user_${Date.now()}`;
  const mockToken = generateToken({ id: 1, name: 'Tester', email: 'test@inbox.com', role: 'agent' });

  beforeEach(async () => {
    // Setup a conversation for testing
    const incomingResult = await saveIncoming({
      channel: 'line',
      externalUserId: testUserId,
      externalMsgId: `msg_${Date.now()}`,
      type: 'text',
      text: 'ข้อความสำหรับทดสอบการตอบกลับ',
      timestamp: new Date(),
      raw: {},
    });
    testConversationId = incomingResult.conversationId!;
  });

  afterAll(async () => {
    await pool.query("DELETE FROM messages WHERE external_msg_id LIKE 'test_%' OR text LIKE 'ข้อความทดสอบ%'");
    await pool.query("DELETE FROM identities WHERE external_user_id LIKE 'test_reply_user_%'");
  });

  describe('LineAdapter Unit Tests', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('successfully sends message via LINE Push API', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: (header: string) => (header === 'x-line-request-id' ? 'req-12345' : null),
        },
      } as unknown as Response);

      const adapter = new LineAdapter('mock_token');
      const result = await adapter.sendMessage({
        toExternalUserId: 'U1234567890',
        text: 'สวัสดีครับ ยินดีให้บริการ',
      });

      expect(result.externalMsgId).toBe('req-12345');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.line.me/v2/bot/message/push',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer mock_token',
          }),
        })
      );
    });

    it('throws error when LINE Push API returns non-200', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Invalid user ID' })),
      } as unknown as Response);

      const adapter = new LineAdapter('mock_token');
      await expect(
        adapter.sendMessage({
          toExternalUserId: 'invalid_id',
          text: 'ทดสอบ',
        })
      ).rejects.toThrow('LINE Push API: Invalid user ID');
    });
  });

  describe('POST /api/conversations/:id/messages API', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('returns 400 if text is missing or empty', async () => {
      const res = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ text: '' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBeDefined();
    });

    it('returns 404 for non-existent conversation', async () => {
      const res = await request(app)
        .post('/api/conversations/99999999/messages')
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ text: 'ทดสอบ' });

      expect(res.status).toBe(404);
    });

    it('successfully sends reply and records outbound message in DB', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        headers: {
          get: () => 'line-req-999',
        },
      } as unknown as Response);

      const res = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ text: 'ข้อความทดสอบตอบกลับทีมงาน' });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('sent');
      expect(res.body.text).toBe('ข้อความทดสอบตอบกลับทีมงาน');
      expect(res.body.direction).toBe('out');

      // Verify DB record
      const dbCheck = await pool.query(
        'SELECT * FROM messages WHERE id = $1',
        [res.body.id]
      );
      expect(dbCheck.rows.length).toBe(1);
      expect(dbCheck.rows[0].direction).toBe('out');
      expect(dbCheck.rows[0].status).toBe('sent');
      expect(dbCheck.rows[0].external_msg_id).toBe('line-req-999');
    });

    it('records failed message in DB and returns 502 when delivery fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: vi.fn().mockResolvedValue(JSON.stringify({ message: 'Authentication failed' })),
      } as unknown as Response);

      const res = await request(app)
        .post(`/api/conversations/${testConversationId}/messages`)
        .set('Authorization', `Bearer ${mockToken}`)
        .send({ text: 'ข้อความทดสอบเคสส่งไม่สำเร็จ' });

      expect(res.status).toBe(502);
      expect(res.body.error).toContain('LINE Push API: Authentication failed');
      expect(res.body.message.status).toBe('failed');

      // Verify DB record has status failed
      const dbCheck = await pool.query(
        'SELECT * FROM messages WHERE id = $1',
        [res.body.message.id]
      );
      expect(dbCheck.rows.length).toBe(1);
      expect(dbCheck.rows[0].status).toBe('failed');
      expect(dbCheck.rows[0].error).toContain('Authentication failed');
    });
  });
});
