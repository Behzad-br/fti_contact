import { getCurrentStudent, homeworkAliasesForStudent } from '@/lib/mock-api';
import { authHeaders } from '@/lib/auth-api';
import { apiBase } from '@/lib/api-base';

function studentHeaders(): Record<string, string> {
  const student = getCurrentStudent();
  const aliases = homeworkAliasesForStudent(student);
  return {
    ...authHeaders(),
    'X-Student-Id': student.id || '',
    'X-Student-Aliases': aliases.join(','),
  };
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const teacherId = localStorage.getItem('ielts-current-teacher-id') || '';
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      ...studentHeaders(),
      'X-Admin-Token': localStorage.getItem('writing_admin_token') || '',
      'X-Teacher-Id': teacherId,
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

export type MockLibraryItem = {
  id: string;
  title: string;
  mock_type: string;
  ielts_type: string;
  question_count?: number | null;
  duration_minutes?: number | null;
};

export type MockAssignment = {
  id: string;
  title: string;
  mock_type: string;
  ielts_type: string;
  assign_mode?: string;
  batch_id?: string | null;
  batch_label?: string | null;
  available_at?: string | null;
  deadline_at?: string | null;
  duration_minutes: number;
  attempts_allowed?: number;
  secure_mode?: boolean;
  screen_monitoring?: boolean;
  fullscreen_required?: boolean;
  allow_late_start?: boolean;
  auto_submit?: boolean;
  paper_source?: string;
  result_mode?: 'teacher' | 'ai' | string;
  instructions?: string | null;
  assigned?: number;
  submitted?: number;
  inbox_status?: string;
  slot_id?: string;
  attempt_id?: string | null;
  question_count?: number;
  privacy_notice?: string | null;
  published?: boolean;
  listening_band?: number | null;
  reading_band?: number | null;
  writing_band?: number | null;
  speaking_band?: number | null;
  overall_band?: number | null;
  writing_feedback?: string | null;
};

export type MockStudentRow = {
  id: string;
  student_id: string;
  student_name: string;
  status: string;
  duration_minutes: number;
  cancelled: boolean;
  flagged: boolean;
  attempt_id?: string | null;
  warning_count: number;
  current_section?: string | null;
  current_question?: number | null;
  question_total?: number | null;
  remaining_seconds?: number | null;
  listening_band?: number | null;
  reading_band?: number | null;
  writing_band?: number | null;
  speaking_band?: number | null;
  overall_band?: number | null;
  published?: boolean;
  last_seen_at?: string | null;
  paused?: boolean;
  screen_sharing?: boolean;
  connection?: string;
  last_warning?: string | null;
  livekit_identity?: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  href?: string | null;
  read: boolean;
  created_at?: string | null;
};

export function mocksFlag() {
  return api<{ enabled: boolean }>('/mocks/flag');
}

export function listMockLibrary() {
  return api<{ items: MockLibraryItem[] }>('/mocks/library');
}

export function createMockAssignment(body: Record<string, unknown>) {
  return api<MockAssignment>('/mocks/assignments', { method: 'POST', body: JSON.stringify(body) });
}

export async function uploadMockImage(file: File) {
  const body = new FormData();
  body.append('file', file);
  return api<{ filename: string; url: string }>('/mocks/teacher/upload-image', { method: 'POST', body });
}

export function listTeacherMocks() {
  return api<{ assignments: MockAssignment[] }>('/mocks/assignments');
}

export function listMockStudents(id: string) {
  return api<{ assignment: MockAssignment; students: MockStudentRow[] }>(`/mocks/assignments/${id}/students`);
}

export function patchMockStudent(slotId: string, body: Record<string, unknown>) {
  return api(`/mocks/assignment-students/${slotId}`, { method: 'PATCH', body: JSON.stringify(body) });
}

export function mockStudentAction(slotId: string, body: Record<string, unknown>) {
  return api(`/mocks/assignment-students/${slotId}/actions`, { method: 'POST', body: JSON.stringify(body) });
}

export function studentMockInbox() {
  return api<{ items: MockAssignment[] }>('/mocks/student/inbox');
}

export function studentMockDetail(id: string) {
  return api<MockAssignment>(`/mocks/student/${id}`);
}

export function startMockAttempt(assignmentId: string, consent = true) {
  return api<{
    attempt_id: string;
    skill: Record<string, string>;
    remaining_seconds: number;
    screen_monitoring: boolean;
    fullscreen_required: boolean;
    auto_submit?: boolean;
    title?: string;
    assignment_id?: string;
    secure_mode?: boolean;
  }>('/mocks/attempts/start', { method: 'POST', body: JSON.stringify({ assignment_id: assignmentId, consent }) });
}

export function saveMockAnswers(attemptId: string, body: Record<string, unknown>) {
  return api(`/mocks/attempts/${attemptId}/answers`, { method: 'POST', body: JSON.stringify(body) });
}

export function mockHeartbeat(attemptId: string, body: Record<string, unknown>) {
  return api<{
    ok: boolean;
    warning_count?: number;
    remaining_seconds?: number;
    status?: string;
    paused?: boolean;
  }>(`/mocks/attempts/${attemptId}/heartbeat`, { method: 'POST', body: JSON.stringify(body) });
}

export function submitMockAttempt(attemptId: string) {
  return api(`/mocks/attempts/${attemptId}/submit`, { method: 'POST', body: JSON.stringify({}) });
}

export function mockMonitor(id: string) {
  return api<{
    assignment: MockAssignment;
    students: MockStudentRow[];
    totals: Record<string, number>;
    screen_note: string;
    livekit?: { configured?: boolean };
  }>(`/mocks/assignments/${id}/monitor`);
}

export function livekitToken(assignmentId: string, role: 'student' | 'teacher') {
  return api<{ enabled: boolean; url: string; token: string; room: string; identity: string }>('/mocks/livekit/token', {
    method: 'POST',
    body: JSON.stringify({ assignment_id: assignmentId, role }),
  });
}

export function reviewMockAttempt(attemptId: string, body: Record<string, unknown>) {
  return api(`/mocks/attempts/${attemptId}/review`, { method: 'POST', body: JSON.stringify(body) });
}

export function mockEvents(attemptId: string) {
  return api<{ events: { id: string; event_type: string; timestamp: string }[] }>(`/mocks/attempts/${attemptId}/events`);
}

export function listNotifications() {
  return api<{ items: NotificationItem[] }>('/notifications');
}

export function markNotificationRead(id: string) {
  return api(`/notifications/${id}/read`, { method: 'POST' });
}
