import { useEffect, useRef, useState } from "react";
import { Eraser, Highlighter } from "lucide-react";

export type TextHighlight = { start: number; end: number; color: string };

export const HIGHLIGHT_COLORS = [
  { id: "yellow", label: "Yellow", value: "#ffe566" },
  { id: "green", label: "Green", value: "#86efac" },
  { id: "pink", label: "Pink", value: "#f9a8d4" },
  { id: "blue", label: "Blue", value: "#7dd3fc" },
] as const;

function clampRange(start: number, end: number, length: number): { start: number; end: number } | null {
  const a = Math.max(0, Math.min(start, length));
  const b = Math.max(0, Math.min(end, length));
  if (b <= a) return null;
  return { start: a, end: b };
}

export function addHighlight(list: TextHighlight[], start: number, end: number, color: string, length: number): TextHighlight[] {
  const next = clampRange(start, end, length);
  if (!next) return list;
  const remnants: TextHighlight[] = [];
  for (const item of list) {
    const kept = clampRange(item.start, item.end, length);
    if (!kept) continue;
    if (kept.end <= next.start || kept.start >= next.end) {
      remnants.push({ ...item, ...kept });
      continue;
    }
    if (kept.start < next.start) remnants.push({ start: kept.start, end: next.start, color: item.color });
    if (kept.end > next.end) remnants.push({ start: next.end, end: kept.end, color: item.color });
  }
  return [...remnants, { ...next, color }].sort((a, b) => a.start - b.start || a.end - b.end);
}

export function removeHighlightAt(list: TextHighlight[], index: number): TextHighlight[] {
  return list.filter((_, i) => i !== index);
}

function offsetsFromSelection(root: HTMLElement | null): { start: number; end: number } | null {
  if (!root) return null;
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = document.createRange();
  before.selectNodeContents(root);
  before.setEnd(range.startContainer, range.startOffset);
  const start = before.toString().length;
  const end = start + range.toString().length;
  return clampRange(start, end, root.textContent?.length || 0);
}

function segments(text: string, ranges: TextHighlight[]) {
  const cuts = new Set<number>([0, text.length]);
  ranges.forEach((item) => {
    cuts.add(Math.max(0, Math.min(item.start, text.length)));
    cuts.add(Math.max(0, Math.min(item.end, text.length)));
  });
  const points = [...cuts].sort((a, b) => a - b);
  const out: { start: number; end: number; color?: string; index?: number }[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const start = points[i];
    const end = points[i + 1];
    if (end <= start) continue;
    const match = ranges.findIndex((item) => item.start <= start && item.end >= end);
    const hit = match >= 0 ? ranges[match] : undefined;
    out.push({ start, end, color: hit?.color, index: hit ? match : undefined });
  }
  return out;
}

export default function HighlightableText({
  text,
  ranges,
  onChange,
  className,
}: {
  text: string;
  ranges: TextHighlight[];
  onChange: (next: TextHighlight[]) => void;
  className?: string;
}) {
  const rootRef = useRef<HTMLSpanElement>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; start: number; end: number } | null>(null);

  const closeMenu = () => setMenu(null);

  const openFromSelection = () => {
    const root = rootRef.current;
    const offsets = offsetsFromSelection(root);
    if (!offsets) {
      closeMenu();
      return;
    }
    const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();
    if (!rect) return;
    setMenu({
      ...offsets,
      x: Math.min(window.innerWidth - 220, Math.max(12, rect.left + rect.width / 2 - 90)),
      y: Math.max(12, rect.top - 52),
    });
  };

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if ((event.target as HTMLElement | null)?.closest("[data-highlight-toolbar]")) return;
      if (rootRef.current?.contains(event.target as Node)) return;
      closeMenu();
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, []);

  const apply = (color: string) => {
    if (!menu) return;
    onChange(addHighlight(ranges, menu.start, menu.end, color, text.length));
    window.getSelection()?.removeAllRanges();
    closeMenu();
  };

  const clearSelection = () => {
    if (!menu) return;
    onChange(
      ranges.filter((item) => item.end <= menu.start || item.start >= menu.end),
    );
    window.getSelection()?.removeAllRanges();
    closeMenu();
  };

  return (
    <>
      <span
        ref={rootRef}
        className={className}
        onMouseUp={openFromSelection}
        onTouchEnd={() => window.setTimeout(openFromSelection, 50)}
      >
        {segments(text, ranges).map((part, i) => {
          const chunk = text.slice(part.start, part.end);
          if (!chunk) return null;
          if (part.color == null || part.index == null) return <span key={`${part.start}-${i}`}>{chunk}</span>;
          return (
            <mark
              key={`${part.start}-${i}`}
              data-hi={part.index}
              title="Click to remove highlight"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                if (window.getSelection()?.toString()) return;
                onChange(removeHighlightAt(ranges, part.index as number));
                closeMenu();
              }}
              className="cursor-pointer rounded-[2px] px-0.5 text-inherit"
              style={{ backgroundColor: part.color }}
            >
              {chunk}
            </mark>
          );
        })}
      </span>
      {menu && (
        <div
          data-highlight-toolbar
          className="fixed z-[80] flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 shadow-lg"
          style={{ left: menu.x, top: menu.y }}
        >
          <Highlighter size={14} className="mr-1 text-slate-400" />
          {HIGHLIGHT_COLORS.map((color) => (
            <button
              key={color.id}
              type="button"
              title={`Highlight ${color.label}`}
              onClick={() => apply(color.value)}
              className="h-6 w-6 rounded-full border border-black/10"
              style={{ backgroundColor: color.value }}
            />
          ))}
          <button
            type="button"
            title="Clear this selection"
            onClick={clearSelection}
            className="ml-1 flex h-6 w-6 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <Eraser size={13} />
          </button>
        </div>
      )}
    </>
  );
}
