import { ChannelAdapter, SendMessageOptions } from './types';

export class LineAdapter implements ChannelAdapter {
  channelType: 'line' = 'line';
  private accessToken?: string;

  constructor(accessToken?: string) {
    this.accessToken = accessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
  }

  async sendMessage(options: SendMessageOptions): Promise<{ externalMsgId?: string }> {
    const token = this.accessToken || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
      throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not configured');
    }

    const messages: Array<{ type: string; [key: string]: unknown }> = [];
    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://coming-shop-aged-athletics.trycloudflare.com';

    // 1. If mediaUrl is provided (image)
    if (options.mediaUrl) {
      const fullUrl = options.mediaUrl.startsWith('http')
        ? options.mediaUrl
        : `${baseUrl}${options.mediaUrl}`;

      if (options.type === 'image' || !options.type) {
        messages.push({
          type: 'image',
          originalContentUrl: fullUrl,
          previewImageUrl: fullUrl,
        });
      }
    }

    // 2. If text is provided
    if (options.text && options.text.trim()) {
      messages.push({
        type: 'text',
        text: options.text.trim(),
      });
    }

    if (messages.length === 0) {
      throw new Error('Cannot send an empty message (text or media required)');
    }

    const payload = {
      to: options.toExternalUserId,
      messages,
    };

    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMsg = `LINE Push API error ${response.status}: ${errorText}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMsg = `LINE Push API: ${errorJson.message}`;
        }
      } catch {
        // Keep errorMsg as raw text
      }
      throw new Error(errorMsg);
    }

    const requestId = response.headers.get('x-line-request-id') || undefined;
    return { externalMsgId: requestId };
  }
}

export const lineAdapter = new LineAdapter();
