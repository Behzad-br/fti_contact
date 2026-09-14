import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { studentMockInbox, type MockAssignment } from '@/lib/mocks-api';

export default function UpcomingMockCard() {
  const [item, setItem] = useState<MockAssignment | null>(null);
  useEffect(() => {
    studentMockInbox()
      .then((d) => {
        const rows = d.items || [];
        setItem(rows.find((row) => row.inbox_status === 'available' || row.inbox_status === 'upcoming' || row.inbox_status === 'in_progress') || null);
      })
      .catch(() => setItem(null));
  }, []);
  if (!item) return null;
  return (
    <div className="card p-6">
      <div className="eyebrow">Upcoming mock</div>
      <h2 className="mt-2 font-display text-lg font-bold">{item.title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{item.duration_minutes} minutes · {item.ielts_type.replace('_', ' ')}</p>
      <Link href={`/student/mocks/${item.id}`} className="mt-4 inline-flex text-xs font-bold text-primary">View mock</Link>
    </div>
  );
}
