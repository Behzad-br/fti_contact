import { useCallback, useEffect, useRef, useState } from "react";
import { startLiveRecognition, stopSpeaking, supportsLiveSpeech } from "@/lib/speech";

function fmtClock(s: number) {
  const safe = Math.max(0, s);
  return `${Math.floor(safe / 60)}:${(safe % 60).toString().padStart(2, "0")}`;
}

export default function MicRecorder({
  onRecordingComplete,
  onLiveTranscript,
  disabled = false,
  maxDurationSeconds = 180,
  timerLabel = "Answer time",
  /** When true, start mic + countdown as soon as the control is enabled (after question is asked). */
  autoStart = false,
}: {
  onRecordingComplete: (blob: Blob) => void;
  onLiveTranscript?: (text: string) => void;
  disabled?: boolean;
  maxDurationSeconds?: number;
  timerLabel?: string;
  autoStart?: boolean;
}) {
  const [state, setState] = useState<"idle" | "requesting" | "recording" | "stopped" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef(0);
  const stopLiveRef = useRef<(() => void) | null>(null);
  const autoStartedRef = useRef(false);
  const onLiveRef = useRef(onLiveTranscript);
  const onCompleteRef = useRef(onRecordingComplete);
  onLiveRef.current = onLiveTranscript;
  onCompleteRef.current = onRecordingComplete;

  const remaining = Math.max(0, maxDurationSeconds - duration);

  const stopLive = useCallback(() => {
    stopLiveRef.current?.();
    stopLiveRef.current = null;
  }, []);

  const stopRecording = useCallback(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    stopLive();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") mediaRecorderRef.current.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setState("stopped");
  }, [stopLive]);

  const startRecording = useCallback(async () => {
    setErrorMsg("");
    setState("requesting");
    chunksRef.current = [];
    stopSpeaking();
    onLiveRef.current?.("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4", ""];
      const supported = mimeTypes.find((m) => !m || MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, supported ? { mimeType: supported } : {});
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stopLive();
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const elapsed = Date.now() - startTimeRef.current;
        if (elapsed < 2500 || blob.size < 800) {
          setErrorMsg("Recording too short. Speak a bit longer, then try again.");
          setState("error");
          autoStartedRef.current = false;
          return;
        }
        setState("stopped");
        onCompleteRef.current(blob);
      };
      recorder.start(250);
      setState("recording");
      startTimeRef.current = Date.now();
      setDuration(0);
      if (supportsLiveSpeech()) {
        stopLiveRef.current = startLiveRecognition({
          onPartial: (text) => onLiveRef.current?.(text),
        });
      }
      timerRef.current = window.setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
        setDuration(elapsed);
        if (elapsed >= maxDurationSeconds) stopRecording();
      }, 250);
    } catch (err: any) {
      setErrorMsg(err?.message || "Microphone error. Allow mic access and try again.");
      setState("error");
      autoStartedRef.current = false;
    }
  }, [maxDurationSeconds, stopRecording, stopLive]);

  // After the examiner asks the question, start mic + timer automatically.
  useEffect(() => {
    if (!autoStart || disabled) return;
    if (autoStartedRef.current) return;
    if (state !== "idle") return;
    autoStartedRef.current = true;
    void startRecording();
  }, [autoStart, disabled, state, startRecording]);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      stopLive();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    },
    [stopLive],
  );

  if (state === "error") {
    return (
      <div className="space-y-3 text-center">
        <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{errorMsg}</p>
        <button
          className="text-sm font-semibold text-primary"
          onClick={() => {
            autoStartedRef.current = false;
            setState("idle");
            setErrorMsg("");
          }}
        >
          Try again
        </button>
      </div>
    );
  }

  const timerActive = state === "recording" || state === "requesting";

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        className={`rounded-2xl border px-6 py-3 text-center ${
          state === "recording"
            ? remaining <= 10
              ? "border-red-300 bg-red-50"
              : "border-amber-300 bg-amber-50"
            : "border-border bg-white"
        }`}
      >
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{timerLabel}</div>
        <div className={`mt-1 font-mono text-3xl font-bold tabular-nums ${state === "recording" && remaining <= 10 ? "text-red-700" : "text-foreground"}`}>
          {timerActive ? fmtClock(remaining) : fmtClock(maxDurationSeconds)}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {state === "recording" && "Time left — speaking now"}
          {state === "requesting" && "Starting timer…"}
          {state === "idle" && (disabled ? "Starts after question" : "Starting automatically…")}
          {state === "stopped" && "Time up · processing"}
        </div>
      </div>

      <button
        type="button"
        onClick={state === "recording" ? stopRecording : () => void startRecording()}
        disabled={disabled || state === "requesting" || state === "stopped"}
        className={`flex h-20 w-20 items-center justify-center rounded-full text-2xl text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-40 ${
          state === "recording" ? "bg-red-500" : "bg-primary"
        }`}
        aria-label={state === "recording" ? "Stop recording" : "Start recording"}
      >
        {state === "requesting" ? "…" : state === "recording" ? "■" : "🎤"}
      </button>
      <p className="text-sm text-muted-foreground">
        {disabled && state === "idle" && "Wait for the question — timer starts right after"}
        {!disabled && state === "idle" && "Timer & mic starting…"}
        {state === "requesting" && "Opening microphone…"}
        {state === "recording" && `Answer now · ${fmtClock(remaining)} left · press stop when finished`}
        {state === "stopped" && "Processing…"}
      </p>
    </div>
  );
}
