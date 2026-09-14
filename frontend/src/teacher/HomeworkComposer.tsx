import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Archive, ArrowLeft, BookOpen, BrainCircuit, FileText, Headphones, Image, Paperclip, PencilLine, Plus, Sparkles, X } from 'lucide-react';
import { Button, SectionTitle, Toast } from '@/components/ui-kit';
import { listTeacherRoster } from '@/lib/mock-api';
import { createHomework, teacherPreview, uploadHomeworkAudio } from '@/lib/homework-api';
import PracticeTestGallery from '@/student/PracticeTestGallery';
import {
  bookSeries,
  loadPracticeBank,
  seriesList,
  uniqueBookCount,
  type BankItem,
} from '@/lib/practice-engine';

type BankPick = {
  item: BankItem;
  sectionId?: string;
  sectionLabel?: string;
};

function examTypeFromPaper(paper: string) {
  return paper.toLowerCase().includes('general') ? 'general_training' : 'academic';
}

function assignmentFromPick(moduleName: string, paperType: string, pick: BankPick) {
  const item = pick.item;
  const full = !pick.sectionId;
  const testType = examTypeFromPaper(paperType);
  const testNo = item.testNumber ? String(item.testNumber).padStart(2, '0') : '';
  const bookBit = [item.bookTitle, testNo ? `Test ${testNo}` : item.title].filter(Boolean).join(' · ');
  const payload: Record<string, unknown> = {
    test_type: testType,
    preview: full ? `${bookBit} · complete test` : `${bookBit} · ${pick.sectionLabel}`,
  };
  if (moduleName === 'Writing') {
    if (full) {
      payload.test_id = item.id;
      payload.task1_id = item.parts?.find((p) => p.part_number === 1)?.id;
      payload.task2_id = item.parts?.find((p) => p.part_number === 2)?.id;
    } else {
      payload.question_id = pick.sectionId;
    }
  } else if (moduleName === 'Reading') {
    payload.test_id = item.id;
    if (!full) payload.passage_id = pick.sectionId;
  } else if (moduleName === 'Listening') {
    payload.test_id = item.id;
    if (!full) payload.part_id = pick.sectionId;
  } else {
    payload.test_id = item.id;
  }
  return {
    payload,
    scope: full ? 'full_mock' : 'piece',
    task: full ? 'Full Mock' : pick.sectionLabel || 'Section',
    title: full ? bookBit || item.title : `${bookBit} · ${pick.sectionLabel}`,
  };
}

export default function HomeworkComposer() {
  const [, setLocation] = useLocation();
  const [moduleName, setModuleName] = useState('Writing');
  const [taskType, setTaskType] = useState('Task 2');
  const [paperType, setPaperType] = useState('Academic');
  const [method, setMethod] = useState<'ai'|'bank'|'manual'>('bank');
  const [manualPrompt, setManualPrompt] = useState('');
  const [manualQuestions, setManualQuestions] = useState<{id: number, type:string, text:string, options?:string[], answer?:string}[]>([]);
  const [targetBatch, setTargetBatch] = useState('Morning Batch A');
  const [assignmentTarget, setAssignmentTarget] = useState<'entire'|'specific'>('entire');
  const [selectedStudents, setSelectedStudents] = useState<string[]>([]);
  const [gradingMethod, setGradingMethod] = useState<'auto' | 'manual'>('manual');
  const [questionType, setQuestionType] = useState('Opinion Essay');
  const [readingPassage, setReadingPassage] = useState('');
  const [deadline, setDeadline] = useState('');
  const [aiPreview, setAiPreview] = useState('');
  const [aiPayload, setAiPayload] = useState<Record<string, unknown>>({});
  const [audioName, setAudioName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [bankItems, setBankItems] = useState<BankItem[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankError, setBankError] = useState('');
  const [series, setSeries] = useState('All');
  const [bookSort, setBookSort] = useState<'newest' | 'oldest'>('newest');
  const [pick, setPick] = useState<BankPick | null>(null);

  const getTaskOptions = (mod: string) => {
    if (mod === 'Writing') return ['Task 1 Academic', 'Task 1 General', 'Task 2', 'Full Mock'];
    if (mod === 'Speaking') return ['Part 1', 'Part 2', 'Part 3', 'Full Mock'];
    if (mod === 'Listening') return ['Section 1', 'Section 2', 'Section 3', 'Section 4', 'Full Mock'];
    if (mod === 'Reading') return ['Academic Passage 1', 'Academic Passage 2', 'Academic Passage 3', 'General Section 1', 'General Section 2', 'General Section 3', 'Full Mock'];
    return [];
  };
  const getQuestionTypeOptions = (mod: string, task: string) => {
    if (task === 'Full Mock') return ['Full test'];
    if (mod === 'Writing') {
      if (task === 'Task 1 Academic') return ['Bar Chart', 'Line Graph', 'Pie Chart', 'Table', 'Process Diagram', 'Map'];
      if (task === 'Task 1 General') return ['Formal Letter', 'Semi-formal Letter', 'Informal Letter'];
      return ['Opinion Essay', 'Discussion Essay', 'Problem/Solution', 'Advantages/Disadvantages', 'Two-part Question'];
    }
    if (mod === 'Speaking') {
       if (task.includes('Part 1')) return ['Familiar Topics (Family, Work, Hobbies)'];
       if (task.includes('Part 2')) return ['Describe a Person', 'Describe a Place', 'Describe an Object', 'Describe an Event'];
       return ['Abstract Discussion', 'Evaluating/Comparing', 'Predicting the Future'];
    }
    if (mod === 'Listening') return ['Multiple Choice', 'Matching', 'Map/Plan Labelling', 'Form/Note/Table Completion', 'Sentence/Summary Completion', 'Short-answer Questions'];
    if (mod === 'Reading') return ['Multiple Choice', 'True/False/Not Given', 'Yes/No/Not Given', 'Matching Headings', 'Matching Information', 'Matching Features', 'Matching Sentence Endings', 'Sentence/Summary Completion', 'Diagram Label Completion', 'Short-answer Questions'];
    return [];
  };
  const handleModuleChange = (mod: string) => {
    setModuleName(mod);
    const firstTask = getTaskOptions(mod)[0];
    setTaskType(firstTask);
    setQuestionType(getQuestionTypeOptions(mod, firstTask)[0]);
    setAiPreview('');
    setPick(null);
    setSeries('All');
    if (mod !== 'Speaking' && method === 'ai') setMethod('bank');
    if (mod === 'Reading' || mod === 'Writing') setPaperType('Academic');
  };
  const handleTaskChange = (task: string) => {
    setTaskType(task);
    setQuestionType(getQuestionTypeOptions(moduleName, task)[0]);
  };
  const batchStudents = listTeacherRoster().filter(s => s.batch === targetBatch);
  const toggleStudent = (id: string) => setSelectedStudents(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const showPaperType = moduleName === 'Reading' || moduleName === 'Writing';
  const seriesOptions = seriesList(bankItems);
  const galleryItems = series === 'All' ? bankItems : bankItems.filter((item) => bookSeries(item) === series);

  useEffect(() => {
    if (method !== 'bank') return;
    let cancelled = false;
    setBankLoading(true);
    setBankError('');
    setPick(null);
    loadPracticeBank(moduleName, paperType, 'Full Mock')
      .then((data) => {
        if (cancelled) return;
        setBankItems(data.items);
        setBankLoading(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setBankItems([]);
        setBankError(e.message || 'Could not load the practice books.');
        setBankLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [method, moduleName, paperType]);

  const generateAi = async () => {
    setBusy(true); setError(''); setAiPreview('');
    try {
      const data = await teacherPreview({ module: moduleName.toLowerCase(), scope: taskType === 'Full Mock' ? 'full_mock' : 'piece', task: taskType, question_type: questionType });
      setAiPreview(data.preview);
      setAiPayload(data.payload || {});
    } catch (e: any) {
      setError(e.message || 'AI generate failed');
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (method !== 'ai') return;
    setAiPreview('');
    setAiPayload({});
    generateAi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method, moduleName, taskType, questionType]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      if (method === 'bank' && !pick) {
        setError('Open a book and choose a complete test or one section to allot.');
        setBusy(false);
        return;
      }
      if (method === 'ai' && !aiPreview) {
        setError('Click Generate first, then assign.');
        setBusy(false);
        return;
      }
      if (method === 'manual' && moduleName === 'Writing' && !manualPrompt.trim()) {
        setError('Write a prompt before assigning.');
        setBusy(false);
        return;
      }
      let payload: Record<string, unknown> = { ...aiPayload };
      let scope = taskType === 'Full Mock' ? 'full_mock' : 'piece';
      let task = taskType;
      let title = aiPreview ? String(aiPreview).slice(0, 60) : `${moduleName} ${taskType}`;
      if (method === 'bank' && pick) {
        const mapped = assignmentFromPick(moduleName, paperType, pick);
        if (moduleName === 'Writing' && mapped.scope === 'full_mock' && (!mapped.payload.task1_id || !mapped.payload.task2_id)) {
          setError('This writing test is missing Task 1 or Task 2, so it cannot be allotted as a complete mock.');
          setBusy(false);
          return;
        }
        payload = mapped.payload;
        scope = mapped.scope;
        task = mapped.task;
        title = mapped.title;
      }
      if (method === 'manual') {
        payload.prompt = manualPrompt;
        payload.passage = readingPassage;
        payload.questions = manualQuestions;
        payload.audio_filename = audioName;
        payload.preview = manualPrompt || readingPassage || 'Manual assignment';
        title = `${moduleName} ${taskType}`;
      }
      if (method === 'ai') payload.preview = aiPreview;
      await createHomework({
        title,
        module: moduleName.toLowerCase(),
        scope,
        source: method,
        task,
        question_type: method === 'bank' ? (scope === 'full_mock' ? 'Full test' : task) : questionType,
        batch_label: targetBatch,
        assignment_target: assignmentTarget,
        student_ids: assignmentTarget === 'specific' ? selectedStudents.map(id => id === 's1' ? 'local' : id) : ['local'],
        deadline: deadline || undefined,
        ai_grading_enabled: gradingMethod === 'auto',
        payload,
      });
      setLocation('/teacher/homework');
    } catch (err: any) {
      setError(err.message || 'Could not assign homework');
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => setLocation('/teacher/homework')} className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
          <ArrowLeft size={16} /> Back to homework
        </button>
      </div>
      <SectionTitle eyebrow="Teacher Workspace" title="Homework Composer" description="Allot the same practice books students see — complete test or one section. Teachers cannot solve these tests." />
      <form onSubmit={handleAssign} className={`card p-6 sm:p-8 space-y-8 mt-5 ${method === 'bank' ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">1. Select Module</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {['Reading', 'Writing', 'Listening', 'Speaking'].map(mod => (
              <button type="button" key={mod} onClick={() => handleModuleChange(mod)} className={`flex flex-col items-center gap-2 rounded-xl border p-4 transition ${moduleName === mod ? 'border-primary bg-primary/5 text-primary' : 'border-border bg-card text-muted-foreground hover:border-primary/50'}`}>
                {mod === 'Writing' && <PencilLine size={24} />}
                {mod === 'Reading' && <BookOpen size={24} />}
                {mod === 'Listening' && <Headphones size={24} />}
                {mod === 'Speaking' && <Sparkles size={24} />}
                <span className="font-semibold text-sm">{mod}</span>
              </button>
            ))}
          </div>
        </div>
        {method === 'bank' && showPaperType && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">2. Academic or General Training</h3>
            <div className="flex flex-wrap gap-3">
              {['Academic', 'General Training'].map((paper) => (
                <button type="button" key={paper} onClick={() => { setPaperType(paper); setPick(null); setSeries('All'); }} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${paperType === paper ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-border'}`}>{paper}</button>
              ))}
            </div>
          </div>
        )}
        {method !== 'bank' && (
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">2. Select Task Type</h3>
            <div className="flex flex-wrap gap-3">
              {getTaskOptions(moduleName).map(task => (
                <button type="button" key={task} onClick={() => handleTaskChange(task)} className={`rounded-full px-5 py-2 text-sm font-semibold transition ${taskType === task ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-border'}`}>{task}</button>
              ))}
            </div>
            <div className="mt-5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Question Specifics</h3>
              <div className="flex flex-wrap gap-2">
                {getQuestionTypeOptions(moduleName, taskType).map(qt => (
                  <button type="button" key={qt} onClick={() => setQuestionType(qt)} className={`rounded-full px-4 py-1.5 text-xs font-semibold transition ${questionType === qt ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-transparent border border-border text-muted-foreground hover:bg-muted'}`}>{qt}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">{method === 'bank' ? (showPaperType ? '3. Content' : '2. Content') : '3. Content Creation'}</h3>
          {(moduleName === 'Listening' && method !== 'bank') && (
            <div className="mb-6 rounded-xl border border-dashed border-border p-6 text-center hover:bg-muted/30 transition">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary mb-3"><Paperclip size={24} /></div>
              <h4 className="text-sm font-bold">Upload Audio File</h4>
              <p className="mt-1 text-xs text-muted-foreground mb-4">MP3, WAV, or OGG up to 20MB {audioName && `· ${audioName}`}</p>
              <label className="btn-quiet inline-flex h-8 cursor-pointer items-center rounded-lg border border-border px-3 text-xs">
                Select File
                <input type="file" accept="audio/*" className="hidden" onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try { const up = await uploadHomeworkAudio(file); setAudioName(up.filename); } catch (err: any) { setError(err.message); }
                }}/>
              </label>
            </div>
          )}
          {(moduleName === 'Reading' && method !== 'bank') && (
            <div className="mb-6">
               <h4 className="text-sm font-bold mb-2">Reading Passage</h4>
               <textarea placeholder="Paste the reading passage text here..." value={readingPassage} onChange={e => setReadingPassage(e.target.value)} className="w-full min-h-[150px] rounded-lg border border-input bg-card p-4 text-sm leading-6 focus:ring-2 focus:ring-ring" />
            </div>
          )}
          <div className="flex border-b border-border mb-5">
            {[{ id: 'bank', label: 'Question Bank', icon: <Archive size={16} /> }, ...(moduleName === 'Speaking' ? [{ id: 'ai' as const, label: 'AI Suggestion', icon: <BrainCircuit size={16} /> }] : []), { id: 'manual', label: 'Manual Entry', icon: <FileText size={16} /> }].map(tab => (
              <button type="button" key={tab.id} onClick={() => setMethod(tab.id as 'ai'|'bank'|'manual')} className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition ${method === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>{tab.icon} {tab.label}</button>
            ))}
          </div>
          <div className={method === 'bank' ? '' : 'min-h-[150px]'}>
            {method === 'ai' && (
              <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-5">
                <div className="flex justify-between items-start mb-4 gap-3">
                  <div className="text-xs font-bold text-sky-800 flex items-center gap-1"><Sparkles size={14} /> AI Generated For {moduleName} - {taskType}{questionType ? ` · ${questionType}` : ''}</div>
                  <button type="button" onClick={generateAi} disabled={busy} className="text-xs font-semibold text-sky-700 hover:underline shrink-0">{busy ? 'Generating…' : 'Generate / Regenerate'}</button>
                </div>
                {busy && !aiPreview && <p className="text-sm text-sky-800">Creating a live IELTS-style suggestion for this module…</p>}
                <p className="text-sm leading-6 font-medium text-slate-800 whitespace-pre-wrap">{aiPreview}</p>
              </div>
            )}
            {method === 'bank' && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  These are the same books as student practice. Allot a complete test or one section. You cannot take the test from here — students solve it as homework.
                </p>
                {seriesOptions.length > 0 && (
                  <div>
                    <label className="mb-2 block text-sm font-semibold">Book series</label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setSeries('All')}
                        className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium ${series === 'All' ? 'border-primary bg-teal-50 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
                      >
                        All books ({uniqueBookCount(bankItems)})
                      </button>
                      {seriesOptions.map((option) => (
                        <button
                          key={option.label}
                          type="button"
                          onClick={() => setSeries(option.label)}
                          className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium ${series === option.label ? 'border-primary bg-teal-50 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
                        >
                          {option.label} ({option.count})
                        </button>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="self-center text-xs font-semibold text-muted-foreground">Sort</span>
                      {([['newest', 'Newest first'], ['oldest', 'Oldest first']] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setBookSort(value)}
                          className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium ${bookSort === value ? 'border-primary bg-teal-50 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {bankError && <p className="text-sm text-red-700">{bankError}</p>}
                {bankLoading && <p className="text-sm text-muted-foreground">Loading books…</p>}
                {!bankLoading && !bankError && (
                  <PracticeTestGallery
                    module={moduleName}
                    items={galleryItems}
                    history={[]}
                    sort={bookSort}
                    seriesLabel={series}
                    mode="assign"
                    selectedTestId={pick?.item.id}
                    selectedSectionId={pick?.sectionId || null}
                    onTakeTest={(item) => setPick({ item })}
                    onPracticeSection={(item, sectionId, label) => setPick({ item, sectionId, sectionLabel: label })}
                  />
                )}
                {pick && (
                  <div className="rounded-xl border border-primary bg-primary/5 p-4">
                    <div className="text-xs font-bold uppercase tracking-wider text-primary">Ready to allot</div>
                    <p className="mt-1 text-sm font-semibold">{pick.item.bookTitle || pick.item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {pick.item.testNumber ? `Test ${String(pick.item.testNumber).padStart(2, '0')}` : pick.item.title}
                      {pick.sectionLabel ? ` · ${pick.sectionLabel}` : ' · Complete test'}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Students will solve this from Homework. You cannot take it yourself.</p>
                  </div>
                )}
              </div>
            )}
            {method === 'manual' && (
              <div className="space-y-4">
                {moduleName === 'Writing' && taskType === 'Task 1 Academic' && (
                  <div className="rounded-lg border border-dashed border-border p-6 text-center hover:bg-muted/30 transition">
                    <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary mb-2"><Image size={20} /></div>
                    <h4 className="text-sm font-bold">Upload Graph/Chart Image</h4>
                    <Button type="button" variant="outline" className="text-xs h-8 mt-2">Select Image</Button>
                  </div>
                )}
                {(moduleName === 'Writing' || moduleName === 'Speaking') ? (
                  <textarea placeholder="Type or paste your prompt here..." value={manualPrompt} onChange={e => setManualPrompt(e.target.value)} className="w-full min-h-[150px] rounded-lg border border-input bg-card p-4 text-sm leading-6 focus:ring-2 focus:ring-ring" />
                ) : (
                  <div className="space-y-4">
                    <div className="flex gap-2 mb-3">
                      <Button type="button" variant="outline" className="text-xs" onClick={() => setManualQuestions([...manualQuestions, { id: Date.now(), type: 'Multiple Choice', text: '', options: ['','','',''], answer: '' }])}><Plus size={14}/> Add MCQ</Button>
                      <Button type="button" variant="outline" className="text-xs" onClick={() => setManualQuestions([...manualQuestions, { id: Date.now(), type: 'True/False/Not Given', text: '', answer: 'True' }])}><Plus size={14}/> Add T/F/NG</Button>
                      <Button type="button" variant="outline" className="text-xs" onClick={() => setManualQuestions([...manualQuestions, { id: Date.now(), type: 'Fill in the blanks', text: '', answer: '' }])}><Plus size={14}/> Add Fill in Blanks</Button>
                    </div>
                    {manualQuestions.length === 0 && <div className="text-center p-8 border border-dashed border-border rounded-lg text-muted-foreground text-sm">No questions added yet. Use the buttons above to build your question set.</div>}
                    {manualQuestions.map((q, index) => (
                      <div key={q.id} className="p-4 border border-border rounded-lg bg-muted/20 relative">
                        <button type="button" onClick={() => setManualQuestions(manualQuestions.filter(mq => mq.id !== q.id))} className="absolute top-3 right-3 text-muted-foreground hover:text-red-500"><X size={16}/></button>
                        <div className="text-xs font-bold text-primary mb-3">Question {index + 1}: {q.type}</div>
                        <input type="text" placeholder="Question text..." className="w-full rounded border-input bg-card px-3 py-2 text-sm mb-3" value={q.text} onChange={e => { const newQ = [...manualQuestions]; newQ[index].text = e.target.value; setManualQuestions(newQ); }}/>
                        {q.type === 'Multiple Choice' && q.options && (
                          <div className="space-y-2 mb-3 pl-4">
                            {q.options.map((opt, oIndex) => (
                              <div key={oIndex} className="flex gap-2 items-center">
                                <span className="text-xs font-semibold text-muted-foreground w-4">{String.fromCharCode(65 + oIndex)}.</span>
                                <input type="text" placeholder={`Option ${oIndex + 1}`} className="flex-1 rounded border-input bg-card px-3 py-1.5 text-sm" value={opt} onChange={e => { const newQ = [...manualQuestions]; newQ[index].options![oIndex] = e.target.value; setManualQuestions(newQ); }}/>
                              </div>
                            ))}
                          </div>
                        )}
                        {q.type === 'True/False/Not Given' && (
                          <div className="flex gap-3 mb-3">
                            {['True', 'False', 'Not Given'].map(val => (
                              <label key={val} className="text-sm flex items-center gap-1 cursor-pointer">
                                <input type="radio" name={`q-${q.id}`} checked={q.answer === val} onChange={() => { const newQ = [...manualQuestions]; newQ[index].answer = val; setManualQuestions(newQ); }}/> {val}
                              </label>
                            ))}
                          </div>
                        )}
                        {(q.type === 'Multiple Choice' || q.type === 'Fill in the blanks') && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">Correct Answer:</span>
                            <input type="text" placeholder="Answer..." className="flex-1 rounded border-input bg-card px-3 py-1.5 text-sm" value={q.answer} onChange={e => { const newQ = [...manualQuestions]; newQ[index].answer = e.target.value; setManualQuestions(newQ); }}/>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="border-t border-border pt-6 mb-6">
          <label className="block text-sm font-semibold mb-3">Grading Method</label>
          <div className="grid sm:grid-cols-2 gap-4">
            <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition ${gradingMethod === 'auto' ? 'border-sky-500 bg-sky-50' : 'border-border bg-card hover:border-primary/50'}`}>
              <input type="radio" className="mt-1" checked={gradingMethod === 'auto'} onChange={() => setGradingMethod('auto')} />
              <div><div className="text-sm font-bold text-foreground">Auto-grade with AI</div><div className="text-xs text-muted-foreground mt-1">Students get instant AI feedback upon submission. You can review and override the final grade later.</div></div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-xl border cursor-pointer transition ${gradingMethod === 'manual' ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'}`}>
              <input type="radio" className="mt-1" checked={gradingMethod === 'manual'} onChange={() => setGradingMethod('manual')} />
              <div><div className="text-sm font-bold text-foreground">Manual Teacher Review</div><div className="text-xs text-muted-foreground mt-1">Students wait for your review. You can still use AI assistance while grading in the review queue.</div></div>
            </label>
          </div>
        </div>
        <div className="border-t border-border pt-6 grid sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm font-semibold">Target Batch
              <select value={targetBatch} onChange={(e) => { setTargetBatch(e.target.value); setSelectedStudents([]); }} className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm">
                <option value="Morning Batch A">Morning Batch A</option>
                <option value="Morning Batch B">Morning Batch B</option>
                <option value="Evening Batch A">Evening Batch A</option>
              </select>
            </label>
            <div className="mt-4 flex gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={assignmentTarget === 'entire'} onChange={() => setAssignmentTarget('entire')} className="accent-primary" /> Entire Batch</label>
              <label className="flex items-center gap-2 text-sm"><input type="radio" checked={assignmentTarget === 'specific'} onChange={() => setAssignmentTarget('specific')} className="accent-primary" /> Specific Students</label>
            </div>
            {assignmentTarget === 'specific' && (
              <div className="mt-3 max-h-[150px] overflow-y-auto rounded-lg border border-border p-3 bg-muted/30">
                {batchStudents.map(s => (
                  <label key={s.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded text-sm cursor-pointer">
                    <input type="checkbox" checked={selectedStudents.includes(s.id)} onChange={() => toggleStudent(s.id)} className="rounded border-input accent-primary h-4 w-4" />
                    <span>{s.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <label className="block text-sm font-semibold">Deadline
            <input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input bg-card px-3 text-sm" />
          </label>
        </div>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <Button type="submit" className="w-full sm:w-auto px-8" disabled={busy}>{busy ? 'Assigning…' : 'Assign Homework'}</Button>
      </form>
      {toast && <Toast message={toast} onClose={()=>setToast('')}/>}
    </>
  );
}
