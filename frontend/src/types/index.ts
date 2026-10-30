export type ChannelType = 'line' | 'messenger';

export type MessageType = 'text' | 'image' | 'sticker' | 'file' | 'other';

export interface Agent {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface Conversation {
  id: number;
  customer_id: number;
  customer_name: string | null;
  customer_avatar: string | null;
  channel_type: ChannelType;
  channel_name: string;
  external_user_id: string;
  status: 'open' | 'closed';
  unread_count: number;
  assigned_to: number | null;
  assigned_agent_name: string | null;
  last_message_at: string | null;
  last_customer_message_at: string | null;
  last_message_text: string | null;
  last_message_type: MessageType | null;
  last_message_direction: 'in' | 'out' | null;
}

export interface Message {
  id: number;
  conversation_id: number;
  direction: 'in' | 'out';
  type: MessageType;
  text: string | null;
  media_url: string | null;
  external_msg_id: string | null;
  sent_by: number | null;
  sender_agent_name?: string | null;
  status: 'sent' | 'failed';
  error: string | null;
  created_at: string;
}
