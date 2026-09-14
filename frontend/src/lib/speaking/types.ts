// lib/types.ts — TypeScript types for IELTS Speaking Coach

export interface CueCard {
  topic: string;
  bullets: string[];
}

export interface Question {
  id: string;
  part: 1 | 2 | 3;
  order_idx: number;
  question_text: string;
  cue_card?: CueCard | null;
}

export interface NextStep {
  action: "next_question" | "complete";
  question?: Question | null;
  session_id: string;
  part?: number | null;
  question_number?: number | null;
  total_questions?: number | null;
}

export interface StartTestResponse {
  session_id: string;
  mode: "stored" | "fresh";
  title: string;
  practice_part?: number | null;
  first_question: Question;
  total_part1: number;
  total_part2?: number;
  total_part3: number;
}

export interface AnswerSubmitResponse {
  answer_id: string;
  transcript: string;
  duration?: number | null;
  word_count?: number | null;
  next_step: NextStep;
}

export interface Correction {
  original: string;
  better: string;
  explanation?: string;
}

export interface BetterVersion {
  question?: string;
  you_said?: string;
  say_it_like_this?: string;
}

export interface Evaluation {
  fluency_coherence: number | null;
  lexical_resource: number | null;
  grammar: number | null;
  task_relevance?: number | null;
  pronunciation: string;
  estimated_band: number | null;
  strengths: string[];
  weaknesses: string[];
  corrections: Correction[];
  why_this_band?: string[];
  better_versions?: BetterVersion[];
  detailed_feedback: string | null;
  part1_feedback: string | null;
  part2_feedback: string | null;
  part3_feedback: string | null;
  improvement_tips: string | null;
  ai_status?: string | null;
}

export interface AnswerReview {
  part: number;
  question_text: string;
  transcript: string;
  duration?: number | null;
  word_count?: number | null;
  relevance_score?: number | null;
  relevance_label?: string | null;
  relevance_note?: string | null;
  answer_band?: number | null;
  examiner_note?: string | null;
  mark_cuts?: string[];
  issues?: Correction[];
}

export interface SessionResult {
  session_id: string;
  mode: "stored" | "fresh";
  title: string | null;
  practice_part?: number | null;
  status: string;
  estimated_band: number | null;
  started_at: string;
  completed_at: string | null;
  evaluation?: Evaluation | null;
  answers?: AnswerReview[];
}

export interface HistoryItem {
  session_id: string;
  mode: "stored" | "fresh";
  title: string | null;
  practice_part?: number | null;
  estimated_band: number | null;
  started_at: string;
  completed_at: string | null;
  status: string;
}

export interface HistoryList {
  sessions: HistoryItem[];
  total: number;
}

export interface Progress {
  total_tests: number;
  recent_bands: (number | null)[];
  average_band: number | null;
  recurring_grammar_issues: string[];
  recurring_vocab_issues: string[];
}

export interface StoredTest {
  id: string;
  title: string;
}

export interface Health {
  status: string;
  database: boolean;
  minimax_configured: boolean;
  whisper_model: string;
  app_name: string;
}

// Frontend session state
export type TestStage = "idle" | "part1" | "part2_prep" | "part2" | "part3" | "submitting" | "done";

export interface TestState {
  sessionId: string;
  mode: "stored" | "fresh";
  title: string;
  practicePart: number | null;
  stage: TestStage;
  currentQuestion: Question | null;
  questionNumber: number;
  totalQuestions: number;
  totalPart1: number;
  totalPart3: number;
  answeredCount: number;
}
