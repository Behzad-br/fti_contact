export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function prettyType(type: string) {
  return type.replace(/_/g, " ");
}

export function formatAnswer(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join(", ") || "—";
  return String(value || "").trim() || "—";
}

export function formatOfficialAnswer(value: string | string[] | null | undefined) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ") || "—";
  return String(value || "").trim() || "—";
}

/** Standard IELTS Listening conversion: correct answers out of 40 → band. */
export const LISTENING_BAND_RANGES = [
  { min: 39, max: 40, band: 9 },
  { min: 37, max: 38, band: 8.5 },
  { min: 35, max: 36, band: 8 },
  { min: 32, max: 34, band: 7.5 },
  { min: 30, max: 31, band: 7 },
  { min: 26, max: 29, band: 6.5 },
  { min: 23, max: 25, band: 6 },
  { min: 18, max: 22, band: 5.5 },
  { min: 16, max: 17, band: 5 },
  { min: 13, max: 15, band: 4.5 },
  { min: 10, max: 12, band: 4 },
  { min: 8, max: 9, band: 3.5 },
  { min: 6, max: 7, band: 3 },
  { min: 4, max: 5, band: 2.5 },
  { min: 3, max: 3, band: 2 },
  { min: 2, max: 2, band: 1.5 },
  { min: 1, max: 1, band: 1 },
  { min: 0, max: 0, band: 0 },
] as const;

export function equivalentOutOf40(correct: number, total: number) {
  if (total <= 0) return 0;
  if (total === 40) return Math.max(0, Math.min(40, correct));
  return Math.max(0, Math.min(40, Math.round((correct * 40) / total)));
}

export function bandFromCorrectAnswers(correct: number, total: number): number | null {
  if (total < 40) return null;
  const score = equivalentOutOf40(correct, total);
  const row = LISTENING_BAND_RANGES.find((item) => score >= item.min && score <= item.max);
  return row ? row.band : 0;
}

export function decodeHtml(value: string) {
  return value
    .replace(/&rsquo;|&apos;|&#39;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;|&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");
}
