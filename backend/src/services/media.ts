import fs from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(__dirname, '../../uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

/**
 * Download media from LINE Content API
 * GET https://api-data.line.me/v2/bot/message/{messageId}/content
 */
export async function downloadLineMedia(messageId: string): Promise<string | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.error(`Failed to download LINE media ${messageId}: ${res.statusText}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('pdf')) ext = '.pdf';

    const filename = `line_${messageId}_${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error downloading LINE media:', err);
    return null;
  }
}

/**
 * Download media from a remote URL (e.g. temporary Messenger attachment URL)
 */
export async function downloadRemoteMedia(url: string, prefix = 'msg'): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`Failed to download remote media: ${res.statusText}`);
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    let ext = '.jpg';
    if (contentType.includes('png')) ext = '.png';
    else if (contentType.includes('gif')) ext = '.gif';
    else if (contentType.includes('mp4')) ext = '.mp4';
    else if (contentType.includes('pdf')) ext = '.pdf';

    const filename = `${prefix}_${Date.now()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return `/uploads/${filename}`;
  } catch (err) {
    console.error('Error downloading remote media:', err);
    return null;
  }
}
