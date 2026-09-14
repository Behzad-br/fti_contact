import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { openLiveSession, type BankItem, type LiveSession, type PracticeSource } from '@/lib/practice-engine';
import WritingRoom from '@/practice/WritingRoom';
import ReadingRoom from '@/practice/ReadingRoom';
import ListeningRoom from '@/practice/ListeningRoom';
import SpeakingRoom from '@/practice/SpeakingRoom';

export default function LivePractice({
  module,
  type,
  task,
  mode,
  source = 'bank',
  item,
  onExit,
}: {
  module: string;
  type: string;
  task: string;
  mode: string;
  source?: PracticeSource;
  item?: BankItem;
  onExit: () => void;
}) {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setSession(null);
    setError('');
    openLiveSession({ module, type, task, mode, source, item })
      .then((s) => {
        if (!cancelled) setSession(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message || 'Could not start practice. Is the backend running on port 8000?');
      });
    return () => {
      cancelled = true;
    };
  }, [module, type, task, mode, source, item]);

  const listening = module.toLowerCase() === 'listening';
  const reading = module.toLowerCase() === 'reading';
  const writing = module.toLowerCase() === 'writing';
  const speaking = module.toLowerCase() === 'speaking';
  const exam = listening || reading || writing || speaking;

  return (
    <div className={exam ? 'h-dvh overflow-hidden' : 'space-y-4'}>
      {!exam && (
        <button
          onClick={onExit}
          className="flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={16} />
          Back to practice setup
        </button>
      )}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
      {!error && !session && (
        <div className={`flex min-h-[40vh] flex-col items-center justify-center gap-2 ${exam ? 'h-full text-slate-500' : 'text-muted-foreground'}`}>
          <p className="font-display text-lg font-bold text-foreground">
            {source === 'ai' ? 'AI is generating your practice…' : `Starting ${module} practice…`}
          </p>
          {listening && <p className="text-sm">Opening the recording and answer paper.</p>}
          {reading && <p className="text-sm">Opening the passage and questions.</p>}
          {writing && <p className="text-sm">Opening the writing paper.</p>}
          {speaking && <p className="text-sm">Opening the speaking room.</p>}
        </div>
      )}
      {session?.kind === 'writing-question' && <WritingRoom questionId={session.questionId} onDone={onExit} />}
      {session?.kind === 'writing-mock' && <WritingRoom mockId={session.mockId} onDone={onExit} />}
      {session?.kind === 'reading' && <ReadingRoom attemptId={session.attemptId} onExit={onExit} />}
      {session?.kind === 'listening' && <ListeningRoom attemptId={session.attemptId} onExit={onExit} />}
      {session?.kind === 'speaking' && <SpeakingRoom sessionId={session.sessionId} onExit={onExit} />}
    </div>
  );
}
