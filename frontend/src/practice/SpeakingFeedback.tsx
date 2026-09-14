import { Evaluation, SessionResult } from "@/lib/speaking/types";

const CRITERIA: { key: keyof Evaluation; label: string }[] = [
  { key: "fluency_coherence", label: "Fluency & Coherence" },
  { key: "lexical_resource", label: "Lexical Resource" },
  { key: "grammar", label: "Grammar" },
  { key: "task_relevance", label: "Task relevance" },
];

function asLines(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map((item) => String(item || "").trim()).filter(Boolean);
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
}

function uniqueLines(items: string[]) {
  const seen = new Set<string>();
  return items.filter((line) => {
    const key = line.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function relevanceLabel(label?: string | null) {
  if (label === "on_topic") return "On topic";
  if (label === "partly") return "Partly on topic";
  if (label === "off_topic") return "Off topic";
  if (label === "no_speech") return "No speech";
  return label || "";
}

export default function SpeakingFeedback({ result }: { result: SessionResult }) {
  const ev = result.evaluation;
  const score = result.estimated_band ?? ev?.estimated_band;
  const answers = result.answers || [];
  const why = uniqueLines([
    ...asLines(ev?.why_this_band),
    ...asLines(ev?.weaknesses).slice(0, 3),
  ]).slice(0, 6);
  const tips = uniqueLines([
    ...asLines(ev?.improvement_tips),
    ...asLines(ev?.weaknesses),
  ]).slice(0, 6);
  const corrections = [
    ...(ev?.corrections || []),
    ...answers.flatMap((answer) => answer.issues || []),
  ].filter((item, index, all) => {
    const key = `${item.original}→${item.better}`.toLowerCase();
    return all.findIndex((row) => `${row.original}→${row.better}`.toLowerCase() === key) === index;
  });
  const better = ev?.better_versions || [];
  const words = answers.reduce((sum, answer) => sum + (answer.word_count || 0), 0);
  const fallbackNote =
    ev?.ai_status === "fallback"
      ? "AI marking could not finish, so this is a local estimate from your transcript. Speak again if the comments look thin."
      : ev?.ai_status === "insufficient"
        ? "Not enough clear English was captured to mark this as a full speaking attempt."
        : "This is practice feedback, not an official IELTS score. Pronunciation is not marked from the transcript.";

  return (
    <div className="space-y-5">
      <div className="card p-6">
        <div className="eyebrow">Estimated practice band</div>
        <h2 className="mt-2 font-display text-2xl font-bold">{result.title || "Speaking result"}</h2>
        <div className="metric-number mt-4 text-5xl font-bold">{score ?? "—"}</div>
        <p className="mt-3 text-xs text-muted-foreground">{fallbackNote}</p>
        <div className="mt-4 flex flex-wrap gap-2 text-sm">
          <span className="rounded-lg bg-muted px-3 py-1.5 font-semibold">
            {answers.length} answer{answers.length === 1 ? "" : "s"}
          </span>
          <span className="rounded-lg bg-muted px-3 py-1.5 font-semibold">{words} words heard</span>
        </div>
        {ev?.detailed_feedback && (
          <p className="mt-4 text-sm leading-6 text-muted-foreground">{ev.detailed_feedback}</p>
        )}
      </div>

      {why.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">Why this band</div>
          <h3 className="mt-2 font-display text-lg font-bold">What the examiner heard</h3>
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

      {ev && (
        <div className="card p-6">
          <div className="eyebrow">Criteria</div>
          <h3 className="mt-2 font-display text-lg font-bold">How the band was built</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CRITERIA.map((row) => {
              const band = ev[row.key];
              if (band == null || typeof band === "object") return null;
              return (
                <div key={row.key} className="rounded-xl border border-border bg-muted/40 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-sm font-semibold">{row.label}</div>
                    <div className="metric-number text-xl font-bold">{band}</div>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">{ev.pronunciation}</p>
        </div>
      )}

      {tips.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">How to improve</div>
          <h3 className="mt-2 font-display text-lg font-bold">Do this on the next attempt</h3>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
            {tips.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
      )}

      {(ev?.strengths || []).length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">Keep doing this</div>
          <ul className="mt-3 space-y-2 text-sm leading-6 text-muted-foreground">
            {ev!.strengths.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {corrections.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">Language notes</div>
          <h3 className="mt-2 font-display text-lg font-bold">Mistakes and better English</h3>
          <ul className="mt-4 space-y-3 text-sm">
            {corrections.slice(0, 10).map((item, index) => (
              <li key={`${item.original}-${index}`} className="rounded-xl border border-border p-3">
                {item.original && <p className="text-muted-foreground">You said: “{item.original}”</p>}
                {item.better && <p className="mt-1 font-semibold text-primary">Say: {item.better}</p>}
                {item.explanation && <p className="mt-1 text-muted-foreground">{item.explanation}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {better.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">Better versions</div>
          <h3 className="mt-2 font-display text-lg font-bold">A stronger way to say it</h3>
          <ul className="mt-4 space-y-4 text-sm">
            {better.slice(0, 6).map((item, index) => (
              <li key={`${item.question}-${index}`} className="rounded-xl border border-border p-4">
                {item.question && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{item.question}</p>}
                {item.you_said && <p className="mt-2 text-muted-foreground">You said: “{item.you_said}”</p>}
                <p className="mt-2 font-medium leading-6">{item.say_it_like_this}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(ev?.part1_feedback || ev?.part2_feedback || ev?.part3_feedback) && (
        <div className="card p-6">
          <div className="eyebrow">Part by part</div>
          <div className="mt-4 space-y-3 text-sm leading-6 text-muted-foreground">
            {ev?.part1_feedback && (
              <p>
                <strong className="text-foreground">Part 1:</strong> {ev.part1_feedback}
              </p>
            )}
            {ev?.part2_feedback && (
              <p>
                <strong className="text-foreground">Part 2:</strong> {ev.part2_feedback}
              </p>
            )}
            {ev?.part3_feedback && (
              <p>
                <strong className="text-foreground">Part 3:</strong> {ev.part3_feedback}
              </p>
            )}
          </div>
        </div>
      )}

      {answers.length > 0 && (
        <div className="card p-6">
          <div className="eyebrow">What you said</div>
          <h3 className="mt-2 font-display text-lg font-bold">Question by question</h3>
          <div className="mt-4 space-y-4">
            {answers.map((answer, index) => (
              <div key={`${answer.part}-${index}`} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">Part {answer.part}</p>
                  <div className="flex flex-wrap gap-2 text-xs font-semibold">
                    {answer.answer_band != null && (
                      <span className="rounded-md bg-muted px-2 py-1">Answer band {answer.answer_band}</span>
                    )}
                    {answer.relevance_label && (
                      <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-900">{relevanceLabel(answer.relevance_label)}</span>
                    )}
                    {answer.word_count != null && <span className="rounded-md bg-muted px-2 py-1">{answer.word_count} words</span>}
                  </div>
                </div>
                <p className="mt-2 text-sm font-semibold">{answer.question_text}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-muted-foreground">
                  {answer.transcript || "No speech was captured for this question."}
                </p>
                {answer.examiner_note && <p className="mt-2 text-sm text-muted-foreground">{answer.examiner_note}</p>}
                {(answer.mark_cuts || []).length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {answer.mark_cuts!.map((cut) => (
                      <li key={cut}>{cut}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
