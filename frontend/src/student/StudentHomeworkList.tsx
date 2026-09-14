import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpRight, CalendarDays, Clock3, Plus } from 'lucide-react';
import { Badge, Button, EmptyState, SectionTitle, StatusBadge } from '@/components/ui-kit';
import { studentHomework, type HomeworkItem } from '@/lib/homework-api';

export default function StudentHomeworkList() {
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState('All');
  const [rows, setRows] = useState<HomeworkItem[]>([]);
  useEffect(() => { studentHomework().then(d => setRows(d.assignments)).catch(() => setRows([])); }, []);
  const visible = rows.filter(a => tab === 'All' || a.status === tab);
  return (
    <>
      <SectionTitle eyebrow="Student workspace" title="Homework" description="Assignments from your teacher across Writing, Reading, Speaking and Listening." action={<Button onClick={()=>setLocation('/student/practice')}><Plus size={16}/>Practice instead</Button>}/>
      <div className="mb-5 flex gap-2 overflow-x-auto">{(['All','Pending','In progress','Completed'] as const).map(t=><button key={t} onClick={()=>setTab(t)} className={`rounded-full px-4 py-2 text-xs font-bold ${tab===t?'bg-primary text-primary-foreground':'bg-muted text-muted-foreground hover:bg-border'}`}>{t} <span className="ml-1 opacity-60">{t==='All'?rows.length:rows.filter(a=>a.status===t).length}</span></button>)}</div>
      <div className="grid gap-4 lg:grid-cols-2">{visible.map(a=>(
        <button key={a.id} onClick={()=>setLocation(`/student/homework/${a.id}`)} className="card group p-5 text-left transition hover:-translate-y-0.5 hover:border-primary/40">
          <div className="flex items-start justify-between"><Badge tone="amber">{a.module} · {a.task_label || a.scope}</Badge><StatusBadge status={(a.status as any) || 'Pending'}/></div>
          <h2 className="mt-4 font-display text-lg font-bold">{a.title}</h2>
          <p className="mt-2 line-clamp-2 text-sm leading-6 text-muted-foreground">{a.preview}</p>
          <div className="mt-5 flex flex-wrap items-center gap-4 border-t border-border pt-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><CalendarDays size={14}/>{a.deadline ? new Date(a.deadline).toLocaleDateString() : 'No deadline'}</span>
            <span className="flex items-center gap-1.5"><Clock3 size={14}/>{a.source}</span>
            <ArrowUpRight size={15} className="ml-auto text-primary"/>
          </div>
        </button>
      ))}</div>
      {visible.length===0 && <EmptyState title="No assignments here" text="This view is clear for now. Check another status or start a practice session."/>}
    </>
  );
}
