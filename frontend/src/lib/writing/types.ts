export type WritingTestType = "academic" | "general_training";

export interface WritingQuestion {
  id: string;
  public_id: string;
  test_type: WritingTestType;
  task_number: 1 | 2;
  question_type: string;
  topic: string | null;
  difficulty: string | null;
  title: string | null;
  prompt: string;
  instructions: string | null;
  minimum_words: number;
  recommended_minutes: number;
  visual_data: Record<string, unknown> | null;
  image_url: string | null;
  extra_image_urls?: string[];
  book_id?: string | null;
  book_title?: string | null;
  test_number?: number | null;
  letter_tone: string | null;
  recipient: string | null;
  bullet_points: string[];
  planning_tags: string[];
  source_type: string;
  generated_by_ai: boolean;
  status: string;
  is_permanent_bank: boolean;
  duplicate_flag?: boolean;
  attempt_state?: string;
  bookmarked?: boolean;
}

export interface GrammarErrorItem {
  original: string;
  suggested: string;
  category: string;
  explanation: string;
}

export interface WritingGrading {
  estimated_overall_band: number;
  criteria: Record<string, { band: number; feedback: string }>;
  strengths: string[];
  priority_improvements: string[];
  grammar_errors: GrammarErrorItem[];
  vocabulary_feedback: unknown[];
  structure_feedback: string;
  task_specific_feedback: string;
  next_steps: string[];
  why_this_band?: string[];
  estimated_band_explanation: string;
  practice_recommendation?: string;
  word_count?: number;
  minimum_words?: number;
  below_minimum?: boolean;
  non_attempt?: boolean;
}

export interface WritingAttempt {
  id: string;
  question_id: string;
  mock_session_id?: string | null;
  answer_text: string;
  word_count: number;
  minimum_words?: number | null;
  started_at: string | null;
  submitted_at: string | null;
  time_spent_seconds: number | null;
  status: string;
  attempt_number: number;
  estimated_band: number | null;
  teacher_band: number | null;
  final_band: number | null;
  band_source: string;
  grading_error: string | null;
  timer_mode?: string;
  below_minimum?: boolean;
  grading?: WritingGrading | null;
  teacher_comments?: string | null;
  teacher_feedback?: unknown;
  question?: WritingQuestion;
  model_answers?: { id: string; band_style: number; text: string; label: string }[];
}

export interface WritingMock {
  id: string;
  test_type: WritingTestType;
  status: string;
  duration_seconds: number;
  started_at: string | null;
  submitted_at: string | null;
  locked: boolean;
  task1_band: number | null;
  task2_band: number | null;
  overall_estimated_band: number | null;
  weighting: string;
  task1: WritingAttempt | null;
  task2: WritingAttempt | null;
}

export interface WritingProgress {
  attempts_completed: number;
  average_estimated_band: number | null;
  average_teacher_band: number | null;
  task1_average: number | null;
  task2_average: number | null;
  criterion_averages: Record<string, number | null>;
  total_writing_time_seconds: number;
  average_word_count: number | null;
  strongest_criterion: string | null;
  weakest_criterion: string | null;
  recommendation: string | null;
  timeline: {
    date: string | null;
    estimated_band: number | null;
    teacher_band: number | null;
    final_band: number | null;
    criteria: Record<string, number | null>;
  }[];
  recommended_filters?: Record<string, string | number>;
  days?: number | null;
}

export const TASK1_TYPES = [
  "line_graph",
  "bar_chart",
  "pie_chart",
  "table",
  "map",
  "process",
  "mixed_chart",
] as const;

export const TASK2_TYPES = [
  "agree_disagree",
  "opinion",
  "discuss_both_views",
  "advantages_disadvantages",
  "problem_solution",
  "causes_solutions",
  "two_part",
  "positive_negative",
  "mixed_other",
] as const;

export const LETTER_TYPES = ["formal_letter", "semi_formal_letter", "informal_letter"] as const;

export function labelType(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
