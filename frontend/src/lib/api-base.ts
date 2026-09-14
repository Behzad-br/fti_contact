/** Absolute API origin for production (Vercel). Empty in local Vite → same-origin `/api` proxy. */
export function apiOrigin(): string {
  const raw = (import.meta.env.VITE_API_URL as string | undefined) || '';
  return raw.replace(/\/$/, '');
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
