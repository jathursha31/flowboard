// 📊 Analytics: "intha page paathaanga", "intha button click pannaanga" nu server ku sollu
// Cookies illa. Browser "Do Not Track" sonnaa server count pannaadhu. Tests la anuppa maattom.

export type TrackEvent = 'cta_click' | 'signup' | 'login' | 'task_created' | 'chat_sent' | 'ai_used' | 'install_app' | 'pricing_click';

function send(data: Record<string, unknown>): void {
  if (import.meta.env.MODE === 'test' || typeof window === 'undefined') return;
  const body = JSON.stringify({ ...data, path: data.path ?? window.location.pathname });
  try {
    // sendBeacon: page vittu pogumbodhum anuppum, page ah slow aakkaadhu
    if (navigator.sendBeacon?.('/api/track', new Blob([body], { type: 'application/json' }))) return;
    fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
  } catch {
    /* analytics fail aanaalum website nikkakoodaadhu */
  }
}

let lastPath = '';
export function trackPageview(path: string): void {
  if (path === lastPath) return; // ore page ku rendu thadavai (StrictMode) vendaam
  lastPath = path;
  send({ type: 'pageview', path, referrer: document.referrer || undefined });
}

export function trackEvent(name: TrackEvent): void {
  send({ type: 'event', name });
}

// 🖱️ <button data-track="cta_click"> maari ellaa click um thaane count
let listening = false;
export function listenForTrackedClicks(): void {
  if (listening || typeof document === 'undefined') return;
  listening = true;
  document.addEventListener('click', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-track]');
    const name = el?.getAttribute('data-track');
    if (name) trackEvent(name as TrackEvent);
  });
}
