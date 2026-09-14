import {
  StartTestResponse,
  AnswerSubmitResponse,
  SessionResult,
  HistoryList,
  Progress,
  StoredTest,
  Health,
  Evaluation,
} from "./types";

const API_BASE = "/api";

async function request<T>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${path}`;
  let res: Response;

  try {
    res = await fetch(url, {
      ...options,
      headers: {
        ...(options?.headers || {}),
      },
    });
  } catch (networkErr: any) {
    throw new Error(
      "Cannot connect to server. Make sure the backend is running on port 8000."
    );
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch {}
    throw new Error(detail);
  }

  return res.json();
}


// ─── Health ──────────────────────────────────────────────────────────────────

export async function getHealth(): Promise<Health> {
  return request<Health>("/health");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

export async function listStoredTests(): Promise<{ tests: StoredTest[]; total: number }> {
  return request("/tests/list");
}

export async function startStoredTest(testId: string): Promise<StartTestResponse> {
  return request<StartTestResponse>("/tests/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "stored", test_id: testId }),
  });
}

export async function startRandomStoredTest(): Promise<StartTestResponse> {
  return request<StartTestResponse>("/tests/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "stored" }),
  });
}

export async function startFreshTest(): Promise<StartTestResponse> {
  return request<StartTestResponse>("/tests/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "fresh" }),
  });
}

export async function startPartPractice(
  part: 1 | 2 | 3,
  options?: { mode?: "stored" | "fresh"; testId?: string }
): Promise<StartTestResponse> {
  return request<StartTestResponse>("/tests/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: options?.mode || "stored",
      test_id: options?.testId,
      practice_part: part,
    }),
  });
}

export async function getSession(sessionId: string): Promise<any> {
  return request(`/tests/${sessionId}`);
}

// ─── Answers ─────────────────────────────────────────────────────────────────

export async function submitAnswer(
  sessionId: string,
  questionId: string,
  audioBlob: Blob,
  filename: string = "audio.webm"
): Promise<AnswerSubmitResponse> {
  const formData = new FormData();
  formData.append("session_id", sessionId);
  formData.append("question_id", questionId);
  formData.append("audio", audioBlob, filename);

  return request<AnswerSubmitResponse>("/answers/submit", {
    method: "POST",
    body: formData,
  });
}

export async function finalizeSession(sessionId: string): Promise<Evaluation> {
  return request<Evaluation>(`/answers/finalize/${sessionId}`, {
    method: "POST",
  });
}

// ─── History ─────────────────────────────────────────────────────────────────

export async function getHistory(): Promise<HistoryList> {
  return request<HistoryList>("/history");
}

export async function getSessionResult(sessionId: string): Promise<SessionResult> {
  return request<SessionResult>(`/history/${sessionId}`);
}

export async function getProgress(): Promise<Progress> {
  return request<Progress>("/progress");
}
