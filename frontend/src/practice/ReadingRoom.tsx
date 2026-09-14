import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CheckCircle2, List, Minus, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui-kit";
import { diagramUrl, getReadingAttempt, saveReadingResponses, submitReadingAttempt } from "@/lib/reading/api";
import { saveLocalPracticeResult } from "@/lib/practice-engine";
import { ReadingAttemptPayload, ReadingPassage, ReadingQuestion, ReadingResult } from "@/lib/reading/types";
import { countWords, prettyType, wordLimit } from "@/lib/reading/utils";
import HighlightableText, { TextHighlight } from "@/practice/HighlightableText";
import { ExamFooter, ExamMenu, ExamTopBar, QBox, SplitPanes, numberRange, useFullscreen } from "@/practice/exam-ui";

function highlightKey(attemptId: string) {
  return `ielts-reading-highlights-${attemptId}`;
}

function useAttemptHighlights(attemptId: string) {
  const [map, setMap] = useState<Record<string, TextHighlight[]>>({});
  const skipSave = useRef(true);

  useEffect(() => {
    skipSave.current = true;
    try {
      const raw = localStorage.getItem(highlightKey(attemptId));
      setMap(raw ? (JSON.parse(raw) as Record<string, TextHighlight[]>) : {});
    } catch {
      setMap({});
    }
  }, [attemptId]);

  useEffect(() => {
    if (skipSave.current) {
      skipSave.current = false;
      return;
    }
    localStorage.setItem(highlightKey(attemptId), JSON.stringify(map));
  }, [attemptId, map]);

  const setRanges = useCallback((key: string, next: TextHighlight[]) => {
    setMap((current) => {
      const copy = { ...current };
      if (!next.length) delete copy[key];
      else copy[key] = next;
      return copy;
    });
  }, []);

  return { map, setRanges, setMap };
}

function answeredValue(value?: string) {
  return Boolean(String(value || "").trim());
}

function normChoice(value: string) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function selectedTfng(value: string) {
  const v = normChoice(value);
  if (["true", "t"].includes(v)) return "True";
  if (["false", "f"].includes(v)) return "False";
  if (["not given", "ng", "n g", "notgiven"].includes(v)) return "Not Given";
  if (["yes", "y"].includes(v)) return "Yes";
  if (["no", "n"].includes(v)) return "No";
  return value;
}

function RadioChoice({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { code: string; label: string }[];
  value: string;
  onChange: (code: string) => void;
}) {
  const stacked = options.length > 4 || options.some((opt) => opt.label.length > 28);
  const current = selectedTfng(value);
  return (
    <div className={stacked ? "mt-2 grid gap-1.5" : "mt-2 flex flex-wrap gap-x-5 gap-y-1.5"}>
      {options.map((opt) => {
        const on =
          current === opt.code ||
          normChoice(value) === normChoice(opt.code) ||
          normChoice(value) === normChoice(opt.label);
        return (
          <label key={opt.code} className="inline-flex cursor-pointer items-start gap-1.5 text-[13px] text-slate-800">
            <input
              type="radio"
              name={name}
              checked={on}
              onChange={() => onChange(opt.code)}
              className="h-3.5 w-3.5 accent-sky-600"
            />
            <span className={on ? "font-semibold" : ""}>
              {opt.label}
            </span>
          </label>
        );
      })}
    </div>
  );
}

function PassageView({
  passage,
  index,
  questions,
  responses,
  active,
  fontSize,
  highlights,
  onHighlight,
  onJump,
  onPrev,
  onNext,
}: {
  passage?: ReadingPassage;
  index: number;
  questions: ReadingQuestion[];
  responses: Record<string, string>;
  active: number | null;
  fontSize: number;
  highlights: Record<string, TextHighlight[]>;
  onHighlight: (key: string, next: TextHighlight[]) => void;
  onJump: (question: ReadingQuestion) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (!passage) return null;
  const images = passage.images?.length ? passage.images : passage.diagram_asset ? [passage.diagram_asset] : [];
  const fallbackKey = `${passage.id}:text`;
  const range = numberRange(questions.map((q) => q.number));
  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      <article className="min-h-0 flex-1 overflow-y-auto px-6 py-5 sm:px-8">
        <p className="text-[13px] italic text-slate-500">
          You should spend about 20 minutes on Questions {range || "this passage"}, which refer to Reading Passage {index + 1} below.
        </p>
        <h2 className="mt-4 text-center font-serif text-[17px] font-bold leading-6 text-slate-900">{passage.title}</h2>
        {images.map((asset) => (
          <img key={asset} src={diagramUrl(asset)} alt="" className="mx-auto mt-4 max-w-full rounded border border-slate-100 bg-white p-2" />
        ))}
        <div className="mt-5 select-text space-y-4 font-serif leading-7 text-slate-800" style={{ fontSize }}>
          {(passage.paragraphs || []).map((para, paraIndex) => {
            const key = `${passage.id}:p${paraIndex}`;
            return (
              <p key={key}>
                {para.label && <strong className="mr-2 text-slate-900">{para.label}</strong>}
                {para.heading && <strong className="mr-2 text-slate-900">{para.heading}</strong>}
                <HighlightableText text={para.text} ranges={highlights[key] || []} onChange={(next) => onHighlight(key, next)} />
              </p>
            );
          })}
          {(!passage.paragraphs || passage.paragraphs.length === 0) && passage.text && (
            <p className="whitespace-pre-wrap">
              <HighlightableText
                text={passage.text}
                ranges={highlights[fallbackKey] || []}
                onChange={(next) => onHighlight(fallbackKey, next)}
              />
            </p>
          )}
        </div>
      </article>
      <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-white px-3 py-2">
        <button type="button" onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600" aria-label="Previous question">
          ‹
        </button>
        <button type="button" onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600" aria-label="Next question">
          ›
        </button>
        <div className="flex min-w-0 flex-wrap gap-1">
          {questions.map((question) => (
            <QBox
              key={question.id}
              number={question.number}
              active={active === question.number}
              done={answeredValue(responses[String(question.number)])}
              onClick={() => onJump(question)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function QuestionCard({
  question,
  value,
  onChange,
  active,
  promptRanges,
  onPromptHighlight,
}: {
  question: ReadingQuestion;
  value: string;
  onChange: (next: string) => void;
  active: boolean;
  promptRanges: TextHighlight[];
  onPromptHighlight: (next: TextHighlight[]) => void;
}) {
  const limit = wordLimit(question);
  const words = countWords(value || "");
  const tfng = question.type === "true_false_not_given";
  const ynng = question.type === "yes_no_not_given";
  const radios = tfng
    ? [
        { code: "True", label: "A TRUE" },
        { code: "False", label: "B FALSE" },
        { code: "Not Given", label: "C NOT GIVEN" },
      ]
    : ynng
      ? [
          { code: "Yes", label: "A YES" },
          { code: "No", label: "B NO" },
          { code: "Not Given", label: "C NOT GIVEN" },
        ]
      : question.options?.length
        ? question.options.map((opt) => ({
            code: opt.code,
            label: `${opt.code} ${/^(true|false|not given|yes|no)$/i.test(opt.text) ? opt.text.toUpperCase() : opt.text}`.trim(),
          }))
        : null;

  return (
    <div id={`rq-${question.number}`} className={`scroll-mt-24 border-b border-slate-100 py-4 ${active ? "bg-sky-50/40" : ""}`}>
      <p className="text-[13px] font-semibold text-slate-800">Question {question.number}</p>
      {question.visual_asset && (
        <img src={diagramUrl(question.visual_asset)} alt="" className="mt-2 w-full rounded border border-slate-100 bg-white p-2" />
      )}
      <div className="mt-2 flex items-start gap-2.5">
        <span className="mt-0.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-[11px] font-semibold text-slate-700">
          {question.number}
        </span>
        <div className="min-w-0 flex-1">
          <p className="select-text text-[14px] leading-6 text-slate-800">
            <HighlightableText text={question.prompt} ranges={promptRanges} onChange={onPromptHighlight} />
          </p>
          {radios ? (
            <RadioChoice name={`rq-choice-${question.id}`} options={radios} value={value} onChange={onChange} />
          ) : (
            <input
              value={value || ""}
              onChange={(e) => onChange(e.target.value)}
              className="mt-2 h-9 w-full max-w-md rounded-sm border border-slate-300 bg-white px-2 text-sm outline-none focus:border-sky-500"
              placeholder="Type your answer"
            />
          )}
          {limit != null && <p className="mt-1 text-[11px] text-slate-500">{words}/{limit} words</p>}
        </div>
      </div>
    </div>
  );
}

function resultTone(row: { correct: boolean; unanswered: boolean }) {
  if (row.correct) return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (row.unanswered) return "border-border bg-white text-muted-foreground";
  return "border-red-200 bg-red-50 text-red-700";
}

function ResultView({
  payload,
  result,
  onExit,
}: {
  payload: ReadingAttemptPayload;
  result: ReadingResult;
  onExit?: () => void;
}) {
  const details = result.details || [];
  const [focusNumber, setFocusNumber] = useState<number | null>(details[0]?.question_number ?? null);

  const grouped = useMemo(() => {
    const questions = payload.test.questions || [];
    const passages = payload.test.passages || [];
    const byNumber = new Map(questions.map((question) => [question.number, question]));
    const rows: { key: string; title: string; items: typeof details }[] = [];
    for (const row of details) {
      const question = byNumber.get(row.question_number);
      const passage = passages.find((item) => item.id === question?.passage_id);
      const key = passage?.id || "questions";
      const last = rows[rows.length - 1];
      if (last && last.key === key) {
        last.items.push(row);
        continue;
      }
      const index = Math.max(0, passages.findIndex((item) => item.id === passage?.id));
      rows.push({
        key,
        title: passage ? `Part ${index + 1}${passage.title ? ` · ${passage.title}` : ""}` : "Questions",
        items: [row],
      });
    }
    return rows;
  }, [details, payload.test.passages, payload.test.questions]);

  const jumpTo = (number: number) => {
    setFocusNumber(number);
    window.requestAnimationFrame(() => {
      const el = document.getElementById(`rr-${number}`);
      const scroller = el?.closest(".overflow-y-auto");
      if (el && scroller instanceof HTMLElement) {
        const sticky = scroller.querySelector(".sticky");
        const offset = sticky instanceof HTMLElement ? sticky.getBoundingClientRect().height + 12 : 12;
        const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset;
        scroller.scrollTo({ top: Math.max(0, top), behavior: "auto" });
        return;
      }
      el?.scrollIntoView({ behavior: "auto", block: "start" });
    });
  };

  return (
    <div className="h-dvh overflow-y-auto bg-[#f4f1eb]">
      <div className="mx-auto flex max-w-4xl flex-col gap-5 p-5 md:p-8">
        {onExit && (
          <button type="button" onClick={onExit} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> Back to tests
          </button>
        )}
        <div className="card p-6">
          <div className="eyebrow">Estimated practice band</div>
          <h2 className="mt-2 font-display text-2xl font-bold">{payload.test.title || "Reading result"}</h2>
          <div className="metric-number mt-4 text-5xl font-bold">{result.estimated_band ?? "—"}</div>
          <p className="mt-3 text-sm text-muted-foreground">
            {result.correct}/{result.total_questions} correct · {result.label}
          </p>
        </div>
        <div className="sticky top-0 z-20 card p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Question numbers — click to jump</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {details.map((row) => (
              <button
                key={row.question_id}
                type="button"
                onClick={() => jumpTo(row.question_number)}
                className={`h-9 min-w-9 rounded-md border px-2 text-xs font-bold ${resultTone(row)} ${
                  focusNumber === row.question_number ? "ring-2 ring-primary ring-offset-1" : ""
                }`}
              >
                {row.question_number}
              </button>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">Green correct · red incorrect · grey blank. Scroll the test below — every question stays on this page.</p>
        </div>
        <div className="space-y-6">
          {grouped.map((group) => (
            <section key={group.key} className="space-y-3">
              <h3 className="font-display text-lg font-bold">{group.title}</h3>
              {group.items.map((row) => (
                <article
                  key={row.question_id}
                  id={`rr-${row.question_number}`}
                  className={`card scroll-mt-36 space-y-4 p-6 ${
                    focusNumber === row.question_number ? "ring-2 ring-primary/30" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold text-primary">
                        Q{row.question_number} · {prettyType(row.question_type)}
                      </p>
                      <p className="mt-2 text-sm leading-6">{row.prompt}</p>
                    </div>
                    {row.correct ? <CheckCircle2 className="shrink-0 text-emerald-600" size={22} /> : <XCircle className="shrink-0 text-red-500" size={22} />}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-muted/60 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your answer</p>
                      <p className="mt-1 text-sm font-semibold">{row.unanswered ? "—" : row.submitted_answer}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 px-4 py-3">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Correct answer</p>
                      <p className="mt-1 text-sm font-bold text-emerald-950">{row.correct_answer_text || row.correct_answer || "—"}</p>
                    </div>
                  </div>
                  {row.explanation && <p className="text-sm leading-6 text-muted-foreground">{row.explanation}</p>}
                  {row.evidence && (
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
                      “{row.evidence}”
                    </p>
                  )}
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ReadingRoom({ attemptId, onExit, onSubmitted }: { attemptId: string; onExit?: () => void; onSubmitted?: () => void }) {
  const [payload, setPayload] = useState<ReadingAttemptPayload | null>(null);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [passageId, setPassageId] = useState("");
  const [active, setActive] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<ReadingResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const [soloGroup, setSoloGroup] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const submitted = useRef(false);
  const { map: highlights, setRanges } = useAttemptHighlights(attemptId);
  const { ref: screenRef, on: fullscreen, toggle: toggleFullscreen } = useFullscreen();

  useEffect(() => {
    getReadingAttempt(attemptId)
      .then((data) => {
        if (data.status === "submitted" && data.result) {
          setResult(data.result);
          setPayload(data);
          return;
        }
        setPayload(data);
        setResponses(data.responses || {});
        setRemaining(data.timed ? data.remaining_seconds : null);
        const firstPassage = data.test?.passages?.[0]?.id || "";
        const firstQ = data.test?.questions?.[0];
        setPassageId(firstQ?.passage_id || firstPassage);
        if (firstQ) setActive(firstQ.number);
      })
      .catch((e) => setError(e.message));
  }, [attemptId]);

  const persist = useCallback(async () => {
    if (!payload || submitted.current) return;
    try {
      await saveReadingResponses(attemptId, responses, remaining);
    } catch {
      /* keep typing */
    }
  }, [attemptId, payload, responses, remaining]);

  useEffect(() => {
    if (!payload) return;
    const handle = window.setTimeout(persist, 1200);
    return () => window.clearTimeout(handle);
  }, [responses, persist, payload]);

  const finish = useCallback(async () => {
    if (submitted.current) return;
    submitted.current = true;
    setSubmitting(true);
    try {
      const next = await submitReadingAttempt(attemptId, responses, remaining);
      setResult(next);
      if (payload?.test.id) saveLocalPracticeResult("Reading", payload.test.id, next.estimated_band);
      onSubmitted?.();
    } catch (e: any) {
      submitted.current = false;
      setError(e.message || "Submit failed");
    } finally {
      setSubmitting(false);
      setConfirm(false);
    }
  }, [attemptId, remaining, responses, payload?.test.id, onSubmitted]);

  useEffect(() => {
    if (!payload) return;
    const id = window.setInterval(() => {
      setElapsed((value) => value + 1);
      if (payload.timed) setRemaining((value) => (value == null ? value : Math.max(0, value - 1)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [payload]);

  useEffect(() => {
    if (payload?.timed && remaining === 0 && !submitted.current) finish();
  }, [remaining, payload?.timed, finish]);

  const allQuestions = payload?.test.questions || [];
  const passages = payload?.test.passages || [];
  const passage = passages.find((item) => item.id === passageId) || passages[0];
  const passageIndex = Math.max(0, passages.findIndex((item) => item.id === passage?.id));
  const passageQuestions = useMemo(() => {
    const forPassage = allQuestions.filter((question) => !passage || question.passage_id === passage.id);
    return forPassage.length ? forPassage : allQuestions;
  }, [allQuestions, passage]);
  const groups = useMemo(() => {
    const rows: { instruction: string; items: ReadingQuestion[] }[] = [];
    for (const question of passageQuestions) {
      const instruction = question.instruction || "";
      const last = rows[rows.length - 1];
      if (last && last.instruction === instruction) last.items.push(question);
      else rows.push({ instruction, items: [question] });
    }
    return rows;
  }, [passageQuestions]);
  const visibleGroups = soloGroup ? groups.filter((group) => group.items[0].id === soloGroup) : groups;

  useEffect(() => {
    setSoloGroup(null);
  }, [passageId]);

  useEffect(() => {
    if (active == null) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`rq-${active}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 40);
    return () => window.clearTimeout(timer);
  }, [passageId, active, visibleGroups]);

  const jumpTo = (question: ReadingQuestion) => {
    setPassageId(question.passage_id);
    setActive(question.number);
  };

  const stepQuestion = (delta: number) => {
    if (!allQuestions.length) return;
    const index = Math.max(0, allQuestions.findIndex((question) => question.number === active));
    const next = allQuestions[Math.min(allQuestions.length - 1, Math.max(0, index + delta))];
    if (next) jumpTo(next);
  };

  const answeredCount = allQuestions.filter((question) => answeredValue(responses[String(question.number)])).length;
  const totalCount = allQuestions.length || 1;
  const lowTime = remaining != null && remaining <= 5 * 60;
  const clock = remaining != null ? remaining : elapsed;
  const passageRange = numberRange(passageQuestions.map((q) => q.number));

  if (error && !payload) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  }
  if (result && payload) return <ResultView payload={payload} result={result} onExit={onExit} />;
  if (!payload || !passage) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-primary">
          <BookOpen size={26} />
        </div>
        <p className="font-display text-lg font-bold text-foreground">Opening reading test</p>
        <p className="text-sm">Loading the passage and questions…</p>
      </div>
    );
  }

  return (
    <div ref={screenRef} className="flex h-dvh flex-col bg-white text-slate-900">
      <ExamTopBar
        remaining={clock}
        lowTime={lowTime}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
        extra={
          <ExamMenu
            items={[
              ...(onExit ? [{ label: "Exit test", onClick: onExit }] : []),
              { label: "Submit answers", onClick: () => setConfirm(true) },
            ]}
          />
        }
      />

      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 py-2">
        <div className="flex items-center gap-2">
          <h1 className="text-[15px] font-semibold text-slate-800">
            Part {passageIndex + 1}
            {passage.genre ? ` ${passage.genre}` : ""}
          </h1>
          <button
            type="button"
            onClick={() => setFontSize((n) => Math.min(22, n + 1))}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-600"
            aria-label="Increase text size"
          >
            <Plus size={12} />
          </button>
          <button
            type="button"
            onClick={() => setFontSize((n) => Math.max(13, n - 1))}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-600"
            aria-label="Decrease text size"
          >
            <Minus size={12} />
          </button>
        </div>
      </div>
      <p className="shrink-0 border-b border-slate-100 bg-white px-4 py-1.5 text-[13px] text-slate-600">
        Read the text and answer questions {passageRange}.
      </p>

      {error && <div className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}

      <SplitPanes
        left={
          <PassageView
            passage={passage}
            index={passageIndex}
            questions={passageQuestions}
            responses={responses}
            active={active}
            fontSize={fontSize}
            highlights={highlights}
            onHighlight={setRanges}
            onJump={jumpTo}
            onPrev={() => stepQuestion(-1)}
            onNext={() => stepQuestion(1)}
          />
        }
        right={
          <div className="flex h-full min-h-0 flex-col bg-white">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {visibleGroups.map((group) => {
                const range = numberRange(group.items.map((item) => item.number));
                const groupId = group.items[0].id;
                return (
                  <section key={groupId} className="mb-6">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <h2 className="text-[15px] font-semibold text-slate-800">Questions {range}</h2>
                      {groups.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setSoloGroup((current) => (current === groupId ? null : groupId))}
                          className="rounded-sm bg-sky-600 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-sky-700"
                        >
                          {soloGroup === groupId ? "Show all sections" : "Practice this section only"}
                        </button>
                      )}
                    </div>
                    {group.instruction && (
                      <p className="mb-3 select-text text-[13px] leading-6 text-slate-600">
                        <HighlightableText
                          text={group.instruction}
                          ranges={highlights[`instr:${groupId}`] || []}
                          onChange={(next) => setRanges(`instr:${groupId}`, next)}
                        />
                      </p>
                    )}
                    {group.items.map((question) => (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        value={responses[String(question.number)] || ""}
                        onChange={(next) => setResponses((current) => ({ ...current, [String(question.number)]: next }))}
                        active={active === question.number}
                        promptRanges={highlights[`q:${question.id}`] || []}
                        onPromptHighlight={(next) => setRanges(`q:${question.id}`, next)}
                      />
                    ))}
                  </section>
                );
              })}
            </div>
            <div className="relative flex shrink-0 items-center justify-end gap-2 border-t border-slate-100 px-3 py-2">
              <button
                type="button"
                onClick={() => setReviewOpen((v) => !v)}
                className="flex h-9 w-9 items-center justify-center rounded-md bg-sky-600 text-white"
                aria-label="Review answers"
              >
                <List size={16} />
              </button>
              <button
                type="button"
                onClick={() => setConfirm(true)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Submit
              </button>
              {reviewOpen && (
                <div className="absolute bottom-12 right-3 z-20 w-64 rounded-md border border-slate-200 bg-white p-3 shadow-xl">
                  <p className="text-xs font-semibold text-slate-700">Answered {answeredCount}/{totalCount}</p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {allQuestions.map((question) => (
                      <QBox
                        key={question.id}
                        number={question.number}
                        active={active === question.number}
                        done={answeredValue(responses[String(question.number)])}
                        onClick={() => {
                          jumpTo(question);
                          setReviewOpen(false);
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        }
      />

      <ExamFooter
        onPrev={() => stepQuestion(-1)}
        onNext={() => stepQuestion(1)}
        onSubmit={() => setConfirm(true)}
        parts={passages.map((item, index) => {
          const nums = allQuestions.filter((question) => question.passage_id === item.id);
          return {
            id: item.id,
            label: `Part ${index + 1}`,
            active: item.id === passage.id,
            count: nums.length,
            onSelect: () => {
              setPassageId(item.id);
              if (nums[0]) setActive(nums[0].number);
            },
            numbers: nums.map((question) => ({
              id: question.id,
              number: question.number,
              done: answeredValue(responses[String(question.number)]),
              active: active === question.number,
              onClick: () => jumpTo(question),
            })),
          };
        })}
      />

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-5">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Submit reading</p>
            <h3 className="mt-2 font-display text-xl font-bold">Send these answers?</h3>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              You have answered {answeredCount} of {totalCount} questions. After submit you cannot change them. Score is an estimated practice band, not official IELTS.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="quiet" onClick={() => setConfirm(false)}>
                Keep answering
              </Button>
              <Button disabled={submitting} onClick={finish}>
                {submitting ? "Submitting…" : "Confirm submit"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
