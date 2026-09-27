/** Absolute API origin for production. Empty in local Vite → same-origin `/api` proxy. */
export function apiOrigin(): string {
  const raw = ((import.meta.env.VITE_API_URL as string | undefined) || '').trim().replace(/\/$/, '');
  if (raw) return raw;

  // Safety net: production SPA on the public site must never call itself for /api.
  if (import.meta.env.PROD && typeof window !== 'undefined') {
    const host = window.location.hostname.toLowerCase();
    if (host === 'fti4iltes.tech' || host === 'www.fti4iltes.tech') {
      return 'https://api.fti4iltes.tech';
    }
  }
  return '';
}

/** Prefix for REST calls — always includes `/api`. */
export function apiBase(): string {
  return `${apiOrigin()}/api`;
}

/** Socket.IO server URL (API origin in production; same host in local proxy). */
export function socketOrigin(): string | undefined {
  const origin = apiOrigin();
  return origin || undefined;
}
