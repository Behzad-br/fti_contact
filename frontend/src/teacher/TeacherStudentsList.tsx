import { useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpRight, KeyRound, Plus, Search, Trash2 } from 'lucide-react';
import { Avatar, Button, Toast } from '@/components/ui-kit';
import { listTeacherRoster, removeStudentAccount, studentWorkReport, type Student } from '@/lib/mock-api';

export default function TeacherStudentsList() {
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState('');
  const [batch, setBatch] = useState('All batches');
  const [toast, setToast] = useState('');
  const [roster, setRoster] = useState(() => listTeacherRoster());

  const batches = Array.from(new Set(roster.map((s) => s.batch)));
  const filtered = roster.filter((s) => {
    const hay = `${s.name} ${s.batch} ${s.username || ''} ${s.email}`.toLowerCase();
    const matchQuery = hay.includes(query.toLowerCase());
    const matchBatch = batch === 'All batches' || s.batch === batch;
    return matchQuery && matchBatch;
  });

  const openStudent = (id: string, hash?: 'login') => {
    setLocation(`/teacher/students/${id}`);
    if (hash === 'login') {
      window.setTimeout(() => {
        window.location.hash = 'login';
      }, 0);
    }
  };

  const removeStudent = (s: Student) => {
    if (!confirm(`Remove login for ${s.name}? They will not be able to sign in.`)) return;
    removeStudentAccount(s.id, s.email);
    setRoster(listTeacherRoster());
    setToast(`${s.name} login removed.`);
  };

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-2">Teacher workspace</div>
          <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">Students</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
            Click a student to open their record. Change or remove their login from the same row.
          </p>
        </div>
        <Button onClick={() => setLocation('/teacher/students/new')}><Plus size={16} /> Add student</Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students"
            className="h-10 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm sm:w-72"
          />
        </div>
        <select
          value={batch}
          onChange={(e) => setBatch(e.target.value)}
          className="h-10 rounded-lg border border-input bg-card px-2 text-sm font-semibold"
        >
          <option value="All batches">All batches</option>
          {batches.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map((s) => {
          const pending = studentWorkReport(s.id, s.batch).pending;
          return (
          <div
            key={s.id}
            className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-[0_8px_24px_rgba(20,16,12,.04)] transition hover:border-primary/40 hover:shadow-[0_12px_30px_rgba(196,92,18,.1)] sm:flex-row sm:items-center"
          >
            <button
              type="button"
              onClick={() => openStudent(s.id)}
              className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
            >
              <Avatar initials={s.initials} size="md" />
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{s.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  ID {s.username || s.email.split('@')[0]} · {s.batch}
                </div>
                {pending > 0 && (
                  <div className="mt-1.5 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                    {pending} homework not submitted
                  </div>
                )}
              </div>
              <div className="ml-auto hidden items-center gap-6 sm:flex">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Band</div>
                  <strong>{s.band > 0 ? s.band.toFixed(1) : '—'}</strong>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Trend</div>
                  <span className={s.trend.startsWith('+') ? 'text-emerald-700' : s.trend.startsWith('-') ? 'text-red-700' : 'text-muted-foreground'}>
                    {s.trend}
                  </span>
                </div>
              </div>
            </button>
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              <button
                type="button"
                onClick={() => openStudent(s.id)}
                className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-primary px-3 text-xs font-bold text-white hover:brightness-110"
              >
                Open record <ArrowUpRight size={14} />
              </button>
              <button
                type="button"
                onClick={() => openStudent(s.id, 'login')}
                className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border px-3 text-xs font-bold text-slate-700 hover:bg-muted"
              >
                <KeyRound size={14} /> Change login
              </button>
              <button
                type="button"
                onClick={() => removeStudent(s)}
                className="inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-lg border border-red-200 px-3 text-xs font-bold text-red-700 hover:bg-red-50"
              >
                <Trash2 size={14} /> Remove
              </button>
            </div>
          </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="card px-5 py-10 text-center text-sm text-muted-foreground">No students match this search.</div>
        )}
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
