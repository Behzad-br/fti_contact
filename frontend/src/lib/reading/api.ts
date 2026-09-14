import { authHeaders, getAuthUser } from "@/lib/auth-api";
import {
  ReadingAttemptPayload,
  ReadingCatalog,
  ReadingHistoryItem,
  ReadingProgress,
  ReadingResult,
  ReadingTest,
} from "./types";

const API_BASE = "/api";

export function getStudentId(): string {
  if (typeof window === "undefined") return "";
  const user = getAuthUser();
  if (user?.role === "student") return user.id;
  return localStorage.getItem("writing_student_id") || "";
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...authHeaders(),
    ...(getStudentId() ? { "X-Student-Id": getStudentId() } : {}),
    ...(options?.headers as Record<string, string> | undefined),
  };
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
  return res.json();
}

export async function readingCatalog() {
  return request<ReadingCatalog>("/reading/catalog");
}

export async function getReadingTest(testId: string, passageId?: string) {
  const q = passageId ? `?passage_id=${encodeURIComponent(passageId)}` : "";
  return request<ReadingTest>(`/reading/tests/${testId}${q}`);
}

export async function readingPractice(questionType: string, testType?: string) {
  const q = new URLSearchParams({ question_type: questionType });
  if (testType) q.set("test_type", testType);
  return request<ReadingTest>(`/reading/practice?${q}`);
}

export async function startReadingAttempt(body: {
  test_id: string;
  mode: "full_mock" | "single_passage" | "question_type" | "ai_passage" | "ai_full_mock";
  passage_id?: string;
  question_type?: string;
  timed?: boolean;
}) {
  return request<ReadingAttemptPayload>("/reading/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function readingHealth() {
  return request<{ minimax_configured: boolean }>("/health");
}

export async function getReadingAttempt(id: string) {
  return request<ReadingAttemptPayload>(`/reading/attempts/${id}`);
}

export async function saveReadingResponses(
  id: string,
  responses: Record<string, string>,
  remainingSeconds?: number | null
) {
  return request<{ ok: boolean; saved: number }>(`/reading/attempts/${id}/responses`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses, remaining_seconds: remainingSeconds ?? undefined }),
  });
}

export async function submitReadingAttempt(
  id: string,
  responses: Record<string, string>,
  remainingSeconds?: number | null
) {
  return request<ReadingResult>(`/reading/attempts/${id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses, remaining_seconds: remainingSeconds ?? undefined }),
  });
}

export async function getReadingResult(id: string) {
  return request<ReadingResult>(`/reading/attempts/${id}/result`);
}

export async function readingHistory() {
  return request<{ attempts: ReadingHistoryItem[] }>("/reading/history");
}

export async function readingProgress() {
  return request<ReadingProgress>("/reading/progress");
}

export function diagramUrl(asset?: string | null) {
  if (!asset) return "";
  if (asset.startsWith("data:") || asset.startsWith("http://") || asset.startsWith("https://") || asset.startsWith("/")) {
    return asset;
  }
  if (asset.startsWith("pack:")) {
    const rest = asset.slice(5);
    const slash = rest.indexOf("/");
    const testId = slash === -1 ? rest : rest.slice(0, slash);
    const file = (slash === -1 ? rest : rest.slice(slash + 1)).split("/").pop() || rest;
    return `${API_BASE}/reading/pack-images/${encodeURIComponent(testId)}/${encodeURIComponent(file)}`;
  }
  const name = asset.split("/").pop() || asset;
  return `${API_BASE}/reading/diagrams/${encodeURIComponent(name)}`;
}
