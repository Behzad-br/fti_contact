import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Bell } from 'lucide-react';
import { listNotifications, markNotificationRead, type NotificationItem } from '@/lib/mocks-api';

export default function NotificationBell() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>([]);

  const load = () => listNotifications().then((d) => setItems(d.items || [])).catch(() => setItems([]));
  useEffect(() => { load(); const id = setInterval(load, 20000); return () => clearInterval(id); }, []);

  const unread = items.filter((item) => !item.read).length;

  return (
    <div className="relative">
      <button type="button" className="relative rounded-lg p-2 hover:bg-muted" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <Bell size={18} />
        {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-500" />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          <div className="border-b border-border px-4 py-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Notifications</div>
          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">No notifications yet.</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`block w-full px-4 py-3 text-left text-sm hover:bg-muted/60 ${item.read ? '' : 'bg-amber-50/50'}`}
                onClick={async () => {
                  await markNotificationRead(item.id).catch(() => undefined);
                  setOpen(false);
                  if (item.href) setLocation(item.href);
                }}
              >
                <div className="font-semibold">{item.title}</div>
                <div className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{item.body}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
