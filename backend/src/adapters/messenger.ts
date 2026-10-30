import { ChannelAdapter, SendMessageOptions } from './types';

export class MessengerAdapter implements ChannelAdapter {
  channelType: 'messenger' = 'messenger';
  private pageAccessToken?: string;
  private graphVersion: string;

  constructor(pageAccessToken?: string, graphVersion = 'v21.0') {
    this.pageAccessToken = pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN;
    this.graphVersion = graphVersion || process.env.FB_GRAPH_VERSION || 'v21.0';
  }

  async sendMessage(options: SendMessageOptions): Promise<{ externalMsgId?: string }> {
    const token = this.pageAccessToken || process.env.FB_PAGE_ACCESS_TOKEN;
    if (!token) {
      throw new Error('FB_PAGE_ACCESS_TOKEN is not configured');
    }

    const baseUrl = process.env.PUBLIC_BASE_URL || 'https://coming-shop-aged-athletics.trycloudflare.com';
    let lastMsgId: string | undefined;

    // 1. If mediaUrl is provided (image)
    if (options.mediaUrl) {
      const fullUrl = options.mediaUrl.startsWith('http')
        ? options.mediaUrl
        : `${baseUrl}${options.mediaUrl}`;

      const mediaPayload = {
        recipient: { id: options.toExternalUserId },
        message: {
          attachment: {
            type: options.type === 'file' ? 'file' : 'image',
            payload: {
              url: fullUrl,
              is_reusable: true,
            },
          },
        },
      };

      const mediaRes = await fetch(
        `https://graph.facebook.com/${this.graphVersion}/me/messages?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(mediaPayload),
        }
      );

      if (!mediaRes.ok) {
        const errorText = await mediaRes.text();
        throw new Error(`Messenger Media Send error: ${errorText}`);
      }
      const mediaData = (await mediaRes.json()) as { message_id?: string };
      lastMsgId = mediaData.message_id;
    }

    // 2. If text is provided
    if (options.text && options.text.trim()) {
      const textPayload = {
        recipient: { id: options.toExternalUserId },
        messaging_type: 'RESPONSE',
        message: { text: options.text.trim() },
      };

      const textRes = await fetch(
        `https://graph.facebook.com/${this.graphVersion}/me/messages?access_token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(textPayload),
        }
      );

      if (!textRes.ok) {
        const errorText = await textRes.text();
        throw new Error(`Messenger Text Send error: ${errorText}`);
      }
      const textData = (await textRes.json()) as { message_id?: string };
      lastMsgId = textData.message_id;
    }

    return { externalMsgId: lastMsgId };
  }
}

export const messengerAdapter = new MessengerAdapter();
