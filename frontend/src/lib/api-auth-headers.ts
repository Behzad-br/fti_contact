/** Shared authenticated fetch for skill APIs. */
import { authHeaders, getAuthUser } from '@/lib/auth-api';
import { getCurrentStudent } from '@/lib/mock-api';

export function studentAuthHeaders(): Record<string, string> {
  const user = getAuthUser();
  const student = getCurrentStudent();
  const id = (user?.role === 'student' ? user.id : student.id) || '';
  return {
    ...authHeaders(),
    ...(id ? { 'X-Student-Id': id } : {}),
  };
}

export function teacherAuthHeaders(): Record<string, string> {
  const user = getAuthUser();
  const teacherId = user?.role === 'teacher' ? user.id : (localStorage.getItem('ielts-current-teacher-id') || '');
  return {
    ...authHeaders(),
    ...(teacherId ? { 'X-Teacher-Id': teacherId } : {}),
  };
}
