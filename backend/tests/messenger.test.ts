import { describe, it, expect, vi, afterEach, afterAll } from 'vitest';
import request from 'supertest';
import crypto from 'crypto';
import { app } from '../src/index';
import { pool } from '../src/db';
import { MessengerAdapter } from '../src/adapters/messenger';
import { sendReply, saveIncoming } from '../src/services/inbox';

describe('Milestone 4: Messenger Webhook, Adapter & 24h Policy', () => {
  const verifyToken = process.env.FB_VERIFY_TOKEN || 'unified_inbox_verify_token_2026_secure';
  const appSecret = process.env.FB_APP_SECRET || '603640b2dd295e41fd8f4b4bfe379362';

  const generateMessengerSignature = (body: string, secret: string) => {
    const hash = crypto.createHmac('sha256', secret).update(Buffer.from(body)).digest('hex');
    return `sha256=${hash}`;
  };

  afterAll(async () => {
    await pool.query("DELETE FROM messages WHERE external_msg_id LIKE 'fb_test_%' OR text LIKE 'FB%'");
    await pool.query("DELETE FROM identities WHERE external_user_id LIKE 'fb_user_%'");
  });

  describe('GET /webhook/messenger (Verification)', () => {
    it('returns challenge with 200 OK when verify token matches', async () => {
      const challenge = 'challenge_test_12345';
      const res = await request(app)
        .get('/webhook/messenger')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': verifyToken,
          'hub.challenge': challenge,
        });

      expect(res.status).toBe(200);
      expect(res.text).toBe(challenge);
    });

    it('returns 403 Forbidden when verify token does not match', async () => {
      const res = await request(app)
        .get('/webhook/messenger')
        .query({
          'hub.mode': 'subscribe',
          'hub.verify_token': 'wrong_token',
          'hub.challenge': '12345',
        });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /webhook/messenger (Incoming & Signature)', () => {
    it('rejects missing or invalid signature with 401', async () => {
      const res = await request(app)
        .post('/webhook/messenger')
        .send({ object: 'page', entry: [] });

      expect(res.status).toBe(401);
    });

    it('accepts valid HMAC signature and processes message', async () => {
      const payload = {
        object: 'page',
        entry: [
          {
            id: 'page_123',
            time: Date.now(),
            messaging: [
              {
                sender: { id: `fb_user_${Date.now()}` },
                recipient: { id: 'page_123' },
                timestamp: Date.now(),
                message: {
                  mid: `fb_test_mid_${Date.now()}`,
                  text: 'FB: สวัสดีจาก Facebook Messenger',
                },
              },
            ],
          },
        ],
      };

      const raw = JSON.stringify(payload);
      const signature = generateMessengerSignature(raw, appSecret);

      const res = await request(app)
        .post('/webhook/messenger')
        .set('x-hub-signature-256', signature)
        .set('Content-Type', 'application/json')
        .send(raw);

      expect(res.status).toBe(200);
      expect(res.text).toBe('EVENT_RECEIVED');
    });
  });

  describe('MessengerAdapter & 24-Hour Policy', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('MessengerAdapter formats request properly and returns message_id', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ recipient_id: '123', message_id: 'fb_mid_sent_999' }),
      } as unknown as Response);

      const adapter = new MessengerAdapter('mock_fb_token', 'v21.0');
      const result = await adapter.sendMessage({
        toExternalUserId: '123',
        text: 'ตอบกลับเพจ',
      });

      expect(result.externalMsgId).toBe('fb_mid_sent_999');
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://graph.facebook.com/v21.0/me/messages?access_token='),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('rejects sending reply if more than 24 hours have passed since last customer message', async () => {
      // 1. Create a conversation where customer message is older than 25 hours
      const oldTime = new Date(Date.now() - 25 * 60 * 60 * 1000);
      const incomingRes = await saveIncoming({
        channel: 'messenger',
        externalUserId: `fb_user_old_${Date.now()}`,
        externalMsgId: `fb_test_old_${Date.now()}`,
        type: 'text',
        text: 'ข้อความเก่าเกิน 24 ชม.',
        timestamp: oldTime,
        raw: {},
      });

      const convId = incomingRes.conversationId!;
      // Explicitly ensure last_customer_message_at is 25 hours ago
      await pool.query('UPDATE conversations SET last_customer_message_at = $1 WHERE id = $2', [
        oldTime,
        convId,
      ]);

      // 2. Try to send reply
      await expect(sendReply(convId, null, 'ข้อความตอบกลับหลังจาก 24 ชม.')).rejects.toThrow(
        'ไม่สามารถส่งข้อความได้เนื่องจากเกินเวลา 24 ชั่วโมง'
      );
    });
  });
});
