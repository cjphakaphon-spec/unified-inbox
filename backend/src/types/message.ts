export type ChannelType = 'line' | 'messenger';

export type MessageType = 'text' | 'image' | 'sticker' | 'file' | 'other';

export interface IncomingMessage {
  channel: ChannelType;
  externalUserId: string;
  externalMsgId: string;
  type: MessageType;
  text?: string;
  mediaUrl?: string;
  timestamp: Date;
  raw: unknown;
}

export interface NormalizedMessage {
  id: number;
  conversation_id: number;
  direction: 'in' | 'out';
  type: MessageType;
  text?: string | null;
  media_url?: string | null;
  raw?: unknown;
  external_msg_id?: string | null;
  sent_by?: number | null;
  status: 'sent' | 'failed';
  error?: string | null;
  created_at: string;
}

export interface ConversationSummary {
  id: number;
  customer_id: number;
  channel_id: number;
  identity_id: number;
  status: 'open' | 'closed';
  assigned_to?: number | null;
  unread_count: number;
  last_message_at?: string | null;
  last_customer_message_at?: string | null;
  channel_type?: ChannelType;
  customer_name?: string | null;
  customer_avatar?: string | null;
}
