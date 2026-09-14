import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Lock, NotebookPen, Unlock } from 'lucide-react';
import { Badge, EmptyState, SectionTitle } from '@/components/ui-kit';
import { listStudentNotes, type StudentNote } from '@/lib/notes-api';

export default function StudentNotes() {
  const [, setLocation] = useLocation();
  const [notes, setNotes] = useState<StudentNote[]>([]);

  useEffect(() => {
    listStudentNotes().then((d) => setNotes(d.notes)).catch(() => setNotes([]));
  }, []);

  return (
    <>
      <SectionTitle
        eyebrow="Student workspace"
        title="Notes"
        description="Read notes your teacher has unlocked for you. You can view them here only — no download, edit, or screenshot."
      />
      <div className="grid gap-4 md:grid-cols-2">
        {notes.map((note) => (
          <button
            key={note.id}
            type="button"
            disabled={!note.unlocked}
            onClick={() => note.unlocked && setLocation(`/student/notes/${note.id}`)}
            className={`card p-5 text-left ${note.unlocked ? 'hover:border-primary/40' : 'cursor-not-allowed opacity-80'}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="rounded-lg bg-amber-50 p-2 text-amber-800"><NotebookPen size={18} /></div>
              {note.unlocked ? <Badge tone="green">Unlocked</Badge> : <Badge tone="amber">Locked</Badge>}
            </div>
            <h2 className="mt-4 font-display text-lg font-bold">{note.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {note.unlocked
                ? (note.description || `Open in the portal to read${note.kind ? ` this ${note.kind.toUpperCase()}` : ''}.`)
                : 'Your teacher has not unlocked these notes for you yet.'}
            </p>
            {note.unlocked && note.page_count ? (
              <p className="mt-1 text-xs text-muted-foreground">{note.page_count} page{note.page_count === 1 ? '' : 's'}{note.kind ? ` · ${note.kind.toUpperCase()}` : ''}</p>
            ) : null}
            <div className="mt-4 flex items-center gap-2 text-xs font-bold">
              {note.unlocked ? <><Unlock size={14} className="text-emerald-700" /> Read in portal</> : <><Lock size={14} /> No access</>}
            </div>
          </button>
        ))}
      </div>
      {notes.length === 0 && <EmptyState title="No notes yet" text="When your teacher uploads and unlocks notes, they will appear here." />}
    </>
  );
}
