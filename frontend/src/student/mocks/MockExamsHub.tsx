import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { Badge, Button, EmptyState, SectionTitle, StatusBadge } from '@/components/ui-kit';
import { studentMockInbox, type MockAssignment } from '@/lib/mocks-api';

const TABS = ['upcoming', 'available', 'in_progress', 'completed', 'results'] as const;
const LABELS: Record<string, string> = {
  upcoming: 'Upcoming',
  available: 'Available',
  in_progress: 'In progress',
  completed: 'Completed',
  results: 'Results',
};

function remainingParts(iso?: string | null) {
  if (!iso) return null;
  const start = new Date(iso).getTime() - Date.now();
  if (start <= 0) return null;
  const total = Math.floor(start / 1000);
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  return { days, hours, minutes };
}

export default function MockExamsHub({ tab }: { tab?: string }) {
  const [, setLocation] = useLocation();
  const current = (TABS as readonly string[]).includes(tab || '') ? tab! : 'upcoming';
  const [items, setItems] = useState<MockAssignment[]>([]);

  useEffect(() => {
    studentMockInbox().then((d) => setItems(d.items || [])).catch(() => setItems([]));
  }, []);

  const filtered = useMemo(() => items.filter((item) => (item.inbox_status || 'available') === current), [items, current]);

  return (
    <>
      <SectionTitle eyebrow="Student workspace" title="Mock exams" description="Assigned by your teacher. Practice tests stay under IELTS Practice." />
      <div className="mb-5 flex flex-wrap gap-2">
        {TABS.map((id) => (
          <button key={id} type="button" onClick={() => setLocation(id === 'upcoming' ? '/student/mocks' : `/student/mocks/${id.replace('_', '-')}`)} className={`rounded-full border px-3 py-1.5 text-xs font-bold ${current === id ? 'border-primary bg-amber-50 text-amber-900' : 'border-border'}`}>{LABELS[id]}</button>
        ))}
      </div>
      {filtered.length === 0 && <EmptyState title={`No ${LABELS[current].toLowerCase()} mocks`} text="When your teacher assigns a mock, it will show here." />}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map((item) => {
          const left = remainingParts(item.available_at);
          return (
            <div key={item.id} className="card p-5">
              <div className="flex items-start justify-between gap-2">
                <Badge tone="amber">{item.ielts_type.replace('_', ' ')}</Badge>
                <StatusBadge status={LABELS[item.inbox_status || 'available']} />
              </div>
              <h2 className="mt-3 font-display text-lg font-bold">{item.title}</h2>
              {left && (
                <p className="mt-3 text-sm text-muted-foreground">Starts in {String(left.days).padStart(2, '0')} days {String(left.hours).padStart(2, '0')} hours {String(left.minutes).padStart(2, '0')} minutes</p>
              )}
              {item.inbox_status === 'results' && (
                <p className="mt-3 text-sm">Overall <strong>{item.overall_band ?? '—'}</strong> · L {item.listening_band ?? '—'} · R {item.reading_band ?? '—'} · W {item.writing_band ?? '—'} · S {item.speaking_band ?? '—'}</p>
              )}
              <Button className="mt-4" variant={item.inbox_status === 'available' || item.inbox_status === 'in_progress' ? 'primary' : 'quiet'} onClick={() => setLocation(`/student/mocks/${item.id}`)}>
                {item.inbox_status === 'available' ? 'Start mock' : item.inbox_status === 'in_progress' ? 'Continue' : 'View mock'}
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
}
