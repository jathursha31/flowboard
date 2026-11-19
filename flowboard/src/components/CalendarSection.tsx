import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useToast } from '../context/ToastContext.tsx';

// 📅 Account page: due dates ah Google / Apple / Outlook calendar la kaatta ragasiya link
export default function CalendarSection() {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    api<{ url: string }>('/api/account/calendar').then((d) => setUrl(d.url), () => setUrl(null));
  }, []);

  const copy = () =>
    url && navigator.clipboard?.writeText(url).then(() => toast('Calendar link copied'), () => toast('Select the link and copy it by hand.', 'error'));

  const reset = async () => {
    if (!window.confirm('Make a new link? Calendars using the old link will stop updating.')) return;
    try {
      setUrl((await api<{ url: string }>('/api/account/calendar/reset', 'POST')).url);
      toast('New calendar link ready');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  if (!url) return null;
  return (
    <section className="card account__card">
      <h2>📅 Calendar</h2>
      <p className="muted">See your tasks&apos; due dates in Google Calendar, iPhone or Outlook. It updates by itself.</p>
      <code className="calendar-url">{url}</code>
      <div className="data-actions">
        <button type="button" className="btn btn--primary" onClick={copy}>📋 Copy link</button>
        <a className="btn btn--outline" href={url.replace(/^https?:/, 'webcal:')}>🍎 Open in Calendar app</a>
        <button type="button" className="btn btn--ghost" onClick={reset}>🔄 New link</button>
      </div>
      <details className="dev-example">
        <summary>How to add it to Google Calendar</summary>
        <ol>
          <li>Open <strong>calendar.google.com</strong> on a computer.</li>
          <li>Next to <strong>Other calendars</strong>, click <strong>+</strong> → <strong>From URL</strong>.</li>
          <li>Paste the link and click <strong>Add calendar</strong>.</li>
        </ol>
        <p className="muted small">Google can only read the link once Flowboard is online (deployed), not from localhost.</p>
      </details>
      <p className="muted small">🔒 Anyone with this link can see your task titles and dates. Keep it private, and make a new link if it leaks.</p>
    </section>
  );
}
