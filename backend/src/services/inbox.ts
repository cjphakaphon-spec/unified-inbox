import { pool } from '../db';
import { IncomingMessage, MessageType } from '../types/message';
import { io } from '../index';
import { lineAdapter } from '../adapters/line';
import { messengerAdapter } from '../adapters/messenger';
import { ChannelAdapter } from '../adapters/types';
import { syncCustomerProfile } from './profile';

export interface SaveIncomingResult {
  isDuplicate: boolean;
  messageId?: number;
  conversationId?: number;
}

export interface SendReplyResult {
  id: number;
  conversationId: number;
  direction: 'out';
  type: MessageType;
  text?: string | null;
  mediaUrl?: string | null;
  status: 'sent' | 'failed';
  error?: string | null;
  createdAt: string;
}

export interface ReplyOptions {
  text?: string;
  type?: MessageType;
  mediaUrl?: string;
}

/**
 * Handles incoming normalized message:
 * 1. Find or create Channel
 * 2. Find or create Identity + Customer
 * 3. Find or create Conversation
 * 4. Deduplicate by (conversation_id, external_msg_id)
 * 5. Insert Message
 * 6. Update unread_count, last_message_at, last_customer_message_at
 * 7. Broadcast via WebSocket (Socket.IO)
 */
export async function saveIncoming(msg: IncomingMessage): Promise<SaveIncomingResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Get or create channel
    let channelRes = await client.query('SELECT id FROM channels WHERE type = $1 LIMIT 1', [msg.channel]);
    let channelId: number;
    if (channelRes.rows.length === 0) {
      const newChannel = await client.query(
        'INSERT INTO channels (type, name) VALUES ($1, $2) RETURNING id',
        [msg.channel, msg.channel === 'line' ? 'LINE Official Account' : 'Facebook Messenger']
      );
      channelId = newChannel.rows[0].id;
    } else {
      channelId = channelRes.rows[0].id;
    }

    // 2. Find or create Identity & Customer
    let identityRes = await client.query(
      'SELECT id, customer_id FROM identities WHERE channel_id = $1 AND external_user_id = $2',
      [channelId, msg.externalUserId]
    );

    let identityId: number;
    let customerId: number;

    if (identityRes.rows.length === 0) {
      // Create new customer
      const newCust = await client.query(
        'INSERT INTO customers (display_name) VALUES ($1) RETURNING id',
        [`User ${msg.externalUserId.slice(-4)}`]
      );
      customerId = newCust.rows[0].id;

      // Create identity
      const newIdentity = await client.query(
        'INSERT INTO identities (customer_id, channel_id, external_user_id) VALUES ($1, $2, $3) RETURNING id',
        [customerId, channelId, msg.externalUserId]
      );
      identityId = newIdentity.rows[0].id;
    } else {
      identityId = identityRes.rows[0].id;
      customerId = identityRes.rows[0].customer_id;
    }

    // 3. Find or create Conversation
    let convRes = await client.query(
      'SELECT id, unread_count FROM conversations WHERE identity_id = $1 AND channel_id = $2 LIMIT 1',
      [identityId, channelId]
    );

    let conversationId: number;
    let currentUnread = 0;

    if (convRes.rows.length === 0) {
      const newConv = await client.query(
        `INSERT INTO conversations (customer_id, channel_id, identity_id, status, unread_count, last_message_at, last_customer_message_at)
         VALUES ($1, $2, $3, 'open', 0, $4, $4)
         RETURNING id`,
        [customerId, channelId, identityId, msg.timestamp]
      );
      conversationId = newConv.rows[0].id;
    } else {
      conversationId = convRes.rows[0].id;
      currentUnread = convRes.rows[0].unread_count || 0;
    }

    // 4. Deduplicate check
    if (msg.externalMsgId) {
      const dupCheck = await client.query(
        'SELECT id FROM messages WHERE conversation_id = $1 AND external_msg_id = $2',
        [conversationId, msg.externalMsgId]
      );
      if (dupCheck.rows.length > 0) {
        await client.query('COMMIT');
        return { isDuplicate: true, messageId: dupCheck.rows[0].id, conversationId };
      }
    }

    // 5. Insert Message
    const msgInsert = await client.query(
      `INSERT INTO messages (conversation_id, direction, type, text, media_url, raw, external_msg_id, status, created_at)
       VALUES ($1, 'in', $2, $3, $4, $5, $6, 'sent', $7)
       RETURNING id, created_at`,
      [
        conversationId,
        msg.type,
        msg.text || null,
        msg.mediaUrl || null,
        JSON.stringify(msg.raw),
        msg.externalMsgId,
        msg.timestamp,
      ]
    );
    const messageId = msgInsert.rows[0].id;

    // 6. Update conversation unread count and timestamps
    const updatedUnread = currentUnread + 1;
    await client.query(
      `UPDATE conversations
       SET unread_count = $1,
           last_message_at = $2,
           last_customer_message_at = $2,
           status = 'open'
       WHERE id = $3`,
      [updatedUnread, msg.timestamp, conversationId]
    );

    await client.query('COMMIT');

    // Trigger profile sync in the background
    syncCustomerProfile(customerId, msg.channel, msg.externalUserId, conversationId).catch(console.error);

    // 7. Realtime Broadcast via WebSocket
    try {
      if (io) {
        io.emit('message:new', {
          id: messageId,
          conversation_id: conversationId,
          direction: 'in',
          type: msg.type,
          text: msg.text,
          media_url: msg.mediaUrl,
          external_msg_id: msg.externalMsgId,
          status: 'sent',
          created_at: msgInsert.rows[0].created_at,
          channel: msg.channel,
        });

        io.emit('conversation:updated', {
          id: conversationId,
          unread_count: updatedUnread,
          last_message_at: msg.timestamp,
          last_customer_message_at: msg.timestamp,
          status: 'open',
        });
      }
    } catch (wsError) {
      console.error('WebSocket emit error:', wsError);
    }

    return { isDuplicate: false, messageId, conversationId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Send an outbound reply from an agent:
 * 1. Look up conversation, channel, and recipient external user id
 * 2. Select appropriate channel adapter (e.g., LINE push API)
 * 3. Send message via adapter
 * 4. Record outgoing message into DB (sent or failed)
 * 5. Emit WebSocket event
 */
export async function sendReply(
  conversationId: number,
  agentId: number | null,
  content: string | ReplyOptions
): Promise<SendReplyResult> {
  const text = typeof content === 'string' ? content : content.text;
  const msgType = typeof content === 'string' ? 'text' : content.type || (content.mediaUrl ? 'image' : 'text');
  const mediaUrl = typeof content === 'string' ? undefined : content.mediaUrl;

  const client = await pool.connect();
  try {
    // 1. Fetch conversation details
    const convRes = await client.query(
      `SELECT c.id, c.channel_id, c.identity_id, c.last_customer_message_at,
              ch.type AS channel_type,
              i.external_user_id
       FROM conversations c
       JOIN channels ch ON ch.id = c.channel_id
       JOIN identities i ON i.id = c.identity_id
       WHERE c.id = $1`,
      [conversationId]
    );

    if (convRes.rows.length === 0) {
      throw new Error(`Conversation ${conversationId} not found`);
    }

    const conv = convRes.rows[0];
    const channelType = conv.channel_type as 'line' | 'messenger';
    const externalUserId = conv.external_user_id as string;

    // 2. Select adapter & enforce rules
    let adapter: ChannelAdapter;
    if (channelType === 'line') {
      adapter = lineAdapter;
    } else if (channelType === 'messenger') {
      // 24-hour policy check for Messenger
      if (conv.last_customer_message_at) {
        const lastMsgTime = new Date(conv.last_customer_message_at).getTime();
        const diffHours = (Date.now() - lastMsgTime) / (1000 * 60 * 60);
        if (diffHours > 24) {
          throw new Error('ไม่สามารถส่งข้อความได้เนื่องจากเกินเวลา 24 ชั่วโมงตามนโยบายของ Messenger');
        }
      }
      adapter = messengerAdapter;
    } else {
      throw new Error(`Channel adapter for ${channelType} is not supported`);
    }

    // 3. Attempt to send via adapter
    let status: 'sent' | 'failed' = 'sent';
    let errorMessage: string | null = null;
    let externalMsgId: string | null = null;

    try {
      const sendResult = await adapter.sendMessage({
        toExternalUserId: externalUserId,
        text,
        type: msgType,
        mediaUrl,
      });
      externalMsgId = sendResult.externalMsgId || null;
    } catch (err: unknown) {
      status = 'failed';
      errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`Failed to send reply to ${channelType}:`, errorMessage);
    }

    // 4. Record outbound message in DB
    const insertRes = await client.query(
      `INSERT INTO messages (conversation_id, direction, type, text, media_url, external_msg_id, sent_by, status, error, created_at)
       VALUES ($1, 'out', $2, $3, $4, $5, $6, $7, $8, NOW())
       RETURNING id, created_at`,
      [conversationId, msgType, text || null, mediaUrl || null, externalMsgId, agentId, status, errorMessage]
    );

    const messageId = insertRes.rows[0].id;
    const createdAt = insertRes.rows[0].created_at;

    // Update conversation last_message_at
    await client.query(
      `UPDATE conversations
       SET last_message_at = NOW()
       WHERE id = $1`,
      [conversationId]
    );

    // 5. Broadcast outbound message via WebSocket
    try {
      if (io) {
        io.emit('message:new', {
          id: messageId,
          conversation_id: conversationId,
          direction: 'out',
          type: msgType,
          text: text || null,
          media_url: mediaUrl || null,
          external_msg_id: externalMsgId,
          status,
          error: errorMessage,
          sent_by: agentId,
          created_at: createdAt,
          channel: channelType,
        });

        io.emit('conversation:updated', {
          id: conversationId,
          last_message_at: createdAt,
        });
      }
    } catch (wsError) {
      console.error('WebSocket emit error for reply:', wsError);
    }

    if (status === 'failed') {
      const err = new Error(errorMessage || 'Failed to send message');
      (err as unknown as { statusResult: SendReplyResult }).statusResult = {
        id: messageId,
        conversationId,
        direction: 'out',
        type: msgType,
        text: text || null,
        mediaUrl: mediaUrl || null,
        status: 'failed',
        error: errorMessage,
        createdAt,
      };
      throw err;
    }

    return {
      id: messageId,
      conversationId,
      direction: 'out',
      type: msgType,
      text: text || null,
      mediaUrl: mediaUrl || null,
      status: 'sent',
      createdAt,
    };
  } finally {
    client.release();
  }
}
