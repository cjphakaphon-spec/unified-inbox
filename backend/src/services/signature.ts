import crypto from 'crypto';

/**
 * Verify LINE webhook signature.
 * Header: x-line-signature = base64(HMAC-SHA256(rawBody, LINE_CHANNEL_SECRET))
 */
export function verifyLineSignature(
  rawBody: Buffer | undefined,
  signature: string | undefined,
  channelSecret: string | undefined
): boolean {
  if (!rawBody || !signature || !channelSecret) {
    return false;
  }

  try {
    const expectedSignature = crypto
      .createHmac('sha256', channelSecret)
      .update(rawBody)
      .digest('base64');

    const signatureBuffer = Buffer.from(signature, 'base64');
    const expectedBuffer = Buffer.from(expectedSignature, 'base64');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('Error verifying LINE signature:', error);
    return false;
  }
}

/**
 * Verify Messenger webhook signature.
 * Header: x-hub-signature-256 = sha256= + hex(HMAC-SHA256(rawBody, FB_APP_SECRET))
 */
export function verifyMessengerSignature(
  rawBody: Buffer | undefined,
  headerSignature: string | undefined,
  appSecret: string | undefined
): boolean {
  if (!rawBody || !headerSignature || !appSecret) {
    return false;
  }

  try {
    if (!headerSignature.startsWith('sha256=')) {
      return false;
    }

    const signature = headerSignature.substring(7);
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (signatureBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
  } catch (error) {
    console.error('Error verifying Messenger signature:', error);
    return false;
  }
}
