export interface SendMessageOptions {
  toExternalUserId: string;
  text?: string;
  type?: 'text' | 'image' | 'sticker' | 'file' | 'other';
  mediaUrl?: string;
}

export interface ChannelAdapter {
  channelType: 'line' | 'messenger';
  sendMessage(options: SendMessageOptions): Promise<{ externalMsgId?: string }>;
}
