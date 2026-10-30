import type { Conversation, Message, MessageType } from '../types';

function getHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function fetchConversations(
  token: string,
  filter?: { status?: string; channel?: string }
): Promise<Conversation[]> {
  const params = new URLSearchParams();
  if (filter?.status) params.append('status', filter.status);
  if (filter?.channel) params.append('channel', filter.channel);

  const res = await fetch(`/api/conversations?${params.toString()}`, {
    headers: getHeaders(token),
  });
  if (!res.ok) throw new Error('Failed to fetch conversations');
  return res.json();
}

export async function fetchMessages(
  token: string,
  conversationId: number,
  before?: number
): Promise<Message[]> {
  const url = before
    ? `/api/conversations/${conversationId}/messages?before=${before}`
    : `/api/conversations/${conversationId}/messages`;

  const res = await fetch(url, { headers: getHeaders(token) });
  if (!res.ok) throw new Error('Failed to fetch messages');
  return res.json();
}

export interface SendMessagePayload {
  text?: string;
  type?: MessageType;
  mediaUrl?: string;
}

export async function sendMessage(
  token: string,
  conversationId: number,
  payload: string | SendMessagePayload
): Promise<Message> {
  const body = typeof payload === 'string' ? { text: payload } : payload;

  const res = await fetch(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    const error = new Error(data.error || 'Failed to send message');
    (error as unknown as { messageData?: Message }).messageData = data.message;
    throw error;
  }
  return data;
}

export async function uploadMedia(
  token: string,
  file: File
): Promise<{ url: string; filename: string; type: 'image' | 'file' }> {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch('/api/upload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Upload failed');
  }
  return res.json();
}

export async function markAsRead(token: string, conversationId: number): Promise<void> {
  await fetch(`/api/conversations/${conversationId}/read`, {
    method: 'POST',
    headers: getHeaders(token),
  });
}

export async function updateConversation(
  token: string,
  conversationId: number,
  updates: { status?: 'open' | 'closed'; assigned_to?: number | null }
): Promise<Conversation> {
  const res = await fetch(`/api/conversations/${conversationId}`, {
    method: 'PATCH',
    headers: getHeaders(token),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update conversation');
  return res.json();
}
