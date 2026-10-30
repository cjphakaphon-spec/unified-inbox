import { Router, Response } from 'express';
import { CustomRequest } from '../index';
import { verifyLineSignature } from '../services/signature';
import { saveIncoming } from '../services/inbox';
import { downloadLineMedia } from '../services/media';
import { IncomingMessage, MessageType } from '../types/message';

const router = Router();

interface LineWebhookEvent {
  type: string;
  timestamp: number;
  source: {
    type: string;
    userId?: string;
  };
  message?: {
    id: string;
    type: string;
    text?: string;
    contentProvider?: { type: string };
  };
}

interface LineWebhookBody {
  destination?: string;
  events?: LineWebhookEvent[];
}

/**
 * POST /webhook/line
 * 1. Verify x-line-signature
 * 2. Return HTTP 200 immediately
 * 3. Process events asynchronously
 */
router.post('/', async (req: CustomRequest, res: Response): Promise<void> => {
  const signature = req.headers['x-line-signature'] as string | undefined;
  const channelSecret = process.env.LINE_CHANNEL_SECRET;

  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET is not configured');
    res.status(500).send('Server misconfiguration');
    return;
  }

  // 1. Verify signature
  const isValid = verifyLineSignature(req.rawBody, signature, channelSecret);
  if (!isValid) {
    console.warn('❌ Invalid LINE webhook signature');
    res.status(401).send('Invalid signature');
    return;
  }

  // 2. Respond 200 OK immediately
  res.status(200).send('OK');

  // 3. Process events in the background
  const body = req.body as LineWebhookBody;
  const events = body.events || [];

  for (const event of events) {
    try {
      // Process only message events from users
      if (event.type !== 'message' || !event.message || !event.source?.userId) {
        continue;
      }

      let msgType: MessageType = 'other';
      if (event.message.type === 'text') msgType = 'text';
      else if (event.message.type === 'image') msgType = 'image';
      else if (event.message.type === 'sticker') msgType = 'sticker';
      else if (event.message.type === 'file') msgType = 'file';

      let mediaUrl: string | undefined = undefined;
      if (msgType === 'image' || msgType === 'file') {
        mediaUrl = (await downloadLineMedia(event.message.id)) || undefined;
      }

      const incoming: IncomingMessage = {
        channel: 'line',
        externalUserId: event.source.userId,
        externalMsgId: event.message.id,
        type: msgType,
        text: event.message.text,
        mediaUrl,
        timestamp: new Date(event.timestamp),
        raw: event,
      };

      await saveIncoming(incoming);
    } catch (err) {
      console.error('Error processing LINE webhook event:', err);
    }
  }
});

export default router;
