import { Router, Request, Response } from 'express';
import { CustomRequest } from '../index';
import { verifyMessengerSignature } from '../services/signature';
import { saveIncoming } from '../services/inbox';
import { downloadRemoteMedia } from '../services/media';
import { IncomingMessage, MessageType } from '../types/message';

const router = Router();

interface MessengerAttachment {
  type: string;
  payload?: {
    url?: string;
  };
}

interface MessagingItem {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    attachments?: MessengerAttachment[];
  };
}

interface MessengerWebhookBody {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    messaging?: MessagingItem[];
  }>;
}

/**
 * GET /webhook/messenger
 * Webhook verification for Meta App setup
 */
router.get('/', (req: Request, res: Response): void => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.FB_VERIFY_TOKEN;

  if (mode === 'subscribe' && token === expectedToken) {
    console.log('✅ Messenger webhook verification succeeded');
    res.status(200).send(challenge);
  } else {
    console.warn('❌ Messenger webhook verification failed: Token mismatch or invalid mode');
    res.sendStatus(403);
  }
});

/**
 * POST /webhook/messenger
 * 1. Verify x-hub-signature-256
 * 2. Return HTTP 200 immediately
 * 3. Process events asynchronously
 */
router.post('/', async (req: CustomRequest, res: Response): Promise<void> => {
  const signature = req.headers['x-hub-signature-256'] as string | undefined;
  const appSecret = process.env.FB_APP_SECRET;

  if (!appSecret) {
    console.error('FB_APP_SECRET is not configured');
    res.status(500).send('Server misconfiguration');
    return;
  }

  // 1. Verify signature
  const isValid = verifyMessengerSignature(req.rawBody, signature, appSecret);
  if (!isValid) {
    console.warn('❌ Invalid Messenger webhook signature');
    res.status(401).send('Invalid signature');
    return;
  }

  // 2. Respond 200 OK immediately
  res.status(200).send('EVENT_RECEIVED');

  // 3. Process events in the background
  const body = req.body as MessengerWebhookBody;
  if (body.object !== 'page' || !Array.isArray(body.entry)) {
    return;
  }

  for (const entry of body.entry) {
    const messagingList = entry.messaging || [];
    for (const item of messagingList) {
      try {
        // Skip echo messages (messages sent by page itself) or non-message events
        if (!item.message || item.message.is_echo || !item.sender?.id) {
          continue;
        }

        let msgType: MessageType = 'text';
        let mediaUrl: string | undefined = undefined;

        if (item.message.attachments && item.message.attachments.length > 0) {
          const firstAttach = item.message.attachments[0];
          const rawUrl = firstAttach.payload?.url;
          if (rawUrl) {
            mediaUrl = (await downloadRemoteMedia(rawUrl, 'fb')) || rawUrl;
          }
          if (firstAttach.type === 'image') msgType = 'image';
          else if (firstAttach.type === 'file') msgType = 'file';
          else msgType = 'other';
        }

        const incoming: IncomingMessage = {
          channel: 'messenger',
          externalUserId: item.sender.id,
          externalMsgId: item.message.mid,
          type: msgType,
          text: item.message.text,
          mediaUrl,
          timestamp: new Date(item.timestamp || Date.now()),
          raw: item,
        };

        await saveIncoming(incoming);
      } catch (err) {
        console.error('Error processing Messenger webhook item:', err);
      }
    }
  }
});

export default router;
