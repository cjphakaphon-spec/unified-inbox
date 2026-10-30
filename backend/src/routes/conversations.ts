import { Router, Response } from 'express';
import { pool } from '../db';
import { sendReply } from '../services/inbox';
import { authenticateAgent, AuthenticatedRequest } from '../services/auth';
import { io } from '../index';

const router = Router();

// Protect all conversation routes with agent authentication
router.use(authenticateAgent);

/**
 * GET /api/conversations?status=&channel=
 * List conversations ordered by last_message_at DESC
 */
router.get('/', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { status, channel } = req.query;

  try {
    const queryText = `
      SELECT c.id, c.status, c.unread_count, c.last_message_at, c.last_customer_message_at,
             c.assigned_to,
             ch.type AS channel_type, ch.name AS channel_name,
             cust.id AS customer_id, cust.display_name AS customer_name, cust.avatar_url AS customer_avatar,
             i.external_user_id,
             a.name AS assigned_agent_name,
             (SELECT m.text FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_text,
             (SELECT m.type FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_type,
             (SELECT m.direction FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_message_direction
      FROM conversations c
      JOIN channels ch ON ch.id = c.channel_id
      JOIN customers cust ON cust.id = c.customer_id
      JOIN identities i ON i.id = c.identity_id
      LEFT JOIN agents a ON a.id = c.assigned_to
      WHERE ($1::text IS NULL OR c.status = $1)
        AND ($2::text IS NULL OR ch.type = $2)
      ORDER BY c.last_message_at DESC NULLS LAST, c.id DESC;
    `;

    const statusParam = typeof status === 'string' && status !== '' ? status : null;
    const channelParam = typeof channel === 'string' && channel !== '' ? channel : null;

    const result = await pool.query(queryText, [statusParam, channelParam]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

/**
 * GET /api/conversations/:id/messages?before=
 * Fetch message history with pagination
 */
router.get('/:id/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: 'Invalid conversation ID' });
    return;
  }

  const { before } = req.query;
  const beforeId = before ? parseInt(before as string, 10) : null;
  const limit = 50;

  try {
    let queryText = `
      SELECT m.id, m.conversation_id, m.direction, m.type, m.text, m.media_url,
             m.external_msg_id, m.status, m.error, m.created_at,
             m.sent_by, a.name AS sender_agent_name
      FROM messages m
      LEFT JOIN agents a ON a.id = m.sent_by
      WHERE m.conversation_id = $1
    `;

    const params: unknown[] = [conversationId];

    if (beforeId && !isNaN(beforeId)) {
      queryText += ' AND m.id < $2 ORDER BY m.id DESC LIMIT $3';
      params.push(beforeId, limit);
    } else {
      queryText += ' ORDER BY m.id DESC LIMIT $2';
      params.push(limit);
    }

    const result = await pool.query(queryText, params);
    // Return in chronological order (oldest first) for UI rendering
    res.json(result.rows.reverse());
  } catch (err) {
    console.error(`Error fetching messages for conversation ${conversationId}:`, err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

/**
 * POST /api/conversations/:id/messages
 * Send outbound message to conversation recipient
 */
router.post('/:id/messages', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: 'Invalid conversation ID' });
    return;
  }

  const { text, mediaUrl, type } = req.body;
  const hasText = text && typeof text === 'string' && text.trim() !== '';
  const hasMedia = mediaUrl && typeof mediaUrl === 'string' && mediaUrl.trim() !== '';

  if (!hasText && !hasMedia) {
    res.status(400).json({ error: 'Message text or media is required' });
    return;
  }

  const agentId = req.user?.id || null;

  try {
    const result = await sendReply(conversationId, agentId, {
      text: hasText ? text.trim() : undefined,
      mediaUrl: hasMedia ? mediaUrl.trim() : undefined,
      type: type || (hasMedia ? 'image' : 'text'),
    });
    res.status(201).json(result);
  } catch (err: unknown) {
    console.error(`Error sending message to conversation ${conversationId}:`, err);

    const statusResult = (err as unknown as { statusResult?: unknown })?.statusResult;
    if (statusResult) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Failed to send message to platform',
        message: statusResult,
      });
      return;
    }

    const message = err instanceof Error ? err.message : 'Failed to send message';
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    res.status(500).json({ error: message });
  }
});

/**
 * POST /api/conversations/:id/read
 * Mark conversation as read (unread_count = 0)
 */
router.post('/:id/read', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: 'Invalid conversation ID' });
    return;
  }

  try {
    const result = await pool.query(
      `UPDATE conversations
       SET unread_count = 0
       WHERE id = $1
       RETURNING id, unread_count`,
      [conversationId]
    );

    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    if (io) {
      io.emit('conversation:updated', {
        id: conversationId,
        unread_count: 0,
      });
    }

    res.json({ success: true, conversationId, unread_count: 0 });
  } catch (err) {
    console.error(`Error marking conversation ${conversationId} as read:`, err);
    res.status(500).json({ error: 'Failed to update read status' });
  }
});

/**
 * PATCH /api/conversations/:id
 * Update status (open/closed) or assigned_to
 */
router.patch('/:id', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const conversationId = parseInt(req.params.id, 10);
  if (isNaN(conversationId)) {
    res.status(400).json({ error: 'Invalid conversation ID' });
    return;
  }

  const { status, assigned_to } = req.body;

  if (status !== undefined && status !== 'open' && status !== 'closed') {
    res.status(400).json({ error: "Invalid status: must be 'open' or 'closed'" });
    return;
  }

  try {
    const updates: string[] = [];
    const params: unknown[] = [conversationId];

    if (status !== undefined) {
      params.push(status);
      updates.push(`status = $${params.length}`);
    }

    if (assigned_to !== undefined) {
      params.push(assigned_to);
      updates.push(`assigned_to = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    const queryText = `
      UPDATE conversations
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, status, assigned_to, unread_count, last_message_at
    `;

    const result = await pool.query(queryText, params);
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const updated = result.rows[0];

    if (io) {
      io.emit('conversation:updated', updated);
    }

    res.json(updated);
  } catch (err) {
    console.error(`Error updating conversation ${conversationId}:`, err);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

export default router;
