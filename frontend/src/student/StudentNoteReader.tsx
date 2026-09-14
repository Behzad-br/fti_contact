import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ChevronLeft, ChevronRight, ShieldAlert } from 'lucide-react';
import { studentNoteMeta, studentNotePageUrl } from '@/lib/notes-api';
import { getCurrentStudent } from '@/lib/mock-api';

export default function StudentNoteReader({ noteId }: { noteId: string }) {
  const [, setLocation] = useLocation();
  const me = getCurrentStudent();
  const [title, setTitle] = useState('Notes');
  const [pages, setPages] = useState(1);
  const [page, setPage] = useState(1);
  const [src, setSrc] = useState('');
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState(false);
  const [warn, setWarn] = useState('');
  const objectUrl = useRef('');

  useEffect(() => {
    let alive = true;
    studentNoteMeta(noteId)
      .then((meta) => {
        if (!alive) return;
        setTitle(meta.title);
        setPages(meta.page_count || 1);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'These notes are locked.'));
    return () => { alive = false; };
  }, [noteId]);

  useEffect(() => {
    if (error) return;
    let alive = true;
    studentNotePageUrl(noteId, page)
      .then((url) => {
        if (!alive) return;
        if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
        objectUrl.current = url;
        setSrc(url);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not open this page.'));
    return () => { alive = false; };
  }, [noteId, page, error]);

  useEffect(() => () => { if (objectUrl.current) URL.revokeObjectURL(objectUrl.current); }, []);

  useEffect(() => {
    const cover = () => setHidden(true);
    const uncover = () => setHidden(false);
    const onVis = () => { document.hidden ? cover() : uncover(); };
    const onKey = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      const blocked = e.key === 'PrintScreen' || ((e.ctrlKey || e.metaKey) && ['p', 's', 'c', 'u'].includes(key)) || (e.metaKey && e.shiftKey && key === 's') || (e.ctrlKey && e.shiftKey && key === 's');
      if (blocked) {
        e.preventDefault();
        cover();
        setWarn('Screenshots, print, and download are blocked for class notes.');
        window.setTimeout(uncover, 1600);
      }
    };
    const block = (e: Event) => e.preventDefault();
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('blur', cover);
    window.addEventListener('focus', uncover);
    window.addEventListener('keyup', onKey);
    window.addEventListener('keydown', onKey);
    document.addEventListener('contextmenu', block);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('dragstart', block);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('blur', cover);
      window.removeEventListener('focus', uncover);
      window.removeEventListener('keyup', onKey);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('contextmenu', block);
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('dragstart', block);
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-[#14120f] p-6 text-center text-white">
        <ShieldAlert size={28} className="text-amber-400" />
        <h1 className="mt-4 font-display text-2xl font-bold">Notes locked</h1>
        <p className="mt-2 max-w-md text-sm text-white/70">{error}</p>
        <button type="button" onClick={() => setLocation('/student/notes')} className="mt-6 rounded-lg bg-primary px-4 py-2 text-sm font-bold">Back to notes</button>
      </div>
    );
  }

  return (
    <div className="note-secure min-h-dvh bg-[#14120f] text-white" onContextMenu={(e) => e.preventDefault()}>
      <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <button type="button" onClick={() => setLocation('/student/notes')} className="inline-flex items-center gap-2 text-sm font-semibold text-white/70 hover:text-white">
          <ArrowLeft size={16} /> Notes
        </button>
        <div className="min-w-0 text-center">
          <div className="truncate text-sm font-bold">{title}</div>
          <div className="text-[11px] text-amber-300/90">View only · {me.name} · no download / screenshot</div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded-lg border border-white/15 p-2 disabled:opacity-30"><ChevronLeft size={16} /></button>
          <span className="text-xs font-semibold">{page} / {pages}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))} className="rounded-lg border border-white/15 p-2 disabled:opacity-30"><ChevronRight size={16} /></button>
        </div>
      </header>
      <div className="relative mx-auto flex min-h-[calc(100dvh-58px)] max-w-5xl items-start justify-center p-4">
        <div className="relative w-full overflow-hidden rounded-xl bg-black">
          {src ? <img src={src} alt="" draggable={false} className="pointer-events-none mx-auto max-h-[calc(100dvh-90px)] w-full select-none object-contain" /> : <div className="py-24 text-center text-sm text-white/50">Opening secure page…</div>}
          <div className="pointer-events-none absolute inset-0 select-none" style={{ backgroundImage: `repeating-linear-gradient(40deg, transparent 0 90px, rgba(255,255,255,.04) 90px 180px)` }} />
          {hidden && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black text-center">
              <div>
                <ShieldAlert className="mx-auto text-amber-400" />
                <p className="mt-3 text-sm font-semibold">Notes hidden while the window is not in focus.</p>
              </div>
            </div>
          )}
        </div>
      </div>
      {warn && <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-xl bg-amber-400 px-4 py-2 text-xs font-bold text-slate-900">{warn}</div>}
    </div>
  );
}
