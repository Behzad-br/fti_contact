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

export async function apiLogin(username: string, password: string, role?: string) {
  const res = await fetch(`${apiBase()}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password, role }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(typeof body.detail === 'string' ? body.detail : 'Login failed');
  }
  setAuthSession(body.access_token, body.user);
  return body as { access_token: string; user: AuthUser };
}

export async function apiMe() {
  const res = await fetch(`${apiBase()}/auth/me`, { headers: { ...authHeaders() } });
  if (!res.ok) throw new Error('Session expired');
  const user = (await res.json()) as AuthUser;
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
