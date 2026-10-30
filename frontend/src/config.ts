// Base URL for Backend API and WebSocket
// In production (Vercel), set VITE_API_URL in Vercel environment variables (e.g. https://unified-inbox-xxxx.onrender.com)
// In local development or same-host deployment, leave VITE_API_URL empty to use relative paths.
export const API_BASE = (import.meta.env.VITE_API_URL as string || '').replace(/\/$/, '');

export function getFullMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const cleanPath = url.startsWith('/') ? url : `/${url}`;
  return `${API_BASE}${cleanPath}`;
}
