import { useEffect, useState } from 'react';
import { api } from '../api.ts';
import { useToast } from '../context/ToastContext.tsx';

// 🔔 Account page: indha device la (phone / computer) push alerts on / off

// Server key "base64url" la varum, browser ku bytes venum
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export default function PushSection() {
  const toast = useToast();
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const devMode = import.meta.env.DEV; // dev server la service worker illa (main.tsx)

  useEffect(() => {
    if (!supported() || devMode) return setOn(false);
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setOn(Boolean(sub)))
      .catch(() => setOn(false));
  }, [devMode]);

  const enable = async () => {
    setBusy(true);
    try {
      if ((await Notification.requestPermission()) !== 'granted') {
        toast('Notifications are blocked. Allow them in your browser settings (🔒 next to the address).', 'error');
        return;
      }
      const { publicKey } = await api<{ publicKey: string }>('/api/push/key');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
      await api('/api/push/subscribe', 'POST', sub.toJSON());
      setOn(true);
      toast('Notifications are on for this device 🔔');
    } catch (err) {
      toast((err as Error).message || "Couldn't turn on notifications.", 'error');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await api('/api/push/unsubscribe', 'POST', { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setOn(false);
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      const { sent } = await api<{ sent: number }>('/api/push/test', 'POST');
      if (!sent) toast('No device got it. Turn notifications off and on again.', 'error');
    } catch (err) {
      toast((err as Error).message, 'error');
    }
  };

  return (
    <section className="card account__card">
      <h2>🔔 Phone &amp; desktop alerts</h2>
      <p className="muted">Get an alert when someone assigns you a task, mentions you or shares a board, even when Flowboard is closed.</p>
      {!supported() ? (
        <p className="muted small">This browser doesn&apos;t support push notifications. On iPhone, add Flowboard to your Home Screen first.</p>
      ) : devMode ? (
        <p className="muted small">Alerts work on the built site (<code>npm run build</code>, then open the server address), not the dev server.</p>
      ) : (
        <div className="data-actions">
          {on ? (
            <>
              <button type="button" className="btn btn--outline" onClick={test}>Send a test alert</button>
              <button type="button" className="btn btn--outline" onClick={disable} disabled={busy}>Turn off on this device</button>
            </>
          ) : (
            <button type="button" className="btn btn--primary" onClick={enable} disabled={busy || on === null}>
              {busy ? 'Turning on…' : '🔔 Turn on alerts'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
