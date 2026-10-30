import { pool } from '../db';
import { io } from '../index';

export interface CustomerProfile {
  displayName?: string;
  avatarUrl?: string;
}

/**
 * Fetch profile from LINE Messaging API
 */
export async function fetchLineProfile(userId: string): Promise<CustomerProfile | null> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;

  try {
    const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      console.warn(`Could not fetch LINE profile for ${userId}: ${res.statusText}`);
      return null;
    }

    const data = (await res.json()) as { displayName?: string; pictureUrl?: string };
    return {
      displayName: data.displayName,
      avatarUrl: data.pictureUrl,
    };
  } catch (err) {
    console.error('Error fetching LINE profile:', err);
    return null;
  }
}

/**
 * Fetch profile for Messenger PSID
 * Includes fallback to page conversations senders list
 */
export async function fetchMessengerProfile(psid: string): Promise<CustomerProfile | null> {
  const token = process.env.FB_PAGE_ACCESS_TOKEN;
  const version = process.env.FB_GRAPH_VERSION || 'v21.0';
  if (!token) return null;

  try {
    // 1. Try direct PSID endpoint
    const directRes = await fetch(
      `https://graph.facebook.com/${version}/${psid}?fields=first_name,last_name,name,profile_pic&access_token=${encodeURIComponent(token)}`
    );

    if (directRes.ok) {
      const data = (await directRes.json()) as {
        name?: string;
        first_name?: string;
        last_name?: string;
        profile_pic?: string;
      };
      const name = data.name || (data.first_name ? `${data.first_name} ${data.last_name || ''}`.trim() : undefined);
      return {
        displayName: name,
        avatarUrl: data.profile_pic,
      };
    }

    // 2. Fallback: Query page conversations to find sender's name
    const convRes = await fetch(
      `https://graph.facebook.com/${version}/me/conversations?fields=senders&access_token=${encodeURIComponent(token)}`
    );

    if (convRes.ok) {
      const convData = (await convRes.json()) as {
        data?: Array<{
          senders?: {
            data?: Array<{ id: string; name?: string }>;
          };
        }>;
      };

      const threads = convData.data || [];
      for (const thread of threads) {
        const senders = thread.senders?.data || [];
        const match = senders.find((s) => s.id === psid);
        if (match && match.name) {
          return { displayName: match.name };
        }
      }
    }

    return null;
  } catch (err) {
    console.error('Error fetching Messenger profile:', err);
    return null;
  }
}

/**
 * Update customer profile in DB and emit update to Web UI
 */
export async function syncCustomerProfile(
  customerId: number,
  channel: 'line' | 'messenger',
  externalUserId: string,
  conversationId?: number
): Promise<void> {
  try {
    let profile: CustomerProfile | null = null;
    if (channel === 'line') {
      profile = await fetchLineProfile(externalUserId);
    } else if (channel === 'messenger') {
      profile = await fetchMessengerProfile(externalUserId);
    }

    if (profile && (profile.displayName || profile.avatarUrl)) {
      const updates: string[] = [];
      const params: unknown[] = [customerId];

      if (profile.displayName) {
        params.push(profile.displayName);
        updates.push(`display_name = $${params.length}`);
      }

      if (profile.avatarUrl) {
        params.push(profile.avatarUrl);
        updates.push(`avatar_url = $${params.length}`);
      }

      if (updates.length > 0) {
        await pool.query(
          `UPDATE customers SET ${updates.join(', ')} WHERE id = $1`,
          params
        );
        console.log(`✅ Synced profile for customer ${customerId} (${channel}): ${profile.displayName}`);

        // Broadcast update via WebSocket
        if (io && conversationId) {
          io.emit('conversation:updated', {
            id: conversationId,
            customer_name: profile.displayName,
            customer_avatar: profile.avatarUrl,
          });
        }
      }
    }
  } catch (err) {
    console.error('Error syncing customer profile:', err);
  }
}
