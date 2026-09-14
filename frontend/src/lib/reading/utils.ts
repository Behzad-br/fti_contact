import { ReadingQuestion } from "./types";

const WORD_NUMBERS: Record<string, number> = {
  ONE: 1,
  TWO: 2,
  THREE: 3,
  FOUR: 4,
  FIVE: 5,
  SIX: 6,
  SEVEN: 7,
  EIGHT: 8,
  NINE: 9,
  TEN: 10,
};

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function countWords(text: string): number {
  const matches = text.match(/[A-Za-z0-9']+/g);
  return matches ? matches.length : 0;
}

export function wordLimit(question: ReadingQuestion): number | null {
  if (question.word_limit) return question.word_limit;
  const match = (question.instruction || "").match(/NO MORE THAN (\w+) WORD/i);
  if (!match) return null;
  const token = match[1].toUpperCase();
  if (/^\d+$/.test(token)) return Number(token);
  return WORD_NUMBERS[token] ?? null;
}

export const CHOICE_TYPES = new Set([
  "multiple_choice",
  "matching_headings",
  "matching_information",
  "matching_features",
  "matching_sentence_endings",
]);

export function prettyType(type: string) {
  return type.replace(/_/g, " ");
}
