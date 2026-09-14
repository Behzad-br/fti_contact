import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GripVertical, Maximize2, Menu, Minimize2, Send } from "lucide-react";

export function formatHms(total: number) {
  const safe = Math.max(0, Math.floor(total));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

export function useFullscreen() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  const toggle = () => {
    if (!document.fullscreenElement) void ref.current?.requestFullscreen?.();
    else void document.exitFullscreen?.();
  };
  return { ref, on, toggle };
}

export function numberRange(nums: number[]) {
  if (!nums.length) return "";
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  return min === max ? String(min) : `${min}-${max}`;
}

export function ExamTopBar({
  remaining,
  lowTime,
  fullscreen,
  onFullscreen,
  extra,
}: {
  remaining: number | null;
  lowTime?: boolean;
  fullscreen: boolean;
  onFullscreen: () => void;
  extra?: ReactNode;
}) {
  return (
    <header className="relative z-20 flex h-12 shrink-0 items-center border-b border-slate-200 bg-white px-3">
      <button
        type="button"
        onClick={onFullscreen}
        className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-slate-600 hover:bg-slate-100"
      >
        {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
        Fullscreen
      </button>
      {remaining != null && (
        <div
          className={`pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center gap-1.5 font-mono text-sm font-semibold ${
            lowTime ? "text-red-600" : "text-slate-800"
          }`}
        >
          <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-current" />
          {formatHms(remaining)}
        </div>
      )}
      <div className="ml-auto flex items-center gap-2">
        {extra}
      </div>
    </header>
  );
}

export function ExamMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded text-slate-600 hover:bg-slate-100"
        aria-label="Menu"
      >
        <Menu size={18} />
      </button>
      {open && (
        <>
          <button type="button" className="fixed inset-0 z-30 cursor-default" aria-label="Close menu" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-1 min-w-[160px] rounded-md border border-slate-200 bg-white py-1 shadow-lg">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  setOpen(false);
                  item.onClick();
                }}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function QBox({
  number,
  active,
  done,
  onClick,
}: {
  number: number;
  active?: boolean;
  done?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 min-w-7 rounded-sm border px-1.5 text-[11px] font-semibold ${
        active
          ? "border-sky-600 bg-sky-600 text-white"
          : done
            ? "border-emerald-400 bg-emerald-50 text-emerald-800"
            : "border-slate-300 bg-white text-slate-700 hover:border-slate-400"
      }`}
    >
      {number}
    </button>
  );
}

export function ExamFooter({
  parts,
  onPrev,
  onNext,
  onSubmit,
}: {
  parts: {
    id: string;
    label: string;
    active: boolean;
    count: number;
    numbers: { number: number; id: string; done: boolean; active: boolean; onClick: () => void }[];
    onSelect: () => void;
  }[];
  onPrev?: () => void;
  onNext?: () => void;
  onSubmit: () => void;
}) {
  return (
    <footer className="flex shrink-0 items-stretch border-t border-slate-200 bg-white">
      <div className="flex min-w-0 flex-1 items-stretch overflow-x-auto">
        {(onPrev || onNext) && (
          <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 border-r border-slate-200 bg-white px-2 py-2">
            {onPrev && (
              <button type="button" onClick={onPrev} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white" aria-label="Previous question">
                <ChevronLeft size={16} />
              </button>
            )}
            {onNext && (
              <button type="button" onClick={onNext} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-white" aria-label="Next question">
                <ChevronRight size={16} />
              </button>
            )}
          </div>
        )}
        {parts.map((part) => (
          <div
            key={part.id}
            className={`flex shrink-0 items-start gap-2 border-r border-slate-200 px-3 py-2 ${
              part.active ? "bg-white" : "bg-slate-50"
            }`}
          >
            <button
              type="button"
              onClick={part.onSelect}
              className={`mt-1 shrink-0 text-left text-sm font-medium ${
                part.active ? "text-slate-800" : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {part.label}:
            </button>
            <div className="grid grid-cols-7 gap-1">
              {part.numbers.map((q) => (
                <QBox key={q.id} number={q.number} active={q.active} done={q.done} onClick={q.onClick} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onSubmit}
        className="inline-flex shrink-0 items-center gap-1.5 bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-700"
      >
        <Send size={15} /> Submit
      </button>
    </footer>
  );
}

export function SplitPanes({ left, right }: { left: ReactNode; right: ReactNode }) {
  const wrap = useRef<HTMLDivElement | null>(null);
  const [pct, setPct] = useState(52);
  const drag = useRef(false);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!drag.current || !wrap.current) return;
      const box = wrap.current.getBoundingClientRect();
      setPct(Math.min(70, Math.max(30, ((e.clientX - box.left) / box.width) * 100)));
    };
    const up = () => {
      drag.current = false;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div ref={wrap} className="flex min-h-0 flex-1 flex-col md:flex-row">
      <div
        className="flex min-h-[42%] w-full min-w-0 flex-col overflow-hidden md:min-h-0 md:w-[var(--split)]"
        style={{ "--split": `${pct}%` } as CSSProperties}
      >
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        onPointerDown={() => {
          drag.current = true;
        }}
        className="hidden w-2.5 shrink-0 cursor-col-resize touch-none items-center justify-center bg-slate-200 hover:bg-slate-300 md:flex"
      >
        <GripVertical size={14} className="text-slate-500" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden border-t border-slate-200 md:border-t-0">{right}</div>
    </div>
  );
}
