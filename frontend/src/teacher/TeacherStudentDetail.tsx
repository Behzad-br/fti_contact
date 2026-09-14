import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, KeyRound, Trash2 } from 'lucide-react';
import { Avatar, Badge, Button, SectionTitle, StatusBadge, Toast } from '@/components/ui-kit';
import { teacherStudentRecord, type StudentHomeworkRecordItem } from '@/lib/homework-api';
import {
  getStudentAccount,
  homeworkAliasesForStudent,
  listCampusBatches,
  listStudentAccounts,
  listTeacherRoster,
  removeStudentAccount,
  studentWorkReport,
  updateStudentAccount,
} from '@/lib/mock-api';

function prettyStatus(status?: string) {
  if (!status) return 'Pending';
  if (status === 'submitted') return 'Awaiting review';
  if (status === 'reviewed' || status === 'published') return 'Published';
  if (status === 'in_progress') return 'In progress';
  if (status === 'Completed') return 'Completed';
  return status[0].toUpperCase() + status.slice(1).replace(/_/g, ' ');
}

function formatWhen(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function WorkList({
  title,
  empty,
  rows,
}: {
  title: string;
  empty: string;
  rows: { id: string; title: string; skill: string; status: string; due: string; band?: string }[];
}) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-border px-5 py-4">
        <div className="eyebrow">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground">{rows.length} item{rows.length === 1 ? '' : 's'}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.id} className="flex items-start justify-between gap-3 px-5 py-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{row.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge tone="amber">{row.skill}</Badge>
                  <span>{row.due}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <StatusBadge status={row.status} />
                {row.band && <div className="mt-1 text-xs font-semibold text-slate-700">{row.band}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TeacherStudentDetailPage({ studentId }: { studentId: string }) {
  const [, setLocation] = useLocation();
  const listed = listTeacherRoster().find((row) => row.id === studentId);
  const account = getStudentAccount(studentId);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState(account?.fullName || listed?.name || '');
  const [studentIdValue, setStudentIdValue] = useState(account?.username || account?.studentId || listed?.username || '');
  const [password, setPassword] = useState(account?.password || 'password123');
  const [confirmPassword, setConfirmPassword] = useState(account?.password || 'password123');
  const [batch, setBatch] = useState(account?.batch || listed?.batch || '');
  const [live, setLive] = useState<{
    submitted: StudentHomeworkRecordItem[];
    in_progress: StudentHomeworkRecordItem[];
    pending: StudentHomeworkRecordItem[];
  } | null>(null);

  useEffect(() => {
    const listedRow = listTeacherRoster().find((row) => row.id === studentId);
    const acc = getStudentAccount(studentId);
    if (!listedRow && !acc) return;
    const aliases = homeworkAliasesForStudent({
      id: studentId,
      email: acc?.email || listedRow?.email,
      username: acc?.username || listedRow?.username,
    });
    teacherStudentRecord(aliases).then(setLive).catch(() => setLive({ submitted: [], in_progress: [], pending: [] }));
  }, [studentId]);

  useEffect(() => {
    if (window.location.hash !== '#login') return;
    const timer = window.setTimeout(() => {
      document.getElementById('login')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [studentId]);

  const report = useMemo(
    () => studentWorkReport(studentId, batch || listed?.batch || ''),
    [studentId, batch, listed?.batch],
  );

  if (!listed && !account) {
    return (
      <div className="card p-8 text-center">
        <h2 className="font-display text-xl font-bold">Student not found.</h2>
        <Button className="mt-5" onClick={() => setLocation('/teacher/students')}>Back to students</Button>
      </div>
    );
  }

  const batchOptions = Array.from(new Set([
    batch,
    ...listTeacherRoster().map((s) => s.batch),
    ...listCampusBatches('lahore').map((b) => b.name),
  ].filter(Boolean)));

  const liveSubmitted = (live?.submitted || []).map((item) => ({
    id: item.id,
    title: item.title,
    skill: item.module || 'Homework',
    status: prettyStatus(item.status),
    due: item.submitted_at ? `Submitted ${formatWhen(item.submitted_at)}` : 'Submitted',
    band: item.teacher_band != null
      ? `Teacher ${Number(item.teacher_band).toFixed(1)}`
      : item.estimated_band != null
        ? `Estimated ${Number(item.estimated_band).toFixed(1)}`
        : undefined,
  }));
  const livePending = [...(live?.pending || []), ...(live?.in_progress || [])].map((item) => ({
    id: item.id,
    title: item.title,
    skill: item.module || 'Homework',
    status: prettyStatus(item.status),
    due: item.deadline ? `Due ${new Date(item.deadline).toLocaleDateString()}` : 'Assigned · not submitted',
  }));
  const mockSubmitted = report.items.filter((item) => item.status === 'Completed').map((item) => ({
    id: item.id,
    title: item.title,
    skill: item.skill,
    status: 'Completed',
    due: item.due,
  }));
  const mockPending = report.items.filter((item) => item.status !== 'Completed').map((item) => ({
    id: item.id,
    title: item.title,
    skill: item.skill,
    status: item.status,
    due: item.due,
  }));
  const hasLive = Boolean((live?.submitted.length || 0) + (live?.pending.length || 0) + (live?.in_progress.length || 0));
  const submittedRows = hasLive ? liveSubmitted : mockSubmitted;
  const pendingRows = hasLive ? livePending : mockPending;
  const pastRows = hasLive
    ? liveSubmitted
    : report.items.filter((item) => item.status === 'Completed').map((item) => ({
        id: `past-${item.id}`,
        title: item.title,
        skill: item.skill,
        status: 'Published',
        due: item.due,
        band: listed?.band ? `Band ${listed.band.toFixed(1)}` : undefined,
      }));

  const save = (e: FormEvent) => {
    e.preventDefault();
    const loginId = studentIdValue.trim();
    if (fullName.trim().length < 2) { setError('Enter the student name.'); return; }
    if (loginId.length < 3) { setError('Student ID must be at least 3 characters.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    const taken = listStudentAccounts().some((s) =>
      s.id !== studentId && (s.username || '').toLowerCase() === loginId.toLowerCase()
    );
    if (taken) { setError('This student ID is already used.'); return; }
    const email = (account?.email || listed?.email || `${loginId.toLowerCase()}@student.fti.local`).trim();
    updateStudentAccount(studentId, {
      fullName: fullName.trim(),
      name: fullName.trim(),
      username: loginId,
      studentId: loginId,
      email,
      password,
      batch,
      band: account?.band || (listed?.band ? String(listed.band) : ''),
      trend: listed?.trend || account?.trend || '—',
      status: listed?.status || account?.status || 'Active',
      lastActive: listed?.lastActive || account?.lastActive || 'Just updated',
      branchId: account?.branchId || 'lahore',
      branchName: account?.branchName || 'Lahore Branch',
    });
    setError('');
    setToast('Login saved. Share this student ID and password with the learner.');
  };

  return (
    <>
      <button onClick={() => setLocation('/teacher/students')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} /> Students
      </button>
      <SectionTitle
        eyebrow={batch || 'Student record'}
        title={fullName || 'Student'}
        description="Open their recent submissions, past results, pending homework, and login details."
      />

      <div className="mb-6 flex flex-wrap items-center gap-4">
        <Avatar initials={(fullName || 'ST').split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()} size="lg" />
        <div className="min-w-0">
          <div className="text-sm font-semibold">{fullName}</div>
          <div className="text-xs text-muted-foreground">ID {studentIdValue || listed?.username} · {batch}</div>
        </div>
        <div className="ml-auto grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-emerald-50 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">Submitted</div>
            <div className="mt-1 font-display text-xl font-bold">{submittedRows.length}</div>
          </div>
          <div className="rounded-xl bg-amber-50 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-800">Not submitted</div>
            <div className="mt-1 font-display text-xl font-bold">{pendingRows.length}</div>
          </div>
          <div className="rounded-xl bg-slate-100 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600">Band</div>
            <div className="mt-1 font-display text-xl font-bold">{listed?.band ? listed.band.toFixed(1) : '—'}</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
        <div className="space-y-5">
          <WorkList
            title="Recently submitted"
            empty="This student has not submitted any homework yet."
            rows={submittedRows}
          />
          <WorkList
            title="Homework given · not submitted"
            empty="No pending homework for this student."
            rows={pendingRows}
          />
          <WorkList
            title="Past record and results"
            empty="No past results yet."
            rows={pastRows}
          />
        </div>

        <form id="login" onSubmit={save} className="card h-fit scroll-mt-24 space-y-4 p-6">
          <div className="flex items-center gap-2">
            <KeyRound size={16} className="text-primary" />
            <div>
              <div className="eyebrow">Login credentials</div>
              <p className="mt-1 text-xs text-muted-foreground">Change their student ID or password, then share the new details.</p>
            </div>
          </div>
          <label className="block text-sm font-semibold">Full name
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          <label className="block text-sm font-semibold">Student ID
            <input value={studentIdValue} onChange={(e) => setStudentIdValue(e.target.value)} required minLength={3} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
            <span className="mt-1 block text-xs font-normal text-muted-foreground">They sign in with this ID.</span>
          </label>
          <label className="block text-sm font-semibold">Password
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          <label className="block text-sm font-semibold">Confirm password
            <input type="text" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm" />
          </label>
          <label className="block text-sm font-semibold">Batch
            <select value={batch} onChange={(e) => setBatch(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm">
              {batchOptions.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap gap-3">
            <Button type="submit">Save credentials</Button>
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-semibold text-red-700 hover:bg-red-50"
              onClick={() => {
                if (!confirm(`Remove login for ${fullName || 'this student'}? They will no longer be able to sign in.`)) return;
                removeStudentAccount(studentId, account?.email || listed?.email);
                setLocation('/teacher/students');
              }}
            >
              <Trash2 size={15} /> Remove credentials
            </button>
          </div>
        </form>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
