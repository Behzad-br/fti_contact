import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Avatar, Badge, Button, Crumb, StatusBadge } from '@/components/ui-kit';
import { completeHomework, startHomework, studentHomeworkDetail, type HomeworkItem } from '@/lib/homework-api';
import WritingRoom from '@/practice/WritingRoom';
import ReadingRoom from '@/practice/ReadingRoom';
import ListeningRoom from '@/practice/ListeningRoom';
import SpeakingRoom from '@/practice/SpeakingRoom';

export default function HomeworkDo({ assignmentId, mode }: { assignmentId: string; mode: 'detail' | 'do' }) {
  const [, setLocation] = useLocation();
  const [item, setItem] = useState<(HomeworkItem & { payload?: any }) | null>(null);
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    studentHomeworkDetail(assignmentId).then(setItem).catch(e => setError(e.message));
  }, [assignmentId]);

  useEffect(() => {
    if (mode === 'do' && assignmentId) {
      startHomework(assignmentId).then(setSession).catch(e => setError(e.message));
    }
  }, [mode, assignmentId]);

  const begin = async () => {
    setError('');
    try {
      const started = await startHomework(assignmentId);
      setSession(started);
      setLocation(`/student/homework/${assignmentId}/do`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const finish = async () => {
    if (session?.submission_id) await completeHomework(session.submission_id, { attempt_ref: session.ref });
    setLocation('/student/homework');
  };

  if (error && !item) return <p className="text-sm text-red-700">{error}</p>;
  if (!item) return <p className="text-sm text-muted-foreground">Loading homework…</p>;

  if (mode === 'do' || session) {
    const back = () => setLocation(`/student/homework/${assignmentId}`);
    return (
      <div className="h-dvh overflow-hidden bg-white">
        {error && <p className="bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>}
        {!session && <div className="p-8"><Button onClick={begin}>Continue</Button></div>}
        {session?.kind === 'writing-question' && <WritingRoom questionId={session.questionId} onDone={finish} />}
        {session?.kind === 'writing-mock' && <WritingRoom mockId={session.mockId} onDone={finish} />}
        {session?.kind === 'reading' && (
          <ReadingRoom
            attemptId={session.attemptId}
            onExit={back}
            onSubmitted={() => {
              if (session.submission_id) void completeHomework(session.submission_id, { attempt_ref: session.ref });
            }}
          />
        )}
        {session?.kind === 'listening' && <ListeningRoom attemptId={session.attemptId} onExit={back} />}
        {session?.kind === 'speaking' && (
          <>
            <SpeakingRoom sessionId={session.sessionId} onExit={back} />
            <div className="fixed bottom-4 right-4 z-50">
              <Button onClick={finish}>Mark submitted for teacher review</Button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <>
      <Crumb text={`Homework · ${item.module}`}/>
      <div className="mx-auto max-w-4xl">
        <button onClick={()=>setLocation('/student/homework')} className="mb-6 flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground"><ArrowLeft size={16}/>Back to homework</button>
        <div className="card overflow-hidden">
          <div className="border-b border-border bg-[hsl(var(--sidebar))] p-6 text-white sm:p-9">
            <div className="flex flex-wrap items-center gap-2"><Badge tone="amber">{item.module} · {item.task_label}</Badge></div>
            <h1 className="mt-5 max-w-2xl font-display text-3xl font-bold tracking-tight sm:text-4xl">{item.title}</h1>
            <div className="mt-5 flex items-center gap-3 text-sm text-white/65"><Avatar initials="NR" size="sm" tone="amber"/><span>Assigned by <strong className="text-white">Nadia Rahman</strong> · {item.batch_label}</span></div>
          </div>
          <div className="p-6 sm:p-9">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">Deadline</div><div className="mt-1 text-sm font-bold">{item.deadline ? new Date(item.deadline).toLocaleString() : 'Open'}</div></div>
              <div className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">Source</div><div className="mt-1 text-sm font-bold">{item.source} · {item.scope}</div></div>
              <div className="rounded-lg bg-muted p-4"><div className="text-xs text-muted-foreground">Status</div><div className="mt-2"><StatusBadge status={(item.status as any) || 'Pending'}/></div></div>
            </div>
            <div className="mt-8"><div className="eyebrow">Your task</div><blockquote className="mt-3 border-l-2 border-amber-400 pl-5 text-base font-medium leading-8">{item.preview}</blockquote></div>
            {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
            <div className="mt-8 flex justify-end"><Button onClick={begin} className="sm:px-7">Start homework <ArrowUpRight size={16}/></Button></div>
          </div>
        </div>
      </div>
    </>
  );
}
