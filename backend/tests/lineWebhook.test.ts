import { describe, it, expect, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/index';
import { pool } from '../src/db';
import { saveIncoming } from '../src/services/inbox';
import { IncomingMessage } from '../types/message';

describe('LINE Webhook & Signature Verification', () => {
  const secret = process.env.LINE_CHANNEL_SECRET || 'test_secret_key';

  const generateSignature = (body: string, channelSecret: string) => {
    return crypto
      .createHmac('sha256', channelSecret)
      .update(Buffer.from(body))
      .digest('base64');
  };

  afterAll(async () => {
    // Cleanup test records
    await pool.query("DELETE FROM messages WHERE external_msg_id LIKE 'test_line_%'");
    await pool.query("DELETE FROM identities WHERE external_user_id LIKE 'test_user_%'");
  });

  it('rejects requests with missing signature (401)', async () => {
    const res = await request(app)
      .post('/webhook/line')
      .send({ events: [] });

    expect(res.status).toBe(401);
  });

  it('rejects requests with invalid signature (401)', async () => {
    const payload = JSON.stringify({ events: [] });
    const res = await request(app)
      .post('/webhook/line')
      .set('x-line-signature', 'invalid_signature_base64')
      .set('Content-Type', 'application/json')
      .send(payload);

    expect(res.status).toBe(401);
  });

  it('accepts requests with valid HMAC-SHA256 signature (200 OK)', async () => {
    const bodyObj = {
      destination: 'U1234567890',
      events: [
        {
          type: 'message',
          timestamp: Date.now(),
          source: { type: 'user', userId: 'test_user_line_webhook' },
          message: { id: 'test_line_msg_webhook_01', type: 'text', text: 'สวัสดีครับ' },
        },
      ],
    };

    const rawBody = JSON.stringify(bodyObj);
    const validSignature = generateSignature(rawBody, secret);

    const res = await request(app)
      .post('/webhook/line')
      .set('x-line-signature', validSignature)
      .set('Content-Type', 'application/json')
      .send(rawBody);

    expect(res.status).toBe(200);
  });

  it('saveIncoming correctly saves new message and deduplicates duplicates', async () => {
    const externalUserId = `test_user_${Date.now()}`;
    const externalMsgId = `test_line_${Date.now()}`;

    const incoming: IncomingMessage = {
      channel: 'line',
      externalUserId,
      externalMsgId,
      type: 'text',
      text: 'สวัสดี ทดสอบข้อความแรก',
      timestamp: new Date(),
      raw: { test: true },
    };

    // First save: should create customer, identity, conversation, and message
    const firstResult = await saveIncoming(incoming);
    expect(firstResult.isDuplicate).toBe(false);
    expect(firstResult.messageId).toBeDefined();
    expect(firstResult.conversationId).toBeDefined();

    // Verify in database
    const msgCheck = await pool.query(
      'SELECT id, text, direction, type FROM messages WHERE id = $1',
      [firstResult.messageId]
    );
    expect(msgCheck.rows.length).toBe(1);
    expect(msgCheck.rows[0].text).toBe('สวัสดี ทดสอบข้อความแรก');
    expect(msgCheck.rows[0].direction).toBe('in');

    const convCheck = await pool.query(
      'SELECT unread_count, status FROM conversations WHERE id = $1',
      [firstResult.conversationId]
    );
    expect(convCheck.rows[0].unread_count).toBeGreaterThanOrEqual(1);
    expect(convCheck.rows[0].status).toBe('open');

    // Second save: same message ID should be detected as duplicate
    const secondResult = await saveIncoming(incoming);
    expect(secondResult.isDuplicate).toBe(true);
    expect(secondResult.messageId).toBe(firstResult.messageId);

    // Verify messages count has not increased
    const countCheck = await pool.query(
      'SELECT COUNT(*) FROM messages WHERE conversation_id = $1 AND external_msg_id = $2',
      [firstResult.conversationId, externalMsgId]
    );
    expect(parseInt(countCheck.rows[0].count, 10)).toBe(1);
  });
});
