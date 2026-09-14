import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Badge, Button, EmptyState, SearchInput, SectionTitle, StatusBadge, Toast } from '@/components/ui-kit';
import PracticeTestGallery from '@/student/PracticeTestGallery';
import {
  bookSeries,
  loadPracticeBank,
  seriesList,
  uniqueBookCount,
  type BankItem,
} from '@/lib/practice-engine';
import {
  listMockStudents,
  listTeacherMocks,
  reviewMockAttempt,
  type MockAssignment,
  type MockStudentRow,
} from '@/lib/mocks-api';

export { LiveMonitoringPage } from './LiveMonitoringPage';

const MOCK_PICK_KEY = 'mock-library-pick';

export type MockPaperPick = {
  module: 'Reading' | 'Listening' | 'Writing' | 'Speaking';
  ieltsType: 'academic' | 'general_training';
  item: BankItem;
  sectionId?: string;
  sectionLabel?: string;
};

export function saveMockPaperPick(pick: MockPaperPick) {
  sessionStorage.setItem(MOCK_PICK_KEY, JSON.stringify(pick));
}

export function readMockPaperPick(): MockPaperPick | null {
  try {
    const raw = sessionStorage.getItem(MOCK_PICK_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as MockPaperPick;
  } catch {
    return null;
  }
}

export function clearMockPaperPick() {
  sessionStorage.removeItem(MOCK_PICK_KEY);
}

export function paperRefsFromPick(pick: MockPaperPick): Record<string, unknown> {
  const item = pick.item;
  const full = !pick.sectionId;
  if (pick.module === 'Reading') {
    return {
      reading_test_id: item.id,
      test_id: item.id,
      ...(full ? {} : { passage_id: pick.sectionId }),
    };
  }
  if (pick.module === 'Listening') {
    return {
      listening_test_id: item.id,
      test_id: item.id,
      ...(full ? {} : { part_id: pick.sectionId }),
    };
  }
  if (pick.module === 'Writing') {
    if (full) {
      return {
        test_id: item.id,
        task1_id: item.parts?.find((p) => p.part_number === 1)?.id,
        task2_id: item.parts?.find((p) => p.part_number === 2)?.id,
      };
    }
    return { question_id: pick.sectionId };
  }
  return { speaking_test_id: item.id, test_id: item.id };
}

function formatTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

const SKILLS = ['Reading', 'Listening', 'Writing', 'Speaking'] as const;

export function MockLibraryPage() {
  const [, setLocation] = useLocation();
  const [module, setModule] = useState<(typeof SKILLS)[number]>('Reading');
  const [ieltsType, setIeltsType] = useState<'academic' | 'general_training'>('academic');
  const [bankItems, setBankItems] = useState<BankItem[]>([]);
  const [bankNote, setBankNote] = useState('Loading the same practice bank students use…');
  const [bankError, setBankError] = useState('');
  const [bankLoading, setBankLoading] = useState(true);
  const [series, setSeries] = useState('All');
  const [bookSort, setBookSort] = useState<'newest' | 'oldest'>('newest');

  useEffect(() => {
    let cancelled = false;
    setBankLoading(true);
    setBankError('');
    setSeries('All');
    loadPracticeBank(module, ieltsType === 'general_training' ? 'General Training' : 'Academic', 'Full Mock')
      .then((data) => {
        if (cancelled) return;
        setBankItems(data.items);
        setBankNote(data.note);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setBankItems([]);
        setBankError(e.message || 'Could not load the practice bank.');
      })
      .finally(() => {
        if (!cancelled) setBankLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [module, ieltsType]);

  const seriesOptions = seriesList(bankItems);
  const galleryItems = useMemo(
    () => (series === 'All' ? bankItems : bankItems.filter((item) => bookSeries(item) === series)),
    [bankItems, series],
  );

  const usePaper = (item: BankItem, sectionId?: string, sectionLabel?: string) => {
    const pick: MockPaperPick = {
      module,
      ieltsType,
      item,
      sectionId,
      sectionLabel,
    };
    saveMockPaperPick(pick);
    setLocation('/teacher/mocks/assign');
  };

  return (
    <>
      <SectionTitle
        eyebrow="Mock exams"
        title="Mock library"
        description="Same books and papers as IELTS Practice. Open a book, then assign that paper as a supervised mock."
        action={<Button onClick={() => setLocation('/teacher/mocks/assign')}>Assign mock</Button>}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {SKILLS.map((skill) => (
          <button
            key={skill}
            type="button"
            onClick={() => setModule(skill)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${module === skill ? 'border-primary bg-amber-50 text-amber-900' : 'border-border'}`}
          >
            {skill}
          </button>
        ))}
      </div>
      {module !== 'Speaking' && (
        <div className="mb-4 flex flex-wrap gap-2">
          {([
            ['academic', 'Academic'],
            ['general_training', 'General Training'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setIeltsType(id)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold ${ieltsType === id ? 'border-primary bg-teal-50 text-teal-900' : 'border-border'}`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSeries('All')}
          className={`rounded-full border px-3 py-1.5 text-xs font-bold ${series === 'All' ? 'border-primary bg-amber-50 text-amber-900' : 'border-border'}`}
        >
          All books ({uniqueBookCount(bankItems)})
        </button>
        {seriesOptions.map((row) => (
          <button
            key={row.label}
            type="button"
            onClick={() => setSeries(row.label)}
            className={`rounded-full border px-3 py-1.5 text-xs font-bold ${series === row.label ? 'border-primary bg-amber-50 text-amber-900' : 'border-border'}`}
          >
            {row.label} ({row.count})
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={() => setBookSort('newest')} className={`text-xs font-bold ${bookSort === 'newest' ? 'text-primary' : 'text-muted-foreground'}`}>Newest</button>
          <button type="button" onClick={() => setBookSort('oldest')} className={`text-xs font-bold ${bookSort === 'oldest' ? 'text-primary' : 'text-muted-foreground'}`}>Oldest</button>
        </div>
      </div>
      {bankError && <p className="mb-3 text-sm text-red-700">{bankError}</p>}
      {bankLoading && <p className="text-sm text-muted-foreground">Loading practice books…</p>}
      {!bankLoading && !bankError && (
        <>
          <p className="mb-2 text-xs text-muted-foreground">{bankNote}</p>
          <PracticeTestGallery
            module={module}
            items={galleryItems}
            history={[]}
            sort={bookSort}
            seriesLabel={series}
            mode="assign"
            onTakeTest={(item) => usePaper(item)}
            onPracticeSection={(item, sectionId, label) => usePaper(item, sectionId, label)}
          />
        </>
      )}
    </>
  );
}

export function AssignedMocksPage() {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<MockAssignment[]>([]);
  useEffect(() => { listTeacherMocks().then((d) => setRows(d.assignments)).catch(() => setRows([])); }, []);
  if (!rows.length) return <><SectionTitle eyebrow="Mock exams" title="Assigned mocks" /><EmptyState title="No mocks assigned yet" text="Assign a library mock to a batch or selected students." action={<Button onClick={() => setLocation('/teacher/mocks/assign')}>Assign mock</Button>} /></>;
  return (
    <>
      <SectionTitle eyebrow="Mock exams" title="Assigned mocks" action={<Button onClick={() => setLocation('/teacher/mocks/assign')}>Assign mock</Button>} />
      <div className="grid gap-4 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} className="card p-5">
            <div className="flex items-start justify-between gap-2">
              <Badge tone="amber">{row.mock_type}</Badge>
              <StatusBadge status={`${row.submitted || 0}/${row.assigned || 0} submitted`} />
            </div>
            <h2 className="mt-3 font-display text-lg font-bold">{row.title}</h2>
            <p className="mt-2 text-xs text-muted-foreground">{row.batch_label || 'Selected students'} · {formatTime(row.available_at)}</p>
            <div className="mt-4 flex gap-2">
              <Button variant="quiet" onClick={() => setLocation(`/teacher/mocks/live/${row.id}`)}>Live</Button>
              <Button variant="quiet" onClick={() => setLocation(`/teacher/mocks/results/${row.id}`)}>Results</Button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

export function MockResultsPage({ assignmentId }: { assignmentId?: string }) {
  const [assignments, setAssignments] = useState<MockAssignment[]>([]);
  const [current, setCurrent] = useState(assignmentId || '');
  const [query, setQuery] = useState('');
  const [students, setStudents] = useState<MockStudentRow[]>([]);
  const [markId, setMarkId] = useState<string | null>(null);
  const [writing, setWriting] = useState('6.0');
  const [ta, setTa] = useState('6.0');
  const [cc, setCc] = useState('6.0');
  const [lr, setLr] = useState('6.0');
  const [gra, setGra] = useState('6.0');
  const [feedback, setFeedback] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    listTeacherMocks().then((d) => {
      setAssignments(d.assignments);
      if (!current && d.assignments[0]) setCurrent(d.assignments[0].id);
    }).catch(() => setAssignments([]));
  }, []);
  useEffect(() => {
    if (!current) return;
    listMockStudents(current).then((d) => setStudents(d.students)).catch(() => setStudents([]));
  }, [current]);

  const rows = students.filter((s) => s.student_name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <SectionTitle eyebrow="Mock exams" title="Results" description="Objective reading/listening scores appear after submit. Writing is teacher-final, never auto-published as the official band." />
      <div className="mb-4 flex flex-wrap gap-3">
        <select className="h-10 rounded-lg border border-input bg-card px-3 text-sm" value={current} onChange={(e) => setCurrent(e.target.value)}>
          {assignments.map((a) => <option key={a.id} value={a.id}>{a.title}</option>)}
        </select>
        <SearchInput value={query} onChange={setQuery} placeholder="Search student" />
      </div>
      <div className="card overflow-hidden">
        <div className="mobile-scroll">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[1.2fr_.6fr_.6fr_.6fr_.6fr_.6fr_.5fr_.8fr] gap-3 bg-muted/60 px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>Student</span><span>L</span><span>R</span><span>W</span><span>S</span><span>Overall</span><span>Warn</span><span>Status</span>
            </div>
            {rows.map((s) => (
              <div key={s.id} className="data-row grid grid-cols-[1.2fr_.6fr_.6fr_.6fr_.6fr_.6fr_.5fr_.8fr] items-center gap-3 px-4 py-3 text-sm">
                <span className="font-semibold">{s.student_name}</span>
                <span>{s.listening_band ?? '—'}</span>
                <span>{s.reading_band ?? '—'}</span>
                <span>{s.writing_band ?? 'Pending'}</span>
                <span>{s.speaking_band ?? '—'}</span>
                <span>{s.overall_band ?? '—'}</span>
                <span>{s.warning_count}</span>
                <span>
                  {s.attempt_id && !s.published ? (
                    <button type="button" className="text-xs font-bold text-primary" onClick={() => setMarkId(s.attempt_id!)}>Mark writing</button>
                  ) : (
                    <StatusBadge status={s.published ? 'Complete' : s.status} />
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      {markId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="card w-full max-w-md p-5">
            <h2 className="font-display text-lg font-bold">Mark writing</h2>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold">Task Achievement<input className="mt-1 h-10 w-full rounded-lg border border-input px-2" value={ta} onChange={(e) => setTa(e.target.value)} /></label>
              <label className="text-xs font-semibold">Coherence<input className="mt-1 h-10 w-full rounded-lg border border-input px-2" value={cc} onChange={(e) => setCc(e.target.value)} /></label>
              <label className="text-xs font-semibold">Lexical<input className="mt-1 h-10 w-full rounded-lg border border-input px-2" value={lr} onChange={(e) => setLr(e.target.value)} /></label>
              <label className="text-xs font-semibold">Grammar<input className="mt-1 h-10 w-full rounded-lg border border-input px-2" value={gra} onChange={(e) => setGra(e.target.value)} /></label>
            </div>
            <label className="mt-3 block text-xs font-semibold">Overall writing band</label>
            <input className="mt-1 h-11 w-full rounded-lg border border-input px-3" value={writing} onChange={(e) => setWriting(e.target.value)} />
            <label className="mt-3 block text-xs font-semibold">Overall feedback</label>
            <textarea className="mt-1 min-h-24 w-full rounded-lg border border-input p-3 text-sm" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="quiet" onClick={() => setMarkId(null)}>Cancel</Button>
              <Button onClick={async () => {
                await reviewMockAttempt(markId, {
                  writing_band: Number(writing),
                  task_achievement: Number(ta),
                  coherence: Number(cc),
                  lexical: Number(lr),
                  grammar: Number(gra),
                  writing_feedback: feedback,
                  publish: true,
                });
                setToast('Result published');
                setMarkId(null);
                const d = await listMockStudents(current);
                setStudents(d.students);
              }}>Publish result</Button>
            </div>
          </div>
        </div>
      )}
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
