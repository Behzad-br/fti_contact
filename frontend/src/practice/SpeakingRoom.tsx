import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Volume2 } from "lucide-react";
import { finalizeSession, getSession, getSessionResult, submitAnswer } from "@/lib/speaking/api";
import { Question, SessionResult, TestStage, TestState } from "@/lib/speaking/types";
import { speakText, stopSpeaking, supportsLiveSpeech, supportsTts } from "@/lib/speech";
import MicRecorder from "./MicRecorder";
import SpeakingFeedback from "./SpeakingFeedback";

function questionSpeechText(q: Question): string {
  if (q.part === 2 && q.cue_card) {
    const bullets = (q.cue_card.bullets || []).join(". ");
    return `${q.cue_card.topic}. ${bullets}`.trim();
  }
  return (q.question_text || "").trim();
}

/** Official-style practice limits (seconds) — different per part. */
function speakingLimits(part: number) {
  if (part === 2) return { prep: 60, answer: 120, label: "Part 2 · Speak (2 min)" };
  if (part === 3) return { prep: 0, answer: 60, label: "Part 3 · Answer (1 min)" };
  return { prep: 0, answer: 45, label: "Part 1 · Answer (45 sec)" };
}

function fmtClock(s: number) {
  const safe = Math.max(0, s);
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`;
}

export default function SpeakingRoom({ sessionId, onExit }: { sessionId: string; onExit?: () => void }) {
  const [state, setState] = useState<TestState | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<SessionResult | null>(null);
  const [micNonce, setMicNonce] = useState(0);
  const [lastHeard, setLastHeard] = useState<{ transcript: string; words?: number | null } | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [voiceHint, setVoiceHint] = useState("");
  const [voiceUnlocked, setVoiceUnlocked] = useState(false);
  const [questionPlaying, setQuestionPlaying] = useState(false);
  const [micReady, setMicReady] = useState(false);
  const [prepLeft, setPrepLeft] = useState(60);
  const stateRef = useRef<TestState | null>(null);
  const speakGen = useRef(0);
  stateRef.current = state;

  useEffect(() => {
    getSession(sessionId)
      .then((data: any) => {
        if (data.status === "completed") {
          getSessionResult(sessionId).then(setResult).catch((e) => setError(e.message));
          return;
        }
        const currentQ: Question | null = data.current_question;
        let stage: TestStage = "idle";
        if (currentQ?.part === 1) stage = "part1";
        else if (currentQ?.part === 2) stage = "part2_prep";
        else if (currentQ?.part === 3) stage = "part3";
        else stage = "done";
        setState({
          sessionId: data.session_id,
          mode: data.mode,
          title: data.title || "IELTS Speaking",
          practicePart: data.practice_part ?? null,
          stage,
          currentQuestion: currentQ,
          questionNumber: currentQ?.order_idx != null ? currentQ.order_idx + 1 : 1,
          totalQuestions: currentQ?.part === 1 ? data.progress.total_part1 : currentQ?.part === 3 ? data.progress.total_part3 : 1,
          totalPart1: data.progress.total_part1,
          totalPart3: data.progress.total_part3,
          answeredCount: data.progress.answered_part1 + (data.progress.answered_part2 || 0) + data.progress.answered_part3,
        });
        if (!currentQ && data.status !== "completed") {
          finalizeSession(sessionId)
            .then(() => getSessionResult(sessionId).then(setResult))
            .catch((e) => setError(e.message));
        }
      })
      .catch((e) => setError(e.message));
  }, [sessionId]);

  // Read the on-screen question aloud whenever it changes (after voice unlock).
  useEffect(() => {
    const q = state?.currentQuestion;
    const stage = state?.stage;
    if (!voiceUnlocked || !q || !stage || stage === "submitting" || stage === "done") return;

    const text = questionSpeechText(q);
    if (!text) {
      setMicReady(true);
      return;
    }

    const gen = ++speakGen.current;
    setLiveTranscript("");
    setLastHeard(null);
    setMicReady(false);
    setQuestionPlaying(true);
    setVoiceHint("Examiner is speaking the question…");

    const handle = speakText(text, {
      onStart: () => {
        if (speakGen.current !== gen) return;
        setQuestionPlaying(true);
        setVoiceHint("Examiner is speaking the question…");
      },
      onEnd: () => {
        if (speakGen.current !== gen) return;
        setQuestionPlaying(false);
        setVoiceHint("Your turn — timer started. Answer now.");
        setMicReady(true);
      },
    });

    // Safety unlock if TTS hangs / unsupported.
    const fallback = window.setTimeout(() => {
      if (speakGen.current !== gen) return;
      setQuestionPlaying(false);
      setMicReady(true);
      setVoiceHint("Your turn — timer started. Answer now.");
    }, Math.min(25000, 2500 + text.length * 70));

    return () => {
      handle.cancel();
      window.clearTimeout(fallback);
    };
  }, [voiceUnlocked, state?.currentQuestion?.id, state?.stage]);

  useEffect(() => () => stopSpeaking(), []);

  // Part 2 preparation countdown (1 minute).
  useEffect(() => {
    if (state?.stage !== "part2_prep") return;
    setPrepLeft(60);
    const id = window.setInterval(() => {
      setPrepLeft((left) => {
        if (left <= 1) {
          window.clearInterval(id);
          setState((s) => (s && s.stage === "part2_prep" ? { ...s, stage: "part2" } : s));
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [state?.stage, state?.currentQuestion?.id]);

  const finishEval = async (id: string) => {
    await finalizeSession(id);
    setResult(await getSessionResult(id));
  };

  const handleRecordingComplete = async (blob: Blob) => {
    const current = stateRef.current;
    if (!current?.currentQuestion) return;
    const prevStage = current.stage;
    setState((s) => (s ? { ...s, stage: "submitting" } : null));
    setError("");
    try {
      const res = await submitAnswer(current.sessionId, current.currentQuestion.id, blob);
      // Show final words briefly while processing; clear when next question starts.
      setLastHeard({ transcript: res.transcript, words: res.word_count });
      setLiveTranscript(res.transcript || "");
      if (res.next_step.action === "complete") {
        setState((s) => (s ? { ...s, stage: "done" } : null));
        await finishEval(current.sessionId);
        return;
      }
      if (res.next_step.question) {
        const nextQ = res.next_step.question;
        let nextStage: TestStage = "idle";
        if (nextQ.part === 1) nextStage = "part1";
        else if (nextQ.part === 2 && prevStage !== "part2_prep") nextStage = "part2_prep";
        else if (nextQ.part === 2) nextStage = "part2";
        else nextStage = "part3";
        setMicReady(false);
        setLastHeard(null);
        setLiveTranscript("");
        setState((s) =>
          s
            ? {
                ...s,
                stage: nextStage,
                currentQuestion: nextQ,
                questionNumber: res.next_step.question_number || 1,
                totalQuestions: res.next_step.total_questions || 1,
                answeredCount: s.answeredCount + 1,
              }
            : null,
        );
      }
    } catch (e: any) {
      setError(e.message || "Failed to submit answer.");
      setState((s) => (s ? { ...s, stage: prevStage } : null));
      setMicNonce((n) => n + 1);
      setMicReady(true);
    }
  };

  const unlockAndStart = async () => {
    setVoiceUnlocked(true);
    // Warm TTS + mic on the same user gesture so auto-start after the question works.
    if (supportsTts()) {
      try {
        window.speechSynthesis.cancel();
        const warm = new SpeechSynthesisUtterance(" ");
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
        window.speechSynthesis.cancel();
      } catch {
        /* ignore */
      }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      /* user can allow mic when recording starts */
    }
  };

  const replayQuestion = () => {
    const q = state?.currentQuestion;
    if (!q) return;
    setMicReady(false);
    setQuestionPlaying(true);
    setVoiceHint("Playing question again…");
    const handle = speakText(questionSpeechText(q), {
      onEnd: () => {
        setQuestionPlaying(false);
        setMicReady(true);
        setVoiceHint("Your turn — timer started. Answer now.");
      },
    });
    window.setTimeout(() => {
      handle.cancel();
      setQuestionPlaying(false);
      setMicReady(true);
    }, 20000);
  };

  if (result) {
    return (
      <div className="min-h-dvh overflow-y-auto bg-[#f4f1eb] p-5 md:p-8">
        {onExit && (
          <button type="button" onClick={onExit} className="mb-4 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> Back to tests
          </button>
        )}
        <SpeakingFeedback result={result} />
      </div>
    );
  }

  if (error && !state) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>;
  if (!state) return <p className="p-8 text-sm text-muted-foreground">Opening speaking session…</p>;

  const q = state.currentQuestion;
  const prep = state.stage === "part2_prep";
  const limits = speakingLimits(q?.part || 1);

  if (!voiceUnlocked && q) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-5 bg-[#eef1f6] p-6 text-center">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-600">Speaking practice</p>
        <h2 className="max-w-md font-display text-2xl font-bold">{state.title}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          The examiner will read each question aloud. Right after that, the timer and microphone start automatically — speak your answer.
        </p>
        <button
          type="button"
          onClick={unlockAndStart}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white shadow"
        >
          <Volume2 size={18} /> Start — hear first question
        </button>
        {onExit && (
          <button type="button" onClick={onExit} className="text-sm font-semibold text-muted-foreground hover:text-foreground">
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[#eef1f6]">
      <header className="z-20 shrink-0 border-b border-black/10 bg-[#1b2430] px-4 py-2.5 text-white md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            {onExit && (
              <button
                type="button"
                onClick={onExit}
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/15"
                aria-label="Exit speaking test"
              >
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-300">Speaking</p>
              <h2 className="truncate font-display text-base font-bold">{state.title}</h2>
            </div>
          </div>
          {q && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold">
                Part {q.part} · Q{state.questionNumber}
              </span>
              <span className="rounded-lg bg-orange-400/20 px-3 py-1.5 font-mono text-xs font-bold text-orange-200">
                {prep ? `Prep ${fmtClock(prepLeft)}` : limits.label.replace("Part ", "P")}
              </span>
            </div>
          )}
        </div>
      </header>
      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col gap-5 overflow-y-auto p-5 md:p-8">
        {q?.part === 2 && q.cue_card ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">
                {prep ? "Preparation time" : "Cue card · speaking"}
              </div>
              {prep && (
                <div className={`rounded-xl border px-4 py-2 text-center ${prepLeft <= 10 ? "border-red-300 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Prep timer</div>
                  <div className={`font-mono text-2xl font-bold tabular-nums ${prepLeft <= 10 ? "text-red-700" : "text-foreground"}`}>
                    {fmtClock(prepLeft)}
                  </div>
                </div>
              )}
            </div>
            <h3 className="mt-3 font-display text-lg font-bold">{q.cue_card.topic}</h3>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              {q.cue_card.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            {prep && (
              <button className="mt-4 text-sm font-semibold text-primary" onClick={() => setState((s) => (s ? { ...s, stage: "part2" } : null))}>
                Skip prep & start speaking ({fmtClock(limits.answer)})
              </button>
            )}
            {!prep && (
              <p className="mt-3 text-xs text-muted-foreground">You have {fmtClock(limits.answer)} to speak about this cue card.</p>
            )}
          </div>
        ) : (
          q && (
            <div>
              <div className="mb-2 inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                Timer for this answer: <span className="font-mono text-foreground">{fmtClock(limits.answer)}</span>
              </div>
              <h3 className="font-display text-2xl font-bold leading-8">{q.question_text}</h3>
            </div>
          )
        )}

        {q && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={replayQuestion}
              disabled={questionPlaying}
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              <Volume2 size={16} /> Hear question again
            </button>
            {voiceHint && <span className="text-xs font-medium text-muted-foreground">{voiceHint}</span>}
          </div>
        )}

        {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

        {!prep && state.stage !== "done" && q && (
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-sky-800">
              {liveTranscript ? "You are saying" : "Your words will appear here"}
            </div>
            <p className="mt-2 min-h-[3rem] text-sm leading-6 text-sky-950">
              {liveTranscript || (micReady ? "Press the microphone and speak — live text shows here." : "Wait for the examiner to finish the question…")}
            </p>
          </div>
        )}

        {lastHeard && state.stage === "submitting" && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">You said</div>
            <p className="mt-2 text-sm leading-6 text-emerald-950">{lastHeard.transcript || "No words were captured. Try speaking closer to the mic."}</p>
            {lastHeard.words != null && <p className="mt-1 text-xs text-emerald-800/70">{lastHeard.words} words</p>}
          </div>
        )}

        {!supportsLiveSpeech() && !prep && state.stage !== "done" && q && (
          <p className="text-xs text-muted-foreground">Live on-screen transcript works best in Chrome or Edge. Final “You said” still appears after each answer (Whisper).</p>
        )}

        {state.stage === "submitting" && <p className="text-sm text-primary">Processing recording…</p>}
        {state.stage === "done" && <p className="text-sm text-muted-foreground">AI is checking your speaking — score, mistakes, and better lines…</p>}
        {!prep && state.stage !== "done" && q && (
          <MicRecorder
            key={`${q.id}-${micNonce}`}
            onRecordingComplete={handleRecordingComplete}
            onLiveTranscript={setLiveTranscript}
            disabled={state.stage === "submitting" || questionPlaying || !micReady}
            maxDurationSeconds={limits.answer}
            timerLabel={limits.label}
            autoStart={micReady && !questionPlaying && state.stage !== "submitting"}
          />
        )}
      </div>
    </div>
  );
}
