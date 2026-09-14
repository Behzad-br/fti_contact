import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Clock3, PencilLine, Trash2, Users } from 'lucide-react';
import { Badge, StatusBadge } from '@/components/ui-kit';
import { deleteHomework, listTeacherHomework, type HomeworkItem } from '@/lib/homework-api';

export default function HomeworkTeacherList({ onToast }: { onToast: (s: string) => void }) {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<HomeworkItem[]>([]);

  const load = () => listTeacherHomework().then(d => setRows(d.assignments)).catch(() => setRows([]));
  useEffect(() => { load(); }, []);

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {rows.map((a) => (
        <div key={a.id} className="card p-5 flex flex-col">
          <div className="flex items-start justify-between">
            <Badge tone="amber">{a.module} · {a.task_label || a.scope}</Badge>
            <StatusBadge status="Active"/>
          </div>
          <h2 className="mt-4 font-display text-lg font-bold">{a.title}</h2>
          <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Users size={14}/> {a.batch_label || 'Batch'}</span>
            <span className="flex items-center gap-1"><Clock3 size={14}/> {a.deadline ? new Date(a.deadline).toLocaleString() : 'No deadline'}</span>
          </div>
          <div className="mt-auto pt-5">
            <div className="flex items-center justify-between border-t border-border pt-4 text-xs">
              <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-1 rounded-md">{a.submitted || 0} / {a.assigned || 1} submitted</span>
              <div className="flex gap-2">
                <button onClick={() => setLocation('/teacher/reviews')} className="flex items-center gap-1 px-3 py-1.5 rounded bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition font-semibold">
                  <PencilLine size={14} /> Reviews
                </button>
                <button onClick={async () => { await deleteHomework(a.id); onToast('Homework deleted successfully'); load(); }} className="flex items-center gap-1 px-3 py-1.5 rounded bg-muted text-muted-foreground hover:bg-red-50 hover:text-red-600 transition font-semibold">
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
      {rows.length === 0 && (
        <div className="col-span-2 p-12 text-center border border-dashed rounded-xl">
          <p className="text-muted-foreground">No active homework assignments.</p>
        </div>
      )}
    </div>
  );
}
