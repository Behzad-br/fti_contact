export type ListeningOption = { code: string; text: string };

export type ListeningPart = {
  id: string;
  part_number: number;
  title: string;
  context?: string;
  setting?: string;
  speakers?: { name: string; voice?: string }[];
  audio_file?: string;
  visual_file?: string;
  audio_asset?: string;
  visual_asset?: string;
  visual_assets?: string[];
};

export type ListeningQuestion = {
  id: string;
  number: number;
  part_number: number;
  part_id: string;
  type: string;
  instruction?: string;
  prompt: string;
  options?: ListeningOption[];
  group_id?: string;
  group_numbers?: number[];
};

export type ListeningTest = {
  id: string;
  title: string;
  duration_minutes?: number;
  part_count: number;
  question_count: number;
  audio_status?: string;
  generated_by_ai?: boolean;
  instructions: string[];
  parts: ListeningPart[];
  questions: ListeningQuestion[];
};

export type CatalogTest = {
  id: string;
  title: string;
  duration_minutes: number;
  part_count: number;
  question_count: number;
  audio_status?: string;
  parts: { id: string; part_number: number; title: string }[];
};

export type ListeningCatalog = {
  question_types: { id: string; label: string }[];
  tests: CatalogTest[];
  note?: string;
};

export type ListeningAttemptPayload = {
  attempt_id: string;
  status: string;
  mode: string;
  timed: boolean;
  duration_seconds: number;
  remaining_seconds: number | null;
  responses: Record<string, string | string[]>;
  playback: Record<string, number>;
  policy: { plays_allowed: number; seeking_allowed: boolean; label: string };
  test: ListeningTest;
  result?: ListeningResult;
};

export type ListeningResultDetail = {
  question_id: string;
  question_number: number;
  part_number?: number;
  question_type: string;
  prompt?: string;
  submitted_answer: string | string[];
  correct: boolean;
  unanswered: boolean;
  correct_answer?: string | string[];
  correct_answer_text?: string | string[];
  accepted_answers?: string[];
  evidence?: string | string[] | null;
  explanation?: string;
  ai_accepted?: boolean;
};

export type ListeningResult = {
  test_id: string;
  raw_score: number;
  total_questions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  estimated_band: number | null;
  label: string;
  score_note?: string;
  conversion_table?: { min: number; max: number; band: number }[];
  generated_by_ai?: boolean;
  graded_by?: string;
  question_type_breakdown: Record<string, { correct: number; total: number }>;
  details: ListeningResultDetail[];
};

export type ListeningHistoryItem = {
  id: string;
  test_id: string;
  mode: string;
  status: string;
  estimated_band: number | null;
  raw_score: number | null;
  started_at: string;
  submitted_at: string | null;
};
