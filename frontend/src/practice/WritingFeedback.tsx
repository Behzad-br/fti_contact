import { useState } from "react";
import { Button } from "@/components/ui-kit";
import { retryGrade } from "@/lib/writing/api";
import { WritingAttempt, WritingGrading } from "@/lib/writing/types";
import { countWords } from "@/lib/writing/utils";

const CRITERIA: { key: string; task1: string; task2: string }[] = [
  { key: "task_response_or_achievement", task1: "Task Achievement", task2: "Task Response" },
  { key: "coherence_and_cohesion", task1: "Coherence & Cohesion", task2: "Coherence & Cohesion" },
  { key: "lexical_resource", task1: "Lexical Resource", task2: "Lexical Resource" },
  { key: "grammatical_range_and_accuracy", task1: "Grammar", task2: "Grammar" },
];

function asLines(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const row = item as { issue?: string; suggestion?: string; explanation?: string };
          return [row.issue, row.suggestion || row.explanation].filter(Boolean).join(" — ");
        }
        return "";
      })
      .filter(Boolean);
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function whyLines(grading: WritingGrading | null | undefined, attempt: WritingAttempt): string[] {
  const fromAi = asLines(grading?.why_this_band);
  if (fromAi.length) return fromAi;
  const fallback = [grading?.estimated_band_explanation, grading?.task_specific_feedback].filter(
    (item): item is string => Boolean(item && item.trim()),
  );
  const minWords = attempt.minimum_words || attempt.question?.minimum_words || 0;
  const words = attempt.word_count || countWords(attempt.answer_text || "");
  if (minWords && words < minWords) {
    fallback.unshift(`You wrote ${words} words; this task needs at least ${minWords}.`);
  }
  return fallback;
}

function suggestionLines(grading: WritingGrading | null | undefined): string[] {
  const combined = [...asLines(grading?.priority_improvements), ...asLines(grading?.next_steps)];
  const seen = new Set<string>();
  return combined.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function WritingFeedback({
  attempt,
  title,
  band,
  heading = "Estimated practice band",
  onRetry,
}: {
  attempt: WritingAttempt;
  title: string;
  band?: number | null;
  heading?: string;
  onRetry?: (next: WritingAttempt) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const grading = attempt.grading;
  const taskNumber = attempt.question?.task_number || 1;
  const words = attempt.word_count || countWords(attempt.answer_text || "");
  const minWords = attempt.minimum_words || attempt.question?.minimum_words;
  const why = whyLines(grading, attempt);
  const suggestions = suggestionLines(grading);
  const strengths = asLines(grading?.strengths);
  const score = band ?? attempt.final_band ?? attempt.estimated_band;
  const nonAttempt = Boolean(grading?.non_attempt);

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="eyebrow">{nonAttempt ? "No assessable attempt" : heading}</div>
        <h2 className="mt-2 font-display text-2xl font-bold">{title}</h2>
        <div className="metric-number mt-4 text-5xl font-bold">{score ?? "—"}</div>
        <p className="mt-3 text-xs text-muted-foreground">
          {nonAttempt
            ? "Random letters, empty scripts, and keyboard smash get band 0. Write a real English answer to receive a practice band."
            : "This is practice feedback, not an official IELTS score."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          {attempt.time_spent_seconds != null && attempt.time_spent_seconds > 0 && (
            <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-semibold text-amber-900">
              Time used: {formatElapsed(attempt.time_spent_seconds)}
            </span>
          )}
          <span className="rounded-lg bg-muted px-3 py-1.5 font-semibold">
            {words} words{minWords ? ` / ${minWords} minimum` : ""}
          </span>
        </div>
        {attempt.grading_error && (
          <p className="mt-4 text-sm text-red-700">AI feedback could not finish: {attempt.grading_error}</p>
        )}
        {onRetry && (attempt.grading_error || attempt.status === "grading") && (
          <Button
            className="mt-4"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                onRetry(await retryGrade(attempt.id));
              } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Could not refresh AI feedback.");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Asking AI…" : "Get AI feedback"}
          </Button>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </div>

      {why.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">Why this band</div>
          <h3 className="mt-2 font-display text-lg font-bold">
            {nonAttempt ? "Why this is band 0" : "What the AI saw in this answer"}
          </h3>
          <ul className="mt-4 space-y-2 text-sm leading-6 text-muted-foreground">
            {why.map((item) => (
              <li key={item} className="flex gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {grading?.criteria && (
        <div className="card p-6">
          <div className="eyebrow">Criteria</div>
          <h3 className="mt-2 font-display text-lg font-bold">How the band was built</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CRITERIA.map((row) => {
              const block = grading.criteria?.[row.key];
              if (!block) return null;
              return (
                <div key={row.key} className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold">{taskNumber === 1 ? row.task1 : row.task2}</div>
                    <div className="metric-number text-xl font-bold">{block.band}</div>
                  </div>
                  {block.feedback && <p className="mt-2 text-sm leading-6 text-muted-foreground">{block.feedback}</p>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">How to improve</div>
          <h3 className="mt-2 font-display text-lg font-bold">Do this on the next attempt</h3>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            {suggestions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          {grading?.practice_recommendation && (
            <p className="mt-4 text-sm leading-6 text-muted-foreground">{grading.practice_recommendation}</p>
          )}
        </div>
      )}

      {strengths.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">Keep doing this</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(grading?.grammar_errors || []).length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">Language notes</div>
          <h3 className="mt-2 font-display text-lg font-bold">Fixes from this script</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {grading!.grammar_errors.slice(0, 6).map((item, index) => (
              <li key={`${item.original}-${index}`} className="rounded-xl border border-border p-3">
                {item.original && <p className="text-muted-foreground">“{item.original}”</p>}
                {item.suggested && <p className="mt-1 font-semibold text-primary">{item.suggested}</p>}
                {item.explanation && <p className="mt-1 text-muted-foreground">{item.explanation}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {attempt.answer_text && (
        <div className="card p-6">
          <div className="eyebrow">Your response</div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">{attempt.answer_text}</p>
        </div>
      )}
    </div>
  );
}

function formatElapsed(total: number) {
  const safe = Math.max(0, Math.floor(total));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
