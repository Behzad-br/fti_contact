import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { FileText, Lock, Paperclip, Trash2, Unlock, Upload, X } from 'lucide-react';
import { Badge, Button, EmptyState, SectionTitle, Toast } from '@/components/ui-kit';
import { listTeacherRoster } from '@/lib/mock-api';
import {
  createTeacherNote,
  deleteTeacherNote,
  listTeacherNotes,
  setNoteAccess,
  teacherNoteFileUrl,
  updateTeacherNote,
  type TeacherNote,
} from '@/lib/notes-api';

const DOCUMENT_ACCEPT = [
  '.pdf', '.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.txt',
  '.png', '.jpg', '.jpeg', '.webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/webp',
].join(',');

export default function TeacherNotes() {
  const roster = listTeacherRoster();
  const batches = useMemo(() => Array.from(new Set(roster.map((s) => s.batch))), [roster]);
  const [notes, setNotes] = useState<TeacherNote[]>([]);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<TeacherNote | null>(null);
  const [accessId, setAccessId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => listTeacherNotes()
    .then((d) => { setNotes(d.notes); setListError(''); })
    .catch((err) => {
      setNotes([]);
      setListError(err instanceof Error ? err.message : 'Could not load notes.');
    });
  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditing(null);
    setTitle('');
    setDescription('');
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) { setError('Enter a title for these notes.'); return; }
    if (!editing && !file) { setError('Choose a document to upload.'); return; }
    setSaving(true);
    setError('');
    try {
      const body = new FormData();
      body.append('title', title.trim());
      body.append('description', description.trim());
      if (file) body.append('file', file);
      const saved = editing ? await updateTeacherNote(editing.id, body) : await createTeacherNote(body);
      setToast(editing ? 'Notes updated.' : 'Notes uploaded. Next: choose who can open them.');
      if (!editing && saved?.id) setAccessId(saved.id);
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save notes.');
    } finally {
      setSaving(false);
    }
  };

  const openFile = async (id: string) => {
    const url = await teacherNoteFileUrl(id);
    window.open(url, '_blank', 'noopener');
  };

  return (
    <>
      <SectionTitle
        eyebrow="Teacher workspace"
        title="Notes"
        description="Upload any class document, then unlock it for a batch or selected students. Learners can only read it in the portal after you give access."
      />
      <div className="grid gap-6 xl:grid-cols-[.9fr_1.1fr]">
        <form onSubmit={submit} className="card h-fit space-y-4 p-6">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-primary" />
            <div>
              <div className="eyebrow">{editing ? 'Update notes' : '1. Upload a document'}</div>
              <p className="mt-1 text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel, text, or images. Students cannot download or edit.</p>
            </div>
          </div>
          <label className="block text-sm font-semibold">Title
            <input data-testid="input-note-title" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" placeholder="e.g. Writing Task 2 vocabulary" />
          </label>
          <label className="block text-sm font-semibold">Short note
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="mt-2 min-h-[80px] w-full rounded-lg border border-input px-3 py-2 text-sm" placeholder="Optional" />
          </label>
          <div>
            <div className="text-sm font-semibold">Document</div>
            <input
              ref={fileInputRef}
              data-testid="input-note-file"
              type="file"
              accept={DOCUMENT_ACCEPT}
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-4 py-3">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:brightness-110"
              >
                <Paperclip size={16} />
                Choose file
              </button>
              {file ? (
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className="truncate text-sm font-semibold text-slate-800" title={file.name}>{file.name}</span>
                  <button
                    type="button"
                    aria-label="Clear file"
                    onClick={() => {
                      setFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-white hover:text-foreground"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">
                  {editing ? 'Leave empty to keep the current file.' : 'No file chosen'}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">PDF, Word, PowerPoint, Excel, text, or an image.</p>
          </div>
          {(error || listError) && <p className="text-sm text-red-700">{error || listError}</p>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>{saving ? 'Saving…' : editing ? 'Save update' : 'Upload notes'}</Button>
            {editing && <Button type="button" variant="quiet" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>

        <div className="space-y-3">
          <div className="eyebrow px-1">2. Give access</div>
          {notes.map((note) => (
            <div key={note.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-lg font-bold">{note.title}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {note.original_name} · {(note.kind || 'file').toUpperCase()} · {note.page_count} page{note.page_count === 1 ? '' : 's'}
                  </p>
                  {note.description && <p className="mt-2 text-sm text-muted-foreground">{note.description}</p>}
                </div>
                {note.unlocked_batches.length || note.unlocked_student_ids.length ? (
                  <Badge tone="green">Unlocked</Badge>
                ) : (
                  <Badge tone="amber">Locked</Badge>
                )}
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {note.unlocked_batches.map((batch) => <Badge key={batch} tone="orange">{batch}</Badge>)}
                {note.unlocked_student_ids.map((id) => {
                  const student = roster.find((s) => s.id === id);
                  return <Badge key={id} tone="blue">{student?.name || id}</Badge>;
                })}
              </div>
              {!(note.unlocked_batches.length || note.unlocked_student_ids.length) && (
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                  Nobody can read this yet. Tick a batch or student, then Save access.
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => openFile(note.id)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted">
                  <FileText size={14} /> Teacher preview
                </button>
                <button type="button" onClick={() => { setEditing(note); setTitle(note.title); setDescription(note.description); setFile(null); }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-bold hover:bg-muted">
                  Update
                </button>
                <button type="button" data-testid={`button-note-access-${note.id}`} onClick={() => setAccessId(accessId === note.id ? null : note.id)} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-white">
                  {note.unlocked_batches.length || note.unlocked_student_ids.length ? <Unlock size={14} /> : <Lock size={14} />} Access
                </button>
                <button type="button" onClick={async () => {
                  if (!confirm(`Delete “${note.title}”?`)) return;
                  await deleteTeacherNote(note.id);
                  setToast('Notes deleted.');
                  load();
                }} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
              {accessId === note.id && (
                <AccessPanel
                  key={`${note.id}-${note.updated_at || ''}`}
                  note={note}
                  batches={batches}
                  roster={roster}
                  onSaved={async () => { setToast('Access saved.'); await load(); }}
                />
              )}
            </div>
          ))}
          {notes.length === 0 && <EmptyState title="No notes yet" text="Upload a document on the left. It stays locked until you open it for a batch or student." />}
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}

function AccessPanel({
  note,
  batches,
  roster,
  onSaved,
}: {
  note: TeacherNote;
  batches: string[];
  roster: ReturnType<typeof listTeacherRoster>;
  onSaved: () => Promise<void> | void;
}) {
  const [selectedBatches, setSelectedBatches] = useState<string[]>(note.unlocked_batches);
  const [selectedStudents, setSelectedStudents] = useState<string[]>(note.unlocked_student_ids);
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], value: string, set: (next: string[]) => void) => {
    set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  return (
    <div className="mt-4 rounded-xl border border-border bg-muted/40 p-4">
      <div className="text-sm font-bold">Who can open these notes?</div>
      <p className="mt-1 text-xs text-muted-foreground">Unlock a whole batch, specific students, or both. Everyone else stays locked.</p>
      <div className="mt-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Batches</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {batches.map((batch) => (
          <label key={batch} className={`cursor-pointer rounded-lg border px-3 py-2 text-xs font-semibold ${selectedBatches.includes(batch) ? 'border-primary bg-white text-primary' : 'border-border bg-white'}`}>
            <input type="checkbox" className="mr-2" checked={selectedBatches.includes(batch)} onChange={() => toggle(selectedBatches, batch, setSelectedBatches)} />
            {batch}
          </label>
        ))}
      </div>
      <div className="mt-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">Specific students</div>
      <div className="mt-2 grid max-h-48 gap-1 overflow-auto sm:grid-cols-2">
        {roster.map((s) => (
          <label key={s.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs hover:bg-white">
            <input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={() => toggle(selectedStudents, s.id, setSelectedStudents)} />
            <span className="font-semibold">{s.name}</span>
            <span className="text-muted-foreground">{s.batch}</span>
          </label>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={saving} onClick={async () => {
          setSaving(true);
          try {
            await setNoteAccess(note.id, selectedBatches, selectedStudents);
            await onSaved();
          } finally {
            setSaving(false);
          }
        }}>{saving ? 'Saving…' : 'Save access'}</Button>
        <Button variant="outline" onClick={async () => {
          setSelectedBatches([]);
          setSelectedStudents([]);
          await setNoteAccess(note.id, [], []);
          await onSaved();
        }}>Lock everyone</Button>
      </div>
    </div>
  );
}
