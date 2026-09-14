import { authHeaders, getAuthUser } from "@/lib/auth-api";
import {
  WritingAttempt,
  WritingMock,
  WritingProgress,
  WritingQuestion,
} from "./types";

const API_BASE = "/api";

export function getStudentId(): string {
  if (typeof window === "undefined") return "";
  const user = getAuthUser();
  if (user?.role === "student") return user.id;
  return localStorage.getItem("writing_student_id") || "";
}

export function getAdminToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem("writing_admin_token") || "";
}

async function request<T>(path: string, options?: RequestInit & { admin?: boolean }): Promise<T> {
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...(getStudentId() ? { "X-Student-Id": getStudentId() } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };
  if (options?.admin) {
    headers["X-Admin-Token"] = getAdminToken();
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  } catch {
    throw new Error("Cannot connect to server. Make sure the backend is running on port 8000.");
  }
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {
      /* ignore */
    }
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  if (res.status === 204) return {} as T;
  return res.json();
}

export async function listWritingQuestions(params: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "" && v !== false) q.set(k, String(v));
  });
  return request<{ total: number; questions: WritingQuestion[] }>(`/writing/questions?${q}`);
}

export async function getWritingQuestion(id: string) {
  return request<WritingQuestion>(`/writing/questions/${id}`);
}

export async function startWritingQuestion(id: string, timerMode = "countup") {
  return request<WritingAttempt>(`/writing/questions/${id}/start?timer_mode=${timerMode}`, {
    method: "POST",
  });
}

export async function getAttempt(id: string) {
  return request<WritingAttempt>(`/writing/attempts/${id}`);
}

export async function saveAttempt(id: string, answer_text: string, time_spent_seconds?: number) {
  return request<{ id: string; status: string; word_count: number }>(`/writing/attempts/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer_text, time_spent_seconds }),
  });
}

export async function submitAttempt(id: string, answer_text: string, time_spent_seconds?: number) {
  return request<WritingAttempt>(`/writing/attempts/${id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ answer_text, time_spent_seconds }),
  });
}

export async function retryGrade(id: string) {
  return request<WritingAttempt>(`/writing/attempts/${id}/grade`, { method: "POST" });
}

export async function generateWritingQuestion(body: Record<string, unknown>) {
  return request<{ generation_id: string; question: WritingQuestion; attempt: WritingAttempt }>(
    "/writing/questions/generate",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );
}

export async function startMock(test_type: string) {
  return request<WritingMock>("/writing/mock-tests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ test_type }),
  });
}

export async function getMock(id: string) {
  return request<WritingMock>(`/writing/mock-tests/${id}`);
}

export async function saveMock(id: string, payload: Record<string, unknown>) {
  return request<WritingMock>(`/writing/mock-tests/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function submitMock(id: string, payload: Record<string, unknown>) {
  return request<WritingMock>(`/writing/mock-tests/${id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function writingHistory(params: Record<string, string | number | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") q.set(k, String(v));
  });
  return request<{ items: Record<string, unknown>[]; total: number }>(`/writing/history?${q}`);
}

export async function writingProgress(days?: number) {
  const suffix = days ? `?days=${days}` : "";
  return request<WritingProgress>(`/writing/progress${suffix}`);
}

export async function writingDrafts() {
  return request<{ attempts: WritingAttempt[] }>("/writing/drafts");
}

export async function writingBookmarks() {
  return request<{ questions: WritingQuestion[] }>("/writing/bookmarks");
}

export async function toggleBookmark(id: string, on: boolean) {
  return request(`/writing/bookmarks/${id}`, { method: on ? "POST" : "DELETE" });
}

export async function requestModelAnswer(attemptId: string, band_style: number) {
  return request(`/writing/attempts/${attemptId}/model-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ band_style }),
  });
}

export async function adminQuestions(params: Record<string, string | undefined> = {}) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v) q.set(k, v);
  });
  return request<{ total: number; questions: WritingQuestion[] }>(`/writing/admin/questions?${q}`, {
    admin: true,
  });
}

export async function adminSaveQuestion(body: Record<string, unknown>, id?: string) {
  return request<WritingQuestion>(id ? `/writing/admin/questions/${id}` : "/writing/admin/questions", {
    method: id ? "PATCH" : "POST",
    admin: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function adminAction(path: string, body?: unknown) {
  return request(path, {
    method: "POST",
    admin: true,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export async function adminSubmissions() {
  return request<{ submissions: Record<string, unknown>[] }>("/writing/admin/submissions", {
    admin: true,
  });
}

export async function adminSubmission(id: string) {
  return request<Record<string, unknown>>(`/writing/admin/submissions/${id}`, { admin: true });
}

export async function adminReview(id: string, body: Record<string, unknown>) {
  return request(`/writing/admin/submissions/${id}/review`, {
    method: "POST",
    admin: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function adminImport(file: File, dryRun = false) {
  const form = new FormData();
  form.append("file", file);
  return request(`/writing/admin/import?dry_run=${dryRun}`, { method: "POST", admin: true, body: form });
}
