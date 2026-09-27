/** Production auth session + API helpers. */

import { apiBase } from '@/lib/api-base';

export type AuthRole = 'student' | 'teacher' | 'branch_admin' | 'super_admin';

export type AuthUser = {
  id: string;
  role: AuthRole | string;
  email: string;
  username: string;
  full_name: string;
  name?: string;
  branch_id?: string;
  branchId?: string;
  batch?: string;
  batches?: string;
  is_active?: boolean;
};

const TOKEN_KEY = 'ielts-access-token';
const USER_KEY = 'ielts-auth-user';

export function getAccessToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function getAuthUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function setAuthSession(token: string, user: AuthUser) {
  if (!token || !user || typeof user !== 'object') {
    throw new Error('Cannot save session: missing access token or user.');
  }
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function formatApiDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail.map((item) => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: unknown }).msg);
      return '';
    }).filter(Boolean);
    if (parts.length) return parts.join('; ');
  }
  return fallback;
}

/** Normalize backend login JSON: { access_token, token_type, user }. */
function parseLoginPayload(body: unknown): { access_token: string; user: AuthUser } {
  const root = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const nested =
    root.data && typeof root.data === 'object' ? (root.data as Record<string, unknown>) : null;
  const source = nested && (nested.access_token || nested.user) ? nested : root;

  const access_token = String(source.access_token || source.accessToken || '').trim();
  const userRaw = source.user;
  if (!access_token) {
    throw new Error('Invalid authentication response: missing access_token.');
  }
  if (!userRaw || typeof userRaw !== 'object') {
    throw new Error('Invalid authentication response: missing user.');
  }
  const user = userRaw as AuthUser;
  if (!user.role) {
    throw new Error('Invalid authentication response: user.role is missing.');
  }
  return { access_token, user };
}

export async function apiLogin(username: string, password: string, role?: string) {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (body as { detail?: unknown })?.detail;
    throw new Error(formatApiDetail(detail, 'Login failed'));
  }
  const parsed = parseLoginPayload(body);
  setAuthSession(parsed.access_token, parsed.user);
  return parsed;
}

export async function apiMe() {
  const res = await fetch(`${apiBase()}/auth/me`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Session expired');
  const user = (await res.json().catch(() => null)) as AuthUser | null;
  if (!user || typeof user !== 'object' || !user.role) {
    clearAuthSession();
    throw new Error('Invalid authentication response.');
  }
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  return user;
}

export async function orgFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      ...authHeaders(),
      ...(options?.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...(options?.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export function mapAuthRoleToUi(role: string): 'student' | 'teacher' | 'admin' | 'branch-admin' {
  if (role === 'super_admin') return 'admin';
  if (role === 'branch_admin') return 'branch-admin';
  if (role === 'teacher') return 'teacher';
  return 'student';
}
