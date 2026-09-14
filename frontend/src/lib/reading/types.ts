export type ReadingOption = { code: string; text: string };

export type ReadingParagraph = {
  label?: string;
  heading?: string;
  text: string;
};

export type ReadingPassage = {
  id: string;
  title: string;
  genre?: string;
  paragraphs: ReadingParagraph[];
  text?: string;
  diagram_asset?: string;
  images?: string[];
};

export type ReadingQuestion = {
  id: string;
  number: number;
  passage_id: string;
  type: string;
  instruction?: string;
  prompt: string;
  options?: ReadingOption[];
  visual_asset?: string;
  word_limit?: number;
};

export type ReadingTest = {
  id: string;
  title: string;
  test_type: "academic" | "general_training" | string;
  duration_minutes?: number;
  passage_count?: number;
  question_count: number;
  instructions: string[];
  generated_by_ai?: boolean;
  passages: ReadingPassage[];
  questions: ReadingQuestion[];
};

export type CatalogTest = {
  id: string;
  title: string;
  test_type: string;
  duration_minutes: number;
  passage_count: number;
  question_count: number;
  passages: { id: string; title: string }[];
};

export type ReadingCatalog = {
  question_types: { key: string; label: string }[];
  academic: CatalogTest[];
  general_training: CatalogTest[];
};

export type ReadingAttemptPayload = {
  attempt_id: string;
  status: "in_progress" | "submitted" | string;
  mode: string;
  timed: boolean;
  duration_seconds: number;
  remaining_seconds: number | null;
  responses: Record<string, string>;
  test: ReadingTest;
  result?: ReadingResult;
};

export type ReadingResultDetail = {
  question_id: string;
  question_number: number;
  question_type: string;
  prompt?: string;
  submitted_answer: string;
  correct: boolean;
  unanswered: boolean;
  correct_answer?: string;
  correct_answer_text?: string;
  evidence?: string | null;
  source_locator?: { paragraph?: string; sentence_id?: string } | null;
  explanation?: string;
};

export type ReadingResult = {
  test_id: string;
  test_type: string;
  result_type: string;
  raw_score: number;
  total_questions: number;
  correct: number;
  incorrect: number;
  unanswered: number;
  estimated_band: number | null;
  label: string;
  generated_by_ai?: boolean;
  question_type_breakdown: Record<string, { correct: number; total: number }>;
  details: ReadingResultDetail[];
};

export type ReadingHistoryItem = {
  id: string;
  test_id: string;
  test_type: string;
  mode: string;
  status: string;
  estimated_band: number | null;
  raw_score: number | null;
  started_at: string;
  submitted_at: string | null;
};

export type ReadingProgress = {
  total_submitted: number;
  average_band: number | null;
  recent_bands: number[];
  question_types: Record<string, { correct: number; total: number }>;
};
