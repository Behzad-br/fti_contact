/** Browser TTS + live STT for speaking practice (no paid API). */

type SpeakHandle = {
  cancel: () => void;
  done: Promise<void>;
};

function pickEnglishVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const prefer = [
    (v: SpeechSynthesisVoice) => /en-GB/i.test(v.lang) && /female|susan|serena|libby|katie/i.test(v.name),
    (v: SpeechSynthesisVoice) => /en-GB/i.test(v.lang),
    (v: SpeechSynthesisVoice) => /en-US/i.test(v.lang) && /female|samantha|zira|jenny/i.test(v.name),
    (v: SpeechSynthesisVoice) => /^en[-_]/i.test(v.lang),
  ];
  for (const rule of prefer) {
    const hit = voices.find(rule);
    if (hit) return hit;
  }
  return voices[0] || null;
}

/** Chrome sometimes freezes mid-utterance; nudge resume while speaking. */
function keepSpeechAlive(): () => void {
  if (typeof window === "undefined" || !window.speechSynthesis) return () => undefined;
  const id = window.setInterval(() => {
    try {
      if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
  }, 4000);
  return () => window.clearInterval(id);
}

/**
 * Speak text aloud (examiner voice). Returns cancel + done promise.
 * Handles voiceschanged / autoplay quirks as much as browsers allow.
 */
export function speakText(
  text: string,
  opts?: { lang?: string; rate?: number; onStart?: () => void; onEnd?: () => void },
): SpeakHandle {
  const empty: SpeakHandle = { cancel: () => undefined, done: Promise.resolve() };
  if (typeof window === "undefined" || !window.speechSynthesis || !text.trim()) return empty;

  let cancelled = false;
  let settled = false;
  let stopAlive: (() => void) | null = null;
  let settle!: () => void;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });

  const finish = () => {
    if (settled) return;
    settled = true;
    stopAlive?.();
    stopAlive = null;
    opts?.onEnd?.();
    settle();
  };

  const cancel = () => {
    cancelled = true;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    finish();
  };

  const run = () => {
    if (cancelled) return;
    try {
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
    const utter = new SpeechSynthesisUtterance(text.trim());
    utter.lang = opts?.lang || "en-GB";
    utter.rate = opts?.rate ?? 0.9;
    utter.pitch = 1;
    const voice = pickEnglishVoice();
    if (voice) utter.voice = voice;
    utter.onstart = () => {
      if (cancelled) return;
      stopAlive = keepSpeechAlive();
      opts?.onStart?.();
    };
    utter.onend = () => {
      if (cancelled) return;
      finish();
    };
    utter.onerror = () => {
      if (cancelled) return;
      finish();
    };
    window.speechSynthesis.speak(utter);
  };

  // Voices often load async in Chrome.
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
      window.setTimeout(run, 30);
    };
    window.speechSynthesis.addEventListener("voiceschanged", onVoices);
    window.setTimeout(run, 250);
  } else {
    window.setTimeout(run, 40);
  }

  return { cancel, done };
}

/** Back-compat: speakText previously returned a cancel function. */
export function speakTextCancelable(text: string, opts?: { lang?: string; rate?: number }) {
  return speakText(text, opts).cancel;
}

export function stopSpeaking() {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    /* ignore */
  }
}

type RecognitionCtor = new () => SpeechRecognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function supportsLiveSpeech(): boolean {
  return Boolean(getRecognitionCtor());
}

export function supportsTts(): boolean {
  return typeof window !== "undefined" && Boolean(window.speechSynthesis);
}

/** Live STT while the student is answering. Returns a stop() function. */
export function startLiveRecognition(handlers: {
  onPartial: (text: string) => void;
  onFinal?: (text: string) => void;
  onError?: (message: string) => void;
}): () => void {
  const Ctor = getRecognitionCtor();
  if (!Ctor) {
    handlers.onError?.("Live transcript needs Chrome or Edge.");
    return () => undefined;
  }
  const recognition = new Ctor();
  recognition.lang = "en-GB";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finals = "";
  let stopped = false;

  recognition.onresult = (event: SpeechRecognitionEvent) => {
    let interim = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const row = event.results[i];
      const piece = row[0]?.transcript || "";
      if (row.isFinal) {
        finals = `${finals} ${piece}`.trim();
        handlers.onFinal?.(finals);
        handlers.onPartial(finals);
      } else {
        interim += piece;
      }
    }
    const live = `${finals} ${interim}`.trim();
    if (live) handlers.onPartial(live);
  };
  recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    handlers.onError?.(event.error || "Speech recognition error");
  };
  // Restart if the browser ends recognition while we still want live text.
  recognition.onend = () => {
    if (stopped) return;
    try {
      recognition.start();
    } catch {
      /* ignore */
    }
  };

  try {
    recognition.start();
  } catch {
    handlers.onError?.("Could not start live transcript.");
  }

  return () => {
    stopped = true;
    try {
      recognition.onresult = null as unknown as typeof recognition.onresult;
      recognition.onerror = null as unknown as typeof recognition.onerror;
      recognition.onend = null as unknown as typeof recognition.onend;
      recognition.stop();
    } catch {
      /* ignore */
    }
  };
}
