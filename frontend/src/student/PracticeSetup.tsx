import { useEffect, useState } from 'react';
import { ArrowUpRight, BrainCircuit, Archive, Sparkles } from 'lucide-react';
import { Button, SectionTitle } from '@/components/ui-kit';
import LivePractice from '@/components/LivePractice';
import PracticeDesk from '@/practice/PracticeDesk';
import PracticeTestGallery from '@/student/PracticeTestGallery';
import {
  bookSeries,
  defaultTask,
  fetchPracticeHistory,
  isFullMock,
  loadPracticeBank,
  seriesList,
  uniqueBookCount,
  taskOptions,
  type BankItem,
  type PracticeHistoryRow,
  type PracticeSource,
} from '@/lib/practice-engine';

function Choice({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">{label}</label>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium ${value === option ? 'border-primary bg-teal-50 text-primary' : 'border-border bg-card text-muted-foreground hover:bg-muted'}`}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function PracticeSetup({ initialModule = 'Reading' }: { initialModule?: string }) {
  const [started, setStarted] = useState(false);
  const [mode, setMode] = useState('Practice mode');
  const [type, setType] = useState('Academic');
  const [module, setModule] = useState(initialModule);
  const [task, setTask] = useState('Full Mock');
  const [source, setSource] = useState<PracticeSource>('bank');
  const [selectedPrompt, setSelectedPrompt] = useState('');
  const [bankItems, setBankItems] = useState<BankItem[]>([]);
  const [bankNote, setBankNote] = useState('Loading live practice bank…');
  const [bankError, setBankError] = useState('');
  const [bankLoading, setBankLoading] = useState(true);
  const [history, setHistory] = useState<PracticeHistoryRow[]>([]);
  const [launchItem, setLaunchItem] = useState<BankItem | undefined>();
  const [series, setSeries] = useState('All');
  const [bookSort, setBookSort] = useState<'newest' | 'oldest'>('newest');
  const showGallery = source === 'bank';

  useEffect(() => {
    setModule(initialModule);
    setSelectedPrompt('');
    setLaunchItem(undefined);
    setSeries('All');
    setTask(['Reading', 'Listening', 'Writing'].includes(initialModule) ? 'Full Mock' : defaultTask(initialModule));
    setSource('bank');
    setStarted(false);
  }, [initialModule]);

  useEffect(() => {
    if (source !== 'bank') return;
    let cancelled = false;
    setBankLoading(true);
    setBankError('');
    setSelectedPrompt('');
    loadPracticeBank(module, type, showGallery ? 'Full Mock' : task)
      .then((data) => {
        if (cancelled) return;
        setBankItems(data.items);
        setBankNote(data.note);
        setBankLoading(false);
        if (data.items.length === 1) setSelectedPrompt(data.items[0].id);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setBankItems([]);
        setBankNote('');
        setBankError(e.message || 'Could not load the live practice bank. Start FastAPI on port 8000.');
        setBankLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [module, type, task, source]);

  useEffect(() => {
    fetchPracticeHistory(module).then(setHistory).catch(() => setHistory([]));
  }, [module, started]);

  const selectedItem = launchItem || bankItems.find((q) => q.id === selectedPrompt);
  const aiAllowed = module === 'Speaking';
  const canStart = (aiAllowed && source === 'ai') || Boolean(selectedItem);
  const seriesOptions = seriesList(bankItems);
  const galleryItems = series === 'All' ? bankItems : bankItems.filter((item) => bookSeries(item) === series);

  if (started && (source === 'ai' || selectedItem)) {
    return (
      <LivePractice
        module={module}
        type={type}
        task={task}
        mode={mode}
        source={source}
        item={selectedItem}
        onExit={() => {
          setStarted(false);
          setLaunchItem(undefined);
        }}
      />
    );
  }

  return (
    <PracticeDesk title={`${module} tests`}>
      <SectionTitle
        eyebrow="IELTS Practice"
        title={`${module} Test Collection`}
        description={`${module} practice tests, grouped by book. Open a book, then take a full test or one section.`}
      />
      <div className={`card p-6 sm:p-8 ${showGallery ? 'max-w-6xl' : 'max-w-4xl'}`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">Practice setup</div>
            <h2 className="mt-1 font-display text-xl font-bold">Set the conditions</h2>
          </div>
        </div>
        <div className="mt-7 space-y-6">
          <Choice label="Test type" options={['Academic', 'General Training']} value={type} onChange={setType} />
          {!showGallery && (
            <Choice
              label={module === 'Writing' ? 'Writing task' : module === 'Speaking' ? 'Speaking part' : module === 'Reading' ? 'Reading' : 'Listening'}
              options={taskOptions(module)}
              value={task}
              onChange={setTask}
            />
          )}
          {aiAllowed && (
          <div>
            <label className="mb-2 block text-sm font-semibold">Content source</label>
            <div className="grid sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSource('bank')}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left ${source === 'bank' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <Archive size={18} className={source === 'bank' ? 'text-primary' : 'text-muted-foreground'} />
                <span>
                  <span className="block text-sm font-bold">Question bank</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Published speaking prompts from the bank.</span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setSource('ai')}
                className={`flex items-start gap-3 rounded-xl border p-4 text-left ${source === 'ai' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
              >
                <BrainCircuit size={18} className={source === 'ai' ? 'text-primary' : 'text-muted-foreground'} />
                <span>
                  <span className="block text-sm font-bold">AI generate (random)</span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {isFullMock(task) ? 'AI creates a full speaking mock.' : 'AI creates a new speaking part for practice.'}
                  </span>
                </span>
              </button>
            </div>
          </div>
          )}
          <Choice label="Session mode" options={['Practice mode', 'Exam conditions']} value={mode} onChange={setMode} />

          {showGallery && seriesOptions.length > 0 && (
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
                {([
                  ['newest', 'Newest first'],
                  ['oldest', 'Oldest first'],
                ] as const).map(([value, label]) => (
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

          {source === 'bank' && showGallery && (
            <div className="mt-2 border-t border-border pt-6">
              {bankError && <p className="mb-3 text-sm text-red-700">{bankError}</p>}
              {bankLoading && <p className="text-sm text-muted-foreground">Loading tests…</p>}
              {!bankLoading && !bankError && (
                <PracticeTestGallery
                  module={module}
                  items={galleryItems}
                  history={history}
                  sort={bookSort}
                  seriesLabel={series}
                  onTakeTest={(item) => {
                    setLaunchItem({ ...item, passageId: undefined, partId: undefined });
                    setSelectedPrompt(item.id);
                    setTask('Full Mock');
                    setStarted(true);
                  }}
                  onPracticeSection={(item, sectionId, label) => {
                    setLaunchItem({
                      ...item,
                      passageId: item.passages?.length ? sectionId : undefined,
                      partId: item.parts?.length ? sectionId : undefined,
                    });
                    setSelectedPrompt(item.id);
                    setTask(label);
                    setStarted(true);
                  }}
                />
              )}
            </div>
          )}

          {source === 'bank' && !showGallery && (
            <div className="mt-2 border-t border-border pt-6">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-semibold">Select from bank</label>
                <span className="text-xs text-muted-foreground">{bankLoading ? 'Loading…' : `${bankItems.length} items`}</span>
              </div>
              {bankError && <p className="mb-3 text-sm text-red-700">{bankError}</p>}
              {!bankError && <p className="mb-3 text-xs text-muted-foreground">{bankNote}</p>}
              <div className="grid gap-2 max-h-[300px] overflow-y-auto pr-2">
                {bankItems.map((q) => (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setSelectedPrompt(q.id)}
                    className={`text-left p-4 rounded-xl border transition ${selectedPrompt === q.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border bg-card hover:border-primary/50'}`}
                  >
                    <div className="font-bold text-sm text-foreground mb-1">{q.title}</div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{q.detail}</p>
                  </button>
                ))}
                {!bankLoading && !bankError && bankItems.length === 0 && (
                  <p className="text-sm text-muted-foreground">No published items for this filter yet.</p>
                )}
              </div>
            </div>
          )}

          {source === 'ai' && (
            <div className="rounded-xl border border-sky-100 bg-sky-50/50 p-5">
              <div className="text-xs font-bold text-sky-800 flex items-center gap-1">
                <Sparkles size={14} /> Ready to generate {module} · {task}
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-800">
                Start will ask the AI for a new random {isFullMock(task) ? 'full mock' : 'task'}. When you submit, the same engine
                marks it and shows an estimated practice band — not an official IELTS score.
              </p>
            </div>
          )}
        </div>
        {!showGallery && (
          <Button className="mt-8 w-full sm:w-auto" disabled={!canStart} onClick={() => setStarted(true)}>
            {source === 'ai' ? 'Generate & start' : 'Start'} {isFullMock(task) ? 'full mock' : mode.toLowerCase()} <ArrowUpRight size={16} />
          </Button>
        )}
      </div>
    </PracticeDesk>
  );
}
