import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Clock3, Monitor } from 'lucide-react';
import { Badge, Button, StatusBadge } from '@/components/ui-kit';
import { studentMockInbox, type MockAssignment } from '@/lib/mocks-api';

const STATUS_LABEL: Record<string, string> = {
  upcoming: 'Upcoming',
  available: 'Available now',
  in_progress: 'In progress',
  completed: 'Completed',
  results: 'Results ready',
};

function formatWhen(iso?: string | null) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return null;
  }
}

export default function UpcomingMockCard() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<MockAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentMockInbox()
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const active = items.filter((row) =>
    ['available', 'upcoming', 'in_progress', 'results'].includes(row.inbox_status || ''),
  );
  const openCount = items.filter((row) =>
    ['available', 'upcoming', 'in_progress'].includes(row.inbox_status || ''),
  ).length;

  return (
    <div className="card p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="eyebrow">Mock tests</div>
          <h2 className="font-display mt-1 text-lg font-bold">Assigned mocks</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {loading
              ? 'Checking your inbox…'
              : openCount
                ? `${openCount} open mock${openCount === 1 ? '' : 's'} from your teacher.`
                : 'No open mocks right now.'}
          </p>
        </div>
        <Link href="/student/mocks" className="text-xs font-bold text-primary">
          Open mock tests
        </Link>
      </div>

      {!loading && active.length === 0 && (
        <div className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
          When your teacher assigns a mock, it will appear here with start time, duration, and status.
        </div>
      )}

      <div className="space-y-3">
        {active.slice(0, 4).map((item) => {
          const status = item.inbox_status || 'available';
          return (
            <div key={item.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="amber">{(item.mock_type || 'mock').replace('_', ' ')}</Badge>
                    <StatusBadge status={STATUS_LABEL[status] || status} />
                  </div>
                  <div className="mt-2 font-semibold">{item.title}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <Clock3 size={12} /> {item.duration_minutes} min
                    </span>
                    <span>{(item.ielts_type || '').replace('_', ' ')}</span>
                    {formatWhen(item.available_at) && <span>Starts {formatWhen(item.available_at)}</span>}
                    {formatWhen(item.deadline_at) && <span>Due {formatWhen(item.deadline_at)}</span>}
                  </div>
                  {status === 'results' && (
                    <p className="mt-2 text-sm">
                      Overall <strong>{item.overall_band ?? '—'}</strong>
                    </p>
                  )}
                </div>
                <Button
                  variant={status === 'available' || status === 'in_progress' ? 'primary' : 'quiet'}
                  onClick={() => setLocation(`/student/mocks/${item.id}`)}
                >
                  {status === 'available' ? 'Start' : status === 'in_progress' ? 'Continue' : 'View'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {active.length > 0 && (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <Monitor size={14} />
          Screen monitoring may be required — your teacher will see live status during the mock.
        </div>
      )}
    </div>
  );
}
