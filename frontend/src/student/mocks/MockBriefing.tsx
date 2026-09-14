import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui-kit';
import { studentMockDetail, startMockAttempt } from '@/lib/mocks-api';

export default function MockBriefing({ assignmentId }: { assignmentId: string }) {
  const [, setLocation] = useLocation();
  const [item, setItem] = useState<any>(null);
  const [step, setStep] = useState<'brief' | 'check'>('brief');
  const [error, setError] = useState('');
  const [checks, setChecks] = useState({ net: false, share: false, full: false, audio: false });

  useEffect(() => {
    studentMockDetail(assignmentId).then(setItem).catch((e) => setError(e.message));
  }, [assignmentId]);

  useEffect(() => {
    if (step !== 'check') return;
    setChecks({
      net: navigator.onLine,
      share: typeof navigator.mediaDevices?.getDisplayMedia === 'function',
      full: typeof document.documentElement.requestFullscreen === 'function',
      audio: typeof navigator.mediaDevices?.getUserMedia === 'function',
    });
  }, [step]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!item) return <p className="text-sm text-muted-foreground">Loading mock…</p>;

  const enter = async () => {
    setError('');
    try {
      const started = await startMockAttempt(assignmentId, true);
      sessionStorage.setItem('mock-assignment-id', assignmentId);
      setLocation(`/student/mock-attempt/${started.attempt_id}?assignment=${assignmentId}`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (step === 'check') {
    const rows = [
      ['Internet', checks.net],
      ['Screen share support', checks.share],
      ['Fullscreen support', checks.full],
      ['Audio / microphone', checks.audio],
    ];
    return (
      <div className="mx-auto max-w-xl">
        <button type="button" className="mb-5 text-sm font-semibold text-muted-foreground" onClick={() => setStep('brief')}>Back</button>
        <h1 className="font-display text-2xl font-bold">System check</h1>
        <div className="mt-5 space-y-2">
          {rows.map(([label, ok]) => (
            <div key={String(label)} className="flex items-center justify-between rounded-lg border border-border px-4 py-3 text-sm">
              <span>{label}</span>
              <span className={ok ? 'font-semibold text-emerald-700' : 'font-semibold text-amber-700'}>{ok ? 'Ready' : 'Not available'}</span>
            </div>
          ))}
        </div>
        {item.screen_monitoring && (
          <p className="mt-4 text-xs text-muted-foreground">Screen capture starts only after you enter the mock and grant permission. It does not start on login.</p>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <Button className="mt-6 w-full" onClick={enter}>Enter mock</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <button type="button" className="mb-5 text-sm font-semibold text-muted-foreground" onClick={() => setLocation('/student/mocks')}>Back to mocks</button>
      <div className="card p-6 sm:p-8">
        <div className="eyebrow">Pre-exam</div>
        <h1 className="mt-2 font-display text-3xl font-bold">{item.title}</h1>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg bg-muted p-4 text-sm"><div className="text-muted-foreground">Duration</div><strong>{item.duration_minutes} minutes</strong></div>
          <div className="rounded-lg bg-muted p-4 text-sm"><div className="text-muted-foreground">Questions</div><strong>{item.question_count || '—'}</strong></div>
          <div className="rounded-lg bg-muted p-4 text-sm"><div className="text-muted-foreground">Attempts</div><strong>{item.attempts_allowed || 1}</strong></div>
          <div className="rounded-lg bg-muted p-4 text-sm"><div className="text-muted-foreground">Fullscreen</div><strong>{item.fullscreen_required ? 'Required' : 'Optional'}</strong></div>
        </div>
        {item.instructions && <p className="mt-5 text-sm leading-6">{item.instructions}</p>}
        {item.result_mode === 'ai' ? (
          <p className="mt-4 text-sm text-muted-foreground">AI check is on for this mock. After you submit, an estimated result appears automatically.</p>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Your teacher will check this mock and publish the result.</p>
        )}
        {item.screen_monitoring && (
          <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            This supervised mock requires screen sharing. Your screen will be visible to your teacher while the mock is active.
            Browser protections are monitoring and deterrence, not a full computer lockdown.
          </div>
        )}
        {item.inbox_status === 'upcoming' && <p className="mt-4 text-sm text-muted-foreground">This mock is not available yet.</p>}
        {item.inbox_status === 'results' && (
          <div className="mt-5 text-sm">
            <p>Listening {item.listening_band ?? '—'} · Reading {item.reading_band ?? '—'} · Writing {item.writing_band ?? '—'} · Speaking {item.speaking_band ?? '—'}</p>
            <p className="mt-2 font-display text-2xl font-bold">Overall {item.overall_band ?? '—'}</p>
            {item.writing_feedback && <p className="mt-3 text-muted-foreground">{item.writing_feedback}</p>}
          </div>
        )}
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        {(item.inbox_status === 'available' || item.inbox_status === 'in_progress') && (
          <Button className="mt-6" onClick={() => setStep('check')}>Continue to system check</Button>
        )}
      </div>
    </div>
  );
}
