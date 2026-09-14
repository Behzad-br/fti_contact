export type PracticeSource = "bank" | "ai";

export type LiveSession =
  | { kind: "writing-question"; questionId: string }
  | { kind: "writing-mock"; mockId: string }
  | { kind: "reading"; attemptId: string }
  | { kind: "listening"; attemptId: string }
  | { kind: "speaking"; sessionId: string };

export type BankItem = {
  id: string;
  title: string;
  detail: string;
  bookId?: string;
  bookTitle?: string;
  testNumber?: number;
  passageId?: string;
  partId?: string;
  questionCount?: number;
  durationMinutes?: number;
  passages?: { id: string; title?: string }[];
  parts?: { id: string; part_number?: number; title?: string }[];
};

export type PracticeHistoryRow = {
  test_id?: string;
  estimated_band?: number | null;
  status?: string;
  submitted_at?: string;
};

export function practiceResultKey(module: string, testId: string) {
  return `ielts-practice-result-${module}-${testId}`;
}

export function readLocalPracticeResult(module: string, testId: string): { band?: number; label: string } | null {
  try {
    const raw = localStorage.getItem(practiceResultKey(module, testId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { band?: number };
    if (parsed.band == null) return { label: "Completed" };
    return { band: parsed.band, label: `Estimated band ${Number(parsed.band).toFixed(1)}` };
  } catch {
    return null;
  }
}

export function saveLocalPracticeResult(module: string, testId: string, band?: number) {
  localStorage.setItem(practiceResultKey(module, testId), JSON.stringify({ band, at: Date.now() }));
}

export async function fetchReadingHistory(): Promise<PracticeHistoryRow[]> {
  try {
    const data = await api<{ attempts: PracticeHistoryRow[] }>("/reading/history");
    return data.attempts || [];
  } catch {
    return [];
  }
}

export async function fetchListeningHistory(): Promise<PracticeHistoryRow[]> {
  try {
    const data = await api<{ attempts: PracticeHistoryRow[] }>("/listening/history");
    return data.attempts || [];
  } catch {
    return [];
  }
}

export async function fetchPracticeHistory(module: string): Promise<PracticeHistoryRow[]> {
  if (module === "Listening") return fetchListeningHistory();
  if (module === "Reading") return fetchReadingHistory();
  return [];
}

const SERIES_RULES: { match: RegExp; label: string }[] = [
  { match: /official guide/i, label: "Official Guide" },
  { match: /official.*practice material/i, label: "Official Practice Materials" },
  { match: /simulation/i, label: "Simulation Tests" },
  { match: /road to ielts/i, label: "Road to IELTS" },
  { match: /past paper/i, label: "Past Papers" },
  { match: /cambridge/i, label: "Cambridge IELTS" },
  { match: /trainer/i, label: "IELTS Trainer" },
  { match: /practice tests plus|practice test plus/i, label: "Practice Tests Plus" },
  { match: /collins/i, label: "Collins" },
  { match: /barron/i, label: "Barron's" },
  { match: /oxford/i, label: "Oxford" },
  { match: /recent actual/i, label: "Recent Actual Tests" },
  { match: /fti/i, label: "FTI" },
];

export const SERIES_ORDER = [
  "Cambridge IELTS",
  "IELTS Trainer",
  "Practice Tests Plus",
  "Collins",
  "Barron's",
  "Oxford",
  "Official Guide",
  "Official Practice Materials",
  "Simulation Tests",
  "Road to IELTS",
  "Past Papers",
  "Recent Actual Tests",
  "FTI",
];

export function bookSeries(item: BankItem): string {
  const text = `${item.bookTitle || ""} ${item.title || ""} ${item.bookId || ""}`;
  const hit = SERIES_RULES.find((rule) => rule.match.test(text));
  if (hit) return hit.label;
  return item.bookTitle || "Other";
}

export function uniqueBookCount(items: BankItem[]): number {
  return new Set(items.map((item) => item.bookId || item.id)).size;
}

export function seriesList(items: BankItem[]): { label: string; count: number }[] {
  const counts = new Map<string, Set<string>>();
  items.forEach((item) => {
    const label = bookSeries(item);
    const set = counts.get(label) || new Set<string>();
    set.add(item.bookId || item.id);
    counts.set(label, set);
  });
  return Array.from(counts.entries())
    .map(([label, set]) => ({ label, count: set.size }))
    .sort((a, b) => {
      const ai = SERIES_ORDER.indexOf(a.label);
      const bi = SERIES_ORDER.indexOf(b.label);
      if (ai === -1 && bi === -1) return a.label.localeCompare(b.label);
      if (ai === -1) return 1;
      if (bi === -1) return -1;
      return ai - bi;
    });
}

export function resultForTest(module: string, testId: string, history: PracticeHistoryRow[]): { band?: number; label: string } {
  const fromApi = history.find((h) => h.test_id === testId && (h.status === "submitted" || h.estimated_band != null));
  if (fromApi?.estimated_band != null) {
    return { band: fromApi.estimated_band, label: `Estimated band ${Number(fromApi.estimated_band).toFixed(1)}` };
  }
  return readLocalPracticeResult(module, testId) || { label: "No result yet" };
}

import { apiBase } from "@/lib/api-base";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...options,
    headers: {
      "X-Student-Id": "local",
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
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
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export function examType(type: string) {
  return type.toLowerCase().includes("general") ? "general_training" : "academic";
}

export function isFullMock(task: string) {
  return task.toLowerCase().includes("full");
}

export function taskOptions(module: string) {
  if (module === "Writing") return ["Task 1", "Task 2", "Full Mock"];
  if (module === "Speaking") return ["Part 1", "Part 2", "Part 3", "Full Mock"];
  if (module === "Reading") return ["Passage 1", "Passage 2", "Passage 3", "Full Mock"];
  return ["Section 1", "Section 2", "Section 3", "Section 4", "Full Mock"];
}

export function defaultTask(module: string) {
  return taskOptions(module)[0];
}

export async function loadPracticeBank(
  module: string,
  type: string,
  task: string,
): Promise<{ items: BankItem[]; note: string }> {
  const tt = examType(type);
  const full = isFullMock(task);
  if (module === "Writing") {
    const catalog = await api<{ tests: any[]; total?: number }>(`/writing/catalog?test_type=${tt}`);
    const tests = catalog.tests || [];
    if (full) {
      return {
        note: `${tests.length} writing tests (Task 1 + Task 2), grouped by book. Estimated band after submit — not official IELTS.`,
        items: tests.map((t) => ({
          id: t.id,
          title: t.title || t.id,
          bookId: t.book_id,
          bookTitle: t.book_title,
          testNumber: t.test_number,
          detail: "Task 1 + Task 2 · 60 minutes",
          durationMinutes: t.duration_minutes || 60,
          parts: t.parts || [],
        })),
      };
    }
    const taskNumber = task.includes("1") ? 1 : 2;
    const items = tests.flatMap((t) => {
      const part = (t.parts || []).find((p: { part_number: number }) => p.part_number === taskNumber);
      if (!part) return [];
      return [
        {
          id: part.id,
          title: `${t.book_title || "Writing"} · Test ${String(t.test_number || 0).padStart(2, "0")} Task ${taskNumber}`,
          bookId: t.book_id,
          bookTitle: t.book_title,
          testNumber: t.test_number,
          detail: part.prompt_preview || t.title || "",
          partId: part.id,
        },
      ];
    });
    return {
      note: `${items.length} published writing tasks. Submit to get an AI estimated band.`,
      items,
    };
  }
  if (module === "Reading") {
    const catalog = await api<{ academic: any[]; general_training: any[] }>("/reading/catalog");
    const list = tt === "general_training" ? catalog.general_training || [] : catalog.academic || [];
    const pIndex = Math.max(0, Number((task.match(/\d+/) || ["1"])[0]) - 1);
    return {
      note: full
        ? `${list.length} reading tests, grouped by book. Answers + estimated band after submit.`
        : `${list.length} reading tests — pick a passage.`,
      items: list.map((t) => ({
        id: t.id,
        title: t.title || t.id,
        bookId: t.book_id,
        bookTitle: t.book_title,
        testNumber: t.test_number,
        detail: `${t.question_count || 40} questions · ${t.duration_minutes || 60} min`,
        questionCount: t.question_count || 40,
        durationMinutes: t.duration_minutes || 60,
        passages: t.passages || [],
        passageId: full ? undefined : t.passages?.[pIndex]?.id,
      })),
    };
  }
  if (module === "Listening") {
    const catalog = await api<{ tests: any[] }>("/listening/catalog");
    const tests = catalog.tests || [];
    const partNum = Number((task.match(/\d+/) || ["1"])[0]);
    return {
      note: full
        ? `${tests.length} original full listening tests. AI checks short answers after submit.`
        : `${tests.length} original listening tests — pick a section.`,
      items: tests.map((t) => {
        const part =
          (t.parts || []).find((p: { part_number: number }) => p.part_number === partNum) ||
          (t.parts || [])[partNum - 1];
        return {
          id: t.id,
          title: t.title || t.id,
          bookId: t.book_id,
          bookTitle: t.book_title,
          testNumber: t.test_number,
          detail: `${t.question_count || 40} questions · ${t.duration_minutes || 30} min`,
          questionCount: t.question_count || 40,
          durationMinutes: t.duration_minutes || 30,
          parts: t.parts || [],
          partId: full ? undefined : part?.id,
        };
      }),
    };
  }
  const data = await api<{ tests: { id: string; title: string }[]; total: number }>("/tests/list");
  return {
    note: full
      ? `${data.total || data.tests?.length || 0} speaking mocks. Record all parts; AI estimates a band after you finish.`
      : `${data.total || data.tests?.length || 0} speaking tests — one part.`,
    items: (data.tests || []).map((t, i) => ({
      id: t.id,
      title: t.title || `Speaking Test ${String(i + 1).padStart(2, "0")}`,
      bookId: "fti-speaking",
      bookTitle: "FTI Speaking",
      testNumber: i + 1,
      detail: "Parts 1–3 · 11–14 minutes",
      parts: [
        { id: "1", part_number: 1, title: "Part 1" },
        { id: "2", part_number: 2, title: "Part 2" },
        { id: "3", part_number: 3, title: "Part 3" },
      ],
    })),
  };
}

export async function openLiveSession(opts: {
  module: string;
  type: string;
  task: string;
  mode: string;
  source: PracticeSource;
  item?: BankItem;
}): Promise<LiveSession> {
  const timed = opts.mode.toLowerCase().includes("exam");
  const tt = examType(opts.type);
  const full = isFullMock(opts.task);
  const source = opts.source;
  if (source === "ai" && opts.module !== "Speaking") {
    throw new Error("AI generate is only available for Speaking practice.");
  }

  if (opts.module === "Writing") {
    if (source === "ai" && full) {
      const t1 = await api<{ question: { id: string } }>("/writing/questions/generate", {
        method: "POST",
        body: JSON.stringify({ test_type: tt, task_number: 1 }),
      });
      const t2 = await api<{ question: { id: string } }>("/writing/questions/generate", {
        method: "POST",
        body: JSON.stringify({ test_type: tt, task_number: 2 }),
      });
      const mock = await api<{ id: string }>("/writing/mock-tests", {
        method: "POST",
        body: JSON.stringify({ test_type: tt, task1_id: t1.question.id, task2_id: t2.question.id }),
      });
      return { kind: "writing-mock", mockId: mock.id };
    }
    if (source === "ai") {
      const taskNumber = opts.task.includes("1") ? 1 : 2;
      const gen = await api<{ question: { id: string } }>("/writing/questions/generate", {
        method: "POST",
        body: JSON.stringify({ test_type: tt, task_number: taskNumber }),
      });
      return { kind: "writing-question", questionId: gen.question.id };
    }
    if (full) {
      const t1 = opts.item?.parts?.find((p) => p.part_number === 1)?.id;
      const t2 = opts.item?.parts?.find((p) => p.part_number === 2)?.id;
      const mock = await api<{ id: string }>("/writing/mock-tests", {
        method: "POST",
        body: JSON.stringify({
          test_type: tt,
          ...(t1 ? { task1_id: t1 } : {}),
          ...(t2 ? { task2_id: t2 } : {}),
        }),
      });
      return { kind: "writing-mock", mockId: mock.id };
    }
    if (!opts.item?.id) throw new Error("Select a writing task from the bank.");
    return { kind: "writing-question", questionId: opts.item.partId || opts.item.id };
  }

  if (opts.module === "Reading") {
    if (source === "ai") {
      const attempt = await api<{ attempt_id: string }>("/reading/attempts", {
        method: "POST",
        body: JSON.stringify({
          test_id: tt,
          mode: full ? "ai_full_mock" : "ai_passage",
          timed,
        }),
      });
      return { kind: "reading", attemptId: attempt.attempt_id };
    }
    if (!opts.item?.id) throw new Error("Select a reading test from the bank.");
    const body = full || !opts.item.passageId
      ? { test_id: opts.item.id, mode: "full_mock", timed }
      : { test_id: opts.item.id, mode: "single_passage", passage_id: opts.item.passageId, timed };
    const attempt = await api<{ attempt_id: string }>("/reading/attempts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { kind: "reading", attemptId: attempt.attempt_id };
  }

  if (opts.module === "Listening") {
    if (source === "ai") {
      const attempt = await api<{ attempt_id: string }>("/listening/attempts", {
        method: "POST",
        body: JSON.stringify({
          test_id: "ai",
          mode: full ? "ai_full_mock" : "ai_part",
          timed,
        }),
      });
      return { kind: "listening", attemptId: attempt.attempt_id };
    }
    if (!opts.item?.id) throw new Error("Select a listening test from the bank.");
    const body = full || !opts.item.partId
      ? { test_id: opts.item.id, mode: "full_mock", timed }
      : { test_id: opts.item.id, mode: "single_part", part_id: opts.item.partId, timed };
    const attempt = await api<{ attempt_id: string }>("/listening/attempts", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return { kind: "listening", attemptId: attempt.attempt_id };
  }

  if (source === "ai") {
    const part = full ? undefined : Number((opts.task.match(/\d+/) || ["1"])[0]);
    const started = await api<{ session_id: string }>("/tests/start", {
      method: "POST",
      body: JSON.stringify(full ? { mode: "fresh" } : { mode: "fresh", practice_part: part }),
    });
    return { kind: "speaking", sessionId: started.session_id };
  }
  if (!opts.item?.id) throw new Error("Select a speaking test from the bank.");
  const part = Number((opts.task.match(/\d+/) || ["1"])[0]) as 1 | 2 | 3;
  const started = await api<{ session_id: string }>("/tests/start", {
    method: "POST",
    body: JSON.stringify(full ? { mode: "stored", test_id: opts.item.id } : { mode: "stored", test_id: opts.item.id, practice_part: part }),
  });
  return { kind: "speaking", sessionId: started.session_id };
}
