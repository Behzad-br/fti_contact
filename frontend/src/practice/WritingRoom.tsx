import { useEffect, useState } from "react";
import { ArrowLeft, Clock3, Send } from "lucide-react";
import { Button } from "@/components/ui-kit";
import { getWritingQuestion, startWritingQuestion, saveAttempt, submitAttempt, getMock, saveMock, submitMock } from "@/lib/writing/api";
import { WritingAttempt, WritingQuestion, WritingMock } from "@/lib/writing/types";
import { countWords } from "@/lib/writing/utils";
import WritingFeedback from "@/practice/WritingFeedback";

function formatElapsed(total: number) {
  const safe = Math.max(0, Math.floor(total));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function Editor({
  question,
  attempt,
  onSubmitted,
  onExit,
  mockLabel,
}: {
  question: WritingQuestion;
  attempt: WritingAttempt;
  onSubmitted: (next: WritingAttempt) => void;
  onExit?: () => void;
  mockLabel?: string;
}) {
  const [text, setText] = useState(attempt.answer_text || "");
  const [seconds, setSeconds] = useState(attempt.time_spent_seconds || 0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const words = countWords(text);

  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => {
      saveAttempt(attempt.id, text, seconds).catch(() => {});
    }, 800);
    return () => window.clearTimeout(t);
  }, [text, attempt.id, seconds]);

  return (
    <div className="flex h-dvh flex-col bg-[#eef1f6]">
      <header className="z-20 shrink-0 border-b border-black/10 bg-[#1b2430] px-4 py-2.5 text-white md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15"
                aria-label="Exit writing test"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">
                Writing{mockLabel ? ` · ${mockLabel}` : ""}
              </p>
              <h2 className="truncate font-display text-base font-bold sm:text-lg">
                {question.test_type === "academic" ? "Academic" : "GT"} · Task {question.task_number}
              </h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 font-mono text-sm font-semibold">
              <Clock3 size={15} />
              {formatElapsed(seconds)}
            </span>
            <span className="text-sm text-white/80">
              {words} words
              <span className="text-white/50"> · min {question.minimum_words}</span>
            </span>
            <Button
              disabled={busy || words < 5}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  onSubmitted(await submitAttempt(attempt.id, text, seconds));
                } catch (e: any) {
                  setError(e.message || "Submit failed");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Send size={15} /> {busy ? "Submitting…" : "Submit"}
            </Button>
          </div>
        </div>
      </header>
      {error && <div className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}
      <div className="grid min-h-0 flex-1 lg:grid-cols-[.9fr_1.1fr]">
        <div className="min-h-0 overflow-y-auto border-b border-slate-200 bg-white p-5 lg:border-b-0 lg:border-r lg:p-8">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Question paper</p>
          <h1 className="mt-2 font-display text-xl font-bold leading-7">{question.title || question.topic || "Writing task"}</h1>
          {question.book_title && (
            <p className="mt-2 text-xs font-semibold text-muted-foreground">
              {question.book_title}
              {question.test_number ? ` · Test ${String(question.test_number).padStart(2, "0")}` : ""}
            </p>
          )}
          <p className="mt-4 whitespace-pre-wrap text-[15px] leading-7 text-slate-700">{question.prompt}</p>
          {question.image_url && <img src={question.image_url} alt="Writing task figure" className="mt-4 w-full rounded-lg border border-border bg-white" />}
          {(question.extra_image_urls || []).map((src) => (
            <img key={src} src={src} alt="" className="mt-3 w-full rounded-lg border border-border bg-white" />
          ))}
          <p className="mt-6 text-xs text-muted-foreground">Copy, cut and paste are turned off. Type in your own words.</p>
        </div>
        <div className="flex min-h-0 flex-col bg-[#f7f8fa]">
          <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3">
            <div className="font-display text-sm font-bold">Your answer</div>
            <div className="text-xs text-muted-foreground">Write here. Timer is running.</div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            onPaste={(e) => e.preventDefault()}
            onDrop={(e) => e.preventDefault()}
            onDragOver={(e) => e.preventDefault()}
            onBeforeInput={(e) => {
              const type = (e.nativeEvent as InputEvent).inputType || "";
              if (type.includes("paste") || type === "insertFromDrop" || type === "insertFromYank") {
                e.preventDefault();
              }
            }}
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && ["v", "c", "x"].includes(e.key.toLowerCase())) {
                e.preventDefault();
              }
            }}
            autoComplete="off"
            spellCheck
            className="min-h-0 flex-1 resize-none border-0 bg-transparent p-5 text-[16px] leading-8 outline-none lg:p-8"
            placeholder="Type your response here."
          />
        </div>
      </div>
    </div>
  );
}

export default function WritingRoom({ questionId, mockId, onDone }: { questionId?: string; mockId?: string; onDone?: () => void }) {
  const [question, setQuestion] = useState<WritingQuestion | null>(null);
  const [attempt, setAttempt] = useState<WritingAttempt | null>(null);
  const [mock, setMock] = useState<WritingMock | null>(null);
  const [task, setTask] = useState<1 | 2>(1);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        if (mockId) {
          const m = await getMock(mockId);
          setMock(m);
          setQuestion(m.task1?.question || null);
          setAttempt(m.task1);
          setTask(1);
          return;
        }
        if (!questionId) return;
        const q = await getWritingQuestion(questionId);
        const a = await startWritingQuestion(q.id);
        setQuestion(q);
        setAttempt(a);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, [questionId, mockId]);

  if (error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  if (attempt?.status && attempt.status !== "in_progress" && !mockId) {
    return (
      <div className="min-h-dvh overflow-y-auto bg-[#f4f1eb] p-5 md:p-8">
        <div className="mx-auto max-w-4xl space-y-4">
        {onDone && (
          <button type="button" onClick={onDone} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> Back to tests
          </button>
        )}
        <WritingFeedback
          attempt={attempt}
          title={question?.title || question?.book_title || "Writing result"}
          band={attempt.final_band ?? attempt.estimated_band}
          onRetry={setAttempt}
        />
        </div>
      </div>
    );
  }
  if (mock && mock.status !== "in_progress") {
    return (
      <div className="min-h-dvh overflow-y-auto bg-[#f4f1eb] p-5 md:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
        {onDone && (
          <button type="button" onClick={onDone} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> Back to tests
          </button>
        )}
        <div className="card p-6">
          <div className="eyebrow">Estimated practice band</div>
          <h2 className="mt-2 font-display text-2xl font-bold">Writing mock result</h2>
          <div className="metric-number mt-4 text-5xl font-bold">{mock.overall_estimated_band ?? "—"}</div>
          <p className="mt-3 text-xs text-muted-foreground">This is practice feedback, not an official IELTS score.</p>
          <p className="mt-3 text-sm text-muted-foreground">{mock.weighting}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 text-sm">
            <div className="rounded-xl bg-muted p-3">
              <div className="text-muted-foreground">Task 1</div>
              <strong className="mt-1 block text-lg">{mock.task1_band ?? "—"}</strong>
            </div>
            <div className="rounded-xl bg-muted p-3">
              <div className="text-muted-foreground">Task 2</div>
              <strong className="mt-1 block text-lg">{mock.task2_band ?? "—"}</strong>
            </div>
          </div>
        </div>
        {mock.task1 && (
          <WritingFeedback
            attempt={mock.task1}
            title={mock.task1.question?.title || "Task 1"}
            band={mock.task1_band}
            heading="Task 1 feedback"
            onRetry={(next) => setMock({ ...mock, task1: next })}
          />
        )}
        {mock.task2 && (
          <WritingFeedback
            attempt={mock.task2}
            title={mock.task2.question?.title || "Task 2"}
            band={mock.task2_band}
            heading="Task 2 feedback"
            onRetry={(next) => setMock({ ...mock, task2: next })}
          />
        )}
      </div>
      </div>
    );
  }
  if (!question || !attempt) return <p className="p-8 text-sm text-muted-foreground">Opening writing workspace…</p>;

  return (
    <Editor
      question={question}
      attempt={attempt}
      onExit={onDone}
      mockLabel={mockId ? `Task ${task} of 2` : undefined}
      onSubmitted={async (next) => {
        if (!mockId || !mock) {
          setAttempt(next);
          return;
        }
        if (task === 1 && mock.task2?.question) {
          await saveMock(mock.id, {});
          setTask(2);
          setQuestion(mock.task2.question);
          setAttempt(mock.task2);
          return;
        }
        const done = await submitMock(mock.id, {});
        setMock(done);
        setAttempt(next);
      }}
    />
  );
}
