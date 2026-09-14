import { getCurrentStudent } from '@/lib/mock-api';

function headers(extra?: Record<string, string>) {
  const me = getCurrentStudent();
  return {
    'X-Student-Id': me.id || 's1',
    'X-Student-Batch': me.batch || '',
    'X-Student-Name': me.name || '',
    'X-Admin-Token': localStorage.getItem('writing_admin_token') || '',
    ...extra,
  };
}

async function notes<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...headers(options?.body instanceof FormData ? undefined : options?.body ? { 'Content-Type': 'application/json' } : undefined),
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

export type TeacherNote = {
  id: string;
  title: string;
  description: string;
  original_name: string;
  kind?: string;
  page_count: number;
  unlocked_batches: string[];
  unlocked_student_ids: string[];
  created_at?: string | null;
  updated_at?: string | null;
};

export type StudentNote = {
  id: string;
  title: string;
  description: string;
  kind?: string;
  page_count: number | null;
  unlocked: boolean;
  updated_at?: string | null;
};

export function listTeacherNotes() {
  return notes<{ notes: TeacherNote[] }>('/notes/teacher');
}

export function createTeacherNote(body: FormData) {
  return notes<TeacherNote>('/notes/teacher', { method: 'POST', body });
}

export function updateTeacherNote(id: string, body: FormData) {
  return notes<TeacherNote>(`/notes/teacher/${id}`, { method: 'PUT', body });
}

export function setNoteAccess(id: string, unlocked_batches: string[], unlocked_student_ids: string[]) {
  return notes<TeacherNote>(`/notes/teacher/${id}/access`, {
    method: 'PUT',
    body: JSON.stringify({ unlocked_batches, unlocked_student_ids }),
  });
}

export function deleteTeacherNote(id: string) {
  return notes(`/notes/teacher/${id}`, { method: 'DELETE' });
}

export async function teacherNoteFileUrl(id: string) {
  const res = await fetch(`/api/notes/teacher/${id}/file`, { headers: headers() });
  if (!res.ok) throw new Error('Could not open this file.');
  return URL.createObjectURL(await res.blob());
}

export function listStudentNotes() {
  return notes<{ notes: StudentNote[] }>('/notes/student');
}

export function studentNoteMeta(id: string) {
  return notes<TeacherNote & { watermark?: string; unlocked: boolean }>(`/notes/student/${id}`);
}

export async function studentNotePageUrl(id: string, page: number) {
  const res = await fetch(`/api/notes/student/${id}/page/${page}`, { headers: headers() });
  if (!res.ok) {
    let detail = 'This page is locked.';
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === 'string' ? detail : 'Locked');
  }
  return URL.createObjectURL(await res.blob());
}
