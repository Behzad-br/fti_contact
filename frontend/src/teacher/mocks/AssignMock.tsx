import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Plus, X } from 'lucide-react';
import { Button, SearchInput, SectionTitle, Toast } from '@/components/ui-kit';
import { assignedBatchIdsForTeacher, getCurrentTeacher, listCampusBatches, listTeacherRoster } from '@/lib/mock-api';
import { createMockAssignment } from '@/lib/mocks-api';
import {
  clearMockPaperPick,
  paperRefsFromPick,
  readMockPaperPick,
  type MockPaperPick,
} from '@/teacher/mocks/MockExamsPages';

const TYPE_LABEL: Record<string, string> = {
  full: 'Full IELTS Mock',
  reading: 'Reading',
  listening: 'Listening',
  writing: 'Writing',
  speaking: 'Speaking',
  custom: 'Custom Mock',
};

type ManualQuestion = {
  id: number;
  type: string;
  text: string;
  options?: string[];
  answer?: string;
};

function defaultDuration(pick: MockPaperPick | null) {
  if (!pick) return 60;
  if (pick.sectionId) {
    if (pick.module === 'Writing') return pick.sectionLabel?.includes('1') ? 20 : 40;
    if (pick.module === 'Reading') return 20;
    if (pick.module === 'Listening') return 10;
    return 15;
  }
  return pick.item.durationMinutes || (pick.module === 'Listening' ? 40 : pick.module === 'Speaking' ? 15 : pick.module === 'Writing' ? 60 : 60);
}

function titleFromPick(pick: MockPaperPick) {
  const testNo = pick.item.testNumber ? String(pick.item.testNumber).padStart(2, '0') : '';
  const bookBit = [pick.item.bookTitle, testNo ? `Test ${testNo}` : pick.item.title].filter(Boolean).join(' · ');
  if (pick.sectionId) return `${bookBit} · ${pick.sectionLabel || 'Section'}`;
  return bookBit || pick.item.title;
}

export default function AssignMock() {
  const [, setLocation] = useLocation();
  const teacher = getCurrentTeacher();
  const batches = useMemo(() => {
    const ids = new Set(assignedBatchIdsForTeacher(teacher.id));
    const all = listCampusBatches(teacher.branchId);
    return all.filter((b) => ids.has(b.id) || b.teacherId === teacher.id || (teacher.batches || '').includes(b.name));
  }, [teacher]);
  const roster = listTeacherRoster();
  const [paperSource, setPaperSource] = useState<'bank' | 'manual'>('bank');
  const [paperPick, setPaperPick] = useState<MockPaperPick | null>(null);
  const [title, setTitle] = useState('');
  const [mockType, setMockType] = useState('writing');
  const [ieltsType, setIeltsType] = useState('academic');
  const [assignMode, setAssignMode] = useState<'batch' | 'selected' | 'individual'>('batch');
  const [batchName, setBatchName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [available, setAvailable] = useState('');
  const [deadline, setDeadline] = useState('');
  const [duration, setDuration] = useState(60);
  const [attempts, setAttempts] = useState(1);
  const [secure, setSecure] = useState(true);
  const [monitor, setMonitor] = useState(true);
  const [fullscreen, setFullscreen] = useState(true);
  const [late, setLate] = useState(true);
  const [autoSubmit, setAutoSubmit] = useState(true);
  const [resultMode, setResultMode] = useState<'teacher' | 'ai'>('teacher');
  const [instructions, setInstructions] = useState('');
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualPassage, setManualPassage] = useState('');
  const [manualQuestions, setManualQuestions] = useState<ManualQuestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    const pick = readMockPaperPick();
    if (!pick) return;
    setPaperSource('bank');
    setPaperPick(pick);
    setTitle(titleFromPick(pick));
    setMockType(pick.module.toLowerCase());
    setIeltsType(pick.ieltsType);
    setDuration(defaultDuration(pick));
  }, []);

  useEffect(() => {
    if (!batchName && batches[0]) setBatchName(batches[0].name);
  }, [batches, batchName]);

  useEffect(() => {
    if (paperSource !== 'manual') return;
    if (mockType === 'full') setMockType('writing');
    if (!title.trim()) setTitle(`Manual ${TYPE_LABEL[mockType] || mockType} mock`);
    if (mockType === 'writing') setDuration((d) => (d === 60 || d === 40 || d === 20 ? 40 : d));
    if (mockType === 'reading') setDuration((d) => (d === 60 || d === 40 ? 20 : d));
    if (mockType === 'listening') setDuration((d) => (d === 60 || d === 40 ? 15 : d));
    if (mockType === 'speaking') setDuration((d) => (d === 60 || d === 40 ? 15 : d));
  }, [paperSource, mockType, title]);

  const batchStudents = roster.filter((s) => s.batch === batchName && !String(s.status || '').toLowerCase().includes('removed'));
  const visibleStudents = batchStudents.filter((s) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return `${s.name} ${s.email} ${s.username || ''}`.toLowerCase().includes(q);
  });

  const recipients = () => {
    if (assignMode === 'batch') return batchStudents.map((s) => ({ id: s.id, name: s.name }));
    return batchStudents.filter((s) => selected.includes(s.id)).map((s) => ({ id: s.id, name: s.name }));
  };

  const buildManualRefs = () => {
    if (mockType === 'writing' || mockType === 'speaking') {
      return { prompt: manualPrompt.trim() };
    }
    if (mockType === 'reading') {
      return {
        passage: manualPassage.trim(),
        questions: manualQuestions.map((q) => ({
          type: q.type,
          text: q.text,
          options: q.options,
          answer: q.answer,
        })),
      };
    }
    return {
      questions: manualQuestions.map((q) => ({
        type: q.type,
        text: q.text,
        options: q.options,
        answer: q.answer,
      })),
    };
  };

  const submit = async () => {
    setError('');
    if (paperSource === 'bank' && !paperPick) {
      setError('Pick a paper from Mock library, or switch to Manual create.');
      return;
    }
    if (paperSource === 'manual') {
      if (!title.trim()) {
        setError('Enter a mock name.');
        return;
      }
      if ((mockType === 'writing' || mockType === 'speaking') && !manualPrompt.trim()) {
        setError('Add a prompt for this manual mock.');
        return;
      }
      if (mockType === 'reading' && !manualPassage.trim()) {
        setError('Add a reading passage for this manual mock.');
        return;
      }
      if ((mockType === 'reading' || mockType === 'listening') && manualQuestions.length === 0) {
        setError('Add at least one question with an answer key.');
        return;
      }
    }
    const students = recipients();
    if (!students.length) {
      setError('Select at least one enrolled student.');
      return;
    }
    setBusy(true);
    try {
      const refs = paperSource === 'bank' && paperPick
        ? paperRefsFromPick(paperPick)
        : buildManualRefs();
      if (paperSource === 'bank' && paperPick?.sectionLabel) refs.section_label = paperPick.sectionLabel;
      await createMockAssignment({
        title: title.trim(),
        mock_type: mockType,
        ielts_type: ieltsType,
        assign_mode: assignMode,
        batch_id: batches.find((b) => b.name === batchName)?.id,
        batch_label: batchName,
        available_at: available ? new Date(available).toISOString() : new Date().toISOString(),
        deadline_at: deadline ? new Date(deadline).toISOString() : undefined,
        duration_minutes: duration,
        attempts_allowed: attempts,
        secure_mode: secure,
        screen_monitoring: monitor,
        fullscreen_required: fullscreen,
        allow_late_start: late,
        auto_submit: autoSubmit,
        paper_source: paperSource,
        result_mode: resultMode,
        instructions,
        teacher_name: teacher.fullName || teacher.name,
        students,
        paper_refs: refs,
      });
      clearMockPaperPick();
      setToast('Mock assigned. Students will see it in their portal.');
      setTimeout(() => setLocation('/teacher/mocks/assigned'), 700);
    } catch (e: any) {
      setError(e.message || 'Could not assign mock.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SectionTitle eyebrow="Mock exams" title="Assign mock" description="Assign from the practice bank, or create a manual mock. Choose AI auto-result or teacher marking." />
      <div className="grid gap-6 lg:grid-cols-[.95fr_1.05fr]">
        <div className="card space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            {[
              ['bank', 'Practice library'],
              ['manual', 'Manual create'],
            ].map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setPaperSource(id as 'bank' | 'manual')}
                className={`rounded-full border px-3 py-1.5 text-xs font-bold ${paperSource === id ? 'border-primary bg-amber-50 text-amber-900' : 'border-border'}`}
              >
                {label}
              </button>
            ))}
          </div>

          {paperSource === 'bank' ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="block text-sm font-semibold">Paper from practice bank</label>
                <Button variant="quiet" onClick={() => setLocation('/teacher/mocks')}>Browse mock library</Button>
              </div>
              {paperPick ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm">
                  <div className="text-xs font-bold uppercase tracking-wider text-amber-800">{TYPE_LABEL[mockType] || mockType} · {ieltsType.replace('_', ' ')}</div>
                  <div className="mt-1 font-display text-lg font-bold text-amber-950">{titleFromPick(paperPick)}</div>
                  <p className="mt-1 text-xs text-amber-900/70">{paperPick.item.detail}</p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                  Open <strong>Mock library</strong> and pick the same book/test students see in IELTS Practice — or switch to Manual create.
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3 rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">Create any skill mock yourself — like homework manual entry. Students open it inside the Mock Tests section.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold">Skill</label>
                  <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={mockType} onChange={(e) => setMockType(e.target.value)}>
                    {['reading', 'listening', 'writing', 'speaking'].map((t) => (
                      <option key={t} value={t}>{TYPE_LABEL[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold">IELTS type</label>
                  <select className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={ieltsType} onChange={(e) => setIeltsType(e.target.value)}>
                    <option value="academic">Academic</option>
                    <option value="general_training">General Training</option>
                  </select>
                </div>
              </div>
              {(mockType === 'writing' || mockType === 'speaking') && (
                <div>
                  <label className="mb-1 block text-xs font-semibold">{mockType === 'writing' ? 'Writing prompt' : 'Speaking cue / prompt'}</label>
                  <textarea className="min-h-28 w-full rounded-lg border border-input bg-card p-3 text-sm" value={manualPrompt} onChange={(e) => setManualPrompt(e.target.value)} placeholder="Type or paste the question students will answer…" />
                </div>
              )}
              {mockType === 'reading' && (
                <div>
                  <label className="mb-1 block text-xs font-semibold">Reading passage</label>
                  <textarea className="min-h-32 w-full rounded-lg border border-input bg-card p-3 text-sm" value={manualPassage} onChange={(e) => setManualPassage(e.target.value)} placeholder="Paste the passage text…" />
                </div>
              )}
              {(mockType === 'reading' || mockType === 'listening') && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="quiet" onClick={() => setManualQuestions((prev) => [...prev, { id: Date.now(), type: 'Multiple Choice', text: '', options: ['', '', '', ''], answer: '' }])}><Plus size={14} /> MCQ</Button>
                    <Button type="button" variant="quiet" onClick={() => setManualQuestions((prev) => [...prev, { id: Date.now() + 1, type: 'True/False/Not Given', text: '', answer: 'True' }])}><Plus size={14} /> T/F/NG</Button>
                    <Button type="button" variant="quiet" onClick={() => setManualQuestions((prev) => [...prev, { id: Date.now() + 2, type: 'Fill in the blanks', text: '', answer: '' }])}><Plus size={14} /> Fill blanks</Button>
                  </div>
                  {manualQuestions.length === 0 && <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">Add questions with answer keys so AI / auto-check can score them.</p>}
                  {manualQuestions.map((q, index) => (
                    <div key={q.id} className="relative rounded-lg border border-border p-3">
                      <button type="button" className="absolute right-2 top-2 text-muted-foreground hover:text-red-600" onClick={() => setManualQuestions((prev) => prev.filter((row) => row.id !== q.id))} aria-label="Remove question"><X size={16} /></button>
                      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Q{index + 1} · {q.type}</div>
                      <input className="mb-2 h-10 w-full rounded-lg border border-input px-3 text-sm" placeholder="Question text" value={q.text} onChange={(e) => setManualQuestions((prev) => prev.map((row) => row.id === q.id ? { ...row, text: e.target.value } : row))} />
                      {q.type === 'Multiple Choice' && (q.options || []).map((opt, oi) => (
                        <input key={oi} className="mb-1 h-9 w-full rounded-lg border border-input px-3 text-sm" placeholder={`Option ${oi + 1}`} value={opt} onChange={(e) => setManualQuestions((prev) => prev.map((row) => {
                          if (row.id !== q.id) return row;
                          const options = [...(row.options || ['', '', '', ''])];
                          options[oi] = e.target.value;
                          return { ...row, options };
                        }))} />
                      ))}
                      {q.type === 'True/False/Not Given' ? (
                        <select className="mt-1 h-9 rounded-lg border border-input px-2 text-sm" value={q.answer || 'True'} onChange={(e) => setManualQuestions((prev) => prev.map((row) => row.id === q.id ? { ...row, answer: e.target.value } : row))}>
                          {['True', 'False', 'Not Given'].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      ) : (
                        <input className="mt-1 h-9 w-full rounded-lg border border-input px-3 text-sm" placeholder="Correct answer" value={q.answer || ''} onChange={(e) => setManualQuestions((prev) => prev.map((row) => row.id === q.id ? { ...row, answer: e.target.value } : row))} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <label className="block text-sm font-semibold">Mock name</label>
          <input className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Available date / start</label>
              <input type="datetime-local" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={available} onChange={(e) => setAvailable(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Deadline</label>
              <input type="datetime-local" className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold">Duration (minutes)</label>
              <input type="number" min={1} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold">Attempts</label>
              <input type="number" min={1} className="h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={attempts} onChange={(e) => setAttempts(Number(e.target.value))} />
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm font-semibold">Result after student submits</div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${resultMode === 'ai' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" className="mt-1" checked={resultMode === 'ai'} onChange={() => setResultMode('ai')} />
                <span>
                  <span className="block text-sm font-bold">AI check · instant result</span>
                  <span className="mt-1 block text-xs text-muted-foreground">As soon as the student submits, estimated band shows in Mock Results. You can still override later.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${resultMode === 'teacher' ? 'border-primary bg-primary/5' : 'border-border'}`}>
                <input type="radio" className="mt-1" checked={resultMode === 'teacher'} onChange={() => setResultMode('teacher')} />
                <span>
                  <span className="block text-sm font-bold">Teacher check · you publish</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Student waits. You mark in Mock Results, then publish the official band.</span>
                </span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              ['Secure mode', secure, setSecure],
              ['Screen monitoring', monitor, setMonitor],
              ['Fullscreen required', fullscreen, setFullscreen],
              ['Allow late start', late, setLate],
              ['Auto submit', autoSubmit, setAutoSubmit],
            ].map(([label, on, set]) => (
              <label key={String(label)} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2">
                <input type="checkbox" checked={Boolean(on)} onChange={(e) => (set as (v: boolean) => void)(e.target.checked)} />
                {label as string}
              </label>
            ))}
          </div>
          <label className="block text-sm font-semibold">Instructions</label>
          <textarea className="min-h-24 w-full rounded-lg border border-input bg-card p-3 text-sm" value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        </div>
        <div className="card p-5">
          <div className="text-sm font-semibold">Assign to</div>
          <div className="mt-3 flex flex-wrap gap-2">
            {[['batch', 'Entire batch'], ['selected', 'Selected students'], ['individual', 'Individual student']].map(([id, label]) => (
              <button key={id} type="button" onClick={() => { setAssignMode(id as typeof assignMode); setSelected([]); }} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${assignMode === id ? 'border-primary bg-amber-50 text-amber-900' : 'border-border'}`}>{label}</button>
            ))}
          </div>
          <label className="mt-4 block text-xs font-semibold">Batch</label>
          <select className="mt-1 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" value={batchName} onChange={(e) => { setBatchName(e.target.value); setSelected([]); }}>
            {batches.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
          </select>
          {assignMode !== 'batch' && (
            <>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <SearchInput value={query} onChange={setQuery} placeholder="Search student" />
                <div className="flex gap-2 text-xs">
                  <button type="button" className="font-semibold text-primary" onClick={() => setSelected(visibleStudents.map((s) => s.id))}>Select all</button>
                  <button type="button" className="font-semibold text-muted-foreground" onClick={() => setSelected([])}>Deselect all</button>
                </div>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{selected.length} selected · {batchStudents.length} enrolled</p>
              <div className="mt-3 max-h-80 space-y-1 overflow-y-auto">
                {visibleStudents.map((s) => (
                  <label key={s.id} className="flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selected.includes(s.id)}
                      onChange={() => {
                        if (assignMode === 'individual') setSelected([s.id]);
                        else setSelected((prev) => prev.includes(s.id) ? prev.filter((id) => id !== s.id) : [...prev, s.id]);
                      }}
                    />
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-xs text-muted-foreground">{s.email}</span>
                  </label>
                ))}
              </div>
            </>
          )}
          {assignMode === 'batch' && <p className="mt-4 text-sm text-muted-foreground">All {batchStudents.length} enrolled students in {batchName || 'this batch'} will receive the mock.</p>}
          {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
          <Button className="mt-5 w-full" disabled={busy} onClick={submit}>{busy ? 'Assigning…' : 'Assign mock'}</Button>
        </div>
      </div>
      {toast && <Toast message={toast} onClose={() => setToast('')} />}
    </>
  );
}
