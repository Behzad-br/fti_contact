import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Clock3, FastForward, Headphones, Map, Pause, Play, Quote, Rewind, Send, Volume2, XCircle } from "lucide-react";
import { Button } from "@/components/ui-kit";
import { saveLocalPracticeResult } from "@/lib/practice-engine";
import {
  audioUrl,
  getListeningAttempt,
  mapUrl,
  saveListeningResponses,
  startListeningAudio,
  submitListeningAttempt,
} from "@/lib/listening/api";
import { ListeningAttemptPayload, ListeningQuestion, ListeningResult, ListeningResultDetail } from "@/lib/listening/types";
import { bandFromCorrectAnswers, decodeHtml, equivalentOutOf40, formatAnswer, formatMmSs, formatOfficialAnswer, LISTENING_BAND_RANGES, prettyType } from "@/lib/listening/utils";

function answeredValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value.length > 0;
  return Boolean(String(value || "").trim());
}

function questionNumbers(question: ListeningQuestion) {
  return question.group_numbers?.length ? question.group_numbers : [question.number];
}

function questionAnswered(question: ListeningQuestion, responses: Record<string, string | string[]>) {
  return questionNumbers(question).every((number) => answeredValue(responses[String(number)]));
}

function isMultiChoice(question: ListeningQuestion) {
  return question.type === "multiple_choice_multiple" || ((question.group_numbers?.length || 0) > 1 && Boolean(question.options?.length));
}

function PromptText({ text }: { text: string }) {
  const parts = String(text || "").split(/(_{3,}|\[\d+\])/g);
  return (
    <p className="text-[15px] leading-7 text-slate-800">
      {parts.map((part, index) =>
        /^(_{3,}|\[\d+\])$/.test(part) ? (
          <span
            key={index}
            className="mx-0.5 inline-block min-w-[3.25rem] border-b-2 border-orange-400/80 px-1 text-center font-semibold text-primary"
          >
            {part.startsWith("[") ? part : "\u00a0"}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </p>
  );
}

function AudioPlayer({
  file,
  seeking,
  onePlay,
  partLabel,
  context,
  onRequestPlay,
}: {
  file?: string;
  seeking: boolean;
  onePlay?: boolean;
  partLabel: string;
  context?: string;
  onRequestPlay: () => Promise<boolean>;
}) {
  const ref = useRef<HTMLAudioElement | null>(null);
  const scrubbing = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [spent, setSpent] = useState(false);
  const started = useRef(false);
  const shown = duration > 0 ? Math.min(elapsed, duration) : elapsed;
  const pct = duration ? Math.min(100, (shown / duration) * 100) : 0;

  const syncDuration = () => {
    const next = ref.current?.duration || 0;
    if (Number.isFinite(next) && next > 0) setDuration(next);
  };

  const seekTo = (seconds: number) => {
    const el = ref.current;
    if (!el || !seeking) return;
    const max = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : duration;
    const next = Math.min(Math.max(0, seconds), max || 0);
    el.currentTime = next;
    setElapsed(next);
  };

  const play = async () => {
    const el = ref.current;
    if (!el || spent || !file) return;
    if (!started.current) {
      const ok = await onRequestPlay();
      if (!ok) return;
      started.current = true;
    }
    try {
      await el.play();
    } catch {
      /* autoplay blocked */
    }
  };

  const sliderClass =
    "h-2 w-full cursor-pointer appearance-none rounded-full bg-transparent " +
    "[&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none " +
    "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:shadow " +
    "[&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full " +
    "[&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-white";

  return (
    <div className="overflow-hidden rounded-2xl bg-slate-950 p-5 text-white shadow-xl shadow-slate-900/20">
      <audio
        ref={ref}
        src={audioUrl(file)}
        preload={seeking ? "auto" : "metadata"}
        onTimeUpdate={() => {
          if (!scrubbing.current) setElapsed(ref.current?.currentTime || 0);
        }}
        onSeeked={() => setElapsed(ref.current?.currentTime || 0)}
        onDurationChange={syncDuration}
        onLoadedMetadata={syncDuration}
        onLoadedData={syncDuration}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          if (onePlay) setSpent(true);
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-orange-300">
          <Headphones size={14} />
          {partLabel}
        </div>
        <Volume2 size={14} className="text-white/35" />
      </div>
      <div className="mt-5 flex items-center gap-4">
        <button
          type="button"
          disabled={spent || !file}
          onClick={() => (playing ? ref.current?.pause() : play())}
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-[0_10px_30px_rgba(249,115,22,.45)] transition hover:scale-[1.03] disabled:opacity-40"
          aria-label={playing ? "Pause recording" : "Play recording"}
        >
          {spent ? <CheckCircle2 size={26} /> : playing ? <Pause size={26} /> : <Play size={26} className="ml-0.5" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl font-bold">
            {!file ? "Audio missing" : spent ? "Play used" : playing ? "Now playing" : "Press play to listen"}
          </p>
          <p className="mt-1 text-xs leading-5 text-white/55">
            {onePlay ? "Exam mode: this part can be played once. You can pause, then continue." : "Practice mode — pause and skip through the recording."}
          </p>
        </div>
      </div>
      {seeking && (
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            disabled={!file || spent || !duration}
            onClick={() => seekTo(shown - 10)}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            <Rewind size={14} />
            10s
          </button>
          <button
            type="button"
            disabled={!file || spent || !duration}
            onClick={() => seekTo(shown + 10)}
            className="inline-flex h-9 items-center gap-1 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40"
          >
            10s
            <FastForward size={14} />
          </button>
        </div>
      )}
      <div className="mt-4">
        {seeking ? (
          <label className="block cursor-pointer py-2">
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.25}
              value={shown}
              disabled={!file || spent || !duration}
              aria-label="Skip through recording"
              onPointerDown={(e) => {
                scrubbing.current = true;
                e.currentTarget.setPointerCapture(e.pointerId);
              }}
              onPointerUp={(e) => {
                seekTo(Number(e.currentTarget.value));
                scrubbing.current = false;
              }}
              onLostPointerCapture={() => {
                scrubbing.current = false;
              }}
              onChange={(e) => {
                const next = Number(e.target.value);
                setElapsed(next);
                const el = ref.current;
                if (el) el.currentTime = next;
              }}
              className={sliderClass}
              style={{ background: `linear-gradient(to right, #f97316 ${pct}%, rgba(255,255,255,.18) ${pct}%)` }}
            />
          </label>
        ) : (
          <div
            className="mt-2 h-2 rounded-full bg-white/20"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration || 0)}
            aria-valuenow={Math.round(shown)}
          >
            <div className="h-2 rounded-full bg-primary" style={{ width: `${pct}%` }} />
          </div>
        )}
        <div className="mt-2 flex justify-between font-mono text-xs text-white/70">
          <span>{formatMmSs(shown)}</span>
          <span>{formatMmSs(duration)}</span>
        </div>
      </div>
      {context && <p className="mt-4 text-sm text-white/80">{context}</p>}
    </div>
  );
}

function ChoiceButtons({
  question,
  selected,
  onToggle,
}: {
  question: ListeningQuestion;
  selected: string[];
  onToggle: (code: string) => void;
}) {
  const multi = isMultiChoice(question);
  return (
    <div className={`mt-4 ${question.type === "matching" ? "flex flex-wrap gap-2" : "grid gap-2"}`}>
      {(question.options || []).map((opt) => {
        const on = selected.includes(opt.code);
        return (
          <button
            key={opt.code}
            type="button"
            onClick={() => onToggle(opt.code)}
            className={`${
              question.type === "matching"
                ? "min-w-[3rem] rounded-lg px-3 py-2"
                : "w-full rounded-xl px-3.5 py-3"
            } flex items-start gap-3 border text-left text-sm transition ${
              on ? "border-primary bg-orange-50 text-slate-900" : "border-slate-200 bg-white text-slate-600 hover:border-primary/50"
            }`}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-bold ${
                on ? "bg-primary text-white" : "bg-slate-100"
              } ${multi ? "rounded-sm" : "rounded-full"}`}
            >
              {opt.code}
            </span>
            {question.type !== "matching" && <span className="pt-0.5">{opt.text}</span>}
          </button>
        );
      })}
    </div>
  );
}

function QuestionCard({
  question,
  value,
  onChange,
}: {
  question: ListeningQuestion;
  value: string | string[];
  onChange: (next: string | string[]) => void;
}) {
  const multi = isMultiChoice(question);
  const selected = Array.isArray(value) ? value : value ? [String(value)] : [];
  const label = questionNumbers(question).join("–");
  const done = answeredValue(value);
  const need = question.group_numbers?.length || 0;

  return (
    <div
      id={`lq-${question.number}`}
      className={`rounded-2xl border bg-white p-5 shadow-sm ${done ? "border-emerald-200" : "border-slate-200"}`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-8 min-w-8 items-center justify-center rounded-full bg-orange-50 px-2.5 text-sm font-bold text-primary">
          {label}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold capitalize text-slate-500">
          {prettyType(question.type)}
        </span>
        {done && <span className="text-[11px] font-semibold text-emerald-700">Answered</span>}
        {multi && need > 1 && (
          <span className="text-[11px] text-slate-500">
            {selected.length}/{need} chosen
          </span>
        )}
      </div>
      <PromptText text={question.prompt} />
      {question.options?.length ? (
        <ChoiceButtons
          question={question}
          selected={selected}
          onToggle={(code) => {
            if (multi) {
              const next = selected.includes(code) ? selected.filter((item) => item !== code) : [...selected, code];
              onChange(next);
            } else onChange(code);
          }}
        />
      ) : (
        <input
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          className="mt-4 h-12 w-full rounded-xl border border-slate-200 bg-[#fbfaf7] px-4 text-sm outline-none ring-orange-200 focus:border-primary focus:ring-2"
          placeholder="Type your answer"
        />
      )}
    </div>
  );
}

function officialText(row: ListeningResultDetail) {
  return decodeHtml(formatOfficialAnswer(row.correct_answer_text ?? row.correct_answer));
}

function evidenceText(value: string | string[] | null | undefined) {
  if (!value) return "";
  const raw = Array.isArray(value) ? value.join(" ") : value;
  return decodeHtml(raw).trim();
}

function ResultView({
  payload,
  result,
  onExit,
}: {
  payload: ListeningAttemptPayload;
  result: ListeningResult;
  onExit?: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(result.details?.[0]?.question_id || null);
  const table = result.conversion_table?.length ? result.conversion_table : LISTENING_BAND_RANGES;
  const band = bandFromCorrectAnswers(result.correct, result.total_questions);
  const raw40 = equivalentOutOf40(result.correct, result.total_questions);
  const grouped = useMemo(() => {
    const rows: { part: number; items: ListeningResultDetail[] }[] = [];
    for (const row of result.details || []) {
      const part = row.part_number || Math.ceil((row.question_number || 1) / 10);
      const last = rows[rows.length - 1];
      if (last && last.part === part) last.items.push(row);
      else rows.push({ part, items: [row] });
    }
    return rows;
  }, [result.details]);

  return (
    <div className="min-h-dvh overflow-y-auto bg-[#f4f1eb] p-5 md:p-8">
      <div className="mx-auto max-w-4xl space-y-5">
      {onExit && (
        <button type="button" onClick={onExit} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} />
          Back to listening tests
        </button>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Listening result</p>
        <h2 className="mt-2 font-display text-2xl font-bold">{payload.test.title}</h2>
        <div className="mt-6 flex flex-wrap items-end gap-8">
          <div>
            <div className="text-xs text-muted-foreground">{band == null ? "Score" : "Estimated band"}</div>
            <div className="mt-1 font-display text-6xl font-bold text-primary">
              {band == null ? `${result.correct}/${result.total_questions}` : band}
            </div>
            {band != null && (
              <p className="mt-2 text-sm font-semibold text-slate-700">
                {result.correct} correct answer{result.correct === 1 ? "" : "s"} / {result.total_questions}
                {result.total_questions !== 40 ? ` → ${raw40}/40` : ""}
              </p>
            )}
          </div>
          <div className="grid grid-cols-3 gap-5 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Correct</div>
              <div className="mt-1 text-xl font-bold text-emerald-700">{result.correct}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Incorrect</div>
              <div className="mt-1 text-xl font-bold text-red-700">{result.incorrect}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Blank</div>
              <div className="mt-1 text-xl font-bold">{result.unanswered}</div>
            </div>
          </div>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">
          {result.correct}/{result.total_questions} · {band == null ? "Section practice — band only after a full 40-question test." : "Band from correct answers (IELTS Listening conversion). Practice estimate, not official."}
        </p>
      </div>

      {band != null && (
        <div className="rounded-2xl border border-border bg-card p-6">
          <h3 className="font-display text-lg font-bold">Band from correct answers</h3>
          <p className="mt-1 text-sm text-muted-foreground">1 mark each. Same chart IELTS uses: 16→5, 23→6, 30→7, 35→8.</p>
          <div className="mt-4 overflow-hidden rounded-xl border border-border">
            <div className="grid grid-cols-2 bg-muted/60 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Correct answers</span>
              <span>Band</span>
            </div>
            {table.map((row) => {
              const active = raw40 >= row.min && raw40 <= row.max;
              return (
                <div
                  key={`${row.min}-${row.band}`}
                  className={`grid grid-cols-2 px-4 py-2 text-sm ${active ? "bg-orange-50 font-bold text-primary" : "border-t border-border"}`}
                >
                  <span>
                    {row.min === row.max ? row.min : `${row.min}–${row.max}`}
                  </span>
                  <span>{Number(row.band).toFixed(1)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6 sm:p-8">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">Answer key</p>
            <h3 className="mt-1 font-display text-2xl font-bold text-emerald-950">Official answers</h3>
          </div>
          <p className="text-xs text-emerald-800/80">Same style as the paper key — alternatives after /</p>
        </div>
        <div className="mt-6 space-y-6">
          {grouped.map((group) => (
            <div key={group.part}>
              <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-emerald-700">Section {group.part}</p>
              <div className="grid gap-x-8 gap-y-1 sm:grid-cols-2">
                {group.items.map((row) => (
                  <button
                    key={row.question_id}
                    type="button"
                    onClick={() => setOpenId(row.question_id)}
                    className="flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-white/70"
                  >
                    <span className="w-7 shrink-0 font-display text-sm font-bold text-emerald-800">{row.question_number}.</span>
                    <span className="text-[15px] font-semibold leading-6 text-emerald-950">{officialText(row)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="font-display text-lg font-bold">Check your answers</h3>
        {(result.details || []).map((row) => {
          const open = openId === row.question_id;
          const locate = evidenceText(row.evidence);
          const alts = (row.accepted_answers || []).filter(Boolean);
          return (
            <div key={row.question_id} className={`rounded-2xl border bg-card p-5 ${row.correct ? "border-emerald-200" : "border-border"}`}>
              <button type="button" onClick={() => setOpenId(open ? null : row.question_id)} className="flex w-full items-start justify-between gap-3 text-left">
                <div className="flex items-start gap-3">
                  {row.correct ? <CheckCircle2 className="mt-0.5 text-emerald-600" size={20} /> : <XCircle className="mt-0.5 text-red-500" size={20} />}
                  <div>
                    <p className="text-sm font-bold">
                      Question {row.question_number}
                      <span className="ml-2 text-xs font-semibold capitalize text-muted-foreground">{prettyType(row.question_type)}</span>
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{row.prompt}</p>
                  </div>
                </div>
                <span className={`text-xs font-bold ${row.correct ? "text-emerald-700" : row.unanswered ? "text-muted-foreground" : "text-red-700"}`}>
                  {row.correct ? "Correct" : row.unanswered ? "Blank" : "Incorrect"}
                </span>
              </button>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-muted/60 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Your answer</p>
                  <p className={`mt-1 text-sm font-semibold ${row.correct ? "text-emerald-800" : "text-red-700"}`}>
                    {row.unanswered ? "—" : formatAnswer(row.submitted_answer)}
                  </p>
                </div>
                <div className="rounded-xl bg-emerald-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Correct answer</p>
                  <p className="mt-1 text-sm font-bold text-emerald-950">{officialText(row)}</p>
                  {alts.length > 1 && (
                    <p className="mt-1 text-xs text-emerald-800/80">Also accept: {alts.join(" / ")}</p>
                  )}
                </div>
              </div>
              {locate && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-amber-800">
                    <Quote size={13} /> Locate — from the recording
                  </p>
                  <p className="mt-2 text-sm leading-6 text-amber-950">“{locate}”</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
    </div>
  );
}

export default function ListeningRoom({ attemptId, onExit }: { attemptId: string; onExit?: () => void }) {
  const [payload, setPayload] = useState<ListeningAttemptPayload | null>(null);
  const [responses, setResponses] = useState<Record<string, string | string[]>>({});
  const [partId, setPartId] = useState("");
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState<number | null>(null);
  const [result, setResult] = useState<ListeningResult | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [focusNumber, setFocusNumber] = useState<number | null>(null);
  const submitted = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    getListeningAttempt(attemptId)
      .then((data) => {
        if (data.status === "submitted" && data.result) {
          setResult(data.result);
          setPayload(data);
          return;
        }
        setPayload(data);
        setResponses(data.responses || {});
        setRemaining(data.timed ? data.remaining_seconds : null);
        setPartId(data.test.parts[0]?.id || "");
      })
      .catch((e) => setError(e.message));
  }, [attemptId]);

  const persist = useCallback(async () => {
    if (!payload || submitted.current) return;
    try {
      await saveListeningResponses(attemptId, responses, remaining);
    } catch {
      /* ignore */
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
      const next = await submitListeningAttempt(attemptId, responses);
      setResult(next);
      saveLocalPracticeResult("Listening", payload?.test.id || "", next.estimated_band ?? undefined);
    } catch (e: any) {
      submitted.current = false;
      setError(e.message || "Submit failed");
    } finally {
      setSubmitting(false);
      setConfirm(false);
    }
  }, [attemptId, responses, payload?.test.id]);

  useEffect(() => {
    if (!payload?.timed) return;
    const id = window.setInterval(() => setRemaining((value) => (value == null ? value : Math.max(0, value - 1))), 1000);
    return () => window.clearInterval(id);
  }, [payload?.timed]);

  useEffect(() => {
    if (remaining === 0 && payload?.timed && !submitted.current) finish();
  }, [remaining, payload?.timed, finish]);

  const part = payload?.test.parts.find((item) => item.id === partId) || payload?.test.parts[0];
  const questions = useMemo(() => {
    const seen = new Set<string>();
    return (payload?.test.questions || []).filter((question) => {
      if (part && question.part_id !== part.id) return false;
      if (!question.group_id) return true;
      if (seen.has(question.group_id)) return false;
      seen.add(question.group_id);
      return true;
    });
  }, [payload, part]);

  const groups = useMemo(() => {
    const rows: { instruction: string; items: ListeningQuestion[] }[] = [];
    for (const question of questions) {
      const instruction = question.instruction || "Answer the questions.";
      const last = rows[rows.length - 1];
      if (last && last.instruction === instruction) last.items.push(question);
      else rows.push({ instruction, items: [question] });
    }
    return rows;
  }, [questions]);

  useEffect(() => {
    if (focusNumber == null) return;
    const timer = window.setTimeout(() => {
      document.getElementById(`lq-${focusNumber}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      setFocusNumber(null);
    }, 40);
    return () => window.clearTimeout(timer);
  }, [partId, focusNumber, questions]);

  const allQuestions = payload?.test.questions || [];
  const answeredCount = allQuestions.filter((question) => questionAnswered(question, responses)).length;
  const totalCount = allQuestions.length || 1;
  const lowTime = remaining != null && remaining <= 5 * 60;

  const jumpTo = (question: ListeningQuestion) => {
    const target = question.group_id ? allQuestions.find((item) => item.group_id === question.group_id) || question : question;
    setPartId(question.part_id);
    setFocusNumber(target.number);
  };

  if (error && !payload) {
    return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  }
  if (result && payload) return <ResultView payload={payload} result={result} onExit={onExit} />;
  if (!payload || !part) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-muted-foreground">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-primary">
          <Headphones size={26} />
        </div>
        <p className="font-display text-lg font-bold text-foreground">Opening listening test</p>
        <p className="text-sm">Loading the recording and questions…</p>
      </div>
    );
  }

  const visuals = part.visual_assets?.length
    ? part.visual_assets
    : part.visual_file || part.visual_asset
      ? [part.visual_file || part.visual_asset || ""]
      : [];

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
                aria-label="Exit listening test"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">Listening</p>
              <h2 className="truncate font-display text-base font-bold sm:text-lg">{payload.test.title}</h2>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {remaining != null && (
              <span
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-mono text-sm font-semibold ${
                  lowTime ? "bg-red-500 text-white" : "bg-white/10 text-white"
                }`}
              >
                <Clock3 size={15} />
                {formatMmSs(remaining)}
              </span>
            )}
            <span className="text-sm text-white/70">
              {answeredCount}/{totalCount}
            </span>
            <Button onClick={() => setConfirm(true)}>
              <Send size={15} /> Submit
            </Button>
          </div>
        </div>
      </header>

      <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2">
        {payload.test.parts.map((item) => {
          const partQuestions = allQuestions.filter((question) => question.part_id === item.id);
          const done = partQuestions.filter((question) => questionAnswered(question, responses)).length;
          const active = partId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setPartId(item.id);
                listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className={`min-w-[120px] rounded-lg px-3 py-2 text-left text-sm ${
                active ? "bg-primary text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              <div className="font-bold">Section {item.part_number}</div>
              <div className={`mt-0.5 text-[11px] ${active ? "text-white/80" : "text-slate-500"}`}>
                {done}/{partQuestions.length || 0} answered
              </div>
            </button>
          );
        })}
      </div>

      {error && <div className="shrink-0 bg-red-50 px-4 py-2 text-sm text-red-800">{error}</div>}

      <div className="grid min-h-0 flex-1 xl:grid-cols-[minmax(280px,380px)_minmax(0,1fr)]">
        <div className="min-h-0 space-y-3 overflow-y-auto bg-[#111827] p-3">
          <AudioPlayer
            key={part.id}
            file={part.audio_file || part.audio_asset}
            seeking={payload.policy.seeking_allowed}
            onePlay={!payload.policy.seeking_allowed}
            partLabel={`Section ${part.part_number} recording`}
            context={(() => {
              const nums = allQuestions.filter((q) => q.part_id === part.id).flatMap((q) => questionNumbers(q));
              const range = nums.length ? `Questions ${Math.min(...nums)}–${Math.max(...nums)}` : "";
              const extra = [part.context, part.setting].filter((text) => {
                if (!text) return false;
                if (range && text.replace(/\s/g, "").toLowerCase() === range.replace(/\s/g, "").toLowerCase()) return false;
                if (/^questions?\s*\d/i.test(text)) return false;
                return true;
              });
              return [range, ...extra].filter(Boolean).join(" · ");
            })()}
            onRequestPlay={async () => {
              try {
                await startListeningAudio(attemptId, part.id);
                return true;
              } catch (e: any) {
                setError(e.message);
                return false;
              }
            }}
          />
          <div className="rounded-2xl border border-white/10 bg-white p-3">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Questions</p>
            <div className="flex flex-wrap gap-1">
              {allQuestions.map((question) => {
                const done = questionAnswered(question, responses);
                const onPart = question.part_id === part.id;
                return (
                  <button
                    key={question.id}
                    type="button"
                    onClick={() => jumpTo(question)}
                    className={`h-8 min-w-8 rounded border px-1.5 text-xs font-bold ${
                      done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : onPart ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-500"
                    }`}
                  >
                    {question.number}
                  </button>
                );
              })}
            </div>
          </div>
          {visuals.map((visual) => (
            <div key={visual} className="overflow-hidden rounded-xl border border-white/10 bg-white p-3">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                <Map size={14} />
                Map / diagram
              </div>
              <img src={mapUrl(visual)} alt={`Section ${part.part_number} visual`} className="max-h-[280px] w-full rounded-lg object-contain" />
            </div>
          ))}
        </div>

        <div className="flex min-h-0 flex-col bg-[#f7f8fa]">
          <div ref={listRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
              <p className="font-display text-lg font-bold">Section {part.part_number}</p>
              <p className="mt-1 text-sm text-slate-500">{part.title || part.context || "Listen and answer the questions."}</p>
            </div>
            {groups.map((group) => {
              const sharedOptions = group.items[0]?.options;
              const matching = group.items.every((item) => item.type === "matching" && item.options?.length);
              return (
                <section key={group.instruction + group.items[0].id} className="space-y-3">
                  <div className="rounded-xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
                    {group.instruction}
                  </div>
                  {matching && sharedOptions && (
                    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Options</p>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                        {sharedOptions.map((opt) => (
                          <span key={opt.code}>
                            <strong className="text-primary">{opt.code}</strong> {opt.text}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {group.items.map((question) => (
                    <QuestionCard
                      key={question.id}
                      question={question}
                      value={responses[String(question.number)] || ""}
                      onChange={(next) =>
                        setResponses((current) => {
                          const updated = { ...current };
                          const numbers = isMultiChoice(question) ? questionNumbers(question) : [question.number];
                          for (const number of numbers) updated[String(number)] = next;
                          return updated;
                        })
                      }
                    />
                  ))}
                </section>
              );
            })}
          </div>
        </div>
      </div>

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-5">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Submit listening</p>
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
