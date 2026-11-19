import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.ts';
import { useLang } from '../context/LanguageContext.tsx';
import { timeAgo } from '../utils/timeAgo.ts';
import type { Notification } from '../types.ts';

const POLL_MS = 30000; // 30 second ku oru thadavai pudhusu irukkaa nu paaru

// 🔔 Navbar bell: assign, comment, share, due date notifications
// Tab background la irundhaa + permission kuduththirundhaa, computer notification um varum
interface Feed {
  unread: number;
  items: Notification[];
}

export default function NotificationBell() {
  const navigate = useNavigate();
  const { locale } = useLang();
  const [data, setData] = useState<Feed>({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const [permission, setPermission] = useState<string>(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission));
  const seen = useRef<Set<string> | null>(null); // mudhal load la pazhaya notifications ku popup vendaam
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const next = await api<Feed>('/api/notifications');
      // 🖥️ Pudhu unread vandhaa, tab paakkaama irundhaa computer notification
      if (seen.current && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        for (const n of next.items.filter((i) => !i.read && !seen.current!.has(i.id))) {
          new Notification('Flowboard', { body: n.text, icon: '/icon-192.png', tag: n.id });
        }
      }
      seen.current = new Set(next.items.map((i) => i.id));
      setData(next);
    } catch {
      /* logout aagirukkalaam */
    }
  }, []);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  // Veliya click / Esc = close
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e: MouseEvent) => !boxRef.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read) {
      setData((d) => ({ unread: Math.max(0, d.unread - 1), items: d.items.map((i) => (i.id === n.id ? { ...i, read: true } : i)) }));
      api(`/api/notifications/${n.id}/read`, 'POST').catch(() => {});
    }
    if (n.boardId) navigate(`/app?board=${n.boardId}${n.taskId ? `&task=${n.taskId}` : ''}`);
  };

  const readAll = async () => {
    setData((d) => ({ unread: 0, items: d.items.map((i) => ({ ...i, read: true })) }));
    api('/api/notifications/read-all', 'POST').catch(() => {});
  };

  const askPermission = async () => setPermission(await Notification.requestPermission());

  return (
    <div className="bell" ref={boxRef}>
      <button
        type="button"
        className="icon-btn bell__btn"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) load();
        }}
        aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}
        aria-expanded={open}
      >
        🔔
        {data.unread > 0 && <span className="bell__count">{data.unread > 9 ? '9+' : data.unread}</span>}
      </button>

      {open && (
        <div className="bell__panel" role="dialog" aria-label="Notifications">
          <div className="bell__head">
            <strong>Notifications</strong>
            {data.unread > 0 && (
              <button type="button" className="link-btn" onClick={readAll}>Mark all read</button>
            )}
          </div>
          {permission === 'default' && (
            <button type="button" className="bell__enable" onClick={askPermission}>
              🖥️ Turn on desktop alerts
            </button>
          )}
          {data.items.length === 0 ? (
            <p className="bell__empty">You&apos;re all caught up ✨</p>
          ) : (
            <ul className="bell__list">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={n.read ? '' : 'is-unread'} onClick={() => openItem(n)}>
                    <span>{n.text}</span>
                    <small>{timeAgo(n.createdAt, locale)}</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
