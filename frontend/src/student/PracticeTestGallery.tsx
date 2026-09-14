import { useEffect, useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { ProgressBar } from '@/components/ui-kit';
import { resultForTest, type BankItem, type PracticeHistoryRow } from '@/lib/practice-engine';

type BookGroup = {
  id: string;
  title: string;
  tests: BankItem[];
};

function bookNumber(title: string) {
  const match = title.match(/(\d+)/);
  return match ? Number(match[1]) : 0;
}

function groupBooks(items: BankItem[], sort: 'newest' | 'oldest'): BookGroup[] {
  const map = new Map<string, BookGroup>();
  items.forEach((item) => {
    const id = item.bookId || 'practice-pack';
    const title = item.bookTitle || 'Practice pack';
    const group = map.get(id) || { id, title, tests: [] };
    group.tests.push(item);
    map.set(id, group);
  });
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return Array.from(map.values())
    .map((book) => ({
      ...book,
      tests: [...book.tests].sort((a, b) => (a.testNumber || 0) - (b.testNumber || 0)),
    }))
    .sort((a, b) => {
      const na = bookNumber(a.title);
      const nb = bookNumber(b.title);
      if (na !== nb) return sort === 'newest' ? nb - na : na - nb;
      return sort === 'newest' ? collator.compare(b.title, a.title) : collator.compare(a.title, b.title);
    });
}

export default function PracticeTestGallery({
  module,
  items,
  history,
  sort = 'newest',
  seriesLabel,
  mode = 'practice',
  selectedTestId,
  selectedSectionId,
  onTakeTest,
  onPracticeSection,
}: {
  module: string;
  items: BankItem[];
  history: PracticeHistoryRow[];
  sort?: 'newest' | 'oldest';
  seriesLabel?: string;
  mode?: 'practice' | 'assign';
  selectedTestId?: string;
  selectedSectionId?: string | null;
  onTakeTest: (item: BankItem) => void;
  onPracticeSection: (item: BankItem, sectionId: string, label: string) => void;
}) {
  const [pick, setPick] = useState<BankItem | null>(null);
  const [bookId, setBookId] = useState<string | null>(null);
  const books = useMemo(() => groupBooks(items, sort), [items, sort]);
  const active = books.find((b) => b.id === bookId) || null;
  const assign = mode === 'assign';

  useEffect(() => {
    setBookId(null);
  }, [module, seriesLabel, sort]);

  const sections = (item: BankItem) => {
    if (item.passages?.length) {
      return item.passages.map((p, i) => ({ id: p.id, label: p.title || `Passage ${i + 1}` }));
    }
    if (item.parts?.length) {
      return item.parts.map((p, i) => ({ id: p.id, label: p.title || `Section ${p.part_number || i + 1}` }));
    }
    return [];
  };

  const bookProgress = (book: BookGroup) => {
    const scored = book.tests.filter((t) => resultForTest(module, t.id, history).label !== 'No result yet');
    return book.tests.length ? Math.round((scored.length / book.tests.length) * 100) : 0;
  };

  return (
    <>
      <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-foreground">
        {assign
          ? seriesLabel && seriesLabel !== 'All'
            ? `${seriesLabel}: ${books.length} book${books.length === 1 ? '' : 's'}. Open a book, then allot the full test or one section. You cannot solve these tests.`
            : 'Same books students use in IELTS Practice. Open a book, then allot a complete test or one section. Teachers cannot take the test.'
          : seriesLabel && seriesLabel !== 'All'
            ? `${seriesLabel}: ${books.length} book${books.length === 1 ? '' : 's'}. Open a book, then take a full test or one section.`
            : 'Pick a series above — Cambridge, IELTS Trainer, Collins, and the rest stay separate. Then open a book.'}
      </p>

      {!active && books.length === 0 && (
        <p className="text-sm text-muted-foreground">No books in this series.</p>
      )}

      {!active && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {books.map((book) => {
            const pct = bookProgress(book);
            return (
              <button
                key={book.id}
                type="button"
                onClick={() => setBookId(book.id)}
                className="flex flex-col rounded-xl border border-border bg-card p-5 text-left hover:border-primary/50"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen size={20} />
                </div>
                <h3 className="mt-4 font-display text-base font-bold leading-6 text-primary">{book.title}</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {book.tests.length} test{book.tests.length === 1 ? '' : 's'}
                </p>
                {!assign && (
                  <div className="mt-4">
                    <ProgressBar value={pct} />
                    <p className="mt-2 text-xs text-muted-foreground">{pct}% tests attempted</p>
                  </div>
                )}
                <span className="mt-4 text-sm font-bold text-primary">Open book</span>
              </button>
            );
          })}
        </div>
      )}

      {active && (
        <>
          <button
            type="button"
            className="mb-4 text-sm font-semibold text-primary hover:underline"
            onClick={() => setBookId(null)}
          >
            ← All books
          </button>
          <h3 className="mb-4 font-display text-lg font-bold">{active.title}</h3>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.tests.map((item) => {
              const result = resultForTest(module, item.id, history);
              const hasScore = result.label !== 'No result yet';
              const testLabel = `Test ${String(item.testNumber || active.tests.indexOf(item) + 1).padStart(2, '0')}`;
              const chosen = selectedTestId === item.id;
              const chosenFull = chosen && !selectedSectionId;
              return (
                <div key={item.id} className={`flex flex-col rounded-xl border bg-card p-5 ${chosen ? 'border-primary ring-1 ring-primary' : 'border-border'}`}>
                  <h3 className="font-display text-base font-bold leading-6 text-primary">{testLabel}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                  {chosen && (
                    <p className="mt-2 text-xs font-semibold text-primary">
                      {chosenFull ? 'Selected: complete test' : `Selected: ${sections(item).find((s) => s.id === selectedSectionId)?.label || 'section'}`}
                    </p>
                  )}
                  {!assign && (
                    <div className="mt-4">
                      <ProgressBar value={hasScore ? Math.min(100, ((result.band || 0) / 9) * 100) : 0} />
                      <p className={`mt-2 text-xs ${hasScore ? 'font-semibold text-emerald-700' : 'text-muted-foreground'}`}>{result.label}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => onTakeTest(item)}
                    className="mt-4 h-11 w-full rounded-lg bg-primary text-sm font-bold text-primary-foreground hover:opacity-95"
                  >
                    {assign ? 'Assign complete test' : 'Take Test'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const opts = sections(item);
                      if (opts.length) setPick(item);
                      else onTakeTest(item);
                    }}
                    className="mt-2 h-11 w-full rounded-lg bg-indigo-700 text-sm font-bold text-white hover:bg-indigo-800"
                  >
                    {assign ? 'Assign section' : 'Practice Section'}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}

      {pick && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center" onClick={() => setPick(null)}>
          <div className="card w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-display text-lg font-bold">{pick.title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {assign ? 'Pick one section to allot. The complete test stays on Assign complete test.' : 'Pick one section to practise. Full test stays on Take Test.'}
            </p>
            <div className="mt-4 grid gap-2">
              {sections(pick).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`rounded-lg border px-4 py-3 text-left text-sm font-semibold hover:border-primary hover:bg-primary/5 ${
                    selectedTestId === pick.id && selectedSectionId === s.id
                      ? 'border-primary bg-primary/5 text-primary'
                      : 'border-border'
                  }`}
                  onClick={() => {
                    onPracticeSection(pick, s.id, s.label);
                    setPick(null);
                  }}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <button type="button" className="mt-4 w-full text-sm font-semibold text-muted-foreground" onClick={() => setPick(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </>
  );
}
