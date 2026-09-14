import { authHeaders, getAuthUser } from "@/lib/auth-api";
import {
  ListeningAttemptPayload,
  ListeningCatalog,
  ListeningHistoryItem,
  ListeningResult,
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

export async function listeningCatalog() {
  return request<ListeningCatalog>("/listening/catalog");
}

export async function startListeningAttempt(body: {
  test_id: string;
  mode: "full_mock" | "single_part" | "question_type" | "ai_part" | "ai_full_mock";
  part_id?: string;
  question_type?: string;
  timed?: boolean;
}) {
  return request<ListeningAttemptPayload>("/listening/attempts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getListeningAttempt(id: string) {
  return request<ListeningAttemptPayload>(`/listening/attempts/${id}`);
}

export async function saveListeningResponses(
  id: string,
  responses: Record<string, string | string[]>,
  remainingSeconds?: number | null
) {
  return request<{ ok: boolean }>(`/listening/attempts/${id}/responses`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses, remaining_seconds: remainingSeconds ?? undefined }),
  });
}

export async function startListeningAudio(id: string, partId: string) {
  return request<{ ok: boolean; plays_used: number; plays_allowed: number; seeking_allowed: boolean }>(
    `/listening/attempts/${id}/audio-start`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ part_id: partId }),
    }
  );
}

export async function submitListeningAttempt(
  id: string,
  responses: Record<string, string | string[]>
) {
  return request<ListeningResult>(`/listening/attempts/${id}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ responses }),
  });
}

export async function getListeningResult(id: string) {
  return request<ListeningResult>(`/listening/attempts/${id}/result`);
}

export async function listeningHistory() {
  return request<{ attempts: ListeningHistoryItem[] }>("/listening/history");
}

export async function listeningProgress() {
  return request<{
    total_submitted: number;
    average_band: number | null;
    recent_bands: number[];
    question_types: Record<string, { correct: number; total: number }>;
  }>("/listening/progress");
}

export async function listeningHealth() {
  return request<{ minimax_configured: boolean }>("/health");
}

export function audioUrl(file?: string | null) {
  if (!file) return "";
  const name = file.split("/").pop() || file;
  return `${API_BASE}/listening/audio/${encodeURIComponent(name)}`;
}

export function mapUrl(file?: string | null) {
  if (!file) return "";
  const name = file.split("/").pop() || file;
  return `${API_BASE}/listening/maps/${encodeURIComponent(name)}`;
}
