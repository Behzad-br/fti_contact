import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ArrowUpRight } from 'lucide-react';
import { StatusBadge } from '@/components/ui-kit';
import { studentHomework, type HomeworkItem } from '@/lib/homework-api';

export default function PendingHomeworkPanel() {
  const [, setLocation] = useLocation();
  const [rows, setRows] = useState<HomeworkItem[]>([]);
  useEffect(() => {
    studentHomework()
      .then(d => setRows(d.assignments.filter(a => a.status !== 'Completed')))
      .catch(() => setRows([]));
  }, []);
  if (!rows.length) {
    return <p className="text-sm text-muted-foreground">No pending homework from your teacher.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.slice(0, 5).map(a => (
        <button
          key={a.id}
          onClick={() => setLocation(`/student/homework/${a.id}`)}
          className="group flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left transition hover:border-primary/40 hover:bg-muted/40"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-[10px] font-bold uppercase text-amber-700">
            {(a.module || 'hw').slice(0, 3)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{a.title}</div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <span>{a.task_label || a.module}</span>
              <span>·</span>
              <span>{a.deadline ? new Date(a.deadline).toLocaleDateString() : 'Open'}</span>
            </div>
          </div>
          <StatusBadge status={(a.status as any) || 'Pending'} />
          <ArrowUpRight size={16} className="text-muted-foreground transition group-hover:text-primary" />
        </button>
      ))}
    </div>
  );
}
