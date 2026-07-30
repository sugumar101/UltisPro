'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useAuthStore } from '../../lib/stores/auth-store';
import { listNotifications, markNotificationRead, type Notification } from '../../lib/notifications-api';

export function NotificationBell() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function load() {
    if (!accessToken) return;
    try {
      setNotifications(await listNotifications(accessToken));
    } catch {
      // Non-critical — fail silently rather than blocking the whole shell.
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  async function handleMarkRead(id: string) {
    if (!accessToken) return;
    try {
      await markNotificationRead(accessToken, id);
      await load();
    } catch {
      // ignore
    }
  }

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ease-smooth hover:bg-surface-container active:scale-95"
      >
        <Bell className="h-[18px] w-[18px] text-on-surface-variant" />
        {unreadCount > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-on-error ring-2 ring-surface-bright">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-80 animate-fade-in-up overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest shadow-popover">
          <div className="border-b border-outline-variant px-4 py-3 text-label-sm font-semibold text-on-surface-variant">
            Notifications
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {notifications.map((n) => (
              <li
                key={n.id}
                className={`cursor-pointer border-b border-outline-variant p-3 transition-colors duration-150 ease-smooth last:border-0 hover:bg-surface-container-low ${
                  n.read_at ? 'opacity-55' : ''
                }`}
                onClick={() => !n.read_at && handleMarkRead(n.id)}
              >
                <p className="text-sm font-semibold">{n.title}</p>
                {n.body ? <p className="mt-0.5 text-xs text-on-surface-variant">{n.body}</p> : null}
                <p className="mt-1 text-[10px] text-on-surface-variant">{new Date(n.created_at).toLocaleString()}</p>
              </li>
            ))}
            {notifications.length === 0 ? (
              <li className="p-6 text-center text-sm text-on-surface-variant">You&apos;re all caught up.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
