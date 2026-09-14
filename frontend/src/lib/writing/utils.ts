export function countWords(text: string): number {
  const matches = text.match(/[A-Za-z0-9']+/g);
  return matches ? matches.length : 0;
}

export function formatMmSs(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function timerWarnings(remainingSeconds: number, fired: Set<number>): number | null {
  const marks = [20 * 60, 10 * 60, 5 * 60, 60];
  for (const mark of marks) {
    if (remainingSeconds <= mark && remainingSeconds > mark - 2 && !fired.has(mark)) {
      return mark;
    }
  }
  return null;
}
