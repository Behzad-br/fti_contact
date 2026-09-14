import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowLeft, ArrowUpRight, Users, Clock3 } from 'lucide-react';
import { Avatar, Badge, Button, SectionTitle, StatusBadge } from '@/components/ui-kit';
import { listSubmissions, listTeacherHomework, reviewSubmission, type HomeworkItem } from '@/lib/homework-api';

export default function ReviewQueueLive() {
  const [, setLocation] = useLocation();
  const [assignments, setAssignments] = useState<HomeworkItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [subs, setSubs] = useState<any[]>([]);
  const [band, setBand] = useState('6.5');
  const [comments, setComments] = useState('');
  const [reviewId, setReviewId] = useState<string | null>(null);

  useEffect(() => { listTeacherHomework().then(d => setAssignments(d.assignments)).catch(() => setAssignments([])); }, []);
  useEffect(() => {
    if (!selected) return;
    listSubmissions(selected).then(d => setSubs(d.submissions)).catch(() => setSubs([]));
  }, [selected]);

  if (reviewId) {
    return (
      <>
        <button onClick={() => setReviewId(null)} className="mb-5 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><ArrowLeft size={16}/> Back</button>
        <SectionTitle eyebrow="Teacher review" title="Publish feedback" description="Override the estimated band if needed, then publish to the student." />
        <div className="card max-w-xl space-y-4 p-6 mt-5">
          <label className="block text-sm font-semibold">Teacher band<input value={band} onChange={e=>setBand(e.target.value)} className="mt-2 h-11 w-full rounded-lg border border-input px-3 text-sm"/></label>
          <label className="block text-sm font-semibold">Comments<textarea value={comments} onChange={e=>setComments(e.target.value)} className="mt-2 min-h-[120px] w-full rounded-lg border border-input p-3 text-sm"/></label>
          <Button onClick={async () => { await reviewSubmission(reviewId, { teacher_band: Number(band), teacher_comments: comments, publish: true }); setReviewId(null); if (selected) listSubmissions(selected).then(d => setSubs(d.submissions)); }}>Publish review</Button>
        </div>
      </>
    );
  }

  if (selected) {
    return (
      <>
        <button onClick={() => setSelected(null)} className="mb-5 flex items-center gap-2 text-sm font-semibold text-muted-foreground"><ArrowLeft size={16}/> Back to assignments</button>
        <SectionTitle eyebrow="Submissions" title="Review queue" description="Student work for this homework."/>
        <div className="card overflow-hidden mt-5">
          <div className="bg-muted/60 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-muted-foreground grid grid-cols-[1.5fr_1fr] sm:grid-cols-[1fr_1fr_120px] gap-4">
            <span>Student</span><span className="hidden sm:block">Status</span><span className="text-right">Action</span>
          </div>
          {subs.map(s => (
            <div key={s.id} className="data-row grid grid-cols-[1.5fr_1fr] sm:grid-cols-[1fr_1fr_120px] items-center gap-4 p-4 sm:p-5">
              <div className="flex items-center gap-3"><Avatar initials={(s.student_id || 'ST').slice(0,2).toUpperCase()} size="sm"/><div><div className="text-sm font-bold">{s.student_id}</div><div className="text-xs text-muted-foreground">{s.estimated_band ? `AI ${s.estimated_band}` : '—'}</div></div></div>
              <div className="hidden sm:block"><StatusBadge status={s.status === 'submitted' ? 'Awaiting review' : s.status === 'published' ? 'Reviewed' : s.status}/></div>
              <div className="flex justify-end">{s.status !== 'pending' && s.status !== 'in_progress' && (
                <button onClick={() => { setReviewId(s.id); setBand(String(s.teacher_band || s.estimated_band || '6.5')); setComments(s.teacher_comments || ''); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-primary/10 text-primary hover:bg-primary hover:text-white transition font-semibold text-xs">Review <ArrowUpRight size={14}/></button>
              )}</div>
            </div>
          ))}
          {subs.length === 0 && <p className="p-6 text-sm text-muted-foreground">No submissions yet.</p>}
        </div>
      </>
    );
  }

  return (
    <>
      <SectionTitle eyebrow="Select an assignment" title="Review queue" description="Choose a homework assignment to review submissions."/>
      <div className="grid gap-4 md:grid-cols-2 mt-5">
        {assignments.map(a => (
          <button key={a.id} onClick={() => setSelected(a.id)} className="card p-5 text-left flex flex-col hover:-translate-y-0.5 hover:border-primary/40 transition">
            <div className="flex items-start justify-between"><Badge tone="amber">{a.module}</Badge><StatusBadge status="Active"/></div>
            <h2 className="mt-4 font-display text-lg font-bold">{a.title}</h2>
            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Users size={14}/> {a.batch_label}</span>
              <span className="flex items-center gap-1"><Clock3 size={14}/> {a.deadline ? new Date(a.deadline).toLocaleDateString() : 'No deadline'}</span>
            </div>
            <div className="mt-auto pt-5 border-t border-border mt-5 text-xs flex justify-between items-center">
              <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">{a.submitted || 0} / {a.assigned || 1} submitted</span>
              <span className="text-primary font-bold flex items-center gap-1">View submissions <ArrowUpRight size={14}/></span>
            </div>
          </button>
        ))}
        {assignments.length === 0 && <p className="text-sm text-muted-foreground">Assign homework first, then reviews appear here.</p>}
      </div>
    </>
  );
}
