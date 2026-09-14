import { useRef, useState } from 'react';
import { ImagePlus, Plus, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui-kit';
import { uploadMockImage } from '@/lib/mocks-api';

export type ManualParagraph = {
  id: number;
  label: string;
  heading: string;
  text: string;
};

export type ManualQuestion = {
  id: number;
  type: string;
  instruction: string;
  text: string;
  options?: string[];
  answer?: string;
  visual_asset?: string;
  word_limit?: number;
};

export type ManualPassage = {
  id: number;
  title: string;
  paragraphs: ManualParagraph[];
  images: string[];
};

const Q_TYPES = [
  { id: 'Multiple Choice', needsOptions: true },
  { id: 'True/False/Not Given', needsOptions: false },
  { id: 'Yes/No/Not Given', needsOptions: false },
  { id: 'Matching Headings', needsOptions: true },
  { id: 'Matching Information', needsOptions: true },
  { id: 'Matching Features', needsOptions: true },
  { id: 'Matching Sentence Endings', needsOptions: true },
  { id: 'Sentence Completion', needsOptions: false },
  { id: 'Summary / Note / Table / Flow-chart', needsOptions: false },
  { id: 'Diagram Label Completion', needsOptions: false },
  { id: 'Short Answer', needsOptions: false },
] as const;

function paraLabel(index: number) {
  return String.fromCharCode(65 + index);
}

export function emptyPassage(index = 0): ManualPassage {
  return {
    id: Date.now() + index,
    title: `Reading Passage ${index + 1}`,
    paragraphs: [{ id: Date.now() + 1, label: 'A', heading: '', text: '' }],
    images: [],
  };
}

export function emptyQuestion(type = 'Multiple Choice'): ManualQuestion {
  const meta = Q_TYPES.find((row) => row.id === type) || Q_TYPES[0];
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    type,
    instruction: '',
    text: '',
    options: meta.needsOptions ? ['', '', '', ''] : undefined,
    answer: type.includes('True/False') ? 'True' : type.includes('Yes/No') ? 'Yes' : '',
  };
}

type Props = {
  passages: ManualPassage[];
  questions: ManualQuestion[];
  onPassages: (next: ManualPassage[]) => void;
  onQuestions: (next: ManualQuestion[]) => void;
};

export default function ManualReadingBuilder({ passages, questions, onPassages, onQuestions }: Props) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const questionImageRef = useRef<HTMLInputElement>(null);
  const [imageTarget, setImageTarget] = useState<{ kind: 'passage' | 'question'; id: number } | null>(null);

  const updatePassage = (id: number, patch: Partial<ManualPassage>) => {
    onPassages(passages.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const updateParagraph = (passageId: number, paraId: number, patch: Partial<ManualParagraph>) => {
    onPassages(
      passages.map((passage) => {
        if (passage.id !== passageId) return passage;
        return {
          ...passage,
          paragraphs: passage.paragraphs.map((para) => (para.id === paraId ? { ...para, ...patch } : para)),
        };
      }),
    );
  };

  const addParagraph = (passageId: number) => {
    onPassages(
      passages.map((passage) => {
        if (passage.id !== passageId) return passage;
        const label = paraLabel(passage.paragraphs.length);
        return {
          ...passage,
          paragraphs: [...passage.paragraphs, { id: Date.now(), label, heading: '', text: '' }],
        };
      }),
    );
  };

  const removeParagraph = (passageId: number, paraId: number) => {
    onPassages(
      passages.map((passage) => {
        if (passage.id !== passageId) return passage;
        const next = passage.paragraphs.filter((para) => para.id !== paraId);
        return {
          ...passage,
          paragraphs: next.map((para, index) => ({ ...para, label: para.label || paraLabel(index) })),
        };
      }),
    );
  };

  const splitFromPaste = (passageId: number, raw: string) => {
    const chunks = raw
      .split(/\n\s*\n/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
    if (chunks.length <= 1) {
      updatePassage(passageId, {
        paragraphs: [{ id: Date.now(), label: 'A', heading: '', text: raw }],
      });
      return;
    }
    updatePassage(passageId, {
      paragraphs: chunks.map((text, index) => ({
        id: Date.now() + index,
        label: paraLabel(index),
        heading: '',
        text,
      })),
    });
  };

  const pickImage = (kind: 'passage' | 'question', id: number) => {
    setImageTarget({ kind, id });
    setUploadError('');
    if (kind === 'passage') fileRef.current?.click();
    else questionImageRef.current?.click();
  };

  const onFile = async (file: File | undefined, kind: 'passage' | 'question') => {
    if (!file || !imageTarget) return;
    setUploading(true);
    setUploadError('');
    try {
      const up = await uploadMockImage(file);
      if (kind === 'passage') {
        onPassages(
          passages.map((passage) =>
            passage.id === imageTarget.id ? { ...passage, images: [...passage.images, up.url] } : passage,
          ),
        );
      } else {
        onQuestions(questions.map((q) => (q.id === imageTarget.id ? { ...q, visual_asset: up.url } : q)));
      }
    } catch (err: any) {
      setUploadError(err.message || 'Image upload failed.');
    } finally {
      setUploading(false);
      setImageTarget(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-xs leading-5 text-amber-950">
        Real IELTS Academic Reading uses up to <strong>3 passages</strong> (about 20 minutes each), labelled paragraphs (A, B, C…),
        and may include <strong>diagrams / graphs / illustrations</strong>. Build the paper the same way — then add official-style questions.
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0], 'passage')}
      />
      <input
        ref={questionImageRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        className="hidden"
        onChange={(e) => void onFile(e.target.files?.[0], 'question')}
      />

      {passages.map((passage, pIndex) => (
        <div key={passage.id} className="space-y-3 rounded-xl border border-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Passage {pIndex + 1}</div>
            {passages.length > 1 && (
              <button
                type="button"
                className="text-xs font-semibold text-red-600"
                onClick={() => onPassages(passages.filter((row) => row.id !== passage.id))}
              >
                Remove passage
              </button>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold">Passage title</label>
            <input
              className="h-10 w-full rounded-lg border border-input bg-card px-3 text-sm"
              value={passage.title}
              onChange={(e) => updatePassage(passage.id, { title: e.target.value })}
              placeholder="e.g. The History of Tea"
            />
          </div>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold">Paragraphs (A, B, C…)</label>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="quiet" onClick={() => addParagraph(passage.id)}>
                  <Plus size={14} /> Add paragraph
                </Button>
              </div>
            </div>
            <textarea
              className="min-h-20 w-full rounded-lg border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground"
              placeholder="Optional: paste a full passage here, then click “Split into paragraphs” (blank line = new paragraph)."
              onBlur={(e) => {
                if (e.target.value.trim()) splitFromPaste(passage.id, e.target.value);
                e.target.value = '';
              }}
            />
            <p className="text-[11px] text-muted-foreground">Tip: leave a blank line between paragraphs when pasting, then click outside the box to split.</p>
            {passage.paragraphs.map((para, index) => (
              <div key={para.id} className="rounded-lg border border-border p-3">
                <div className="mb-2 flex items-center gap-2">
                  <input
                    className="h-9 w-14 rounded-lg border border-input px-2 text-center text-sm font-bold"
                    value={para.label}
                    onChange={(e) => updateParagraph(passage.id, para.id, { label: e.target.value })}
                    aria-label="Paragraph label"
                  />
                  <input
                    className="h-9 flex-1 rounded-lg border border-input px-3 text-sm"
                    placeholder="Optional paragraph heading"
                    value={para.heading}
                    onChange={(e) => updateParagraph(passage.id, para.id, { heading: e.target.value })}
                  />
                  {passage.paragraphs.length > 1 && (
                    <button type="button" className="text-muted-foreground hover:text-red-600" onClick={() => removeParagraph(passage.id, para.id)} aria-label="Remove paragraph">
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>
                <textarea
                  className="min-h-28 w-full rounded-lg border border-input bg-card p-3 text-sm leading-6"
                  placeholder={`Paragraph ${para.label || index + 1} text…`}
                  value={para.text}
                  onChange={(e) => updateParagraph(passage.id, para.id, { text: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold">Diagrams / graphs / illustrations</label>
              <Button type="button" variant="quiet" disabled={uploading} onClick={() => pickImage('passage', passage.id)}>
                <ImagePlus size={14} /> {uploading ? 'Uploading…' : 'Add image'}
              </Button>
            </div>
            {passage.images.length === 0 && (
              <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
                Add charts, maps, or diagrams that belong with this passage (common in Academic Reading).
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {passage.images.map((src) => (
                <div key={src} className="relative overflow-hidden rounded-lg border border-border bg-white p-2">
                  <img src={src} alt="" className="max-h-40 w-full object-contain" />
                  <button
                    type="button"
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-muted-foreground shadow hover:text-red-600"
                    onClick={() => updatePassage(passage.id, { images: passage.images.filter((row) => row !== src) })}
                    aria-label="Remove image"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      ))}

      {passages.length < 3 && (
        <Button type="button" variant="quiet" onClick={() => onPassages([...passages, emptyPassage(passages.length)])}>
          <Plus size={14} /> Add another passage
        </Button>
      )}

      <div className="space-y-2">
        <div className="text-sm font-semibold">Questions</div>
        <p className="text-xs text-muted-foreground">Use IELTS task types. For Matching / MCQ, fill the option list and put the correct letter (A, B, C…) in the answer key.</p>
        <div className="flex flex-wrap gap-2">
          {Q_TYPES.map((row) => (
            <Button key={row.id} type="button" variant="quiet" onClick={() => onQuestions([...questions, emptyQuestion(row.id)])}>
              <Plus size={14} /> {row.id.replace(' / Note / Table / Flow-chart', '')}
            </Button>
          ))}
        </div>
        {questions.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Add questions with answer keys so AI / auto-check can score them.
          </p>
        )}
        {questions.map((q, index) => {
          const needsOptions = Boolean(Q_TYPES.find((row) => row.id === q.type)?.needsOptions);
          return (
            <div key={q.id} className="relative rounded-lg border border-border p-3">
              <button
                type="button"
                className="absolute right-2 top-2 text-muted-foreground hover:text-red-600"
                onClick={() => onQuestions(questions.filter((row) => row.id !== q.id))}
                aria-label="Remove question"
              >
                <X size={16} />
              </button>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Q{index + 1} · {q.type}
              </div>
              <input
                className="mb-2 h-10 w-full rounded-lg border border-input px-3 text-sm"
                placeholder="Instruction (e.g. Choose TRUE if the statement agrees with the information…)"
                value={q.instruction}
                onChange={(e) => onQuestions(questions.map((row) => (row.id === q.id ? { ...row, instruction: e.target.value } : row)))}
              />
              <input
                className="mb-2 h-10 w-full rounded-lg border border-input px-3 text-sm"
                placeholder="Question / statement / stem"
                value={q.text}
                onChange={(e) => onQuestions(questions.map((row) => (row.id === q.id ? { ...row, text: e.target.value } : row)))}
              />
              {(q.type.includes('Diagram') || q.visual_asset) && (
                <div className="mb-2">
                  <Button type="button" variant="quiet" disabled={uploading} onClick={() => pickImage('question', q.id)}>
                    <ImagePlus size={14} /> {q.visual_asset ? 'Replace diagram' : 'Add diagram for labels'}
                  </Button>
                  {q.visual_asset && (
                    <div className="relative mt-2 max-w-sm overflow-hidden rounded-lg border border-border bg-white p-2">
                      <img src={q.visual_asset} alt="" className="max-h-36 w-full object-contain" />
                      <button
                        type="button"
                        className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow"
                        onClick={() => onQuestions(questions.map((row) => (row.id === q.id ? { ...row, visual_asset: undefined } : row)))}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}
              {needsOptions &&
                (q.options || []).map((opt, oi) => (
                  <input
                    key={oi}
                    className="mb-1 h-9 w-full rounded-lg border border-input px-3 text-sm"
                    placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                    value={opt}
                    onChange={(e) =>
                      onQuestions(
                        questions.map((row) => {
                          if (row.id !== q.id) return row;
                          const options = [...(row.options || ['', '', '', ''])];
                          options[oi] = e.target.value;
                          return { ...row, options };
                        }),
                      )
                    }
                  />
                ))}
              {needsOptions && (
                <button
                  type="button"
                  className="mb-2 text-xs font-semibold text-primary"
                  onClick={() =>
                    onQuestions(
                      questions.map((row) => (row.id === q.id ? { ...row, options: [...(row.options || []), ''] } : row)),
                    )
                  }
                >
                  + Add option
                </button>
              )}
              {q.type.includes('True/False') ? (
                <select
                  className="mt-1 h-9 rounded-lg border border-input px-2 text-sm"
                  value={q.answer || 'True'}
                  onChange={(e) => onQuestions(questions.map((row) => (row.id === q.id ? { ...row, answer: e.target.value } : row)))}
                >
                  {['True', 'False', 'Not Given'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : q.type.includes('Yes/No') ? (
                <select
                  className="mt-1 h-9 rounded-lg border border-input px-2 text-sm"
                  value={q.answer || 'Yes'}
                  onChange={(e) => onQuestions(questions.map((row) => (row.id === q.id ? { ...row, answer: e.target.value } : row)))}
                >
                  {['Yes', 'No', 'Not Given'].map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="mt-1 h-9 w-full rounded-lg border border-input px-3 text-sm"
                  placeholder={needsOptions ? 'Correct answer (A / B / C…)' : 'Correct answer (exact wording)'}
                  value={q.answer || ''}
                  onChange={(e) => onQuestions(questions.map((row) => (row.id === q.id ? { ...row, answer: e.target.value } : row)))}
                />
              )}
            </div>
          );
        })}
      </div>
      {uploadError && <p className="text-sm text-red-700">{uploadError}</p>}
    </div>
  );
}
